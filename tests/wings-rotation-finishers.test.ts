import dawnsun from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-jadebreaker.json"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

describe("Wings rotation finishers", () => {
  it.each(["17", "18"].flatMap(breakthrough => [jadebreaker, dawnsun].map(rotation => ({ breakthrough, rotation }))))(
    "adds damage within one minute for $rotation.name at breakthrough $breakthrough",
    ({ breakthrough, rotation }) => {
      const current = rotation as RotationRecord
      const previous = structuredClone(current)
      const bursting = previous.steps.findIndex(step => step.type === "skill" && step.skill === "BurstingNine2Shots")
      previous.steps.splice(bursting + 1, previous.steps.length - bursting - 2)
      if (rotation === dawnsun) {
        const soaringIndex = previous.steps.findIndex(step => step.type === "skill" && step.skill === "SoaringSpin2")
        const soaring = previous.steps.splice(soaringIndex, 1)[0]
        const special = previous.steps.findLastIndex(step => step.type === "skill" && step.skill === "RippleDawnsun")
        previous.steps.splice(special + 1, 0, soaring)
      }
      const calculate = (candidate: RotationRecord) => {
        const bundle = buildPresetRotationBundle(
          {
            pathId: "silkbindWing",
            martialArts: ["museflowWaistDrum", "willowbendFan"],
            rotation: candidate,
            breakthrough,
            globalDebuffs: { ...defaultGlobalDebuffs },
            food: "SimmeringFishSlices",
            script: "None",
            divinecraft: "Fire",
            skillOverrides: {},
            previewId: null,
          },
          "wings-fully-relayed-min",
        )!
        return calculateRotationBaseline(bundle)
      }
      const before = calculate(previous)
      const after = calculate(current)
      expect(after.duration).toBe(60)
      expect(before.duration).toBe(after.duration)
      expect(after.metrics.totalDamage).toBeGreaterThan(before.metrics.totalDamage)
    },
  )
})
