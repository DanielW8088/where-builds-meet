import {
  attunementAvailableForSettings,
  availableSetEntriesForSettings,
  characterStatAvailableForSettings,
  innerWayAvailableForPath,
} from "@/application/characterComposition"
// Static metadata a character editor needs: what can be chosen, and what it is called.
import type { PathId } from "@/application/contracts"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import {
  divinecraftDisplayOrder,
  foodAvailableForPath,
  scriptDisplayOrder,
  typedArmorSetDefinitions,
  typedArsenalDefinitions,
  typedBowRingSetDefinitions,
  typedBreakthroughProfiles,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
  typedWeaponSetDefinitions,
} from "@/application/gameData/setup"
import { innerWayDefinitions } from "@/data/innerWayDefinitions"
import { allStatDefinitions } from "@/data/statDefinitions"
import {
  affixOptionsForGearDefinition,
  attunementData,
  attunementsForGearDefinition,
  defaultBuildPresets,
  gearData,
  gearDefinitionForSlot,
  gearLevels,
  gearSlots,
  maxGearRoll,
} from "@/gear"
import { defaultGlobalDebuffs, globalDebuffRows } from "@/globalDebuffs"

import { pathWeapons, rotationsForWeapons } from "./engine"
import { gameText, hasText, text } from "./i18n"

const attributeNames: Record<string, string> = {
  bellstrike: "鸣金",
  stonesplit: "裂石",
  silkbind: "牵丝",
  bamboocut: "破竹",
}

function pathShortName(pathId: string, englishName: string) {
  const dataKey = `data.path.${pathId}.name`
  if (hasText(dataKey)) return text(dataKey)
  const systemKey = `system.path.${englishName.toLowerCase()}`
  return hasText(systemKey) ? text(systemKey) : englishName
}

function rollsByLevel(key: string, category: "affix" | "attunement") {
  return Object.fromEntries(
    gearLevels.flatMap(level => {
      const max = maxGearRoll(key, category, false, level)
      return max === undefined ? [] : [[level, max]]
    }),
  )
}

export function buildCatalog(engineVersion: string) {
  const paths = Object.entries(typedPathDefinitions).flatMap(([id, path]) => {
    const pathId = id as PathId
    if (path.status === "devOnly") return []
    const weapons = pathWeapons(pathId)
    if (!weapons) return []
    const rotations = rotationsForWeapons(weapons)
    if (!rotations.length) return []
    const settings = { weapons, breakthrough: "18", ping: 0 }
    const attribute = Object.keys(attributeNames).find(prefix => pathId.startsWith(prefix))
    const short = pathShortName(pathId, path.name)
    const presets = defaultBuildPresets.filter(preset => preset.buildGroup === path.buildGroup && !preset.test)
    return [
      {
        id: pathId,
        name: attribute ? `${attributeNames[attribute]}${short}` : short,
        shortName: short,
        attribute: attribute ?? null,
        status: path.status,
        weapons: weapons.map(weapon => ({ id: weapon, name: gameText(martialArtDefinitions[weapon].name) })),
        gearDefinitions: gearSlots.map(slot => ({
          slot,
          definitionId: gearDefinitionForSlot(slot, weapons).definitionId,
        })),
        defaultBuild: path.defaultBuild,
        graduated: path.graduated.filter(buildId => buildId !== "empty"),
        defaultRotation: path.defaultRotation,
        rotations: rotations.map(entry => ({ id: entry.id, name: gameText(entry.rotation.name) })),
        presets: presets.map(preset => ({
          id: preset.id,
          name: gameText(preset.name),
          graduate: path.graduated.includes(preset.id),
          relayed: preset.relayed === true,
        })),
        stats: allStatDefinitions
          .filter(definition => characterStatAvailableForSettings(definition.key, settings, pathId))
          .map(definition => definition.key),
        attunements: Object.keys(attunementData).filter(key => attunementAvailableForSettings(key, pathId, settings)),
        innerWays: Object.entries(innerWayDefinitions)
          .filter(([innerWay]) => innerWayAvailableForPath(innerWay, pathId))
          .map(([innerWay, definition]) => ({ id: innerWay, name: gameText(definition.name) })),
        weaponSets: availableSetEntriesForSettings(typedWeaponSetDefinitions, settings, pathId).map(([setId, set]) => ({
          id: setId,
          name: gameText(set.name),
        })),
        armorSets: availableSetEntriesForSettings(typedArmorSetDefinitions, settings, pathId).map(([setId, set]) => ({
          id: setId,
          name: gameText(set.name),
        })),
        foods: Object.entries(typedFoodDefinitions)
          .filter(
            ([food, definition]) =>
              food !== "None" && definition.category === "food" && foodAvailableForPath(food, pathId, "food"),
          )
          .map(([food, definition]) => ({ id: food, name: gameText(definition.name) })),
        enduranceFoods: Object.entries(typedFoodDefinitions)
          .filter(
            ([food, definition]) =>
              food !== "None" &&
              definition.category === "enduranceFood" &&
              foodAvailableForPath(food, pathId, "enduranceFood"),
          )
          .map(([food, definition]) => ({ id: food, name: gameText(definition.name) })),
      },
    ]
  })

  return {
    engineVersion,
    breakthroughs: Object.entries(typedBreakthroughProfiles).map(([id, profile]) => ({
      id,
      gearTier: profile.gearTier,
      defense: profile.defense,
      judgementResistance: profile.judgementResistance,
    })),
    paths,
    slots: gearSlots.map(slot => ({ id: slot, name: text(`system.gearSlot.${slot}`, slot) })),
    gear: Object.fromEntries(
      Object.entries(gearData.gear).map(([definitionId, definition]) => [
        definitionId,
        {
          name: gameText(definition.name),
          slots: definition.slots,
          weapon: definition.weapon ?? null,
          levels: Object.fromEntries(
            gearLevels.map(level => [
              level,
              {
                baseAffixes: affixOptionsForGearDefinition(definition, "baseAffixes", level),
                additionalAffixes: affixOptionsForGearDefinition(definition, "additionalAffixes", level),
                relayedAdditionalAffixes: affixOptionsForGearDefinition(definition, "additionalAffixes", level, true),
                baseStats: definition.baseStats[String(level)] ?? {},
              },
            ]),
          ),
          attunements: attunementsForGearDefinition(definition),
        },
      ]),
    ),
    affixes: Object.fromEntries(
      Object.entries(gearData.affixes).map(([key, affix]) => [
        key,
        {
          name: text(`stat.${key}`, gameText(affix.name)),
          percentage: affix.percentage === true,
          max: rollsByLevel(key, "affix"),
        },
      ]),
    ),
    attunements: Object.fromEntries(
      Object.entries(attunementData).map(([key, attunement]) => [
        key,
        {
          name: gameText(attunement.name),
          percentage: attunement.percentage === true,
          tags: attunement.tags,
          max: rollsByLevel(key, "attunement"),
        },
      ]),
    ),
    stats: allStatDefinitions.map(definition => ({
      key: definition.key,
      name: text(`stat.${definition.key}`, definition.label),
      percentage: definition.unit === "%",
    })),
    bowRingSets: Object.entries(typedBowRingSetDefinitions).map(([id, set]) => ({ id, name: gameText(set.name) })),
    arsenals: Object.entries(typedArsenalDefinitions).map(([id, arsenal]) => ({ id, name: gameText(arsenal.name) })),
    scripts: scriptDisplayOrder.map(id => ({ id, name: gameText(typedScriptDefinitions[id]?.name ?? id) })),
    divinecrafts: divinecraftDisplayOrder
      .filter((id): id is NonNullable<typeof id> => id !== null && typedDivinecraftDefinitions[id]?.available !== false)
      .map(id => ({ id, name: gameText(typedDivinecraftDefinitions[id]?.name ?? id) })),
    innerWayTiers: ["T0", "T1", "T2", "T3", "T4", "T5", "T6"],
    globalDebuffs: {
      defaults: defaultGlobalDebuffs,
      toggles: globalDebuffRows.map(row => ({ key: row.key, name: `${gameText(row.name)}（${gameText(row.path)}）` })),
      choices: [
        {
          key: "draught",
          name: text("ui.app.draughtDebuffs"),
          options: ["none", "strayhunt", "both"].map(id => ({ id, name: text(`ui.app.${id}`) })),
        },
        {
          key: "floatingGrace",
          name: `${gameText("Floating Grace")}（${text("system.path.deluge")}）`,
          options: [
            { id: "none", name: text("ui.app.none") },
            { id: "mixed", name: text("data.path.mixed.name") },
            { id: "deluge", name: text("system.path.deluge") },
          ],
        },
        {
          key: "silkbindWings",
          name: text("ui.app.silkbindWings"),
          options: [
            { id: "none", name: text("ui.app.none") },
            { id: "yellow", name: text("ui.app.wingsYellow") },
            { id: "blue", name: text("ui.app.wingsBlue") },
            { id: "full", name: text("ui.app.wingsFull") },
          ],
        },
        {
          key: "qingyisCharm",
          name: text("system.innerWay.bitterSeasons"),
          options: [
            { id: "none", name: text("ui.app.none") },
            { id: "T1", name: "T1" },
            { id: "T6", name: "T6" },
          ],
        },
      ],
    },
  }
}

export type Catalog = ReturnType<typeof buildCatalog>
