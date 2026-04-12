export const CharacterClass = {
  Warrior: "warrior",
  Mage: "mage",
  Rogue: "rogue",
  Archer: "archer",
} as const;

export type CharacterClassId = (typeof CharacterClass)[keyof typeof CharacterClass];

export const CHARACTER_CLASSES: readonly CharacterClassId[] = [
  CharacterClass.Warrior,
  CharacterClass.Mage,
  CharacterClass.Rogue,
  CharacterClass.Archer,
] as const;

export interface BaseStats {
  maxHealth: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  power: number;
  critChance: number;
  dodgeChance: number;
}

/**
 * Converts class moveSpeed points to world coordinate units per second.
 * Godot and web clients move in pixel-like world units, while class balance
 * keeps compact moveSpeed points.
 */
export const MOVE_SPEED_WORLD_MULTIPLIER = 55;

export const CLASS_BALANCE_TABLE: Readonly<Record<CharacterClassId, BaseStats>> =
  Object.freeze({
    [CharacterClass.Warrior]: {
      maxHealth: 148,
      attack: 17,
      defense: 10,
      moveSpeed: 4.2,
      power: 4,
      critChance: 0.05,
      dodgeChance: 0.03,
    },
    [CharacterClass.Mage]: {
      maxHealth: 76,
      attack: 21,
      defense: 2,
      moveSpeed: 5.05,
      power: 12,
      critChance: 0.08,
      dodgeChance: 0.04,
    },
    [CharacterClass.Rogue]: {
      maxHealth: 86,
      attack: 15,
      defense: 4,
      moveSpeed: 5.95,
      power: 6,
      critChance: 0.22,
      dodgeChance: 0.16,
    },
    [CharacterClass.Archer]: {
      maxHealth: 98,
      attack: 16,
      defense: 6,
      moveSpeed: 5.3,
      power: 7,
      critChance: 0.1,
      dodgeChance: 0.06,
    },
  });

export function baseStatsForClass(classId: CharacterClassId): BaseStats {
  return CLASS_BALANCE_TABLE[classId];
}

export function moveSpeedToWorldUnits(moveSpeed: number): number {
  return moveSpeed * MOVE_SPEED_WORLD_MULTIPLIER;
}

export function worldMoveSpeedForClass(classId: CharacterClassId): number {
  return moveSpeedToWorldUnits(baseStatsForClass(classId).moveSpeed);
}
