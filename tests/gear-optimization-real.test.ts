import { describe, expect, it } from "vitest"

import {
  optimizeGear,
  type EquippedGear,
  type GearSearchInput,
  type GearSearchProgress,
} from "@/calculations/gearOptimization"
import { buildRotationCalculationBundle, measurementSubject } from "@/calculations/rotationCalculationBundle"
import {
  calculateRotationBaseline,
  calculateRotationGearCandidate,
  rotationGearTimelineKey,
} from "@/calculations/rotationCalculator"
import { gearSlots, isGearItemCompatible, parseGearInventory } from "@/gear"

import {
  realGearSearchInput,
  realGearSearchScenarios,
  realGearTradeoffInput,
} from "./helpers/gearOptimizationScenarios"

/** Independent physical-item enumeration: deliberately uses neither optimizer enumeration nor deduplication. */
function exhaustiveEquipment(input: GearSearchInput): EquippedGear[] {
  const result: EquippedGear[] = []
  let partial: EquippedGear[] = [{}]
  for (const slot of gearSlots) {
    const items = input.items.filter(item =>
      isGearItemCompatible(item, slot, input.context.environment.settings.weapons),
    )
    const next: EquippedGear[] = []
    for (const equipped of partial) {
      if (!items.length) {
        next.push(equipped)
        continue
      }
      for (const item of items) {
        if (Object.values(equipped).includes(item.id)) continue
        next.push({ ...equipped, [slot]: item.id })
      }
    }
    partial = next
  }
  result.push(...partial)
  return result
}

function bundleFor(input: GearSearchInput, equipped = input.build.equipped) {
  return buildRotationCalculationBundle(
    measurementSubject({
      build: { ...input.build, equipped },
      gearItems: input.items,
      context: input.context,
      rotation: input.rotation,
    }),
  )
}

function expectWithinFourUlps(actual: number, expected: number) {
  expect(Number.isFinite(actual)).toBe(true)
  expect(actual).toBeGreaterThan(0)
  const view = new DataView(new ArrayBuffer(16))
  view.setFloat64(0, actual)
  view.setFloat64(8, expected)
  const difference = view.getBigUint64(0) - view.getBigUint64(8)
  expect(difference < 0n ? -difference : difference).toBeLessThanOrEqual(4n)
}

describe("real preset rotations and saved inventories", () => {
  it.each(realGearSearchScenarios.map((scenario, index) => Object.assign({}, scenario, { index })))(
    "$name",
    ({ index }) => {
      const input = realGearSearchInput(index)
      const snapshot = structuredClone(input)
      const original = bundleFor(input)
      const baseline = calculateRotationBaseline(original)
      expect(baseline.duration).toBeGreaterThan(50)
      expect(baseline.baseline.length).toBeGreaterThan(20)
      const key = rotationGearTimelineKey(original, baseline)
      const physical = exhaustiveEquipment(input)
      const evaluated = physical.map(equipped => {
        const bundle = bundleFor(input, equipped)
        const fresh = calculateRotationBaseline(bundle)
        return { bundle, fresh }
      })
      for (const { bundle, fresh } of evaluated.filter(
        result => key !== undefined && rotationGearTimelineKey(result.bundle, baseline) === key,
      )) {
        const reused = calculateRotationGearCandidate(bundle, baseline)
        expectWithinFourUlps(reused.damage, fresh.metrics.totalDamage)
        expectWithinFourUlps(reused.damage / reused.duration, fresh.metrics.dps)
        expect(reused.duration).toBe(fresh.duration)
      }
      const updates: GearSearchProgress[] = []
      optimizeGear(input, progress => updates.push(progress))
      const final = updates.at(-1)!
      expect(final.phase).toBe("completed")
      expect(final.total).toBe(16)
      expect(physical.length).toBeGreaterThan(final.total)
      expect(final.completed).toBe(final.total)
      expect(final.fast + final.rebuild).toBe(final.total)
      expect(final.reading!.dps).toBeGreaterThan(baseline.metrics.dps)
      expectWithinFourUlps(final.reading!.dps, Math.max(...evaluated.map(result => result.fresh.metrics.dps)))
      expectWithinFourUlps(calculateRotationBaseline(bundleFor(input, final.equipped)).metrics.dps, final.reading!.dps)
      for (const progress of updates) {
        expectWithinFourUlps(
          calculateRotationBaseline(bundleFor(input, progress.equipped)).metrics.dps,
          progress.reading!.dps,
        )
      }
      const bestReadings = updates.map(progress => progress.reading!.dps)
      expect(bestReadings).toEqual([...bestReadings].sort((a, b) => a - b))
      expect(input).toEqual(snapshot)
      expect(final.fast).toBe(index === 0 ? final.total : 0)
    },
  )

  it("handles a legal Purple armor alternative that changes HP alongside ordinary fast-path gear", () => {
    const input = realGearSearchInput(0)
    const helmet = input.items.find(item => item.id === "upgrade:helmet")!
    input.items.push({ ...helmet, id: "purple-helmet", rarity: "Purple" })
    expect(parseGearInventory({ items: input.items }).items).toHaveLength(input.items.length)
    const updates: GearSearchProgress[] = []
    optimizeGear(input, progress => updates.push(progress))
    const final = updates.at(-1)!
    expect(final.fast).toBeGreaterThan(0)
    expect(final.rebuild).toBeGreaterThan(0)
    expect(final.total).toBe(24)
    const oracle = Math.max(
      ...exhaustiveEquipment(input).map(equipped => calculateRotationBaseline(bundleFor(input, equipped)).metrics.dps),
    )
    expectWithinFourUlps(final.reading!.dps, oracle)
  })

  it("rejects an expensive real inventory before searching, using a controlled timing sample", () => {
    const input = realGearSearchInput(0, gearSlots)
    const snapshot = structuredClone(input)
    const updates: GearSearchProgress[] = []
    let virtualTime = 0
    expect(() =>
      optimizeGear(
        input,
        progress => updates.push(progress),
        () => (virtualTime += 80),
      ),
    ).toThrow("tooLong")
    expect(updates.every(progress => progress.phase === "preparing")).toBe(true)
    expect(virtualTime).toBeLessThan(120_000)
    expect(input).toEqual(snapshot)
  })

  it("finds the exhaustive best when real pure and mixed preset affixes compete across four slots", () => {
    const input = realGearTradeoffInput()
    expect(parseGearInventory({ items: input.items }).items).toHaveLength(input.items.length)
    const updates: GearSearchProgress[] = []
    optimizeGear(input, progress => updates.push(progress))
    const final = updates.at(-1)!
    // One pure/mixed preset item is already equivalent; its extra copy adds no new loadout.
    expect(final.total).toBe(54)
    const freshReadings = exhaustiveEquipment(input).map(
      equipped => calculateRotationBaseline(bundleFor(input, equipped)).metrics.dps,
    )
    expectWithinFourUlps(final.reading!.dps, Math.max(...freshReadings))
    expectWithinFourUlps(calculateRotationBaseline(bundleFor(input, final.equipped)).metrics.dps, final.reading!.dps)
  })
})
