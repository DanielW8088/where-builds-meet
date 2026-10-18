import type { GearSearchFailure, GearSearchInput, GearSearchProgress } from "@/calculations/gearOptimization"
import { t } from "@/i18n"
import { dismissNotice, publishNotice } from "@/notices"
import { useGearOptimizationStore } from "@/stores/gearOptimizationStore"
import { useGearStore } from "@/stores/gearStore"
import { useSettingsStore } from "@/stores/settingsStore"

let worker: Worker | undefined

export function cancelGearOptimization() {
  const run = useGearOptimizationStore.getState().run
  worker?.terminate()
  worker = undefined
  useGearOptimizationStore.getState().setRun(undefined)
  if (!run?.progress || run.progress.phase === "preparing") return
  const { equipped } = run.progress
  useGearStore
    .getState()
    .updateBuildState(run.input.context.environment.pathId, state => ({
      ...state,
      entries: state.entries.map(entry => (entry.id === run.input.build.id ? { ...entry, equipped } : entry)),
    }))
}

export function startGearOptimization(input: GearSearchInput) {
  if (useGearOptimizationStore.getState().run || input.build.isDefault) return
  dismissNotice("gear-optimization")
  const snapshot = structuredClone(input)
  snapshot.timeLimitMinutes = useSettingsStore.getState().gearSearchMinutes
  delete snapshot.context.buildSetupOverrides
  const store = useGearOptimizationStore.getState()
  store.setRun({ input: snapshot })
  try {
    const currentWorker = new Worker(new URL("../calculations/gearOptimizationWorker.ts", import.meta.url), {
      type: "module",
    })
    worker = currentWorker
    const fail = (message: string) => {
      if (worker !== currentWorker) return
      cancelGearOptimization()
      publishNotice({ id: "gear-optimization", error: true, message })
    }
    currentWorker.onmessage = (
      event: MessageEvent<{ progress?: GearSearchProgress; error?: string; reason?: GearSearchFailure }>,
    ) => {
      if (worker !== currentWorker) return
      const { progress, error, reason } = event.data
      if (error) {
        switch (reason) {
          case "tooMany":
            fail(t("ui.buildTab.optimizationTooMany"))
            break
          case "tooLong":
            fail(t("ui.buildTab.optimizationTooLong"))
            break
          case "noCombinations":
            fail(t("ui.buildTab.optimizationNoCombinations"))
            break
          default:
            fail(error)
        }
        return
      }
      if (!progress) return
      store.setRun({ input: snapshot, progress })
      if (progress.phase === "completed") {
        cancelGearOptimization()
        publishNotice({ id: "gear-optimization", message: t("ui.buildTab.optimizationCompleted") })
      }
    }
    currentWorker.onerror = event => fail(event.message || t("ui.buildTab.optimizationFailed"))
    currentWorker.onmessageerror = () => fail(t("ui.buildTab.optimizationFailed"))
    currentWorker.postMessage(snapshot)
  } catch (error) {
    cancelGearOptimization()
    publishNotice({
      id: "gear-optimization",
      error: true,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
