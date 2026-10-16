import { describe, expect, it } from "vitest"

import { setEffectsFor } from "@/application/characterComposition"
import {
  bowRingSetEffectFor,
  defaultSettings,
  typedArmorSetDefinitions,
  typedWeaponSetDefinitions,
} from "@/application/gameData/setup"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"

const settings = (breakthrough: string) => ({ ...defaultSettings, breakthrough })

describe("set progression", () => {
  it.each([2, 4] as const)(
    "applies the selected breakthrough to %s-piece weapon and armor bonuses and restores the prior values",
    pieces => {
      const effects = (breakthrough: string) => [
        ...setEffectsFor(
          { Cleftpeak: pieces },
          typedWeaponSetDefinitions,
          settings(breakthrough),
          "stonesplitStrength",
        ),
        ...setEffectsFor({ Formbend: pieces }, typedArmorSetDefinitions, settings(breakthrough), "stonesplitStrength"),
        bowRingSetEffectFor("Precision", settings(breakthrough)),
      ]
      const original = effects("17")
      const stats = (breakthrough: string) => calculateStatsWithEffects(emptyStats, effects(breakthrough), 0).stats
      expect(stats("17")).toMatchObject({ minPhys: 77.8, physicalDefense: 39, precision: 0.04 })
      expect(stats("18")).toMatchObject({ minPhys: 90.6, physicalDefense: 45.4, precision: 0.047 })
      expect(effects("17")).toEqual(original)

      const mechanics = (breakthrough: string) =>
        effects(breakthrough).map(({ rawStat: _rawStat, stat: _stat, ...rest }) => rest)
      expect(mechanics("18")).toEqual(mechanics("17"))
    },
  )

  it.each([
    ["Critical", "crit", 0.045, 0.052],
    ["Affinity", "affinity", 0.022, 0.026],
  ] as const)("resolves %s bow/ring through the shared stat calculation", (selection, stat, previous, current) => {
    const calculate = (breakthrough: string) =>
      calculateStatsWithEffects(emptyStats, [bowRingSetEffectFor(selection, settings(breakthrough))], 0).stats[stat]
    expect(calculate("17")).toBe(previous)
    expect(calculate("18")).toBe(current)
  })
})
