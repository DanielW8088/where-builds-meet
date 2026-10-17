import { describe, expect, it } from "vitest"

import { arsenalEffectFor, defaultSettings, systemStatEffectsForProgression } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

const settings = (breakthrough: string) => ({ ...defaultSettings, breakthrough })

describe("Enhancement and Arsenal progression", () => {
  it.each([
    { soloLevel: 17, minPhys: 240, maxPhys: 480, maxHp: 40070, physicalDefense: 120 },
    { soloLevel: 18, minPhys: 258, maxPhys: 516, maxHp: 43147, physicalDefense: 130 },
    { soloLevel: 19, minPhys: 276, maxPhys: 552, maxHp: 46223, physicalDefense: 138 },
  ])("applies exported cumulative Enhancement totals at Solo Level $soloLevel", ({ soloLevel, ...expected }) => {
    const effects = systemStatEffectsForProgression(soloLevel, soloLevel).filter(effect => "id" in effect)
    expect(calculateStatsWithEffects(emptyStats, effects, 0).rawStats).toMatchObject(expected)
  })

  it.each([
    ["General", "Phys"],
    ["Bellstrike", "Bellstrike"],
    ["Stonesplit", "Stonesplit"],
    ["Silkbind", "Silkbind"],
    ["Bamboocut", "Bamboocut"],
  ])("applies %s Arsenal attack in its channel and HP at both Solo Levels", (selection, channel) => {
    const calculate = (breakthrough: string) =>
      calculateStatsWithEffects(emptyStats, [arsenalEffectFor(selection, settings(breakthrough))], 0).rawStats
    const before = calculate("17")
    expect(before).toMatchObject({ [`min${channel}`]: 131, [`max${channel}`]: 263, maxHp: 27300 })
    expect(calculate("18")).toMatchObject({ [`min${channel}`]: 148, [`max${channel}`]: 297, maxHp: 31700 })
    expect(calculate("19")).toEqual(calculate("18"))
    expect(calculate("17")).toEqual(before)
  })

  it.each(["17", "18", "19"])(
    "passes resolved progression into the production worker bundle at breakthrough %s",
    breakthrough => {
      const bundle = buildPresetRotationBundle(
        {
          pathId: "stonesplitStrength",
          martialArts: ["snowparting", "phalanxbane"],
          breakthrough,
          rotation: { name: "Progression probe", steps: [{ type: "skill", skill: "AnxiSoldierBurningHeart2" }] },
          food: "None",
          divinecraft: "None",
          script: "None",
          globalDebuffs: defaultGlobalDebuffs,
          skillOverrides: {},
          previewId: null,
        },
        "mixed-fully-relayed-double-min",
      )!
      expect(bundle.timeline.setupEffects).toContainEqual(arsenalEffectFor("Stonesplit", settings(breakthrough)))
      const enhancement = systemStatEffectsForProgression(Number(breakthrough), Number(breakthrough)).find(
        effect => "id" in effect,
      )!
      expect(bundle.timeline.setupEffects).toContainEqual(enhancement)
      expect(JSON.stringify(bundle.timeline.setupEffects)).not.toContain("bySoloLevel")
    },
  )
})
