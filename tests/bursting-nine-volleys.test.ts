import mystic from "@gamedata/skill/mystic.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"

it("retains 270% arrow damage in both Bursting Nine volleys, with the second at half strength", () => {
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 50, maxBellstrike: 50, precision: 1 }
  const context = {
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    effects: [],
    buffs: [],
    skillTags: ["Mystic"],
    weapons: [],
    attunement: emptyAttunementStats,
    enemy: {
      name: "Target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
  }
  for (const calculate of [
    calculateDamageBreakdown,
    (action: Parameters<typeof calculateDamageBreakdown>[0], input: typeof context) =>
      calculateSimulatedDamageBreakdown(action, input, () => 0.5),
  ]) {
    const single = mystic.BurstingNine.action.filter(action => action.type === "damage")
    const double = mystic.BurstingNine2Shots.action.filter(action => action.type === "damage")
    const volleys = [double.slice(0, 9), double.slice(9)]
    const firstArrow = calculate(single[0], context)
    for (const channel of ["physical", "bellstrike"] as const) {
      const total = (actions: typeof single) =>
        actions.reduce((sum, action) => sum + calculate(action, context)[channel], 0)
      expect(total(single) / firstArrow[channel]).toBeCloseTo(2.7, 12)
      expect(total(volleys[0])).toBeCloseTo(total(single), 10)
      expect(total(volleys[1]) / total(volleys[0])).toBeCloseTo(0.5, 12)
    }
  }
})
