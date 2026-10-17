import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("breakthrough 19", () => {
  it("calculates every preset rotation with its new progression and restores breakthrough 18", async () => {
    for (const { pathId, rotation, fixture } of await loadDpsSnapshotFixtures()) {
      const calculate = (breakthrough: string) => {
        const bundle = buildPresetRotationBundle(
          { pathId, ...fixture, breakthrough, rotation, skillOverrides: {}, previewId: null },
          fixture.build,
        )!
        return calculateRotationBaseline(bundle).metrics
      }
      const before = calculate("18")
      const after = calculate("19")
      expect(Number.isFinite(after.dps)).toBe(true)
      expect(after.totalDamage).toBeGreaterThan(0)
      expect(after.dps).not.toBe(before.dps)
      expect(calculate("18")).toEqual(before)
    }
  }, 120000)
})
