import { useMemo } from "react"

import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { BuildEntry, GearItem, GearSlot } from "@/gear"
import { useGearOptimizationStore } from "@/stores/gearOptimizationStore"

import { useBuildThroughputs, type ThroughputTarget } from "./useBuildThroughputs"

/** The key the equipped item's own reading is held under. A candidate is keyed by its item id. */
const equippedKey = "equipped"

/**
 * What one item would do to the build that has the equipped item in this slot.
 *
 * A single-slot swap is a build whose loadout names a different item, so it is measured through
 * the same path as any other build rather than as a variant of a baseline. That matters: a swap
 * re-resolves the sheet, including the armour set tiers whose four points the swapped piece
 * competes for, so a variant that only patched the stats would be measuring a sheet the game
 * cannot produce.
 *
 * The swap is written the way `equip` writes it, because that is the state clicking Equip reaches.
 * An item is never in two slots, so moving one has to take it out of wherever it was.
 *
 * That equivalence holds for a build whose `equipped` map is what the sheet is read from, which is
 * every build a reader can equip gear on. A preset is the exception and not a near miss:
 * `resolveBuildInventory` reads the preset's own gear rather than the map, so the swap resolves to
 * the same sheet as the reference and every candidate would read `0` — a number, where the honest
 * answer for an unmeasured candidate is nothing. The inventory is closed on those builds, so no card
 * is ever asked about one; the precondition is stated here so that closing them stays a deliberate
 * rule rather than something that would break silently if a panel were opened on a preset.
 */
function buildWithSwappedItem(build: BuildEntry, slot: GearSlot, item: GearItem): BuildEntry {
  return {
    ...build,
    equipped: {
      ...Object.fromEntries(Object.entries(build.equipped ?? {}).filter(([, id]) => id !== item.id)),
      [slot]: item.id,
    },
  }
}

/**
 * A swap that is written once and handed back unchanged until something it was built from moves.
 *
 * `measurementFor` recognises a bundle it already holds by comparing the build it was given, so a
 * caller that rebuilt the swap on every render would make every candidate look new and no bundle
 * would ever be reused. That is exactly what a scroll does: the cards on screen change, and with
 * them every swap. Held per item, the swap for a card still on screen survives the cards around it
 * appearing and leaving, so the one that arrives is the only thing that costs a bundle.
 *
 * Keyed on the build weakly, so the swaps are dropped with the build they were made from, and
 * checked against the slot, since a swap is a function of both.
 */
const swapsByBuild = new WeakMap<BuildEntry, Map<string, { slot: GearSlot; build: BuildEntry }>>()

function swappedBuild(build: BuildEntry, slot: GearSlot, item: GearItem): BuildEntry {
  const held = swapsByBuild.get(build) ?? new Map()
  swapsByBuild.set(build, held)
  const previous = held.get(item.id)
  if (previous && previous.slot === slot) return previous.build
  const swapped = buildWithSwappedItem(build, slot, item)
  held.set(item.id, { slot, build: swapped })
  return swapped
}

/**
 * The candidates in one slot that are on screen, measured against the item it has equipped.
 *
 * A reading is a whole rotation, so this is bounded by what the reader can see rather than by the
 * inventory: opening a slot asks only about the cards in view. Scrolling brings the next ones in.
 * The equipped item is never a candidate of itself; it is the reading everything else is weighed
 * against, and the card says so in words instead of showing it a difference of zero.
 *
 * The build has to be one whose `equipped` map names the gear it wears. A preset does not, and a
 * preset therefore has nothing here to compare; see `buildWithSwappedItem` for why.
 */
export function useGearComparison(input: {
  build: BuildEntry | undefined
  slot: GearSlot
  candidates: readonly GearItem[]
  /** The item the slot has equipped, which is the reading every candidate is compared to. */
  equippedId: string | undefined
  /** The candidates currently on screen, reported by their own cards. */
  visibleItemIds: ReadonlySet<string>
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
}) {
  const { build, slot, candidates, equippedId, visibleItemIds, gearItems, context, rotation } = input
  const optimizing = useGearOptimizationStore(state => build !== undefined && state.run?.input.build.id === build.id)

  const targets = useMemo<ThroughputTarget[]>(() => {
    if (!build || optimizing) return []
    return [
      { key: equippedKey, build },
      ...candidates
        .filter(item => item.id !== equippedId && visibleItemIds.has(item.id))
        .map(item => ({ key: item.id, build: swappedBuild(build, slot, item) })),
    ]
  }, [build, slot, candidates, equippedId, visibleItemIds, optimizing])

  const readings = useBuildThroughputs({ targets, gearItems, context, rotation })
  const reference = readings[equippedKey]

  return {
    /** The reference every candidate is weighed against, absent until it has been measured. */
    reference,
    readingFor: (itemId: string) => (itemId === equippedId ? reference : readings[itemId]),
  }
}
