const renamedSkillIds: Record<string, string> = {
  Rustling: "VerdantGust",
  CraneCry: "CranesCry",
  FiendishSquall: "EndOfGale",
  HarmoniousDrum: "RhythmOfAccord",
  InnerBalanceStrike1: "InnerBalanceStrikeIII1",
  InnerBalanceStrikeBoth: "InnerBalanceStrikeIII2",
  InnerBalanceStrike1ThreeHits: "InnerBalanceStrikeIII1ThreeHits",
  InnerBalanceStrike2: "CrisscrossInnerBalanceStrikeIIICancel",
  InnerBalanceStrike2Cancel: "CrisscrossInnerBalanceStrikeIIICancel",
  SecondTrackSlashFollowup: "CrisscrossSecondTrackSlash1",
  SecondTrackSlashFollowup2Hits: "CrisscrossSecondTrackSlash2",
}

export function migrateSkillId(id: string): string {
  return renamedSkillIds[id] ?? id
}
