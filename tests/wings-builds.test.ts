import dawnsun from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-jadebreaker.json"
import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { typedBreakthroughProfiles } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, maxGearRoll } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

describe("Wings builds", () => {
  it.each([17, 18])(
    "keeps Double Min's selected penetration ahead on both rotations at breakthrough %s",
    breakthrough => {
      const tier = breakthrough === 17 ? 96 : 100
      for (const rotation of [dawnsun, jadebreaker]) {
        const bundle = buildPresetRotationBundle(
          {
            pathId: "silkbindWing",
            martialArts: ["museflowWaistDrum", "willowbendFan"],
            rotation: rotation as RotationRecord,
            breakthrough: String(breakthrough),
            globalDebuffs: { ...defaultGlobalDebuffs },
            food: "SimmeringFishSlices",
            script: "None",
            divinecraft: "Fire",
            skillOverrides: {},
            previewId: null,
          },
          "wings-fully-relayed-double-min",
        )!
        const selected = calculateRotationBaseline(bundle).metrics.dps
        const alternate = {
          ...bundle,
          attunement: {
            ...bundle.attunement,
            physicalPenetration: 0,
            formlessPenetration: maxGearRoll("formlessPenetration", "attunement", false, tier)! * 4,
          },
        }
        expect(selected).toBeGreaterThan(calculateRotationBaseline(alternate).metrics.dps)
      }
    },
  )
  it("does not combine Void and Silkbind rolls for the same weapon attack bound", () => {
    for (const preset of defaultBuildPresets.filter(row => row.buildGroup === "silkbind-wing")) {
      for (const gear of Object.values(preset.gearByTier)) {
        for (const slot of ["leftWeapon", "rightWeapon"] as const) {
          const weapon = gear[slot]!
          const keys = new Set([weapon.baseAffix.key, ...weapon.additionalAffixes.map(affix => affix.key)])
          for (const bound of ["min", "max"]) {
            expect(keys.has(`${bound}VoidAttack`) && keys.has(`${bound}Silkbind`)).toBe(false)
          }
        }
      }
    }
  })
  it.each([96, 100] as const)("keeps Graduate at non-relayed maximum rolls at tier %s", tier => {
    const graduate = buildPresetInventory(
      defaultBuildPresets.find(row => row.id === "wings-graduate")!,
      tier,
    )
    for (const target of graduate.items) {
      expect(target.relayed).not.toBe(true)
      const targetAffixes = [target.baseAffix!, ...target.additionalAffixes]
      for (const affix of targetAffixes) expect(affix.value).toBe(maxGearRoll(affix.key, "affix", false, tier))
    }
  })
  it.each(
    ([96, 100] as const).flatMap(tier =>
      [
        "wings-fully-relayed-double-min",
        "wings-fully-relayed-min",
        "wings-fully-relayed-min-attribute",
        "wings-max",
      ].map(id => ({ tier, id })),
    ),
  )("approaches the critical cap for $id at gear tier $tier", ({ tier, id }) => {
    const preset = defaultBuildPresets.find(row => row.id === id)!
    const inventory = buildPresetInventory(preset, tier)
    const gear = calculateEquippedGearEffects(inventory, ["museflowWaistDrum", "willowbendFan"])
    const breakthrough = Object.entries(typedBreakthroughProfiles).find(([, profile]) => profile.gearTier === tier)![0]
    const result = calculateGlobalStatState(
      {},
      { weapons: ["museflowWaistDrum", "willowbendFan"], breakthrough, ping: 40 },
      { rawStat: gear.stats },
      preset.setup!,
      { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
      "silkbindWing",
    )
    expect(result.derivedStats.effectiveCrit).toBeGreaterThanOrEqual(0.79)
    expect(result.derivedStats.effectiveCrit).toBeLessThanOrEqual(0.8)
    expect(inventory.items.every(item => item.relayed)).toBe(true)
    const attackRolls = inventory.items
      .flatMap(item => [item.baseAffix!].concat(item.additionalAffixes))
      .filter(affix =>
        ["minPhys", "maxPhys", "minVoidAttack", "maxVoidAttack", "minSilkbind", "maxSilkbind"].includes(affix.key),
      )
    expect(attackRolls).toHaveLength(20)
  })
})
