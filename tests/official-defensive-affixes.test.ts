import { describe, expect, it } from "vitest"

import { calculateEquippedGearEffects, mergeImportedBuildState, parseGearInventory } from "@/gear"
import { parseOfficialGearExport } from "@/officialGearImport"

describe("official defensive affixes", () => {
  it.each([96, 100])("preserves tier %i defensive rolls through import, storage, and equipped effects", level => {
    const prefix = level === 100 ? 101 : 97
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          1: {
            exVo: {
              level,
              rarity: "Gold",
              baseAffixes: [
                [Number(`${prefix}11001`), 53],
                [Number(`${prefix}93001`), 40],
                [Number(`${prefix}93003`), 41],
                [Number(`${prefix}93006`), 2500],
                [Number(`${prefix}93009`), 35],
              ],
            },
          },
        },
      },
      ["namelessSword", "snowparting"],
    )
    expect(parsed.warnings).toEqual([])
    const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
    expect(merged.importedGearCount).toBe(1)
    const inventory = parseGearInventory(
      JSON.parse(JSON.stringify({ items: merged.state.gearItems, equipped: merged.state.entries[0]!.equipped })),
    )
    expect(inventory.items[0]?.additionalAffixes).toEqual([
      { key: "body", value: 40 },
      { key: "defense", value: 41 },
      { key: "maxHp", value: 2500 },
      { key: "physicalDefense", value: 35 },
    ])
    expect(calculateEquippedGearEffects(inventory, ["namelessSword", "snowparting"]).stats).toMatchObject({
      body: 40,
      defense: 41,
      maxHp: 2500,
      physicalDefense: 35,
    })
  })

  it("imports tier 100 armor attunements with their percentage roll intact", () => {
    const parsed = parseOfficialGearExport(
      {
        wearEquipsDetailed: {
          3: {
            exVo: {
              level: 100,
              rarity: "Gold",
              baseAffixes: [
                [10143001, 3444],
                [10193103, 41],
                [290202, 7],
              ],
            },
          },
        },
      },
      ["thundercry", "stormbreaker"],
    )
    expect(parsed.warnings).toEqual([])
    expect(parsed.exportValue.gearItems[0]).toMatchObject({
      level: 100,
      baseAffix: { key: "maxHp", value: 3444 },
      additionalAffixes: [{ key: "defense", value: 41 }],
      attunement: { key: "thundercryChargedBoost", value: 0.07 },
    })
  })

  for (const [slot, id, key, value] of [
    [3, 9743001, "maxHp", 2500],
    [4, 9743002, "physicalDefense", 35],
    [5, 9753006, "body", 40],
    [8, 9753001, "maxHp", 2500],
  ] as const) {
    it(`accepts defensive armor base affix ${id}`, () => {
      const parsed = parseOfficialGearExport(
        {
          wearEquipsDetailed: {
            [slot]: {
              exVo: {
                level: 96,
                rarity: "Gold",
                baseAffixes: [
                  [id, value],
                  [9793103, 41],
                ],
              },
            },
          },
        },
        ["namelessSword", "snowparting"],
      )
      expect(parsed.warnings).toEqual([])
      const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
      expect(merged.importedGearCount).toBe(1)
      expect(merged.state.gearItems[0]?.baseAffix).toEqual({ key, value })
      expect(merged.state.gearItems[0]?.additionalAffixes).toEqual([{ key: "defense", value: 41 }])
    })
  }
})
