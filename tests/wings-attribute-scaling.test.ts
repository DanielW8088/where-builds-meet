import drum from "@gamedata/skill/wendong-nichang.json"
import fan from "@gamedata/skill/xingyou-caoye.json"
import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, type DamageAction } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"
import type { WeaponId } from "@/types"

import { asSkillRecords, skillActions } from "./helpers/shippedData"

const weapons: WeaponId[] = ["wendongNichang", "xingyouCaoye"]
const enemy = {
  name: "Coefficient target",
  level: 100,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
const actions = Object.entries(asSkillRecords({ ...drum, ...fan })).flatMap(([skill, record]) =>
  skillActions(record).flatMap((action, index) =>
    action.type === "damage" ? [{ name: `${skill}:${index}`, action: action as DamageAction }] : [],
  ),
)

describe("Wings primary attribute scaling", () => {
  it.each(actions)("applies the 50% primary attribute advantage once for $name", ({ action }) => {
    const hit = (attack: number) => {
      const stats = {
        ...emptyStats,
        minPhys: attack,
        maxPhys: attack,
        minSilkbind: attack,
        maxSilkbind: attack,
        precision: 1,
      }
      return calculateDamageBreakdown(action, {
        stats,
        derivedStats: calculateDerivedStats(stats, 0, {}, weapons),
        attunement: emptyAttunementStats,
        skillTags: [],
        weapons,
        buffs: [],
        enemy,
        effects: [],
      })
    }
    const lower = hit(100)
    const upper = hit(200)
    expect(upper.physical - lower.physical).toBeGreaterThan(0)
    expect(upper.silkbind - lower.silkbind).toBeCloseTo((upper.physical - lower.physical) * 1.5, 8)
  })
})
