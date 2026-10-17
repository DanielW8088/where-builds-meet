// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { cancelGearOptimization, startGearOptimization } from "@/application/gearOptimization"
import type { GearSearchInput, GearSearchProgress } from "@/calculations/gearOptimization"
import { useGearOptimizationStore } from "@/stores/gearOptimizationStore"
import { useGearStore } from "@/stores/gearStore"

vi.mock("@/notices", () => ({ publishNotice: vi.fn<() => void>(), dismissNotice: vi.fn<() => void>() }))

class SearchWorker {
  static instances: SearchWorker[] = []
  onmessage?: (event: { data: { progress: GearSearchProgress } }) => void
  terminate = vi.fn<() => void>()
  postMessage = vi.fn<() => void>()
  constructor() {
    SearchWorker.instances.push(this)
  }
}

function input(): GearSearchInput {
  return {
    build: {
      id: "search",
      name: "My build",
      equipped: { helmet: "original" },
      setup: { innerWays: [], weaponSets: {}, armorSets: {}, arsenal: "None", bowRingSet: "None" },
    },
    items: [],
    context: {
      environment: { pathId: "stonesplitStrength" },
      buildSetupOverrides: { buildId: "search", overrides: { arsenal: "Other" } },
    } as GearSearchInput["context"],
    rotation: { name: "Original", steps: [] },
  }
}

beforeEach(() => {
  vi.stubGlobal("Worker", SearchWorker)
  SearchWorker.instances = []
  localStorage.clear()
})
afterEach(() => {
  cancelGearOptimization()
  vi.unstubAllGlobals()
})

describe("gear search lifecycle", () => {
  it("snapshots inputs, runs only one worker, and commits the best once on cancellation", () => {
    const original = input()
    useGearStore.setState({ buildState: { entries: [original.build], activeBuildId: "search", gearItems: [] } })
    startGearOptimization(original)
    const worker = SearchWorker.instances[0]
    original.rotation.name = "Edited later"
    original.build.name = "Changed later"
    expect(useGearOptimizationStore.getState().run!.input.rotation.name).toBe("Original")
    expect(useGearOptimizationStore.getState().run!.input.build.name).toBe("My build")
    expect(useGearOptimizationStore.getState().run!.input.context.buildSetupOverrides).toBeUndefined()
    startGearOptimization(input())
    expect(SearchWorker.instances).toHaveLength(1)
    const progress: GearSearchProgress = {
      phase: "searching",
      completed: 5,
      total: 10,
      fast: 9,
      rebuild: 1,
      equipped: { helmet: "best" },
      reading: { dps: 200, hps: 0, totalDamage: 2000 },
    }
    worker.onmessage!({ data: { progress } })
    expect(useGearStore.getState().buildState.entries[0].equipped).toEqual({ helmet: "original" })
    expect(useGearOptimizationStore.getState().run!.progress!.equipped).toEqual({ helmet: "best" })
    cancelGearOptimization()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(useGearOptimizationStore.getState().run).toBeUndefined()
    expect(useGearStore.getState().buildState.entries[0].equipped).toEqual({ helmet: "best" })
    worker.onmessage!({ data: { progress: { ...progress, equipped: { helmet: "stale" } } } })
    expect(useGearStore.getState().buildState.entries[0].equipped).toEqual({ helmet: "best" })
  })

  it("protects the searched build and inventory while allowing another build's setup to change", () => {
    const original = input()
    const other = { ...original.build, id: "other", name: "Other" }
    useGearStore.setState({ buildState: { entries: [original.build, other], activeBuildId: "search", gearItems: [] } })
    startGearOptimization(original)
    useGearStore
      .getState()
      .updateBuildState("stonesplitStrength", state => ({
        ...state,
        entries: state.entries.map(entry => ({ ...entry, name: "Renamed" })),
      }))
    const state = useGearStore.getState().buildState
    expect(state.entries[0].name).toBe("My build")
    expect(state.entries[1].name).toBe("Renamed")
    expect(state.gearItems).toEqual([])
    useGearStore
      .getState()
      .updateBuildState("stonesplitStrength", current => ({ ...current, gearItems: [{ id: "new" }] as never }))
    expect(useGearStore.getState().buildState.gearItems).toEqual([])
  })

  it("commits completed results and releases the run lock", () => {
    const original = input()
    useGearStore.setState({ buildState: { entries: [original.build], activeBuildId: "search", gearItems: [] } })
    startGearOptimization(original)
    SearchWorker.instances[0].onmessage!({
      data: {
        progress: { phase: "completed", completed: 1, total: 1, fast: 1, rebuild: 0, equipped: { helmet: "winner" } },
      },
    })
    expect(useGearOptimizationStore.getState().run).toBeUndefined()
    expect(useGearStore.getState().buildState.entries[0].equipped).toEqual({ helmet: "winner" })
  })
})
