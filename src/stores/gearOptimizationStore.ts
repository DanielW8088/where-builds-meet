import { create } from "zustand"

import type { GearSearchInput, GearSearchProgress } from "@/calculations/gearOptimization"

type GearOptimizationRun = { input: GearSearchInput; progress?: GearSearchProgress }

/** Transient overlay: live improvements do not invalidate the shared comparison store. */
export const useGearOptimizationStore = create<{
  run?: GearOptimizationRun
  setRun: (run: GearOptimizationRun | undefined) => void
}>()(set => ({ setRun: run => set({ run }) }))
