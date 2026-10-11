import { describe, expect, it } from "vitest"

import { emptyAttunementStats, matchingAttunementEntries } from "@/calculations/attunementStats"
import { maxGearRoll } from "@/gear"

describe("Wings attunement eligibility", () => {
  it.each([
    ["WendongNichang", "MartialArt", "wendongNichangMartialBoost"],
    ["WendongNichang", "Special", "wendongNichangSpecialBoost"],
    ["WendongNichang", "Light", "wendongNichangLightHeavyVariedComboBoost"],
    ["WendongNichang", "Heavy", "wendongNichangLightHeavyVariedComboBoost"],
    ["WendongNichang", "VariedCombo", "wendongNichangLightHeavyVariedComboBoost"],
    ["XingyouCaoye", "MartialArt", "xingyouCaoyeMartialBoost"],
    ["XingyouCaoye", "Heavy", "xingyouCaoyeHeavyVariedComboBoost"],
    ["XingyouCaoye", "VariedCombo", "xingyouCaoyeHeavyVariedComboBoost"],
  ])("applies only the matching bonus to %s %s", (art, category, key) => {
    const wingsKeys = new Set(
      Object.keys(emptyAttunementStats).filter(id => id.startsWith("wendongNichang") || id.startsWith("xingyouCaoye")),
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
    ["XingyouCaoye", "Light"],
    ["WendongNichang", "Charged"],
    ["NamelessSword", "MartialArt"],
  ])("does not boost unrelated %s %s attacks", (art, category) => {
    const matched = matchingAttunementEntries(emptyAttunementStats, [art, category])
    expect(matched.some(entry => entry.key.startsWith("wendongNichang") || entry.key.startsWith("xingyouCaoye"))).toBe(
      false,
    )
  })
})
