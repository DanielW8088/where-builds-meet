import assert from "node:assert/strict"

import windBuffs from "@gamedata/buff/bamboocut-wind.json"
import rotation from "@gamedata/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"

import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
import { rowCasting } from "./helpers/timelineRows"

function bundleFor(full = false) {
  const preset = structuredClone(rotation) as RotationRecord
  if (full) preset.steps = preset.steps.filter(step => step.type !== "event" || step.event !== "BattleEnd")
  const bundle = buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      pathId: "bamboocutWind",
      martialArts: ["infernalTwinblades", "mortalRopeDart"],
      rotation: preset,
      skillOverrides: {},
      previewId: null,
    },
    "wind-fully-relayed-min",
  )
  if (!bundle) throw new Error("Missing Wind production bundle")
  return bundle
}

describe("Wind dummy preset", () => {
  it("omits the passive from other paths' calculation setup", () => {
    const wind = bundleFor()
    const kite = buildPresetRotationBundle(
      {
        ...dpsSnapshotEnvironment,
        pathId: "bamboocutKite",
        martialArts: ["heavenwill", "skygrasp"],
        rotation: { name: "Equipment scope", steps: [] },
        skillOverrides: {},
        previewId: null,
      },
      "kite-fully-relayed-min",
    )!
    const passive = windBuffs.InfernalLightAttackPveBonus.effect[0]
    expect(wind.timeline.setupEffects).toContain(passive)
    expect(kite.timeline.setupEffects).not.toContain(passive)
  })
  it("applies the persistent PvE bonus only to Infernal Light Attack damage", () => {
    const bundle = bundleFor()
    bundle.enemy = { ...bundle.enemy, defense: 0, physicalResistance: 0, judgementResistance: 0 }
    const passive = windBuffs.InfernalLightAttackPveBonus.effect[0]
    const productionRules = bundle.timeline.setupEffects!.filter(rule => rule === passive)
    const ids = ["InfernalLight1", "InfernalFlamelashLight1", "InfernalFlamelashLight5Cancel", "AddledMind", "Rodent"]
    bundle.stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
    delete bundle.rawStats
    delete bundle.baseStats
    bundle.startAnchor = { rowId: "rotation-0" }
    bundle.timeline = {
      ...bundle.timeline,
      initialBuffs: [],
      initialDebuffs: [],
      innerWayRules: [],
      innerWayConditions: [],
      setupEffects: [...productionRules, { effect: { hpDMGBonus: 0.2 } }],
      rotation: {
        name: "Persistent Light Attack bonus",
        ping: 0,
        steps: [...ids, "OtherLight"].map(skill => ({ type: "skill" as const, skill })),
      },
      skills: Object.fromEntries(
        [...ids, "OtherLight"].map(id => [
          id,
          {
            castTime: 1,
            tags: id === "OtherLight" ? ["MartialArts", "MortalRopeDart", "Light"] : bundle.timeline.skills[id].tags,
            action: [{ type: "damage", time: 0, phyCoef: 1 }],
          },
        ]),
      ),
    }
    const boosted = calculateRotationBaseline(bundle)
    bundle.timeline.setupEffects = [{ effect: { hpDMGBonus: 0.2 } }]
    const control = calculateRotationBaseline(bundle)
    for (let index = 0; index < 6; index++) {
      const key = `rotation-${index}:0`
      expect(boosted.actionBreakdowns[key].total / control.actionBreakdowns[key].total).toBeCloseTo(
        index < 3 ? 1.3 / 1.2 : 1,
      )
    }
  })

  it("anchors combat to RD Q damage and preserves the authored sequence with a 60-second cutoff", () => {
    const bundle = bundleFor()
    const result = calculateRotationBaseline(bundle)
    const full = calculateRotationBaseline(bundleFor(true))
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const fullCasts = full.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const firstQ = casts.find(row => row.step.type === "skill" && row.step.skill === "BladeboundThreadCancel")!
    const fightStart = firstQ.startTime + Number(firstQ.actions[0].time)
    expect(result.duration).toBeCloseTo(60)
    expect(Math.min(...result.baseline.map(entry => entry.timelineTime!))).toBeCloseTo(fightStart)
    expect(result.baseline.every(entry => entry.timelineTime! <= fightStart + 60)).toBe(true)
    for (const row of fullCasts.filter(row => row.step.skill === "BladeboundThreadCancel")) {
      const next = fullCasts[fullCasts.indexOf(row) + 1]
      expect(next.step.skill).toBe("Deflect")
      expect(next.startTime).toBeCloseTo(row.startTime + row.effectiveCastTime)
    }
    for (const row of fullCasts.filter(row => ["InfernalLight2", "InfernalLight3"].includes(row.step.skill ?? ""))) {
      const previous = fullCasts[fullCasts.indexOf(row) - 1]
      const previousSkill = row.step.skill === "InfernalLight2" ? "InfernalLight1" : "InfernalLight2"
      expect(previous.step.skill).toBe(previousSkill)
      expect(row.startTime).toBeCloseTo(previous.startTime + previous.effectiveCastTime)
    }
    const activations = fullCasts.filter(row => row.step.skill === "Flamelash")
    expect(activations).toHaveLength(4)
    const rodentCancels = fullCasts.filter(row => row.step.skill?.endsWith("Rodent"))
    expect(rodentCancels.length).toBeGreaterThan(0)
    for (const row of rodentCancels) {
      expect(row.effectiveCastTime).toBe(0)
      assert.equal(
        row.actions.some(action => action.type === "damage"),
        false,
      )
    }
    // Flamelash may expire during a cast, but must be active when that cast starts.
    for (const row of casts.filter(
      row =>
        row.step.skill?.startsWith("InfernalFlamelashLight") && row.actions.some(action => action.type === "damage"),
    )) {
      expect(row.buffs.has("Flamelash")).toBe(true)
    }
    for (const [index, row] of fullCasts.entries()) {
      if (!row.step.skill?.includes("PerfectDodge")) continue
      const cancel = fullCasts[index - 1]
      expect(cancel.step.skill?.endsWith("Rodent")).toBe(true)
      expect(
        full.timeline.filter(trigger => trigger.sourceRowId === cancel.id && trigger.step.skill === "Rodent"),
      ).toHaveLength(cancel.buffs.has("RodentRampage") || cancel.buffs.has("EnhancedRodentRampage") ? 1 : 0)
      expect(cancel.startTime).toBeLessThanOrEqual(row.startTime)
    }
    expect(fullCasts.length).toBe(bundle.timeline.rotation.steps.filter(step => step.type === "skill").length)
    expect(casts.map(row => row.id)).toEqual(
      fullCasts.filter(row => row.startTime < fightStart + 60).map(row => row.id),
    )
    expect(result.metrics.totalDamage).toBeGreaterThan(0)
    expect(Number.isFinite(result.metrics.dps)).toBe(true)
  })

  it("cancels completed FA5 casts and keeps the seven selected dodge windows", () => {
    const { timeline } = calculateRotationBaseline(bundleFor(true))
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const firstQ = rowCasting(casts, "BladeboundThreadCancel")
    const anchor = firstQ.startTime + Number(firstQ.actions[0].time)
    const dodges = casts.filter(row => row.step.skill === "PerfectDodge")
    expect(dodges.map(row => Number((row.startTime - anchor).toFixed(3)))).toEqual([
      5.475, 11.475, 17.475, 23.475, 29.475, 41.475, 47.475,
    ])
    let worldUsed = false
    for (const [index, row] of casts.entries()) {
      const match = /^InfernalFlamelashLight([1-5])(Cancel|Rodent)?$/.exec(row.step.skill ?? "")
      if (!match) continue
      const stage = Number(match[1])
      if (match[2] === "Rodent") {
        const dodge = casts[index + 1]
        assert.equal(dodge.step.skill, "PerfectDodge")
        assert.equal(
          row.actions.some(action => action.type === "damage"),
          false,
        )
        continue
      }
      if (stage === 5) {
        const q = casts[index + 1]
        assert.equal(row.step.skill, "InfernalFlamelashLight5Cancel")
        let expectedCancel = "WorldToSword"
        if (worldUsed) expectedCancel = q.buffs.has("Flamelash") ? "AddledMind" : "Deflect"
        assert.equal(q.step.skill, expectedCancel)
        const lastHit = Math.max(
          ...row.actions.filter(action => action.type === "damage").map(action => Number(action.time)),
        )
        assert(Math.abs(row.effectiveCastTime - lastHit) < 1e-9)
        assert(Math.abs(q.startTime - row.startTime - lastHit - (expectedCancel === "AddledMind" ? 0.04 : 0)) < 1e-9)
        worldUsed = true
      }
    }
  })

  it.each([0, 1, 2])("ends Flamelash window %s on the drain tick that exhausts Hellfire", index => {
    const bundle = bundleFor()
    const flame = bundle.timeline.skills.Flamelash
    const checkpoints = Array.from({ length: 120 }, (_, tick) => (tick + 1) * 0.132)
    bundle.timeline.skills = {
      ...bundle.timeline.skills,
      Flamelash: { ...flame, action: [...flame.action!, { type: "trigger", value: "HellfireObservation", time: 0 }] },
      HellfireObservation: {
        castTime: 0,
        tags: ["Triggered"],
        action: checkpoints.flatMap(time =>
          [time - 0.001, time + 0.001].map(time => ({ type: "addResource", value: "Hellfire", amount: 0, time })),
        ),
      },
    }
    const { timeline } = calculateRotationBaseline(bundle)
    const observation = timeline.filter(row => row.step.skill === "HellfireObservation")[index]
    const pairs = checkpoints
      .map((_, tick) => ({
        tick,
        before: observation.actionStates[tick * 2],
        after: observation.actionStates[tick * 2 + 1],
      }))
      .filter(pair => pair.before && pair.after && pair.before.buffs.has("Flamelash"))
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.every(pair => pair.before.resources.Hellfire > 0)).toBe(true)
    const sustained = pairs.filter(pair => pair.after.buffs.has("Flamelash"))
    expect(sustained.every(pair => pair.after.resources.Hellfire > 0)).toBe(true)
    const depletions = pairs.filter(pair => !pair.after.buffs.has("Flamelash"))
    expect(depletions).toHaveLength(1)
    expect(depletions[0].after.resources.Hellfire).toBe(0)
    expect(depletions[0].before.resources.Hellfire).toBeLessThanOrEqual(1 + depletions[0].tick * 0.05 + 1e-9)
  })

  it("refills Hellfire after the second Flamelash and preserves the selected FA1 restart", () => {
    const { timeline } = calculateRotationBaseline(bundleFor())
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const firstQ = casts.find(row => row.step.skill === "BladeboundThreadCancel")!
    const anchor = firstQ.startTime + Number(firstQ.actions[0].time)
    const dodge = casts.find(
      row => row.step.skill === "PerfectDodge" && Math.abs(row.startTime - anchor - 23.475) < 1e-9,
    )!
    expect(casts[casts.indexOf(dodge) + 1].step.skill).toBe("InfernalFlamelashLight1")
    const third = casts.filter(row => row.step.skill === "Flamelash")[2]
    const refill = casts.find(row => row.startTime > dodge.startTime && row.step.skill === "InfernalLight1")!
    expect(refill.buffs.has("Flamelash")).toBe(false)
    expect(third.resources.Hellfire).toBe(80)
  })

  it("refreshes Rampage after the third activation and refills before the fourth", () => {
    const { timeline } = calculateRotationBaseline(bundleFor())
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const activations = casts.filter(row => row.step.skill === "Flamelash")
    expect(activations).toHaveLength(4)
    const thirdIndex = casts.indexOf(activations[2])
    expect(casts.slice(thirdIndex + 1, thirdIndex + 6).map(row => row.step.skill)).toEqual([
      "InfernalFlamelashLight1",
      "InfernalFlamelashLight2",
      "BladeboundThreadCancel",
      "Deflect",
      "RodentRampage",
    ])
    const fourth = activations[3]
    expect(fourth.resources.Hellfire).toBe(80)
    const refillCancel = casts.findLast(row => row.step.skill === "Deflect" && row.startTime < fourth.startTime)!
    const normals = casts.filter(
      row =>
        row.startTime > refillCancel.startTime &&
        row.startTime < fourth.startTime &&
        /^InfernalLight[1-4]$/.test(row.step.skill ?? ""),
    )
    expect(normals.length).toBeGreaterThanOrEqual(4)
    expect(normals.every(row => !row.buffs.has("Flamelash"))).toBe(true)
    expect(normals.slice(0, 4).map(row => row.step.skill)).toEqual([
      "InfernalLight1",
      "InfernalLight2",
      "InfernalLight3",
      "InfernalLight4",
    ])
    const enhanced = casts.filter(
      row => row.startTime > fourth.startTime && row.step.skill?.startsWith("InfernalFlamelashLight"),
    )
    expect(enhanced.length).toBeGreaterThan(0)
    expect(enhanced.every(row => row.buffs.has("Flamelash"))).toBe(true)
  })

  it("keeps attacking late while Breaking Point is cooling down and Mystery is absent", () => {
    const { timeline } = calculateRotationBaseline(bundleFor())
    const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const fourth = casts.findLast(row => row.step.skill === "Flamelash")!
    const refill = casts[casts.indexOf(fourth) - 1]
    expect(refill.step.skill).toBe("InfernalLight1")
    expect(refill.effectiveCastTime).toBeGreaterThan(0)
    const tail = casts.filter(row => row.startTime >= refill.startTime)
    expect(tail.every(row => row.buffs.has("BreakingPointCooldown"))).toBe(true)
    expect(tail.every(row => ![...row.buffs.keys()].some(name => name.startsWith("Mystery")))).toBe(true)
    expect(tail.some(row => row.step.skill === "PerfectDodge" || row.step.skill?.endsWith("Rodent"))).toBe(false)
    const fa2 = tail.findLast(row => row.step.skill === "InfernalFlamelashLight2")!
    const next = casts[casts.indexOf(fa2) + 1]
    expect(next.step.skill).toBe("InfernalFlamelashLight3")
    expect(next.startTime).toBeCloseTo(fa2.startTime + fa2.effectiveCastTime)
  })

  it("resolves paired dummy attacks, infinite Vitality, and the break after FA1 damage", () => {
    const bundle = bundleFor()
    const { timeline } = calculateRotationBaseline(bundle)
    const attacks = timeline.filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
    expect(attacks).toHaveLength(20)
    for (let index = 0; index < attacks.length; index += 2) {
      expect(attacks[index].startTime).toBeCloseTo(attacks[index + 1].startTime)
    }
    const states = timeline.flatMap(row => Object.values(row.actionStates))
    expect(states.every(state => state.resources.Vitality === bundle.timeline.resourceMaximums!.Vitality)).toBe(true)
    const breakIndex = bundle.timeline.rotation.steps.findIndex(
      step => step.type === "event" && step.event === "Qi" && step.targetQiRatio === 0,
    )
    const fa1 = timeline.find(row => row.id === "rotation-" + (breakIndex + 1))!
    const fa2 = timeline.find(row => row.id === "rotation-" + (breakIndex + 2))!
    expect(fa1.actionStates[1].targetQiRatio).toBe(0.3999)
    expect(fa2.actionStates[0].targetQiRatio).toBe(0)
    expect(
      timeline.some(row => row.step.type === "skill" && row.step.skill === "GhostlyStepsUmbraDodgeDualBlades"),
    ).toBe(true)
  })

  it("depletes Qi before the first break and toward a second break beyond Battle End", () => {
    const { timeline } = calculateRotationBaseline(bundleFor())
    const firstQ = rowCasting(timeline, "BladeboundThreadCancel")!
    const fightStart = firstQ.startTime + Number(firstQ.actions[0].time)
    const qiRows = timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
    expect(qiRows).toHaveLength(5)
    const breakTime = qiRows[2].startTime - fightStart
    expect(breakTime).toBeGreaterThan(0)
    expect(breakTime).toBeLessThan(60)
    const recoveryTime = breakTime + 10
    const ratios = [0.5999, 0.3999, 0, 0.5999, 0.3999]
    expect(qiRows.slice(1).every((row, index) => row.startTime > qiRows[index].startTime)).toBe(true)
    qiRows.forEach((row, index) => {
      const actionIndex = row.actions.findIndex(action => action.type === "setQi")
      expect(row.actionStates[actionIndex + 1].targetQiRatio).toBe(ratios[index])
    })
    const afterRecovery = timeline
      .flatMap(row =>
        row.actions.map((action, index) => ({
          time: row.startTime + Number(action.time ?? 0) - fightStart,
          state: row.actionStates[index],
        })),
      )
      .filter(entry => entry.time > recoveryTime + 0.01 && entry.time < qiRows[3].startTime - fightStart - 0.2)
    expect(afterRecovery.length).toBeGreaterThan(0)
    expect(afterRecovery.every(entry => entry.state.targetQiRatio === 1)).toBe(true)
  })
  it("applies base Flamelash bonuses at cast start and removes them on Hellfire depletion", () => {
    const bundle = bundleFor()
    bundle.stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, critDmgBonus: 0.5 }
    bundle.derivedStats = calculateDerivedStats(bundle.stats, 0)
    delete bundle.rawStats
    delete bundle.baseStats
    bundle.enemy = { ...bundle.enemy, defense: 0, physicalResistance: 0, judgementResistance: 0 }
    bundle.startAnchor = { rowId: "rotation-0" }
    bundle.timeline = {
      ...bundle.timeline,
      initialResources: { Hellfire: 80 },
      setupEffects: [],
      innerWayRules: [],
      innerWayConditions: [],
      rotation: {
        name: "Flamelash lifecycle",
        ping: 0,
        steps: [
          { type: "skill", skill: "Observe" },
          { type: "event", event: "Delay", duration: 0.2 },
          { type: "skill", skill: "Flamelash" },
          { type: "event", event: "Delay", duration: 5 },
        ],
      },
      skills: {
        ...bundle.timeline.skills,
        Observe: { castTime: 0, ignorePing: true, action: [{ type: "trigger", value: "Observation", time: 0 }] },
        Observation: {
          castTime: 0,
          tags: ["Triggered"],
          action: [0.199, 0.201, 5.611, 5.613].map(time => ({ type: "damage", phyCoef: 1, time })),
        },
      },
    }
    const result = calculateRotationBaseline(bundle)
    const row = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "Observation")
    assert(row, "The wind probe must schedule its Observation skill.")
    const damage = [0, 1, 2, 3].map(index => result.actionBreakdowns[`${row?.id ?? ""}:${index}`])
    const criticalRateOf = (index: number) => damage[index]?.outcomeRates?.critical
    expect([0, 1, 2, 3].map(criticalRateOf)).toEqual([0, 0.1, 0.1, 0])
    expect(damage[1].total / damage[0].total).toBeCloseTo(1.07)
    expect(damage[2].total).toBeCloseTo(damage[1].total)
    expect(damage[3].total).toBeCloseTo(damage[0].total)
  })
})
