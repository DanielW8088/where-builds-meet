import { readdir, readFile } from "node:fs/promises"

import { assert, describe, expect, it } from "vitest"

import { resolvePing } from "@/calculations/combatDefaults"

import { loadDpsSnapshotCases, selectDpsSnapshotUpdates } from "./helpers/dps-snapshot-fixtures"
import { compareDpsSnapshots } from "./helpers/dps-snapshot-guard.mjs"

describe("rotation DPS snapshot fixtures", () => {
  it("discovers every build paired with every non-empty rotation at both breakthroughs", async () => {
    const cases = await loadDpsSnapshotCases()
    const snapshots = JSON.parse(await readFile("tests/snapshots/rotation-dps.json", "utf8"))
    const paths = JSON.parse(await readFile("data/path.json", "utf8"))
    const files = await readdir("data/rotation", { recursive: true })
    const expected = []
    const rotations = await Promise.all(
      files
        .filter(file => file.endsWith(".json"))
        .map(async file => ({ file, rotation: JSON.parse(await readFile("data/rotation/" + file, "utf8")) })),
    )
    const buildFiles = await readdir("data/build", { recursive: true })
    const builds = await Promise.all(
      buildFiles
        .filter(file => file.endsWith(".json"))
        .map(async file => ({
          group: file.replaceAll("\\", "/").split("/")[0],
          build: JSON.parse(await readFile("data/build/" + file, "utf8")),
        })),
    )
    for (const { file, rotation } of rotations) {
      assert(Number.isFinite(rotation.ping), "Preset must store its own ping: " + file)
      assert(resolvePing(rotation.ping, 85) === rotation.ping, "Preset ping must ignore Settings: " + file)
      if (!rotation.steps.length) continue
      const group = file.replaceAll("\\", "/").split("/")[0]
      const pathId = Object.keys(paths).find(id => paths[id].buildGroup === group)
      assert(pathId !== undefined, "Rotation has no path: " + file)
      const rotationId = pathId + "/" + file.replaceAll("\\", "/").split("/").at(-1)!.slice(0, -5)
      for (const { build } of builds.filter(entry => entry.group === group))
        expected.push(rotationId + "/" + build.id + "/18", rotationId + "/" + build.id + "/19")
    }
    expect(cases.map(c => c.id).sort()).toEqual(expected.sort())
    await Promise.all(
      cases.map(async entry => {
        const build = JSON.parse(
          await readFile("data/build/" + entry.buildGroup + "/" + entry.fixture.build + ".json", "utf8"),
        )
        expect(build.martialArts.slice().sort()).toEqual(entry.fixture.martialArts.slice().sort())
        expect(entry.fixture.ping).toBe(entry.rotation.ping)
        expect(entry.id.endsWith("/" + entry.fixture.breakthrough)).toBe(true)
      }),
    )
    expect(compareDpsSnapshots(snapshots.cases, snapshots.cases)).toEqual([])
  })
  it("updates one rotation, an entire path, or all cases without accepting unrelated results", () => {
    const ids = ["kite/regular/18", "kite/regular/19", "kite/bp/18", "kite/bp/19", "deluge/wts/18", "deluge/wts/19"]
    expect(selectDpsSnapshotUpdates("", ids)).toEqual([])
    expect(selectDpsSnapshotUpdates("kite/regular/18", ids)).toEqual(["kite/regular/18"])
    expect(selectDpsSnapshotUpdates("kite/regular", ids)).toEqual(["kite/regular/18", "kite/regular/19"])
    expect(selectDpsSnapshotUpdates("kite", ids)).toEqual([
      "kite/bp/18",
      "kite/bp/19",
      "kite/regular/18",
      "kite/regular/19",
    ])
    expect(selectDpsSnapshotUpdates("kite/bp deluge/wts", ids)).toEqual([
      "deluge/wts/18",
      "deluge/wts/19",
      "kite/bp/18",
      "kite/bp/19",
    ])
    expect(selectDpsSnapshotUpdates("all", ids)).toEqual(ids)
    for (const selector of ["missing", "kite kite/bp", "kite/bp kite/bp", "kit"])
      expect(() => selectDpsSnapshotUpdates(selector, ids)).toThrow(
        /Unknown DPS snapshot selector|Overlapping DPS snapshot selectors/,
      )
  })
  it("detects a regression or missing baseline at either breakthrough independently", () => {
    // Each snapshot number is compared on its own, so a case must move exactly
    // the field under test rather than deriving it from another.
    const sample = (overrides = {}) => ({
      fixture: { build: "same" },
      dps: 100,
      totalDamage: 6000,
      duration: 60,
      ...overrides,
    })
    const old = { "kite/regular/18": sample(), "kite/regular/19": sample() }
    expect(
      compareDpsSnapshots(old, {
        ...old,
        "kite/regular/18": sample({ dps: 99 }),
        "kite/regular/19": sample({ dps: 101 }),
      }),
    ).toHaveLength(2)
    expect(compareDpsSnapshots(old, { "kite/regular/18": old["kite/regular/18"] })).toHaveLength(1)
  })
})
