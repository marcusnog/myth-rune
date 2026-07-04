import type { CharacterClassId } from "./character.js";

export const SKILL_IDS = [
  "warrior_battle_cry",
  "mage_arcane_blast",
  "rogue_shadow_step",
  "archer_rain_of_arrows",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export type SkillEffectType = "buff" | "aoe" | "mobility";

export interface SkillDefinition {
  id: SkillId;
  name: string;
  description: string;
  classId: CharacterClassId;
  unlockLevel: number;
  cooldownMs: number;
  /** Duration of local buff in ms (0 = instant) */
  buffDurationMs: number;
  /** Multiplicative modifier for mobility/combat buffs when applicable. */
  buffMultiplier?: number;
  /** Server-authoritative radius for offensive skill resolution. */
  impactRadius?: number;
  color: string;
  effectType: SkillEffectType;
}

export const SKILL_DEFINITIONS: Readonly<Record<SkillId, SkillDefinition>> =
  Object.freeze({
    warrior_battle_cry: {
      id: "warrior_battle_cry",
      name: "Giro de Aco",
      description: "Executa um giro com a espada e acerta inimigos proximos.",
      classId: "warrior",
      unlockLevel: 1,
      cooldownMs: 9000,
      buffDurationMs: 0,
      impactRadius: 92,
      color: "#e87c3c",
      effectType: "aoe",
    },
    mage_arcane_blast: {
      id: "mage_arcane_blast",
      name: "Circulo Arcano",
      description: "Invoca um selo magico e detona energia arcana ao redor.",
      classId: "mage",
      unlockLevel: 1,
      cooldownMs: 8500,
      buffDurationMs: 0,
      impactRadius: 140,
      color: "#9b5cf6",
      effectType: "aoe",
    },
    rogue_shadow_step: {
      id: "rogue_shadow_step",
      name: "Passo das Sombras",
      description: "Envolve-se em sombras, corta ao redor e ganha velocidade por alguns segundos.",
      classId: "rogue",
      unlockLevel: 1,
      cooldownMs: 10000,
      buffDurationMs: 3200,
      buffMultiplier: 2.0,
      impactRadius: 84,
      color: "#64748b",
      effectType: "mobility",
    },
    archer_rain_of_arrows: {
      id: "archer_rain_of_arrows",
      name: "Rajada de Flechas",
      description: "Marca a area e faz uma salva de flechas cair sobre inimigos proximos.",
      classId: "archer",
      unlockLevel: 1,
      cooldownMs: 9500,
      buffDurationMs: 0,
      impactRadius: 156,
      color: "#4ade80",
      effectType: "aoe",
    },
  });