// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"

import { gearSearchMinutesStorageKey } from "@/application/persistence/keys"
import { useSettingsStore } from "@/stores/settingsStore"

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSettingsStore.getState().initialise(false)
})

it("defaults to two minutes and restores saved limits, including unlimited", () => {
  expect(useSettingsStore.getState().gearSearchMinutes).toBe(2)
  for (const minutes of [5, 0]) {
    useSettingsStore.getState().setGearSearchMinutes(minutes)
    useSettingsStore.setState({ gearSearchMinutes: 2 })
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().gearSearchMinutes).toBe(minutes)
  }
})

it.each(["-1", "NaN", "Infinity", "invalid"])("uses the default for invalid saved limit %s", saved => {
  localStorage.setItem(gearSearchMinutesStorageKey, saved)
  useSettingsStore.getState().initialise(false)
  expect(useSettingsStore.getState().gearSearchMinutes).toBe(2)
})
