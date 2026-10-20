import assert from "node:assert/strict"

import rotation from "@gamedata/rotation/bamboocut-wind/wind-dummy-1-min-iv-no-dodge.json"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord, TimelineRow, TrackedEffect } from "@/calculations/rotationTimeline"

import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"

function simulate(breakthrough: string, full = false) {
  const preset = structuredClone(rotation) as RotationRecord
  if (full) preset.steps = preset.steps.filter(step => step.type !== "event" || step.event !== "BattleEnd")
  const bundle = buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      breakthrough,
      pathId: "bamboocutWind",
      martialArts: ["infernalTwinblades", "mortalRopeDart"],
      rotation: preset,
      skillOverrides: {},
      previewId: null,
    },
    "wind-fully-relayed-min",
  )!
  return calculateRotationBaseline(bundle)
}

function appliedEffect(row: TimelineRow, names: string[]): TrackedEffect {
  const effects = Object.values(row.actionStates).flatMap(state => Array.from(state.buffs.values()))
  const effect = effects.find(effect => names.includes(effect.name) && effect.sourceRowId === row.id)
  assert(effect, `Missing applied effect on ${row.step.skill}`)
  return effect!
}

describe.each(["17", "18", "19"])("Wind no-dodge preset at breakthrough %s", breakthrough => {
  it("uses the requested opening cancels and keeps Flute outside Flamelash", () => {
    const result = simulate(breakthrough)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(result.duration).toBeCloseTo(60)
    const full = simulate(breakthrough, true)
    const cutoff = full.timeline[0].battleStartTime! + 60
    expect(
      full.timeline
        .filter(row => row.kind === "rotation" && row.step.type === "skill")
        .every(row => row.startTime < cutoff),
    ).toBe(true)
    expect(result.metrics.dps).toBeGreaterThan(0)
    expect(casts.every(row => !row.skipped)).toBe(true)
    expect(result.timeline.some(row => row.skill?.tags?.some(tag => tag === "Dodge" || tag === "PerfectDodge"))).toBe(
      false,
    )
    expect(result.timeline.some(row => row.step.event === "TakeDamage")).toBe(false)
    const firstA4 = casts.findIndex(row => row.step.skill === "InfernalLight4Cancel")
    expect(casts[firstA4 + 1].step.skill).toBe("GhostlyStepsUmbra")
    expect(casts[firstA4 + 1].startTime).toBeCloseTo(casts[firstA4].startTime + casts[firstA4].effectiveCastTime)
    const firstFA5 = casts.findIndex(row => row.step.skill === "InfernalFlamelashLight5Cancel")
    expect(casts[firstFA5 + 1].step.skill).toBe("WorldToSword")
    expect(casts[firstFA5 + 1].startTime).toBeCloseTo(casts[firstFA5].startTime + casts[firstFA5].effectiveCastTime)
    for (const row of casts.filter(row => row.step.skill === "FluteOfTheTidesCancel"))
      expect(row.buffs.has("Flamelash")).toBe(false)
    for (const row of casts.filter(row => row.step.skill === "Flamelash")) expect(row.resources.Hellfire).toBe(80)
    for (const row of casts.filter(row => row.step.skill?.startsWith("InfernalFlamelashLight")))
      expect(row.buffs.has("Flamelash")).toBe(true)
  })

  it("uses the outgoing Rampage for a full FA3 before the third refresh", () => {
    const { timeline } = simulate(breakthrough)
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const rampages = casts.filter(row => row.step.skill === "RodentRampage")
    const outgoing = appliedEffect(rampages[1], ["RodentRampage", "EnhancedRodentRampage"])
    const refreshIndex = casts.indexOf(rampages[2])
    const fa3 = casts[refreshIndex - 3]
    expect(fa3.step.skill).toBe("InfernalFlamelashLight3")
    const hits = fa3.actions.filter(action => action.type === "damage")
    expect(hits).toHaveLength(8)
    expect(fa3.startTime + Number(hits[0].time)).toBeLessThan(outgoing.expiresAt!)
    expect(fa3.startTime + fa3.effectiveCastTime).toBeGreaterThan(outgoing.expiresAt!)
    expect(casts[refreshIndex - 2].startTime).toBeGreaterThanOrEqual(fa3.startTime + fa3.effectiveCastTime)
  })

  it("lets every light attack trigger Rodent and refreshes expired RD effects", () => {
    const { timeline } = simulate(breakthrough)
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const lights = casts.filter(row => row.skill?.tags?.includes("Light"))
    expect(lights.length).toBeGreaterThan(50)
    for (const row of lights) {
      const firstHit = row.actions.findIndex(action => action.type === "damage")
      const state = row.actionStates[firstHit]
      assert(state, `Missing hit state for ${row.id}`)
      assert(
        state.buffs.has("RodentRampage") || state.buffs.has("EnhancedRodentRampage"),
        `Missing Rampage on ${row.id}`,
      )
      // Rodents whose damage is past Battle End may be omitted from the visible timeline.
      if (row.startTime + Number(row.actions[firstHit].time) + 0.5 < timeline[0].battleStartTime! + 60) {
        assert(
          timeline.some(
            trigger =>
              trigger.step.skill === "Rodent" &&
              Math.abs(trigger.startTime - row.startTime - Number(row.actions[firstHit].time)) < 1e-9,
          ),
          `Missing coordinated Rodent for ${row.id}`,
        )
      }
    }
    const refreshes = casts.filter(row => row.step.skill === "RodentRampage")
    expect(refreshes.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < refreshes.length; i++) {
      const row = refreshes[i]
      const previous = appliedEffect(refreshes[i - 1], ["RodentRampage", "EnhancedRodentRampage"])
      const index = casts.indexOf(row)
      const q = casts[index - 2]
      expect(q.step.skill).toBe("BladeboundThreadCancel")
      expect(casts[index - 1].step.skill).toBe("Deflect")
      expect(q.startTime + 1e-9).toBeGreaterThanOrEqual(previous.expiresAt!)
    }
  })
})
