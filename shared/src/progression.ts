import {
  baseStatsForClass,
  moveSpeedToWorldUnits,
  type CharacterClassId,
} from "./character.js";
import {
  RUNE_DEFINITIONS,
  RUNE_IDS,
  type RuneDefinition,
  type RuneId,
  type RuneStatBonus,
} from "./runes.js";
import {
  DEFAULT_EQUIPMENT,
  equipmentBonusesForLoadout,
  type EquipmentLoadout,
} from "./equipment.js";

export interface DerivedCharacterStats {
  maxHealth: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  worldMoveSpeed: number;
  power: number;
  critChance: number;
  dodgeChance: number;
}

export interface ProgressionRuneView extends RuneDefinition {
  unlocked: boolean;
  equippedSlotIndex: number | null;
}

export interface ProgressionSnapshot {
  level: number;
  experience: number;
  currentHealth: number;
  experienceIntoLevel: number;
  experienceForNextLevel: number;
  levelProgress: number;
  equippedRunes: ReadonlyArray<RuneId | null>;
  equipment: EquipmentLoadout;
  availableRunes: ReadonlyArray<ProgressionRuneView>;
  stats: DerivedCharacterStats;
}

export const MAX_CHARACTER_LEVEL = 20;

export function experienceRequiredForLevel(level: number): number {
  if (level <= 1) {
    return 0;
  }
  const previousLevel = level - 1;
  return 70 + previousLevel * 40 + previousLevel * previousLevel * 18;
}

export function levelFromExperience(experience: number): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(experience));
  while (level < MAX_CHARACTER_LEVEL) {
    const needed = experienceRequiredForLevel(level + 1);
    if (remaining < needed) {
      break;
    }
    remaining -= needed;
    level += 1;
  }
  return level;
}

export function sumRuneBonuses(
  equippedRunes: ReadonlyArray<RuneId | null>,
): RuneStatBonus {
  return equippedRunes.reduce<RuneStatBonus>(
    (acc, runeId) => {
      if (!runeId) {
        return acc;
      }
      const bonuses = RUNE_DEFINITIONS[runeId].bonuses;
      acc.maxHealth += bonuses.maxHealth;
      acc.attack += bonuses.attack;
      acc.defense += bonuses.defense;
      acc.moveSpeed += bonuses.moveSpeed;
      return acc;
    },
    { maxHealth: 0, attack: 0, defense: 0, moveSpeed: 0 },
  );
}

export function derivedStatsForCharacter(
  characterClass: CharacterClassId,
  level: number,
  equippedRunes: ReadonlyArray<RuneId | null>,
  equipment: EquipmentLoadout = DEFAULT_EQUIPMENT,
): DerivedCharacterStats {
  const base = baseStatsForClass(characterClass);
  const bonus = sumRuneBonuses(equippedRunes);
  const equipBonus = equipmentBonusesForLoadout(equipment);
  const levelDelta = Math.max(0, level - 1);
  const moveSpeed =
    base.moveSpeed + levelDelta * 0.04 + bonus.moveSpeed + equipBonus.moveSpeed;
  const power = base.power + Math.floor(levelDelta * 1.1);
  const critChance = Math.min(0.5, base.critChance + levelDelta * 0.004);
  const dodgeChance = Math.min(0.35, base.dodgeChance + levelDelta * 0.003);

  return {
    maxHealth: base.maxHealth + levelDelta * 8 + bonus.maxHealth + equipBonus.maxHealth,
    attack: base.attack + levelDelta * 2 + bonus.attack + equipBonus.attack,
    defense:
      base.defense + Math.floor(levelDelta * 1.2) + bonus.defense + equipBonus.defense,
    moveSpeed,
    worldMoveSpeed: moveSpeedToWorldUnits(moveSpeed),
    power,
    critChance,
    dodgeChance,
  };
}

export function buildProgressionSnapshot(
  characterClass: CharacterClassId,
  experience: number,
  equippedRunes: ReadonlyArray<RuneId | null>,
  equipment: EquipmentLoadout = DEFAULT_EQUIPMENT,
  currentHealth?: number,
): ProgressionSnapshot {
  const safeExperience = Math.max(0, Math.floor(experience));
  const level = levelFromExperience(safeExperience);
  const currentLevelBaseXp = (() => {
    let total = 0;
    for (let nextLevel = 2; nextLevel <= level; nextLevel++) {
      total += experienceRequiredForLevel(nextLevel);
    }
    return total;
  })();
  const nextLevelRequirement =
    level >= MAX_CHARACTER_LEVEL ? 0 : experienceRequiredForLevel(level + 1);
  const experienceIntoLevel = Math.max(0, safeExperience - currentLevelBaseXp);
  const progress =
    nextLevelRequirement > 0 ? experienceIntoLevel / nextLevelRequirement : 1;
  const stats = derivedStatsForCharacter(characterClass, level, equippedRunes, equipment);

  return {
    level,
    experience: safeExperience,
    currentHealth: Math.min(stats.maxHealth, Math.max(0, Math.floor(currentHealth ?? stats.maxHealth))),
    experienceIntoLevel,
    experienceForNextLevel: nextLevelRequirement,
    levelProgress: Math.min(1, Math.max(0, progress)),
    equippedRunes: [...equippedRunes],
    equipment: {
      weapon: equipment.weapon ?? null,
      armour: equipment.armour ?? null,
    },
    availableRunes: RUNE_IDS.map((runeId) => ({
      ...RUNE_DEFINITIONS[runeId],
      unlocked: level >= RUNE_DEFINITIONS[runeId].unlockLevel,
      equippedSlotIndex: equippedRunes.findIndex((entry) => entry === runeId),
    })).map((entry) => ({
      ...entry,
      equippedSlotIndex: entry.equippedSlotIndex >= 0 ? entry.equippedSlotIndex : null,
    })),
    stats,
  };
}