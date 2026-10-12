import { describe, expect, it } from "vitest"

import { emptyAttunementStats, matchingAttunementEntries } from "@/calculations/attunementStats"
import { maxGearRoll } from "@/gear"

describe("Wings attunement eligibility", () => {
  it.each([
    ["MuseflowWaistDrum", "MartialArt", "museflowWaistDrumMartialBoost"],
    ["MuseflowWaistDrum", "Special", "museflowWaistDrumSpecialBoost"],
    ["MuseflowWaistDrum", "Light", "museflowWaistDrumLightHeavyVariedComboBoost"],
    ["MuseflowWaistDrum", "Heavy", "museflowWaistDrumLightHeavyVariedComboBoost"],
    ["MuseflowWaistDrum", "VariedCombo", "museflowWaistDrumLightHeavyVariedComboBoost"],
    ["WillowbendFan", "MartialArt", "willowbendFanMartialBoost"],
    ["WillowbendFan", "Heavy", "willowbendFanHeavyVariedComboBoost"],
    ["WillowbendFan", "VariedCombo", "willowbendFanHeavyVariedComboBoost"],
  ])("applies only the matching bonus to %s %s", (art, category, key) => {
    const wingsKeys = new Set(
      Object.keys(emptyAttunementStats).filter(
        id => id.startsWith("museflowWaistDrum") || id.startsWith("willowbendFan"),
      ),
    )
    const matched = matchingAttunementEntries(emptyAttunementStats, [art, category]).filter(entry =>
      wingsKeys.has(entry.key),
    )
    expect(matched.map(entry => entry.key)).toEqual([key])
    expect(matched[0].stat?.attunementDMGBonus).toBe(1)
    expect(maxGearRoll(key, "attunement", false, 96)).toBe(0.06)
    expect(maxGearRoll(key, "attunement", false, 100)).toBe(0.07)
  })

  it.each([
    ["WillowbendFan", "Light"],
    ["MuseflowWaistDrum", "Charged"],
    ["NamelessSword", "MartialArt"],
  ])("does not boost unrelated %s %s attacks", (art, category) => {
    const matched = matchingAttunementEntries(emptyAttunementStats, [art, category])
    expect(
      matched.some(entry => entry.key.startsWith("museflowWaistDrum") || entry.key.startsWith("willowbendFan")),
    ).toBe(false)
  })
})
