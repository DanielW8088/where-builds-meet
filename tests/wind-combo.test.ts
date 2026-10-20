import buffs from "@gamedata/buff/bamboocut-wind.json"
import skills from "@gamedata/skill/infernal-twinblades.json"
import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type RotationStep } from "@/calculations/rotationTimeline"

import { castStep, delayStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const run = (steps: RotationStep[]) =>
  buildRotationTimeline({
    rotation: { name: "Combo", steps },
    skills: { ...asSkillRecords(skills), Observe: { castTime: 0 } },
    effectDefinitions: asEffectDefinitions(buffs),
    dots: {},
    eventDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["infernalTwinblades"],
  })

describe("Wind combo tracking", () => {
  it.each([1, 2, 3, 4])("lets Flamelash cancel A%s after all hits and Hellfire gains", stage => {
    const full = run([castStep(`InfernalLight${stage}`), castStep("Flamelash")])
    const cancel = run([castStep(`InfernalLight${stage}Cancel`), castStep("Flamelash")])
    const fullFlame = full.find(row => row.step.skill === "Flamelash")!
    const cancelFlame = cancel.find(row => row.step.skill === "Flamelash")!
    const damage = (rows: typeof full) => rows[0].actions.filter(action => action.type === "damage")
    expect(damage(cancel)).toEqual(damage(full))
    expect(cancelFlame.resources.Hellfire).toBe(fullFlame.resources.Hellfire)
    expect(cancelFlame.resources.Hellfire).toBe(10)
    expect(cancelFlame.startTime).toBeCloseTo(Math.max(...damage(cancel).map(action => Number(action.time))))
    expect(cancelFlame.startTime).toBeLessThan(fullFlame.startTime)
  })
  it("retains only landed hits when a combo is interrupted", () => {
    const rows = run([
      castStep("InfernalFlamelashLight1Combo"),
      castStep("InfernalFlamelashLight4Combo"),
      castStep("Observe"),
    ])
    expect(rows[0].actions.filter(a => a.type === "damage")).toHaveLength(1)
    expect(rows[1].actions.filter(a => a.type === "damage")).toHaveLength(0)
    expect(rows[2].startTime).toBeCloseTo(0.446)
    expect(rows[2].buffs.get("InfernalFlamelashCombo")?.stack).toBe(5)
  })
  it("sets rather than accumulates the next stage and clears on the final strike", () => {
    const rows = run([
      castStep("InfernalLight1Combo"),
      castStep("InfernalLight2Combo"),
      castStep("Observe"),
      castStep("InfernalLight4"),
      castStep("Observe"),
    ])
    expect(rows[2].buffs.get("InfernalLightCombo")?.stack).toBe(3)
    expect(rows[4].buffs.has("InfernalLightCombo")).toBe(false)
  })
  it("preserves combo across an intervening action and expires at the window end", () => {
    const rows = run([
      castStep("InfernalFlamelashLight1Combo"),
      delayStep(0.2),
      castStep("Observe"),
      delayStep(0.2),
      castStep("Observe"),
    ])
    const observed = rows.filter(r => r.step.skill === "Observe")
    expect(observed[0].buffs.get("InfernalFlamelashCombo")?.stack).toBe(2)
    expect(observed[1].buffs.has("InfernalFlamelashCombo")).toBe(false)
  })
})
