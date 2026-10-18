import { create } from "zustand"

import type { LayoutMode } from "@/application/contracts"
import {
  developmentModeStorageKey,
  gearSearchMinutesStorageKey,
  layoutPreviewStorageKey,
} from "@/application/persistence/keys"
import { loadDevMode, loadGearSearchMinutes, loadLayoutPreview } from "@/application/persistence/settings"
import { setPersistentItem } from "@/persistentStorage"

/**
 * How the application behaves, as opposed to what it calculates.
 *
 * The distinction is whether a value reaches a measurement. The development toggle and the layout
 * preview change which paths, builds and locales are reachable and how the page is drawn; neither
 * appears in a calculation's inputs, so neither belongs beside the weapons and ping, which do. The
 * values that do live in `loadoutStore`, because `MeasurementContext` in
 * `rotationCalculationBundle.ts` calls that group `environment` and hashes it into the cache key.
 *
 * Read with selectors, like `loadoutStore` and unlike the calculation cache in `dpsStore`. Every
 * mutator stores what it sets, so state and storage cannot drift apart.
 */
export type SettingsStore = {
  /** Gates the work-in-progress paths, the test-preset builds, and the unreleased locales. */
  gearSearchMinutes: number
  setGearSearchMinutes: (minutes: number) => void
  devMode: boolean
  /** The chosen layout while `devMode` is on. The effective layout is derived in `App`, because
   *  it also depends on the live viewport, which is not a stored value. */
  layoutPreview: LayoutMode

  /**
   * Reads the stored application settings.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported. The application boots it
   * explicitly instead, once per mount, before anything reads it. `loadoutStore` is booted after
   * this one, because the path a saved session resolves to depends on the development toggle.
   *
   * `compactViewport` is passed in rather than read here because the viewport is not a stored
   * value: it is a live media query that `App` already subscribes to, and reading it twice would
   * mean two subscriptions to the same query.
   */
  initialise: (compactViewport: boolean) => void
  setDevMode: (enabled: boolean) => void
  setLayoutPreview: (mode: LayoutMode) => void
}

export const useSettingsStore = create<SettingsStore>()(set => ({
  gearSearchMinutes: 2,
  setGearSearchMinutes: minutes => {
    if (!Number.isFinite(minutes) || minutes < 0) return
    setPersistentItem(gearSearchMinutesStorageKey, String(minutes))
    set({ gearSearchMinutes: minutes })
  },
  devMode: false,
  layoutPreview: "pc",

  initialise: compactViewport =>
    set({
      devMode: loadDevMode(),
      layoutPreview: loadLayoutPreview(compactViewport),
      gearSearchMinutes: loadGearSearchMinutes(),
    }),

  setDevMode: enabled => {
    setPersistentItem(developmentModeStorageKey, String(enabled))
    set({ devMode: enabled })
  },

  setLayoutPreview: mode => {
    setPersistentItem(layoutPreviewStorageKey, mode)
    set({ layoutPreview: mode })
  },
}))
