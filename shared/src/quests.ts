import type { ItemId } from "./items.js";
import type { MobType } from "./schemas/world.js";

export const QUEST_IDS = [
  "goblin_menace",
  "wolf_patrol",
  "timber_for_torren",
  "stone_for_lyra",
  "ent_root_watch",
] as const;

export type QuestId = (typeof QUEST_IDS)[number];
export type QuestStatus = "available" | "active" | "ready" | "completed";
export type QuestObjectiveType = "kill" | "collect";

export interface QuestReward {
  itemId: ItemId;
  quantity: number;
}

export interface QuestDefinition {
  id: QuestId;
  npcId: string;
  npcName: string;
  title: string;
  description: string;
  objectiveType: QuestObjectiveType;
  targetMobType?: MobType;
  targetItemId?: ItemId;
  requiredAmount: number;
  rewards: readonly QuestReward[];
}

export interface QuestStateEntry {
  status: QuestStatus;
  progress: number;
}

export type QuestStateRecord = Record<QuestId, QuestStateEntry>;

export const QUEST_DEFINITIONS: Readonly<Record<QuestId, QuestDefinition>> = Object.freeze({
  goblin_menace: {
    id: "goblin_menace",
    npcId: "captain_brom",
    npcName: "Captain Brom",
    title: "Bounty: Ameaca Goblin",
    description: "Derrote 4 goblins perto da cerca e volte para receber a recompensa.",
    objectiveType: "kill",
    targetMobType: "goblin",
    requiredAmount: 4,
    rewards: [
      { itemId: "gold_coin", quantity: 24 },
      { itemId: "health_potion", quantity: 1 },
    ],
  },
  wolf_patrol: {
    id: "wolf_patrol",
    npcId: "guard_hale",
    npcName: "Guard Hale",
    title: "Patrulha dos Lobos",
    description: "Elimine 3 lobos na trilha sul para manter a estrada segura.",
    objectiveType: "kill",
    targetMobType: "wolf",
    requiredAmount: 3,
    rewards: [
      { itemId: "gold_coin", quantity: 18 },
      { itemId: "wood_handle", quantity: 1 },
    ],
  },
  timber_for_torren: {
    id: "timber_for_torren",
    npcId: "blacksmith_torren",
    npcName: "Blacksmith Torren",
    title: "Lenha para a Forja",
    description: "Traga 6 unidades de madeira para manter a forja acesa.",
    objectiveType: "collect",
    targetItemId: "wood",
    requiredAmount: 6,
    rewards: [
      { itemId: "gold_coin", quantity: 14 },
      { itemId: "simple_axe", quantity: 1 },
    ],
  },
  stone_for_lyra: {
    id: "stone_for_lyra",
    npcId: "healer_lyra",
    npcName: "Healer Lyra",
    title: "Pedras do Santuario",
    description: "Entregue 4 pedras para reforcar o circulo de cura.",
    objectiveType: "collect",
    targetItemId: "stone",
    requiredAmount: 4,
    rewards: [
      { itemId: "gold_coin", quantity: 12 },
      { itemId: "health_potion", quantity: 2 },
    ],
  },
  ent_root_watch: {
    id: "ent_root_watch",
    npcId: "mage_elowen",
    npcName: "Mage Elowen",
    title: "Raiz Antiga",
    description: "Abata 1 ent na borda da floresta para estudar a energia da raiz.",
    objectiveType: "kill",
    targetMobType: "ent",
    requiredAmount: 1,
    rewards: [
      { itemId: "gold_coin", quantity: 30 },
      { itemId: "cut_stone", quantity: 2 },
    ],
  },
});

export function createDefaultQuestState(): QuestStateRecord {
  return {
    goblin_menace: { status: "available", progress: 0 },
    wolf_patrol: { status: "available", progress: 0 },
    timber_for_torren: { status: "available", progress: 0 },
    stone_for_lyra: { status: "available", progress: 0 },
    ent_root_watch: { status: "available", progress: 0 },
  };
}
