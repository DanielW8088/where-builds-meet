/// <reference lib="webworker" />
import { GearSearchError, optimizeGear, type GearSearchInput } from "./gearOptimization"

self.onmessage = (event: MessageEvent<GearSearchInput>) => {
  try {
    optimizeGear(event.data, progress => self.postMessage({ progress }))
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      reason: error instanceof GearSearchError ? error.reason : undefined,
    })
  }
}
