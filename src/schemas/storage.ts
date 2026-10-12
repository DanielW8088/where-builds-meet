import * as v from "valibot"

const finiteNumber = v.pipe(v.number(), v.finite())
const stringMap = v.record(v.string(), v.string())
const numberMap = v.record(v.string(), finiteNumber)

export const pathSelectionSchema = stringMap
/**
 * One record holding both sharing settings and the per-path maps. The maps are keyed by path and
 * hold ids rather than records, so a record is never duplicated per path; an id absent from a
 * path's array is simply one that path cannot see. Loose, because the record is written by
 * earlier versions that knew only some of these fields.
 */
export const gearScopeSchema = v.looseObject({
  sharedInventory: v.optional(v.boolean()),
  sharedBuilds: v.optional(v.boolean()),
  itemIdsByPath: v.optional(v.record(v.string(), v.array(v.string()))),
  buildIdsByPath: v.optional(v.record(v.string(), v.array(v.string()))),
})
export const settingsSchema = v.looseObject({
  weapons: v.optional(v.array(v.string())),
  ping: v.optional(finiteNumber),
  weapon: v.optional(v.string()),
})
export const statMapSchema = numberMap
export const attunementMapSchema = numberMap
export const simulationPercentilesSchema = v.array(v.pipe(finiteNumber, v.minValue(0), v.maxValue(100)))
export const globalDebuffStateSchema = v.looseObject({
  draught: v.optional(v.string()),
  phantomChime: v.optional(v.boolean()),
  qiImbalance: v.optional(v.boolean()),
  soulShaken: v.optional(v.boolean()),
  vulnerable: v.optional(v.boolean()),
  fearfulBlade: v.optional(v.boolean()),
  qingyisCharm: v.optional(v.string()),
  floatingGrace: v.optional(v.string()),
  silkbindWings: v.optional(v.string()),
})
