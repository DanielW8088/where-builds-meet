import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("Umbra preset endings", () => {
  it.each([
    ["dummy-1-min-37-bb-dh", 37, "SecondTrackSlash2Casts1Hit", 5],
    ["dummy-1-min-38-bb", 39, "InnerTrackSlash", 5],
  ] as const)(
    "continues %s through its final in-battle hits",
    async (rotationId, burstCount, finalSkill, finalHits) => {
      const entry = (await loadDpsSnapshotFixtures()).find(entry => entry.id === `bellstrikeUmbra/${rotationId}`)!
      const bundle = buildPresetRotationBundle(
        { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
        entry.fixture.build,
      )!
      const result = calculateRotationBaseline(bundle)
      const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
      const tail = casts.slice(-4)
      for (let i = 1; i < tail.length; i++) {
        const previousEnd = tail[i - 1].startTime + tail[i - 1].effectiveCastTime
        expect(tail[i].startTime - previousEnd).toBeGreaterThanOrEqual(-1e-10)
        expect(tail[i].startTime - previousEnd).toBeLessThanOrEqual(0.04 + 1e-10)
      }
      const last = tail.at(-1)!
      expect(last.step.skill).toBe(finalSkill)
      const hits = last.actions.flatMap((action, index) =>
        action.type === "damage" && (result.actionBreakdowns[`${last.id}:${index}`]?.total ?? 0) > 0
          ? [last.startTime + Number(action.time)]
          : [],
      )
      expect(hits).toHaveLength(finalHits)
      expect(hits.every(time => time < result.anchorTime + 60)).toBe(true)
      expect(result.duration).toBe(60)
      expect(result.timeline.filter(row => row.step.skill === "BloodBurstDamage")).toHaveLength(burstCount)
    },
  )
  it("keeps Dragon Head exhausted, DOTs connected, and the final charge inside battle", async () => {
    const entry = (await loadDpsSnapshotFixtures()).find(entry => entry.id === "bellstrikeUmbra/dummy-1-min-37-bb-dh")!
    const bundle = buildPresetRotationBundle(
      { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
      entry.fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const dragon = casts.find(row => row.step.skill === "DragonHeadTide")!
    const hitIndex = dragon.actions.findIndex(action => action.type === "damage")
    expect(dragon.actionStates[hitIndex].debuffs.has("Exhausted")).toBe(true)
    const last = casts.at(-1)!
    expect(last.startTime + last.effectiveCastTime).toBeLessThan(result.anchorTime + result.duration)
    const short = casts.filter(row => row.step.skill === "SoberSorrow5Hits")
    expect(short).toHaveLength(2)
    expect(short.every(row => row.debuffs.get("UmbraBleeding")?.stack === 5)).toBe(true)
    expect(casts.filter(row => row.step.skill === "SoberSorrow")).toHaveLength(1)
    const smolder = result.timeline.filter(row => row.kind === "dot" && row.step.skill === "Smolder")
    expect(smolder.at(-1)!.startTime - result.anchorTime).toBeGreaterThan(59)
    for (let i = 1; i < smolder.length; i++)
      expect(smolder[i].startTime - smolder[i - 1].startTime).toBeCloseTo(0.528, 8)
  })
})
