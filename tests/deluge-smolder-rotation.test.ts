import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it("lets Intoxicated expire before Deluge Smolder's third Dragon's Breath without an extra Poet drink", async () => {
  const fixture = (await loadDpsSnapshotFixtures()).find(entry => entry.id === "silkbindDeluge/dummy-1-min-smolder")!
  const input = buildPresetRotationBundle(
    { pathId: fixture.pathId, ...fixture.fixture, rotation: fixture.rotation, skillOverrides: {}, previewId: null },
    fixture.fixture.build,
  )!
  const result = calculateRotationBaseline(input)
  const breaths = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "DragonsBreathSmolder2")
  const expiry = breaths[0].actionStates[3].buffs.get("Intoxicated")!.expiresAt!
  expect(breaths[2].startTime).toBeGreaterThan(expiry)
  expect(breaths[2].actionStates[0].buffs.has("Intoxicated")).toBe(false)
  const refreshed = breaths[2].actionStates[3].buffs.get("Intoxicated")!
  expect(refreshed.expiresAt).toBeGreaterThan(expiry)
  const poet = result.timeline.find(
    row =>
      row.kind === "rotation" && row.step.skill === "DrunkenPoet5HitsCancel" && row.startTime > breaths[2].startTime,
  )!
  expect(poet.actionStates[0].buffs.has("Intoxicated")).toBe(true)
  expect(poet.resourceConsumption?.Vitality).toBe(30)
  const summary = result.timeline.find(row => row.timelineResourceSummary)!.timelineResourceSummary!.Vitality
  expect(summary.consumed).toBe(380)
  expect(result.duration).toBe(60)
})
