# Wings implementation audit

Scope: the six inner ways available to Wings and the two Wings martial arts.
Rechecked against the local Inner Way, martial art, skill, item-set, and raw buff
exports on 2026-10-12.

## Implemented with existing mechanisms

- 相和歌: T3 ordinary and T6 enhanced Jadebreaker bonuses require 爍鼓; cast-time T1 damage
  reduction; Dawnsun's T3/T6 shield-active state and T6 damage reduction;
  exhaustion cooldown/resource reset and Dawnsun duration extension.
- 風知意: 墨韻 applies after Perception's final hit, including additional-dash
  delays. T4 adds another 5% to the original 5%, retains Fan/Drum Series scope,
  lasts 18 seconds, and reduces incoming damage by 10% while the modeled attacker
  has 墨韻 (5% before T4). Each executed dash attempts 30 雅意 recovery, using two
  shared cooldown uses in a 15-second window.
- 弦墨篇: strict above-50% HP before T4, unrestricted HP from T4; T6 replaces
  earlier penetration instead of stacking with it. T6 gives 8 Physical/Formless
  Penetration, with another 12 only for Drum Series. 扶風, 爍鼓, Floating Grace,
  and Floating Grace's Deluge variant qualify.
- 寸草心: eligible-hit stacks, thresholds, durations, tier bonuses and T2/T5
  stats. The export's explicit drum attack is 鼓樂和; broad Drum Series matching
  previously allowed Drum Specials and is now removed from this Inner Way.
- Morale Chant: healing grants Yi River stacks; stack healing bonuses are
  represented; Physical Penetration starts at T1. The base tier's damage bonus
  is Physical-only. T6 healing uses the registered proc's unit Physical/Silkbind
  coefficients and shares the attack proc's ten-second cooldown.
- Envigorated Warrior: 5% damage/healing at T0, 8% from T4; five-second disable
  after incoming hits; Cage's five-second 5%/3% vulnerability; T3 five-second
  escape after outgoing attacks; T6 five-second target mark preventing disable.
- 裁雲·翊: 6% all-type damage and healing, one stack, fifteen seconds. It no
  longer substitutes attack-range bonuses for damage bonuses.
- Martial arts: rank 0–14 stat formulas, caps, raw attribute bonuses, and
  rank-specific offensive talent upgrades are populated from exported ranks.
- 凌波·繁音: draft three-wave damage and the T6 field's four callback ticks.
  Cast-relative rhythm timings remain zero where unresolved; field callbacks
  use the exported offsets relative to the enhanced wave (0.45–1.95 seconds).

Effect modifications append rules: 墨韻 T4 therefore adds 5%, rather than
appending a second 10% bonus. Existing action indexes remain stable for saved
rotation anchors and attached events.

## Remaining mechanism gaps

| Area                    | Required mechanism                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 相和歌 and martial arts | Party buff recipients and movement speed; Tenacity and interruption resistance; interruption-triggered T4 refund; silence, root, knockdown and slow with target immunities.                                                                                                                                           |
| Dawnsun shields         | Shield absorption amounts based on recipient maximum HP, expiry/depletion, and incoming damage absorption. The existing Shield marker is modeled, not its 5%/15% HP capacity.                                                                                                                                         |
| 弦墨篇                  | General damage-based lifesteal with its 2.5%-maximum-HP-per-second cap, including T1/T4 upgrades.                                                                                                                                                                                                                     |
| 寸草心                  | Per-target simultaneous-hit tracking, rather than the editor's enemy-count proxy; player targets, endurance-cost modifiers, outgoing-damage reduction, root and immunity timers.                                                                                                                                      |
| Morale Chant            | Correlated random self-buff stacks and proc attempts: below T4 the 80% chance is still approximated as guaranteed. Existing expected probability tracking supports target debuffs, not Yi River's self-state and downstream procs. Healing-target Controlled state is also needed for the conditional second T6 heal. |
| Lower martial art ranks | Rank-dependent attack coefficients: the rank-3 attribute talent remains baked into skill coefficients, as before. It is not disabled below rank 3; conditional stat formulas alone cannot change that coefficient.                                                                                                    |

Skill eligibility enforcement remains deliberately outside scope, per the user:
cooldowns are enforced, while Perception/流風 prerequisite windows are not.
These are an intentional editor policy rather than missing combat mechanisms.

Incoming attacks currently belong to the one modeled target. 墨韻 reduction and
the Warrior mark use that target's debuffs; independently attributed attackers
would require a multi-target combat-state mechanism.

Both dummies count as bosses in this simulator. 羅纏's 20% bonus therefore
already covers every supported practice target correctly; a `targetType: Boss`
gate would incorrectly exclude dummies.

## Data and timing limitations

Flourishing Notes' selection/rhythm handoff is not resolved on the cast clock.
Its draft zero timings are not a measured rotation. Field callbacks are imported
from the route; survival after cancellation remains unverified. The field's
three-second slow and skill invincibility are not simulated as control states.

The game caps Dawnsun's four-second 爍鼓 extension at ten seconds remaining.
That cap is documented but intentionally not enforced at the user's request.

## Why 寸草心 is weak against one target

T0 requires simultaneous eligible hits on at least three enemies. T4 lowers
the threshold to two, and grants two stacks at three targets. A one-target
rotation cannot gain stacks, so only T2 Void Attack and T5 Formless Penetration
contribute. Drum Specials are outside the export's explicit eligible list.

Earlier diagnostic DPS figures are superseded by the corrected offensive rules;
they are not accepted snapshots or universal Inner Way bonuses.
