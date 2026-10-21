// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { activeBuildStorageKey, buildListStorageKey, loadBuildState } from "@/gear"

afterEach(() => localStorage.clear())
it.each([
  ["deluge-fully-relayed-min-rw", "deluge-fully-relayed-min-ib"],
  ["deluge-fully-relayed-max-rw", "deluge-fully-relayed-max-ib"],
  ["deluge-full-min-ew", "deluge-full-max-ib"],
])("migrates retired preset %s to %s and preserves custom builds", (oldId, newId) => {
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
