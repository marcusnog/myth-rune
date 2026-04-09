export const WORLD_COMBAT_REJECT_CODES = [
  "COOLDOWN",
  "OUT_OF_RANGE",
  "NOT_FOUND",
] as const;

export type WorldCombatRejectCode = (typeof WORLD_COMBAT_REJECT_CODES)[number];

export const WORLD_COMBAT_REJECT_MESSAGES: Record<
  WorldCombatRejectCode,
  string
> = {
  COOLDOWN: "Basic attack is on cooldown",
  OUT_OF_RANGE: "Mob is out of range",
  NOT_FOUND: "Mob not found",
};

export interface WorldCombatConfig {
  playerAttackRange: number;
  playerAttackCooldownMs: number;
  mobAttackDamage: number;
  mobDefense: number;
  mobAttackRange: number;
  mobAttackCooldownMs: number;
}

export const WORLD_COMBAT_CONFIG: Readonly<WorldCombatConfig> = Object.freeze({
  playerAttackRange: 72,
  playerAttackCooldownMs: 550,
  mobAttackDamage: 14,
  mobDefense: 4,
  mobAttackRange: 56,
  mobAttackCooldownMs: 1400,
});
