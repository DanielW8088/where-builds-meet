import { assert, describe, it } from "vitest"

import { typedPathDefinitions } from "@/application/gameData/paths"
import {
  buildGraduationBundleSet,
  buildPresetRotationBundle,
  selectHighestGraduationResult,
  type GraduationPresetEnvironment,
} from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("graduation", () => {
  it("uses a full-roll Deluge graduate that outperforms the matching relayed build", async () => {
    const levels = await Promise.all(["18", "19"].map(breakthrough => loadDpsSnapshotFixtures(breakthrough)))
    for (const fixtures of levels) {
      const fixture = fixtures.find(entry => entry.id === "silkbindDeluge/dummy-1-min-wts")
      assert(fixture)
      const environment: GraduationPresetEnvironment = {
        pathId: fixture.pathId,
        ...fixture.fixture,
        rotation: fixture.rotation,
        graduatedBuildIds: typedPathDefinitions[fixture.pathId].graduated,
        skillOverrides: {},
        previewId: null,
      }
      const prepared = buildGraduationBundleSet(environment)
      assert(prepared)
      assert.lengthOf(prepared.candidates, 1)
      const graduate = calculateRotationBaseline(prepared.candidates[0].bundle)
      const relayed = buildPresetRotationBundle(environment, "deluge-fully-relayed-max-ib")
      assert(relayed)
      const reference = calculateRotationBaseline(relayed)
      assert.isAbove(graduate.metrics.dps, reference.metrics.dps)
      assert.isAbove(graduate.metrics.hps, reference.metrics.hps)
    }
  })

  it("selects the highest-DPS Strength graduate for each playstyle rotation", async () => {
    const fixtures = await loadDpsSnapshotFixtures()
    const scenarios = [
      { rotationId: "stonesplitStrength/mixed-dummy-1-min", winningBuildId: "mixed-full-min" },
      { rotationId: "stonesplitStrength/pure-dummy-1-min", winningBuildId: "pure-full-min" },
    ] as const

    for (const scenario of scenarios) {
      const fixture = fixtures.find(entry => entry.id === scenario.rotationId)
      assert(fixture, `${scenario.rotationId} fixture must exist.`)
      const path = typedPathDefinitions[fixture.pathId]
      const environment: GraduationPresetEnvironment = {
        pathId: fixture.pathId,
        martialArts: fixture.fixture.martialArts,
        rotation: { ...fixture.rotation, ping: fixture.fixture.ping },
        breakthrough: fixture.fixture.breakthrough,
        globalDebuffs: fixture.fixture.globalDebuffs,
        food: fixture.fixture.food,
        script: fixture.fixture.script,
        divinecraft: fixture.fixture.divinecraft,
        graduatedBuildIds: path.graduated,
        skillOverrides: {},
        previewId: null,
      }
      const prepared = buildGraduationBundleSet(environment)
      assert(prepared, `${scenario.rotationId} must resolve its graduate builds.`)
      const candidateIds = prepared.candidates.map(candidate => candidate.buildId)
      assert.lengthOf(candidateIds, 2)
      assert.include(candidateIds, "mixed-full-min")
      assert.include(candidateIds, "pure-full-min")

      // A graduation run keeps only the throughput it is compared by, so the selection is
      // made over the same two numbers the worker reports rather than over full baselines.
      const throughputs = prepared.candidates.map(candidate => {
        const calculated = calculateRotationBaseline(candidate.bundle)
        return { dps: calculated.metrics.dps, hps: calculated.metrics.hps }
      })
      const highest = selectHighestGraduationResult(throughputs)
      assert(highest, `${scenario.rotationId} must select a calculated preset.`)
      const highestIndex = throughputs.indexOf(highest)
      assert.equal(highest.dps, Math.max(...throughputs.map(result => result.dps)))
      assert.equal(candidateIds[highestIndex], scenario.winningBuildId)
      assert.isAbove(highest.dps, 0)
    }
  })
})
