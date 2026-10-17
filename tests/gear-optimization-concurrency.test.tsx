// @vitest-environment jsdom
import { act, createElement, useMemo } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GearSearchInput } from "@/calculations/gearOptimization"
import { calculateRotationBaseline, calculateRotationComparisons } from "@/calculations/rotationCalculator"
import { useBuildThroughputs } from "@/features/build/useBuildThroughputs"
import { useGearComparison } from "@/features/build/useGearComparison"
import { useActiveRotationResult } from "@/features/rotations/useActiveRotationResult"
import { useGearOptimizationStore } from "@/stores/gearOptimizationStore"
import { useRotationStore } from "@/stores/rotationStore"

import { dpsDispatches, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { realGearSearchInput } from "./helpers/gearOptimizationScenarios"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("baseline", async request => calculateRotationBaseline(request.build()))
dpsResolves("comparisons", async request => ({
  metrics: calculateRotationComparisons(request.build(), request.baseline()),
}))
dpsResolves("throughput", async request => {
  const { metrics } = calculateRotationBaseline(request.build())
  return { dps: metrics.dps, hps: metrics.hps, totalDamage: metrics.totalDamage }
})

let container: HTMLDivElement
let root: Root
let readings: ReturnType<typeof useBuildThroughputs>
let gearComparison: ReturnType<typeof useGearComparison>
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function report(viewed: ReturnType<typeof useBuildThroughputs>, comparison: ReturnType<typeof useGearComparison>) {
  readings = viewed
  gearComparison = comparison
}

function Viewer({ input, rotationId }: { input: GearSearchInput; rotationId: string }) {
  useActiveRotationResult({
    comparisonsActive: true,
    pathId: input.context.environment.pathId,
    build: input.build,
    gearItems: input.items,
    measurement: input.context,
    activeRotationId: rotationId,
    defaultRotationId: rotationId,
    devMode: false,
    weapons: input.context.environment.settings.weapons,
  })
  const targets = useMemo(() => [{ key: "viewed", build: input.build }], [input.build])
  const viewed = useBuildThroughputs({
    targets,
    gearItems: input.items,
    context: input.context,
    rotation: input.rotation,
  })
  const helmet = input.items.find(item => item.id === "upgrade:helmet")!
  const comparison = useGearComparison({
    build: input.build,
    slot: "helmet",
    candidates: [helmet],
    equippedId: input.build.equipped?.helmet,
    visibleItemIds: new Set([helmet.id]),
    gearItems: input.items,
    context: input.context,
    rotation: input.rotation,
  })
  report(viewed, comparison)
  return null
}

function fixture() {
  const input = realGearSearchInput(0)
  input.rotation = {
    name: "Original rotation",
    start: { step: 0 },
    steps: [
      { type: "skill", skill: "SnowpartingQ" },
      { type: "event", event: "Delay", duration: 3 },
    ],
  }
  return input
}

async function view(input: GearSearchInput, rotationId: string) {
  await act(async () => root.render(createElement(Viewer, { input, rotationId })))
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  resetDpsMock()
  useRotationStore.getState().clear()
  useGearOptimizationStore.getState().setRun(undefined)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  useGearOptimizationStore.getState().setRun(undefined)
  container.remove()
})

describe("normal calculations alongside an optimizer snapshot", () => {
  it("calculates the optimizing build under a newly selected rotation and leaves the search snapshot untouched", async () => {
    const original = fixture()
    const current: GearSearchInput = {
      ...original,
      rotation: {
        ...original.rotation,
        name: "New rotation",
        steps: [
          { type: "skill" as const, skill: "SnowpartingQ2" },
          { type: "event" as const, event: "Delay", duration: 6 },
        ],
      },
    }
    useRotationStore.setState({
      entries: [
        { id: "new", rotation: current.rotation, martialArts: [...current.context.environment.settings.weapons] },
      ],
    })
    useGearOptimizationStore.getState().setRun({ input: structuredClone(original) })
    await view(current, "new")
    const result = useRotationStore.getState().result!
    expect(result.rotationId).toBe("new")
    expect(result.rotation.name).toBe("New rotation")
    expect(result.metrics.dps).toBeGreaterThan(0)
    expect(result.metrics.statPriority.length).toBeGreaterThan(0)
    expect(dpsDispatches("comparisons").length).toBeGreaterThan(0)
    expect(readings.viewed?.dps).toBe(result.metrics.dps)
    expect(useGearOptimizationStore.getState().run!.input).toEqual(original)
  })

  it("refreshes another build and its gear comparisons, without rescheduling them for optimizer progress", async () => {
    const original = fixture()
    const other: GearSearchInput = {
      ...original,
      build: { ...original.build, id: "other-build", setup: { ...original.build.setup!, bowRingSet: "None" } },
    }
    const rotationId = "original"
    useRotationStore.setState({
      entries: [
        {
          id: rotationId,
          rotation: original.rotation,
          martialArts: [...original.context.environment.settings.weapons],
        },
      ],
    })
    useGearOptimizationStore.getState().setRun({ input: structuredClone(original) })
    await view(original, rotationId)
    const originalResult = useRotationStore.getState().result!
    const previousDispatches = dpsDispatches("comparisons").length
    await view(other, rotationId)
    const current = useRotationStore.getState().result!
    expect(current.bundleKey).not.toBe(originalResult.bundleKey)
    expect(current.metrics.dps).not.toBe(originalResult.metrics.dps)
    expect(dpsDispatches("comparisons").length).toBeGreaterThan(previousDispatches)
    expect(gearComparison.reference?.dps).toBe(current.metrics.dps)
    expect(gearComparison.readingFor("upgrade:helmet")).toBeDefined()
    const comparisons = dpsDispatches("comparisons").length
    const throughput = dpsDispatches("throughput").length
    const run = useGearOptimizationStore.getState().run!
    await act(async () =>
      useGearOptimizationStore
        .getState()
        .setRun({
          ...run,
          progress: {
            phase: "searching",
            completed: 3,
            total: 16,
            fast: 16,
            rebuild: 0,
            equipped: { ...original.build.equipped, helmet: "upgrade:helmet" },
            reading: { dps: 999_999, hps: 0, totalDamage: 9_999_990 },
          },
        }),
    )
    await view(other, rotationId)
    expect(useRotationStore.getState().result!.bundleKey).toBe(current.bundleKey)
    expect(readings.viewed?.dps).toBe(current.metrics.dps)
    expect(dpsDispatches("comparisons")).toHaveLength(comparisons)
    expect(dpsDispatches("throughput")).toHaveLength(throughput)
    expect(useGearOptimizationStore.getState().run!.input).toEqual(original)
  })
})
