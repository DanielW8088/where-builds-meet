import { create } from "zustand"

import type { PathId } from "@/application/contracts"
import {
  gearScopeReconciled,
  gearScopeWithIds,
  loadGearScope,
  persistGearScope,
  scopedBuildIds,
  scopedItemIds,
  sharedGearScope,
  unplacedIds,
  type GearScope,
  type ScopeTarget,
} from "@/application/gearScope"
import { activeBuildByPathStorageKey, activeBuildStorageKey } from "@/application/persistence/keys"
import { loadPathSelectionIds, withPathSelection, type PathSelectionIds } from "@/application/persistence/pathSelection"
import { buildListStorageKey, loadBuildState, serializeBuildState, type BuildState } from "@/gear"
import { setPersistentItem } from "@/persistentStorage"

import { useGearOptimizationStore } from "./gearOptimizationStore"

/**
 * The builds the user has and the gear they are made of, and which path may see each.
 *
 * Preset and user-defined builds are one list, and the gear inventory is shared between all of
 * them — a build records which item ids it equips rather than carrying copies — so they are
 * stored as one record and held here as one value. Editing a build and editing the inventory are
 * the same act of storing the list, which is why they do not drift apart here.
 *
 * `activeBuildId` is the legacy single-selection field inside that record. It is not stored:
 * persistence is the per-path map below, which a build list cannot express because a session has
 * one active build per path rather than one overall. The two are the same fact at two levels, so
 * the mutators that move one move both.
 *
 * `scope` is authoritative over both lists, which is why the two filter sites read it through the
 * selectors at the foot of this store rather than filtering the entries themselves. It is kept
 * here rather than beside the records because placing a new build and storing the build list are
 * one act, and a caller that did one without the other would leave a build no path can see.
 *
 * Read with selectors, like `rotationStore` and unlike the calculation cache in `dpsStore`. Every
 * mutator stores what it sets, so state and storage cannot drift apart.
 */
export type GearStore = {
  buildState: BuildState
  scope: GearScope
  activeBuildIdsByPath: PathSelectionIds

  /**
   * Reads the stored builds, inventory, per-path selection and scope.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it.
   */
  initialise: (pathId: PathId) => void
  /**
   * Applies a change to the build list or the inventory and stores the result, which cannot drift
   * apart. Covers creating, renaming, duplicating and deleting a build, equipping gear, and
   * importing a build from a file or the official export.
   *
   * The path is an argument because the scope is the one thing here that cannot be derived from
   * the records, and `loadoutStore` holds the session's path rather than this store keeping a
   * second copy of it that could disagree.
   */
  updateBuildState: (pathId: PathId, update: (state: BuildState) => BuildState) => void
  /** Records the active build for one path, and for the session as a whole. */
  selectBuildForPath: (id: string, pathId: PathId) => void
  /** Writes a whole selection map, which is what switching paths resolves. */
  setBuildsByPath: (ids: PathSelectionIds) => void

  /**
   * Turns a sharing setting on. The maps are kept, so a path the user had arranged is still
   * arranged if they turn sharing off again.
   */
  shareGear: (target: ScopeTarget) => void
  /**
   * Turns a sharing setting off, first placing the ids that no path has yet. The caller reads
   * `unplacedCount` to decide whether to ask where they go; this stores the answer, and places
   * nothing when the count was zero, so the two cannot disagree about what was asked.
   */
  unshareGear: (target: ScopeTarget, placement: { target: "all" | "path"; pathId: PathId }) => void
  /** How many builds or items a sharing setting would have to ask about, which may be none. */
  unplacedCount: (target: ScopeTarget) => number
}

const emptyBuildState: BuildState = { entries: [], activeBuildId: "", gearItems: [] }

/** What the store's own functions need to read and write it, without closing over the factory. */
type StoreApi = { get: () => GearStore; set: (next: Partial<GearStore>) => void }

export const useGearStore = create<GearStore>()((set, get) => {
  const api: StoreApi = { get, set }
  return {
    buildState: emptyBuildState,
    scope: sharedGearScope,
    activeBuildIdsByPath: {},

    initialise: pathId => boot(api, pathId),
    updateBuildState: (pathId, update) => applyBuildChange(api, pathId, update),
    selectBuildForPath: (id, pathId) => activateBuild(api, id, pathId),
    setBuildsByPath: ids => writeSelection(api, ids),
    shareGear: target => writeScope(api, sharedFlag(get().scope, target, true)),
    unshareGear: (target, placement) => unshare(api, target, placement),
    unplacedCount: target => unplacedIds(get().scope, target, scopedIds(get().buildState, target)).length,
  }
})

function boot({ set }: StoreApi, pathId: PathId) {
  set({
    buildState: loadBuildState(),
    scope: loadGearScope(),
    activeBuildIdsByPath: loadPathSelectionIds(activeBuildByPathStorageKey, activeBuildStorageKey, pathId),
  })
}

/** A build list and the scope describing it are one change, so they are written together here. */
function applyBuildChange({ get, set }: StoreApi, pathId: PathId, update: (state: BuildState) => BuildState) {
  const current = get().buildState
  let next = update(current)
  const run = useGearOptimizationStore.getState().run
  if (run) {
    if (next.gearItems !== current.gearItems) return
    const locked = current.entries.find(entry => entry.id === run.input.build.id)
    next = {
      ...next,
      gearItems: current.gearItems,
      entries: next.entries.map(entry => (entry.id === locked?.id ? locked : entry)),
    }
    if (locked && !next.entries.some(entry => entry.id === locked.id)) next.entries = [...next.entries, locked]
  }
  // The stored record holds the entries and the inventory, not the active selection, so a change
  // that only moves the selection has nothing to store.
  if (next.entries !== current.entries || next.gearItems !== current.gearItems) {
    setPersistentItem(buildListStorageKey, serializeBuildState(next))
  }
  writeScope({ get, set }, gearScopeReconciled(get().scope, current, next, pathId))
  set({ buildState: next })
}

function activateBuild({ get, set }: StoreApi, id: string, pathId: PathId) {
  writeSelection({ get, set }, withPathSelection(get().activeBuildIdsByPath, pathId, id))
  const buildState = get().buildState
  set({ buildState: buildState.activeBuildId === id ? buildState : { ...buildState, activeBuildId: id } })
}

function writeScope({ get, set }: StoreApi, next: GearScope) {
  if (next === get().scope) return
  persistGearScope(next)
  set({ scope: next })
}

function writeSelection({ get, set }: StoreApi, next: PathSelectionIds) {
  if (next === get().activeBuildIdsByPath) return
  setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(next))
  set({ activeBuildIdsByPath: next })
}

function unshare(api: StoreApi, target: ScopeTarget, placement: { target: "all" | "path"; pathId: PathId }) {
  const { get } = api
  const current = get().scope
  const unplaced = unplacedIds(current, target, scopedIds(get().buildState, target))
  const placed = unplaced.length > 0 ? gearScopeWithIds(current, target, unplaced, placement) : current
  writeScope(api, sharedFlag(placed, target, false))
}

/** The ids a scope has to account for. Presets are excluded, because they are never scoped. */
function scopedIds(buildState: BuildState, target: ScopeTarget) {
  return target === "inventory" ? scopedItemIds(buildState) : scopedBuildIds(buildState)
}

function sharedFlag(scope: GearScope, target: ScopeTarget, shared: boolean): GearScope {
  switch (target) {
    case "inventory":
      return scope.sharedInventory === shared ? scope : { ...scope, sharedInventory: shared }
    case "builds":
      return scope.sharedBuilds === shared ? scope : { ...scope, sharedBuilds: shared }
  }
}
