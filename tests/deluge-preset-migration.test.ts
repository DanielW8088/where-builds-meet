// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { activeBuildStorageKey, buildListStorageKey, loadBuildState } from "@/gear"

afterEach(() => localStorage.clear())
it.each(["min", "max"])("migrates the retired Rainwhisper %s preset selection and preserves custom builds", mode => {
  const oldId = `deluge-fully-relayed-${mode}-rw`
  const newId = `deluge-fully-relayed-${mode}-ib`
  localStorage.setItem(
    buildListStorageKey,
    JSON.stringify({
      entries: [
        { id: oldId, name: "My preset label", isDefault: true, presetId: oldId },
        {
          id: "custom-deluge",
          name: "Saved custom build",
          martialArts: ["panaceaFan", "soulshadeUmbrella"],
          equipped: {},
          setup: { weaponSets: { RainWhisper: 4 } },
        },
      ],
      gearItems: [],
    }),
  )
  localStorage.setItem(activeBuildStorageKey, oldId)
  const state = loadBuildState()
  expect(state.activeBuildId).toBe(newId)
  expect(state.entries.find(entry => entry.id === newId)?.name).toBe("My preset label")
  expect(state.entries.some(entry => entry.id === oldId)).toBe(false)
  expect(state.entries.find(entry => entry.id === "custom-deluge")?.setup?.weaponSets.RainWhisper).toBe(4)
})
