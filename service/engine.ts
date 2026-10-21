import defaultSetup from "@gamedata/default-setup.json"

import { resolveBuildStatState, type BuildStatState } from "@/application/buildStatState"
// The calculations the Yunshen service answers, as plain functions of a JSON character.
// Everything here runs inside a worker thread; see worker.ts.
import type { CalculatorSettings, PathId, SetupSelections } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import {
  breakthroughProfile,
  defaultBreakthrough,
  foodSelectionForPath,
  typedArsenalDefinitions,
  typedBowRingSetDefinitions,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
  typedWeaponSetDefinitions,
  typedArmorSetDefinitions,
} from "@/application/gameData/setup"
import { buildGraduationBundleSet, selectHighestGraduationResult } from "@/application/graduation"
import { defaultRotationEntries, rotationAvailableForWeapons } from "@/application/rotationCatalog"
import type { AttunementOverrides } from "@/calculations/attunementStats"
import { DEFAULT_PING_MS, resolvePing } from "@/calculations/combatDefaults"
import type { AttunementStats } from "@/calculations/damage"
import type { DerivedStats } from "@/calculations/effectiveStats"
import {
  buildRotationCalculationBundle,
  type CalculationSubject,
  type MeasurementContext,
} from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline, calculateRotationSimulation } from "@/calculations/rotationCalculator"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import type { RotationPriority } from "@/calculations/rotationMetrics"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { CharacterStatOverrides } from "@/calculations/statEffects"
import { innerWayDefinitions } from "@/data/innerWayDefinitions"
import { allStatDefinitions } from "@/data/statDefinitions"
import {
  attunementData,
  buildPresetInventory,
  defaultBuildPresets,
  gearSlots,
  normalizeBuildSetup,
  type BuildEntry,
  type BuildSetup,
  type GearItem,
  type GearSlot,
} from "@/gear"
import { normalizeGlobalDebuffs, type GlobalDebuffState } from "@/globalDebuffs"
import type { CharacterStats, WeaponId } from "@/types"

import { gameText, text } from "./i18n"

/** One equipped item. The slot it sits in is the key it is stored under. */
export type GearPiece = Omit<GearItem, "id" | "slot">

/** A character as the Yunshen site stores it: one path, one build, one environment. */
export type CharacterInput = {
  pathId: PathId
  breakthrough?: string
  ping?: number
  rotationId?: string
  setupSelections?: Partial<SetupSelections>
  globalDebuffs?: Partial<GlobalDebuffState>
  setup?: BuildSetup
  /** Gear mode: the equipped item per slot. */
  gear?: Partial<Record<GearSlot, GearPiece>>
  /** Panel mode: final sheet values, percentages as decimals. */
  statOverrides?: CharacterStatOverrides
  attunementOverrides?: AttunementOverrides
}

export type CompareCategory = "statPriority" | "attunementPriority" | "innerWays" | "setup"

export class InputError extends Error {}

type ResolvedCharacter = {
  pathId: PathId
  settings: CalculatorSettings
  setupSelections: SetupSelections
  globalDebuffs: GlobalDebuffState
  rotationId: string
  rotation: RotationRecord
  build: BuildEntry
  gearItems: GearItem[]
  context: MeasurementContext
}

export function pathWeapons(pathId: PathId): [WeaponId, WeaponId] | undefined {
  const path = typedPathDefinitions[pathId]
  const preset = defaultBuildPresets.find(candidate => candidate.id === path?.defaultBuild)
  const weapons = path?.lockedWeapons ?? preset?.martialArts
  return weapons?.length === 2 ? [weapons[0], weapons[1]] : undefined
}

export function rotationsForWeapons(weapons: [WeaponId, WeaponId]) {
  return defaultRotationEntries.filter(
    entry => !entry.test && entry.rotation.steps.length > 0 && rotationAvailableForWeapons(entry, weapons),
  )
}

function resolveCharacter(input: CharacterInput): ResolvedCharacter {
  const pathId = input.pathId
  const path = typedPathDefinitions[pathId]
  if (!path) throw new InputError(`Unknown path ${String(pathId)}.`)
  const weapons = pathWeapons(pathId)
  if (!weapons) throw new InputError(`Path ${pathId} has no weapons.`)
  const breakthrough = input.breakthrough ?? defaultBreakthrough
  const settings: CalculatorSettings = { weapons, breakthrough, ping: input.ping ?? DEFAULT_PING_MS }
  if (!breakthroughProfile(settings)) throw new InputError(`Unknown breakthrough ${breakthrough}.`)

  const rotations = rotationsForWeapons(weapons)
  const entry =
    rotations.find(candidate => candidate.id === input.rotationId) ??
    rotations.find(candidate => candidate.id === path.defaultRotation) ??
    rotations[0]
  if (!entry) throw new InputError(`Path ${pathId} has no rotation.`)

  const selections = input.setupSelections ?? {}
  const setupSelections: SetupSelections = {
    food: foodSelectionForPath(selections.food ?? defaultSetup.food, pathId, "food"),
    enduranceFood: foodSelectionForPath(selections.enduranceFood, pathId, "enduranceFood"),
    script: typedScriptDefinitions[selections.script ?? ""] ? selections.script! : "None",
    divinecraft:
      typedDivinecraftDefinitions[selections.divinecraft ?? ""]?.available !== false &&
      typedDivinecraftDefinitions[selections.divinecraft ?? ""]
        ? selections.divinecraft!
        : defaultSetup.divinecraft,
  }
  const globalDebuffs = normalizeGlobalDebuffs(input.globalDebuffs ?? {})

  const gearItems: GearItem[] = []
  const equipped: Partial<Record<GearSlot, string>> = {}
  for (const slot of gearSlots) {
    const piece = input.gear?.[slot]
    if (!piece) continue
    const id = `gear-${slot}`
    gearItems.push({ ...piece, id, slot })
    equipped[slot] = id
  }
  const build: BuildEntry = {
    id: "character",
    name: "character",
    martialArts: [...weapons],
    equipped,
    setup: normalizeBuildSetup(input.setup),
  }
  const context: MeasurementContext = {
    environment: {
      pathId,
      settings,
      setupSelections,
      skillOverrides: {},
      previewId: null,
      globalDebuffs,
      enemy: breakthroughProfile(settings),
    },
    statOverrides: input.statOverrides ?? {},
    attunementOverrides: input.attunementOverrides ?? {},
  }
  return {
    pathId,
    settings,
    setupSelections,
    globalDebuffs,
    rotationId: entry.id,
    rotation: entry.rotation,
    build,
    gearItems,
    context,
  }
}

// What `measurementSubject` assembles, with the resolved sheet kept whole so the derived rates
// the sheet shows can be returned alongside the calculation.
function subjectFor(character: ResolvedCharacter): CalculationSubject & { build: BuildStatState } {
  const { environment, statOverrides, attunementOverrides } = character.context
  const build = resolveBuildStatState({
    build: character.build,
    gearItems: character.gearItems,
    pathId: environment.pathId,
    settings: environment.settings,
    setupSelections: environment.setupSelections,
    statOverrides,
    attunementOverrides,
  })
  return { ...environment, rotation: character.rotation, build }
}

function graduationFor(character: ResolvedCharacter) {
  const { pathId, settings, setupSelections, globalDebuffs, rotation } = character
  const prepared = buildGraduationBundleSet({
    pathId,
    martialArts: [...settings.weapons],
    rotation: { ...rotation, ping: resolvePing(rotation.ping, settings.ping) },
    breakthrough: settings.breakthrough,
    globalDebuffs,
    food: setupSelections.food,
    enduranceFood: setupSelections.enduranceFood,
    script: setupSelections.script,
    divinecraft: setupSelections.divinecraft,
    graduatedBuildIds: typedPathDefinitions[pathId].graduated,
    skillOverrides: {},
    previewId: null,
  })
  if (!prepared) return null
  const results = prepared.candidates.map(candidate => {
    const { metrics } = calculateRotationBaseline(candidate.bundle)
    return { buildId: candidate.buildId, dps: metrics.dps, hps: metrics.hps }
  })
  return selectHighestGraduationResult(results) ?? null
}

export type EvaluateResult = {
  rotation: { id: string; name: string }
  dps: number
  hps: number
  totalDamage: number
  totalHealing: number
  duration: number
  graduation: { rate: number; dps: number; buildId: string; buildName: string } | null
  stats: CharacterStats
  derived: DerivedStats
  attunement: AttunementStats
  breakdown: {
    skills: Array<{
      id: string
      name: string
      casts: number
      hits: number
      abrasionRate: number
      normalRate: number
      criticalRate: number
      affinityRate: number
      damage: number
      percentage: number
    }>
    healingSkills: Array<{
      id: string
      name: string
      casts: number
      heals: number
      healing: number
      percentage: number
    }>
    damageTypes: Array<{ id: string; name: string; damage: number; percentage: number }>
  }
}

export function evaluate(input: CharacterInput): EvaluateResult {
  const character = resolveCharacter(input)
  const subject = subjectFor(character)
  const baseline = calculateRotationBaseline(buildRotationCalculationBundle(subject))
  const { metrics } = baseline
  const graduate = graduationFor(character)
  const graduatePreset = graduate && defaultBuildPresets.find(preset => preset.id === graduate.buildId)
  return {
    rotation: { id: character.rotationId, name: gameText(character.rotation.name) },
    dps: metrics.dps,
    hps: metrics.hps,
    totalDamage: metrics.totalDamage,
    totalHealing: metrics.totalHealing,
    duration: baseline.duration,
    graduation:
      graduate && graduate.dps > 0
        ? {
            rate: metrics.dps / graduate.dps,
            dps: graduate.dps,
            buildId: graduate.buildId,
            buildName: gameText(graduatePreset?.name ?? graduate.buildId),
          }
        : null,
    stats: subject.build.stats,
    derived: subject.build.derivedStats,
    attunement: subject.build.displayedAttunement,
    breakdown: {
      skills: metrics.breakdown.skills.map(row => ({
        id: row.id,
        name: gameText(row.name),
        casts: row.casts,
        hits: row.hits,
        abrasionRate: row.abrasionRate,
        normalRate: row.normalRate,
        criticalRate: row.criticalRate,
        affinityRate: row.affinityRate,
        damage: row.damage,
        percentage: row.percentage,
      })),
      healingSkills: metrics.breakdown.healingSkills.map(row => ({
        id: row.id,
        name: gameText(row.name),
        casts: row.casts,
        heals: row.heals,
        healing: row.healing,
        percentage: row.percentage,
      })),
      damageTypes: metrics.breakdown.damageTypes.map(row => ({
        id: row.id,
        name: gameText(row.name),
        damage: row.damage,
        percentage: row.percentage,
      })),
    },
  }
}

export type PriorityRow = {
  key: string
  name: string
  maxRoll?: number
  increase: number
  dpsDifference: number
  healingIncrease: number
  hpsDifference: number
}

export type SetupComparisonGroup = { group: string; name: string; rows: PriorityRow[] }

export type CompareResult = {
  statPriority: PriorityRow[]
  attunementPriority: PriorityRow[]
  innerWayPriority: PriorityRow[]
  setupComparisons: SetupComparisonGroup[]
}

const statKeyByLabel = new Map(allStatDefinitions.map(definition => [definition.label, definition.key]))
const attunementKeyByName = new Map(Object.entries(attunementData).map(([key, definition]) => [definition.name, key]))
const innerWayIdByName = new Map(Object.entries(innerWayDefinitions).map(([id, definition]) => [definition.name, id]))

function priorityRow(row: RotationPriority, key: string, name: string): PriorityRow {
  return {
    key,
    name,
    maxRoll: row.maxRoll,
    increase: row.increase,
    dpsDifference: row.dpsDifference,
    healingIncrease: row.healingIncrease,
    hpsDifference: row.hpsDifference,
  }
}

const booleanDebuffNames: Record<string, string> = {
  phantomChime: "Phantom Chime",
  qiImbalance: "Qi Imbalance",
  soulShaken: "Soul-Shaken",
  vulnerable: "Vulnerable",
  fearfulBlade: "Fearful Blade",
}

function setupGroupName(group: string) {
  const [kind, id = ""] = group.split(":")
  switch (kind) {
    case "weaponSets":
      return gameText(typedWeaponSetDefinitions[id]?.name ?? id)
    case "armorSets":
      return gameText(typedArmorSetDefinitions[id]?.name ?? id)
    case "arsenal":
      return text("ui.app.arsenal", "Arsenal")
    case "bowRingSet":
      return text("ui.app.bowRingSet", "Bow / Ring Set")
    case "food":
      return text("ui.app.food", "Food")
    case "enduranceFood":
      return text("ui.app.enduranceFood", "耐力食物")
    case "script":
      return text("ui.app.script", "Script")
    case "divinecraft":
      return text("ui.app.divinecraft", "Divinecraft")
    case "debuff":
    case "buff":
      if (id === "draught") return text("ui.app.draughtDebuffs")
      if (id === "silkbindWings") return text("ui.app.silkbindWings")
      if (id === "qingyisCharm") return text("system.innerWay.bitterSeasons")
      if (id === "floatingGrace") return gameText("Floating Grace")
      return gameText(booleanDebuffNames[id] ?? id)
    default:
      return group
  }
}

function setupValueName(group: string, value: string) {
  const [kind] = group.split(":")
  switch (kind) {
    case "weaponSets":
    case "armorSets":
      return `${value} 件`
    case "arsenal":
      return gameText(typedArsenalDefinitions[value]?.name ?? value)
    case "bowRingSet":
      return gameText(typedBowRingSetDefinitions[value]?.name ?? value)
    case "food":
    case "enduranceFood":
      return gameText(typedFoodDefinitions[value]?.name ?? value)
    case "script":
      return gameText(typedScriptDefinitions[value]?.name ?? value)
    case "divinecraft":
      return gameText(typedDivinecraftDefinitions[value]?.name ?? value)
    default:
      return (
        {
          on: text("ui.app.on"),
          off: text("ui.app.off"),
          none: text("ui.app.none"),
          strayhunt: text("ui.app.strayhunt"),
          both: text("ui.app.both"),
          yellow: text("ui.app.wingsYellow"),
          blue: text("ui.app.wingsBlue"),
          full: text("ui.app.wingsFull"),
          mixed: text("data.path.mixed.name"),
          deluge: text("system.path.deluge"),
        }[value] ?? value
      )
  }
}

export function compare(input: CharacterInput, categories?: CompareCategory[]): CompareResult {
  const character = resolveCharacter(input)
  const wanted = new Set<CompareCategory>(categories ?? ["statPriority", "attunementPriority", "innerWays", "setup"])
  const full = buildRotationComparisonBundle(subjectFor(character), true)
  const bundle = {
    ...full,
    statPriority: wanted.has("statPriority") ? full.statPriority : [],
    attunementPriority: wanted.has("attunementPriority") ? full.attunementPriority : [],
    innerWayPriority: wanted.has("innerWays") ? full.innerWayPriority : [],
    setupComparisons: wanted.has("setup") ? full.setupComparisons : {},
  }
  const { metrics } = calculateRotationSimulation(bundle)
  return {
    statPriority: metrics.statPriority.map(row => {
      const key = statKeyByLabel.get(row.label) ?? row.label
      return priorityRow(row, key, text(`stat.${key}`, gameText(row.label)))
    }),
    attunementPriority: metrics.attunementPriority.map(row => {
      const key = attunementKeyByName.get(row.label) ?? statKeyByLabel.get(row.label) ?? row.label
      return priorityRow(row, key, gameText(row.label))
    }),
    innerWayPriority: metrics.innerWayPriority.map(row =>
      priorityRow(row, innerWayIdByName.get(row.label) ?? row.label, gameText(row.label)),
    ),
    setupComparisons: Object.entries(metrics.setupComparisons).map(([group, rows]) => ({
      group,
      name: setupGroupName(group),
      rows: rows.map(row => priorityRow(row, row.label, setupValueName(group, row.label))),
    })),
  }
}

/** A path preset's gear at a breakthrough's gear tier, in the shape a character stores. */
export function presetBuild(presetId: string, breakthrough = defaultBreakthrough) {
  const preset = defaultBuildPresets.find(candidate => candidate.id === presetId)
  if (!preset) throw new InputError(`Unknown preset ${presetId}.`)
  const weapons = preset.martialArts as [WeaponId, WeaponId]
  const { gearTier } = breakthroughProfile({ weapons, breakthrough, ping: 0 })
  const inventory = buildPresetInventory(preset, gearTier)
  const gear: Partial<Record<GearSlot, GearPiece>> = {}
  for (const slot of gearSlots) {
    const item = inventory.items.find(candidate => candidate.id === inventory.equipped[slot])
    if (!item) continue
    const { id: _id, slot: _slot, ...piece } = item
    gear[slot] = piece
  }
  return { presetId, name: gameText(preset.name), gear, setup: normalizeBuildSetup(preset.setup) }
}
