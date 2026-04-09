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
      maxHealth: 130,
      attack: 15,
      defense: 9,
      moveSpeed: 4.4,
    },
    [CharacterClass.Mage]: {
      maxHealth: 82,
      attack: 19,
      defense: 3,
      moveSpeed: 5.1,
    },
    [CharacterClass.Rogue]: {
      maxHealth: 92,
      attack: 17,
      defense: 5,
      moveSpeed: 5.6,
    },
    [CharacterClass.Archer]: {
      maxHealth: 98,
      attack: 16,
      defense: 6,
      moveSpeed: 5.3,
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
