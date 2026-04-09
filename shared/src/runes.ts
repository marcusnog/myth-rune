import type { CharacterClassId } from "./character.js";

export const RUNE_SLOT_COUNT = 3;

export const RUNE_IDS = [
  "ember",
  "bulwark",
  "gust",
  "siphon",
  "warden",
  "celerity",
] as const;

export type RuneId = (typeof RUNE_IDS)[number];

export interface RuneStatBonus {
  maxHealth: number;
  attack: number;
  defense: number;
  moveSpeed: number;
}

export interface RuneDefinition {
  id: RuneId;
  name: string;
  description: string;
  color: string;
  unlockLevel: number;
  bonuses: RuneStatBonus;
}

export const RUNE_DEFINITIONS: Readonly<Record<RuneId, RuneDefinition>> = Object.freeze({
  ember: {
    id: "ember",
    name: "Runa da Brasa",
    description: "Aquece a arma e aumenta o poder de ataque.",
    color: "#d86c48",
    unlockLevel: 1,
    bonuses: { maxHealth: 0, attack: 2, defense: 0, moveSpeed: 0 },
  },
  bulwark: {
    id: "bulwark",
    name: "Runa do Baluarte",
    description: "Fortalece o corpo com vida e defesa adicionais.",
    color: "#c9a45f",
    unlockLevel: 1,
    bonuses: { maxHealth: 14, attack: 0, defense: 1, moveSpeed: 0 },
  },
  gust: {
    id: "gust",
    name: "Runa do Vento",
    description: "Leveza arcana para deslocamento mais rapido.",
    color: "#58c3c9",
    unlockLevel: 1,
    bonuses: { maxHealth: 0, attack: 0, defense: 0, moveSpeed: 0.24 },
  },
  siphon: {
    id: "siphon",
    name: "Runa do Sifao",
    description: "Canaliza poder bruto para causar mais dano.",
    color: "#c74f63",
    unlockLevel: 3,
    bonuses: { maxHealth: 8, attack: 3, defense: 0, moveSpeed: 0 },
  },
  warden: {
    id: "warden",
    name: "Runa do Guardiao",
    description: "Refina defesa e resiliencia contra inimigos.",
    color: "#7cb36c",
    unlockLevel: 5,
    bonuses: { maxHealth: 18, attack: 0, defense: 2, moveSpeed: 0 },
  },
  celerity: {
    id: "celerity",
    name: "Runa da Celeridade",
    description: "Impulsiona o ritmo de combate e movimento.",
    color: "#7a8ef0",
    unlockLevel: 7,
    bonuses: { maxHealth: 0, attack: 1, defense: 0, moveSpeed: 0.38 },
  },
});

export function emptyEquippedRunes(): Array<RuneId | null> {
  return Array.from({ length: RUNE_SLOT_COUNT }, () => null);
}

export function isRuneUnlocked(runeId: RuneId, level: number): boolean {
  return level >= RUNE_DEFINITIONS[runeId].unlockLevel;
}

export function defaultStarterRunesForClass(
  characterClass: CharacterClassId,
): Array<RuneId | null> {
  const slots = emptyEquippedRunes();
  slots[0] =
    characterClass === "warrior"
      ? "bulwark"
      : characterClass === "archer"
        ? "gust"
        : "ember";
  return slots;
}
