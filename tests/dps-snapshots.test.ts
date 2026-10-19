import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { assert, describe, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases, selectDpsSnapshotUpdates } from "./helpers/dps-snapshot-fixtures"
import { compareDpsSnapshots, dpsSnapshotUlpBudget } from "./helpers/dps-snapshot-guard.mjs"

describe("dps-snapshots", () => {
  it("compares every preset rotation against its accepted DPS snapshot", async () => {
    const snapshotFile = new URL("./snapshots/rotation-dps.json", import.meta.url)
    const cases = await loadDpsSnapshotCases()
    const rawUpdateIds = (process.env.DPS_UPDATE_IDS ?? "").trim()
    const updateIds = selectDpsSnapshotUpdates(
      rawUpdateIds,
      cases.map(entry => entry.id),
    )
    let snapshot
    try {
      snapshot = JSON.parse(await readFile(snapshotFile, "utf8"))
      if (
        snapshot.schemaVersion !== 2 ||
        !snapshot.cases ||
        typeof snapshot.cases !== "object" ||
        Array.isArray(snapshot.cases)
      )
        throw new Error("Invalid rotation DPS snapshot format.")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !updateIds.length) throw error
      snapshot = { schemaVersion: 2, cases: {} }
    }
    const actual: Record<
      string,
      { fixture: (typeof cases)[number]["fixture"]; dps: number; totalDamage: number; duration: number }
    > = {}
    for (const { id, pathId, rotation, fixture } of cases) {
      const bundle = buildPresetRotationBundle(
        { pathId, ...fixture, rotation: { ...rotation, ping: fixture.ping }, skillOverrides: {}, previewId: null },
        fixture.build,
      )
      assert(bundle, id + ": failed to build the production calculation bundle.")
      const { metrics, duration } = calculateRotationBaseline(bundle)
      actual[id] = { fixture, dps: metrics.dps, totalDamage: metrics.totalDamage, duration }
      const previous = snapshot.cases[id]?.dps
      console.log(
        id +
          ": " +
          metrics.dps +
          " DPS" +
          (previous > 0
            ? "; baseline " + previous + ", change " + ((metrics.dps / previous - 1) * 100).toExponential(3) + "%"
            : "; no accepted baseline"),
      )
    }
    const invalid = compareDpsSnapshots(actual, actual)
    assert(!invalid.length, invalid.join("\n"))
    if (updateIds.length) {
      const next = { ...snapshot.cases }
      for (const id of updateIds) next[id] = actual[id]
      if (rawUpdateIds === "all") for (const id of Object.keys(next)) if (!actual[id]) delete next[id]
      const value = {
        schemaVersion: 2,
        cases: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
      }
      const formatterCli = join(dirname(createRequire(import.meta.url).resolve("oxfmt/package.json")), "bin", "oxfmt")
      const formatted = execFileSync(
        process.execPath,
        [formatterCli, "--stdin-filepath", fileURLToPath(snapshotFile)],
        { input: JSON.stringify(value, null, 2) + "\n", encoding: "utf8" },
      )
      await writeFile(snapshotFile, formatted, "utf8")
      console.log("Updated reviewed rotation snapshots: " + updateIds.join(", "))
    } else {
      const failures = compareDpsSnapshots(snapshot.cases, actual)
      assert(!failures.length, failures.join("\n") + "\nReview each change; update only confirmed rotation snapshots.")
      console.log("All preset rotations reproduce their accepted snapshots within " + dpsSnapshotUlpBudget + " ULPs.")
    }
  })
})
