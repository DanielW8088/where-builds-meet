import dawn from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-dawnsun.json"
import jade from "@gamedata/rotation/silkbind-wing/wings-dummy-1-min-jadebreaker.json"
import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

it.each([jade, dawn])("depletes Qi proportionally before the third Drum Special in $name", rotation => {
  const bundle = buildPresetRotationBundle(
    {
      pathId: "silkbindWing",
      martialArts: ["wendongNichang", "xingyouCaoye"],
      rotation: rotation as RotationRecord,
      breakthrough: "17",
      globalDebuffs: { ...defaultGlobalDebuffs },
      food: "SimmeringFishSlices",
      script: "None",
      divinecraft: "Fire",
      skillOverrides: {},
      previewId: null,
    },
    "wings-fully-relayed-min",
  )!
  const result = calculateRotationBaseline(bundle)
  const start = result.timeline.find(row => row.battleStartTime !== undefined)!.battleStartTime!
  const qi = result.timeline
    .filter(row => row.step.type === "event" && row.step.event === "Qi" && !row.skipped)
    .sort((a, b) => a.startTime - b.startTime)
  expect(qi.map(row => (row.step as { targetQiRatio: number }).targetQiRatio)).toEqual([0.5999, 0.3999, 0])
  const exhaustion = qi[2].startTime - start
  for (const [index, fraction] of [
    [0, 0.4],
    [1, 0.6],
  ]) {
    expect(qi[index].startTime - start).toBeCloseTo(exhaustion * fraction, 8)
    const action = qi[index].actions.findIndex(action => action.type === "setQi")
    expect(qi[index].actionStates[action + 1].targetQiRatio).toBe(
      (qi[index].step as { targetQiRatio: number }).targetQiRatio,
    )
  }
  const specials = result.timeline.filter(
    row => row.step.skill === "RippleJadebreaker" || row.step.skill === "RippleDawnsun",
  )
  expect(qi[2].startTime).toBeCloseTo(specials[2].startTime + Number(specials[2].actions[3].time), 8)
  expect(result.duration).toBe(60)
})
