import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { typedBreakthroughProfiles } from "@/application/gameData/setup"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, maxGearRoll } from "@/gear"

describe("Wings builds", () => {
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
    const gear = calculateEquippedGearEffects(inventory, ["wendongNichang", "xingyouCaoye"])
    const breakthrough = Object.entries(typedBreakthroughProfiles).find(([, profile]) => profile.gearTier === tier)![0]
    const result = calculateGlobalStatState(
      {},
      { weapons: ["wendongNichang", "xingyouCaoye"], breakthrough, ping: 40 },
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
