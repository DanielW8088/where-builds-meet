import build from "@gamedata/build/silkbind-wing/wings-fully-relayed-min.json"
import dawnsun from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-jadebreaker.json"
import system from "@gamedata/system.json"
import { describe, expect, it } from "vitest"

import {
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectableRotationSkillGroups,
  setupConditionsFor,
} from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type RotationRecord, type SkillRecord } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import type { BuildSetup } from "@/gear"
import type { WeaponId } from "@/types"

const weapons: WeaponId[] = ["wendongNichang", "xingyouCaoye"]
function timeline(
  rotation: unknown,
  harmonyTier = "T6",
  skills: Record<string, SkillRecord> = allSkillDefinitions,
  extraInnerWays: BuildSetup["innerWays"] = [],
) {
  const innerWays = build.setup.innerWays
    .map(row => Object.assign({}, row, { tier: row.innerWay === "SongOfHarmony" ? harmonyTier : row.tier }))
    .concat(extraInnerWays) as BuildSetup["innerWays"]
  const setupEffects = martialArtEffectsForRank(martialArtDefinitions, weapons, 14)
  return buildRotationTimeline({
    rotation: rotation as RotationRecord,
    skills,
    eventDefinitions: rotationEventDefinitions,
    dots: {},
    effectDefinitions,
    innerWayConditions: [
      ...innerWayConditionsFor(innerWays, undefined, "silkbindWing"),
      ...setupConditionsFor(setupEffects),
      "Cloudshear4P",
    ],
    innerWayRules: innerWayEffectRulesFor(innerWays, 21, "silkbindWing"),
    setupEffects,
    weapons,
    initialResources: system.initialResources,
    resourceMaximums: system.resourceMaximums,
    cooldownPolicy: "wait",
  })
}
describe("Wings preset combat", () => {
  it.each([
    ["T3", 6.5],
    ["T6", 10.5],
  ] as const)("extends Dawnsun Radiant Drum at %s", (tier, expiresAt) => {
    const rows = timeline(
      {
        name: "Dawnsun extension",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Rustling" },
          { type: "skill", skill: "RippleDawnsun" },
          { type: "skill", skill: "Observe" },
        ],
      },
      tier,
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
    )
    const special = rows.find(row => row.step.skill === "RippleDawnsun")!
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.buffs.get("RadiantDrum")!.expiresAt! - special.startTime).toBeCloseTo(expiresAt)
  })
  it.each([
    ["T0", 1, 0],
    ["T0", 2, 0],
    ["T0", 3, 1],
    ["T4", 1, 0],
    ["T4", 2, 1],
    ["T4", 3, 2],
  ] as const)("applies Cuncao %s with %s enemies and expires its stacks", (tier, enemyCount, perHit) => {
    const rows = timeline(
      {
        name: "Cuncao stacks",
        enemyCount,
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Rustling" },
          { type: "skill", skill: "Observe" },
          ...Array.from({ length: 6 }, () => [
            { type: "skill", skill: "HarmoniousDrum" },
            { type: "skill", skill: "Observe" },
          ]).flat(),
          { type: "event", event: "Delay", duration: 8.1 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
      [{ innerWay: "CuncaoXin", tier }],
    )
    const observations = rows.filter(row => row.step.skill === "Observe")
    expect(observations[0].debuffs.has("Cuncao")).toBe(false)
    for (let i = 1; i <= 6; i++) expect(observations[i].debuffs.get("Cuncao")?.stack ?? 0).toBe(Math.min(i * perHit, 5))
    expect(observations.at(-1)!.debuffs.has("Cuncao")).toBe(false)
  })
  it.each([1, 2, 3, 4, 5])(
    "uses enemy count %s for Perception dash timing without adding other-target damage",
    enemyCount => {
      const rows = timeline({
        name: "Perception targets",
        enemyCount,
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "FiendishSquall" },
          { type: "skill", skill: "CraneWings" },
        ],
      })
      const perception = rows.find(row => row.step.skill === "FiendishSquall")!
      const hits = perception.actions.filter(
        (action, index) => action.type === "damage" && perception.actionStates[index]?.combatOrder !== undefined,
      )
      const extra = (Math.min(enemyCount, 4) - 1) * 0.4
      expect(hits).toHaveLength(2)
      expect(Number(hits[0].time)).toBeCloseTo(0.566)
      expect(Number(hits[1].time)).toBeCloseTo(1.816 + extra)
      expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - perception.startTime).toBeCloseTo(
        1.933 + extra,
      )
    },
  )
  it("connects enhanced Fan Q to one-dash Perception on its second callback", () => {
    const rows = timeline({
      name: "Fan perception clock",
      ping: 0,
      start: { step: 0 },
      steps: [
        { type: "skill", skill: "BoundlessBloom" },
        { type: "skill", skill: "FiendishSquall" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const fan = rows.find(row => row.step.skill === "BoundlessBloom")!
    const perception = rows.find(row => row.step.skill === "FiendishSquall")!
    expect(
      fan.actions
        .filter((action, index) => action.type === "damage" && fan.actionStates[index]?.combatOrder !== undefined)
        .map(action => action.time),
    ).toEqual([0.5, 1])
    expect(perception.startTime - fan.startTime).toBeCloseTo(1)
    const hits = perception.actions
      .filter((action, index) => action.type === "damage" && perception.actionStates[index]?.combatOrder !== undefined)
      .map(action => perception.startTime - fan.startTime + Number(action.time))
    expect(hits[0]).toBeCloseTo(1.566)
    expect(hits[1]).toBeCloseTo(2.816)
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - fan.startTime).toBeCloseTo(2.933)
  })
  it("connects charged light to VC after pre-charge and release", () => {
    const rows = timeline({
      name: "Charged light clock",
      ping: 0,
      start: { step: 0 },
      steps: [
        { type: "skill", skill: "RibbonLightChargedVC" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const combo = rows.find(row => row.step.skill === "RibbonLightChargedVC")!
    const vcHit = combo.actions.find(action => action.type === "damage" && Number(action.time) > 0)!
    expect(Number(vcHit.time)).toBeCloseTo(0.2 + 1.833 + 0.5471428571428572)
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - combo.startTime).toBeCloseTo(
      0.2 + 1.833 + 1.1785714285714286,
    )
  })
  it("lands Dawnsun hits and releases the next skill on the nominal perfect-input clock", () => {
    const rows = timeline({
      name: "Dawnsun clock",
      ping: 0,
      start: { step: 0, action: 3 },
      steps: [
        { type: "skill", skill: "RippleDawnsun" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const special = rows.find(row => row.step.skill === "RippleDawnsun")!
    const hits = Object.entries(special.actionStates)
      .filter(([index, state]) => special.actions[Number(index)].type === "damage" && state.combatOrder !== undefined)
      .map(([index]) => Number(special.actions[Number(index)].time))
    expect(hits).toEqual([0.982, 2.963, 5.165])
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - special.startTime).toBeCloseTo(5.92)
    expect(rows[0].battleStartTime! - special.startTime).toBeCloseTo(0.982)
  })
  it.each(["T3", "T6"])("lands Jadebreaker waves on the nominal perfect-input clock at Harmony %s", tier => {
    const rows = timeline(
      {
        name: "Jadebreaker clock",
        ping: 0,
        start: { step: 1, action: 3 },
        steps: [
          { type: "skill", skill: "Rustling" },
          { type: "skill", skill: "RippleJadebreaker" },
          { type: "skill", skill: "CraneWings" },
        ],
      },
      tier,
    )
    const special = rows.find(row => row.step.skill === "RippleJadebreaker")!
    const hits = rows
      .filter(row => row.step.skill === "RippleJadebreaker" || row.step.skill === "JadebreakerEnhanced")
      .flatMap(row =>
        Object.entries(row.actionStates)
          .filter(([index, state]) => row.actions[Number(index)].type === "damage" && state.combatOrder !== undefined)
          .map(([index]) => row.startTime - special.startTime + Number(row.actions[Number(index)].time)),
      )
    const expected = tier === "T6" ? [0.982, 3.033, 4.089, 5.235, 5.435] : [0.982, 3.033, 4.089, 5.235]
    expect(hits).toHaveLength(expected.length)
    hits.forEach((time, index) => expect(time).toBeCloseTo(expected[index]))
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - special.startTime).toBeCloseTo(5.852)
    expect(rows[0].battleStartTime! - special.startTime).toBeCloseTo(0.982)
  })
  it.each([0, 40])("combines heavy attacks and VC with the earlier Pre-VC interruption at %sms ping", ping => {
    const run = (ids: string[]) =>
      timeline({ name: "Wings combo", ping, start: { step: 0 }, steps: ids.map(skill => ({ type: "skill", skill })) })
    const separate = run(["RibbonHeavy1", "RibbonHeavy2", "RibbonHeavy3", "HarmoniousDrum", "CraneWings"])
    const combined = run(["RibbonHeavyComboVC", "CraneWings"])
    const end = (rows: ReturnType<typeof run>) => rows.find(row => row.step.skill === "CraneWings")!
    expect(end(separate).startTime - end(combined).startTime).toBeCloseTo(0.25)
    expect(end(combined).resources.NobleWill).toBe(end(separate).resources.NobleWill)
    const damage = (rows: ReturnType<typeof run>) =>
      rows
        .filter(row => row.step.skill !== "CraneWings")
        .flatMap(row =>
          row.actions.filter(action => action.type === "damage").map(({ time: _time, ...action }) => action),
        )
    expect(damage(combined)).toEqual(damage(separate))
  })
  it("offers the two ready-to-use combos while hiding their attack components", () => {
    const ids = selectableRotationSkillGroups(["wendongNichang", "xingyouCaoye"]).flatMap(group => group.skillIds)
    expect(ids).toEqual(expect.arrayContaining(["RibbonLightChargedVC", "RibbonHeavyComboVC"]))
    for (const id of ["RibbonHeavy1", "RibbonHeavy2", "RibbonHeavy3", "RibbonHeavy3PreVC", "RibbonLightCharged"])
      expect(ids).not.toContain(id)
  })
  it("advances the heavy/light combo by imported cancel times and restores 雅意 on the light hit", () => {
    const rows = timeline(
      {
        name: "Wings timed combo",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Spend" },
          { type: "skill", skill: "RibbonHeavy1" },
          { type: "skill", skill: "RibbonHeavy2" },
          { type: "skill", skill: "RibbonHeavy3" },
          { type: "skill", skill: "HarmoniousDrum" },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      {
        ...allSkillDefinitions,
        Spend: { castTime: 0, action: [{ type: "consumeResource", value: "NobleWill", amount: "all", time: 0 }] },
        Observe: { castTime: 0, action: [] },
      },
    )
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.startTime).toBeCloseTo(
      0.6941666666666667 + 0.4615384615384615 + 0.8333333333333334 + 1.1785714285714286,
    )
    expect(observed.resources.NobleWill).toBe(20)
    const light = rows.find(row => row.step.skill === "HarmoniousDrum")!
    const hit = Object.entries(light.actionStates).find(
      ([index, state]) => light.actions[Number(index)].type === "damage" && state.combatOrder !== undefined,
    )!
    expect(Number(light.actions[Number(hit[0])].time)).toBeCloseTo(0.5471428571428572)
    expect(hit[1].resources.NobleWill).toBe(0)
  })
  it("does not refresh Cloudshear when Radiant Drum expires into Tailwind", () => {
    const rows = timeline(
      {
        name: "Expiry Tailwind",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Rustling" },
          { type: "skill", skill: "RippleJadebreaker" },
          { type: "event", event: "Delay", duration: 10 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
    )
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.buffs.has("RadiantDrum")).toBe(false)
    expect(observed.buffs.has("Tailwind")).toBe(true)
    expect(observed.buffs.has("Cloudshear")).toBe(false)
  })
  it.each([jadebreaker, dawnsun])("keeps Cloudshear active throughout $name", rotation => {
    const rows = timeline(rotation)
    const start = rows[0].battleStartTime!
    const expiries = Array.from(
      new Set(
        rows.flatMap(row =>
          [row.buffs, ...Object.values(row.actionStates).map(state => state.buffs)].flatMap(buffs => {
            const expiry = buffs.get("Cloudshear")?.expiresAt
            return typeof expiry === "number" ? [expiry] : []
          }),
        ),
      ),
    ).sort((a, b) => a - b)
    let coveredUntil = start
    for (const expiry of expiries) {
      expect(expiry - 15).toBeLessThanOrEqual(coveredUntil)
      coveredUntil = Math.max(coveredUntil, expiry)
    }
    expect(coveredUntil).toBeGreaterThanOrEqual(start + 60)
  })
  it("caps repeated Cloudshear applications at one stack and expires 15 seconds after refresh", () => {
    const rows = timeline(
      {
        name: "Cloudshear refresh",
        ping: 0,
        start: { step: 0, action: 0 },
        steps: [
          { type: "skill", skill: "Rustling" },
          { type: "event", event: "Delay", duration: 1 },
          { type: "skill", skill: "Rustling" },
          { type: "event", event: "Delay", duration: 14.9 },
          { type: "skill", skill: "Observe" },
          { type: "event", event: "Delay", duration: 0.2 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      {
        ...allSkillDefinitions,
        Rustling: { ...allSkillDefinitions.Rustling, cooldown: 0, castTime: 0 },
        Observe: { castTime: 0, action: [] },
      },
    )
    const observations = rows.filter(row => row.step.skill === "Observe")
    expect(observations).toHaveLength(2)
    const active = observations[0].buffs.get("Cloudshear")!
    expect(active.stack).toBe(1)
    expect(active.expiresAt! - observations[0].startTime).toBeCloseTo(0.1)
    expect(observations[1].buffs.has("Cloudshear")).toBe(false)
  })
  it.each([
    ["RippleJadebreaker", jadebreaker],
    ["RippleDawnsun", dawnsun],
  ])("restores 雅意 naturally before every %s", (variant, rotation) => {
    const rows = timeline(rotation)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === variant)
    expect(specials).toHaveLength(4)
    expect(specials.map(row => row.resourceConsumption?.NobleWill)).toEqual([100, 100, 100, 100])
    expect(rows.some(row => row.buffs.has("Cloudshear"))).toBe(true)
    expect(rows.some(row => row.debuffs.has("InkRhyme"))).toBe(true)
  })
  it.each([
    ["RippleJadebreaker", jadebreaker],
    ["RippleDawnsun", dawnsun],
  ])("resets %s after the third special's exhausted Q2 hit", (variant, rotation) => {
    const rows = timeline(rotation)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === variant)
    const third = specials[2]
    const fourth = specials[3]
    const firstHit = third.actions.findIndex(action => action.type === "damage")
    const exhausted = rows.find(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
    )!
    expect(exhausted.startTime).toBeCloseTo(third.startTime + Number(third.actions[firstHit].time))
    const q2 = rows.find(row => row.step.skill === "CraneCry" && row.startTime > third.startTime)!
    expect(fourth.startTime).toBeGreaterThan(q2.startTime)
    expect(fourth.startTime - third.startTime).toBeLessThan(20)
  })
  it("uses the third Dawnsun's Radiant Drum for Soaring Spin before the final special", () => {
    const rows = timeline(dawnsun)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === "RippleDawnsun")
    const soaring = rows.find(row => row.kind === "rotation" && row.step.skill === "SoaringSpin2")!
    expect(soaring.startTime).toBeGreaterThan(specials[2].startTime)
    expect(soaring.startTime).toBeLessThan(specials[3].startTime)
    expect(soaring.buffs.has("RadiantDrum")).toBe(true)
  })
  it.each([jadebreaker, dawnsun])(
    "starts combat on the first drum special hit after precombat Fan Q and Flute",
    rotation => {
      const rows = timeline(rotation)
      const flute = rows.find(row => row.kind === "rotation" && row.step.skill === "FluteOfTheTidesCancel")!
      const fan = rows.find(row => row.kind === "rotation" && row.step.skill === "Rustling")!
      const special = rows.find(row => row.kind === "rotation" && row.step.skill?.startsWith("Ripple"))!
      const firstHit = special.actions.find(action => action.type === "damage")!
      expect(fan.startTime).toBeLessThan(flute.startTime)
      expect(rows[0].battleStartTime).toBe(special.startTime + Number(firstHit.time))
      expect(flute.startTime).toBeLessThan(rows[0].battleStartTime!)
    },
  )
  it("adds the second enhanced Jadebreaker beat only at Harmony T6", () => {
    const beats = (tier: string) =>
      timeline(jadebreaker, tier)
        .filter(row => row.step.skill === "JadebreakerEnhanced")
        .flatMap(row =>
          Object.keys(row.actionStates)
            .filter(index => row.actionStates[Number(index)].combatOrder !== undefined)
            .map(index => row.actions[Number(index)])
            .filter(action => action.type === "damage"),
        )
    expect(beats("T3")).toHaveLength(3)
    expect(beats("T6")).toHaveLength(8)
  })
  it("shares the sequence apart from the drum special variant and Soaring Spin placement", () => {
    const normalize = (rotation: typeof jadebreaker) =>
      rotation.steps
        .filter(step => step.skill !== "SoaringSpin2")
        .map(step => step.skill?.replace(/Ripple(Jadebreaker|Dawnsun)/, "Ripple"))
    expect(normalize(jadebreaker)).toEqual(normalize(dawnsun))
  })
})
