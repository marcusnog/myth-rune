import { CharacterClass, type CharacterClassId } from "./character.js";

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

export type PlayerAttackStyle = "melee" | "ranged";

export interface PlayerAttackProfile {
  style: PlayerAttackStyle;
  range: number;
  projectileSpeed: number | null;
}

export const WORLD_COMBAT_CONFIG: Readonly<WorldCombatConfig> = Object.freeze({
  playerAttackRange: 72,
  playerAttackCooldownMs: 550,
  mobAttackDamage: 14,
  mobDefense: 4,
  mobAttackRange: 56,
  mobAttackCooldownMs: 1400,
});

export const PLAYER_ATTACK_PROFILES: Readonly<
  Record<CharacterClassId, PlayerAttackProfile>
> = Object.freeze({
  [CharacterClass.Warrior]: {
    style: "melee",
    range: WORLD_COMBAT_CONFIG.playerAttackRange,
    projectileSpeed: null,
  },
  [CharacterClass.Mage]: {
    style: "ranged",
    range: 196,
    projectileSpeed: 520,
  },
  [CharacterClass.Rogue]: {
    style: "melee",
    range: WORLD_COMBAT_CONFIG.playerAttackRange,
    projectileSpeed: null,
  },
  [CharacterClass.Archer]: {
    style: "melee",
    range: WORLD_COMBAT_CONFIG.playerAttackRange,
    projectileSpeed: null,
  },
});

export function playerAttackProfileForClass(
  classId: CharacterClassId,
): PlayerAttackProfile {
  return PLAYER_ATTACK_PROFILES[classId];
}

export function playerAttackRangeForClass(classId: CharacterClassId): number {
  return playerAttackProfileForClass(classId).range;
}
