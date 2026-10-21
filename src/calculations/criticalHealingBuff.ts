import { outcomeBuffTick, outcomeProbability } from "./outcomeTriggeredBuffs"
import type { EditableObject } from "./rotationTimeline"

export type CriticalHealingBuff = { name: string; durationTicks: number; effects: EditableObject[] }

/** Retain a conditional setup effect after any recipient receives a critical heal. */
export function criticalHealingBuffFor(setupEffects: EditableObject[]): CriticalHealingBuff | undefined {
  for (const effect of setupEffects) {
    const retention = effect.retainAfterCriticalHealing as { buff: string; duration: number } | undefined
    if (retention)
      return {
        name: retention.buff,
        durationTicks: outcomeBuffTick(retention.duration),
        effects: [effect.effect as EditableObject],
      }
  }
  return undefined
}

/** Exact expiration distribution; active and inactive branches have different refresh chances. */
export class CriticalHealingBuffTracker {
  private inactive = 1
  private expiries = new Map<number, number>()

  probability(tick: number) {
    for (const [expiry, mass] of this.expiries) {
      if (expiry > tick) continue
      this.inactive += mass
      this.expiries.delete(expiry)
    }
    return outcomeProbability(1 - this.inactive)
  }

  refresh(tick: number, durationTicks: number, inactiveChance: number, activeChance: number) {
    this.probability(tick)
    const fromInactive = this.inactive * outcomeProbability(inactiveChance)
    let refreshed = fromInactive
    this.inactive -= fromInactive
    for (const [expiry, mass] of this.expiries) {
      const gained = mass * outcomeProbability(activeChance)
      refreshed += gained
      this.expiries.set(expiry, mass - gained)
    }
    const expiry = tick + durationTicks
    this.expiries.set(expiry, (this.expiries.get(expiry) ?? 0) + refreshed)
  }
}
