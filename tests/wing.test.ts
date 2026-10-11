import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { weaponArtBonus } from "@/calculations/damage"
import { mainAttributeForWeapons } from "@/calculations/effectiveStats"
import { emptyStats } from "@/data/statDefinitions"
import { buildEntryAvailableForMartialArts, defaultBuildPresets, gearDefinitionForSlot } from "@/gear"
import { normalizeStoredWeaponIds, weaponIds } from "@/types"

describe("Wings placeholder integration", () => {
  it("resolves both weapons through the shared stat, gear, and empty-build pipelines", () => {
    const weapons = typedPathDefinitions.silkbindWing.lockedWeapons!
    expect(mainAttributeForWeapons([weapons[0]])).toBe("silkbind")
    expect(mainAttributeForWeapons([weapons[1]])).toBe("silkbind")
    for (const slot of ["leftWeapon", "rightWeapon"] as const) {
      expect(gearDefinitionForSlot(slot, weapons).definition.slots).toContain(slot)
    }
    const preset = defaultBuildPresets.find(preset => preset.id === "empty")!
    expect(
      buildEntryAvailableForMartialArts(
        { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
        weapons,
      ),
    ).toBe(true)
    expect(
      weaponArtBonus({ ...emptyStats, ribbonAndDrumDmgBoost: 0.25, fanDmgBoost: 0.1 }, [
        martialArtDefinitions[weapons[0]].weapon,
      ]),
    ).toBe(0.25)
  })
  it("expands a previously universal weapon list while preserving a specific saved pair", () => {
    const oldUniversal = weaponIds.filter(id => id !== "wendongNichang" && id !== "xingyouCaoye")
    expect(normalizeStoredWeaponIds(oldUniversal)).toEqual([...weaponIds])
    expect(normalizeStoredWeaponIds(["panaceaFan", "soulshadeUmbrella"])).toEqual(["panaceaFan", "soulshadeUmbrella"])
  })
})
