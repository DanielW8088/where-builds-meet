import buffs from "@gamedata/buff/general.json"
import sets from "@gamedata/gear-set.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateRotationDamageSequence,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { emptyStats } from "@/data/statDefinitions"

import { asEffectDefinitions } from "./helpers/shippedData"

it("applies shipped Hawkwing stacks to Physical and Bellstrike damage in expected and sampled combat", () => {
  const stats = {
    ...emptyStats,
    minPhys: 100,
    maxPhys: 100,
    minBellstrike: 100,
    maxBellstrike: 100,
    minSilkbind: 100,
    maxSilkbind: 100,
    precision: 1,
    directAffinity: 1,
  }
  const input: RotationSimulationBundle = {
    timeline: {
      rotation: { name: "Hawkwing channel probe", steps: [{ type: "skill", skill: "Hit" }] },
      skills: {
        Hit: {
          castTime: 7,
          tags: ["DirectDamage"],
          action: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 6].map(time => ({
            type: "damage",
            time,
            phyCoef: 1,
            attrCoef: 1,
          })),
        },
      },
      effectDefinitions: asEffectDefinitions(buffs),
      setupEffects: [effectForSoloLevel(sets.Hawkwing.options["4"].effect, 17, "Hawkwing")],
      eventDefinitions: {},
      dots: {},
      innerWayRules: [],
      innerWayConditions: [],
      weapons: [],
    },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
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
    startAnchor: { rowId: "rotation-0" },
    weapons: [],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
  const result = calculateRotationBaseline(input)
  for (const random of [undefined, () => 0.5]) {
    const hits = calculateRotationDamageSequence(result.baseline, random)
    const first = hits[0].breakdown
    for (const [index, stack] of [0, 1, 2, 3, 4, 5, 5, 0].entries()) {
      expect(hits[index].expectedBuffStacks?.Hawkwing).toBe(stack)
      expect(hits[index].breakdown.physical / first.physical).toBeCloseTo(1 + stack * 0.018, 12)
      expect(hits[index].breakdown.bellstrike / first.bellstrike).toBeCloseTo(1 + stack * 0.018, 12)
      expect(hits[index].breakdown.silkbind).toBe(first.silkbind)
    }
  }
})
