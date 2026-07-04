import { CharacterClass, type CharacterClassId } from "./character.js";

export const WORLD_COMBAT_REJECT_CODES = [
  "COOLDOWN",
  "OUT_OF_RANGE",
  "NOT_FOUND",
] as const;

export type WorldCombatRejectCode = (typeof WORLD_COMBAT_REJECT_CODES)[number];

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
  playerAttackCooldownMs: 750,
  mobAttackDamage: 14,
  mobDefense: 4,
  mobAttackRange: 56,
  mobAttackCooldownMs: 2000,
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
    style: "ranged",
    range: 180,
    projectileSpeed: 480,
  },
});