import { z } from "zod";
import { CharacterClass } from "../character.js";
import { WORLD_COMBAT_REJECT_CODES } from "../combatRules.js";
import { ITEM_IDS } from "../items.js";
import { RUNE_IDS, RUNE_SLOT_COUNT } from "../runes.js";
import { QUEST_IDS } from "../quests.js";
import { CRAFTING_RECIPES } from "../recipes.js";
import { SKILL_IDS } from "../skills.js";
import { DEFAULT_EQUIPMENT } from "../equipment.js";
import { mapIdSchema, positionSchema } from "./common.js";

const characterClassInWorldSchema = z.enum([
  CharacterClass.Warrior,
  CharacterClass.Mage,
  CharacterClass.Rogue,
  CharacterClass.Archer,
]);

/** Tipos de recurso que o servidor reconhece para validação de XP de coleta. */
export const gatherResourceTypeSchema = z.enum([
  "oak_tree",
  "pine_tree",
  "stone_deposit",
  "copper_deposit",
  "iron_deposit",
  "silver_deposit",
]);
export type GatherResourceType = z.infer<typeof gatherResourceTypeSchema>;

/** XP concedida por tipo de recurso coletado. Centralizado no shared para evitar divergência. */
export const GATHER_XP: Readonly<Record<GatherResourceType, number>> = {
  oak_tree: 8,
  pine_tree: 8,
  stone_deposit: 12,
  copper_deposit: 14,
  iron_deposit: 16,
  silver_deposit: 20,
};

export const recipeIdSchema = z.enum(
  CRAFTING_RECIPES.map((recipe) => recipe.id) as [string, ...string[]],
);

export const itemIdSchema = z.enum(ITEM_IDS);

export const questIdSchema = z.enum(QUEST_IDS);

export const worldClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    payload: z.object({
      token: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("move"),
    payload: positionSchema,
  }),
  z.object({
    type: z.literal("attack"),
    payload: z.object({
      targetMobId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal("aoe_attack"),
    payload: z.object({
      skillId: z.enum(SKILL_IDS),
    }),
  }),
  z.object({
    type: z.literal("ping"),
    payload: z.object({ clientTime: z.number().optional() }),
  }),
  z.object({
    type: z.literal("equip_rune"),
    payload: z.object({
      slotIndex: z.number().int().min(0).max(RUNE_SLOT_COUNT - 1),
      runeId: z.enum(RUNE_IDS).nullable(),
    }),
  }),
  z.object({
    type: z.literal("equip_item"),
    payload: z.object({
      slot: z.enum(["weapon", "armour"]),
      itemId: z.string().min(1).nullable(),
    }),
  }),
  z.object({
    type: z.literal("respawn"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("craft_start"),
    payload: z.object({
      recipeId: recipeIdSchema,
    }),
  }),
  z.object({
    type: z.literal("craft_cancel"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("gather_start"),
    payload: z.object({
      nodeId: z.string().min(1),
      resourceType: gatherResourceTypeSchema,
    }),
  }),
  z.object({
    type: z.literal("gather_cancel"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("change_map"),
    payload: z.object({
      portalId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("pickup_loot"),
    payload: z.object({
      dropId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal("use_item"),
    payload: z.object({
      itemId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("open_npc_panel"),
    payload: z.object({
      npcId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("npc_action"),
    payload: z.object({
      npcId: z.string().min(1),
      actionId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("use_skill"),
    payload: z.object({
      skillId: z.enum(SKILL_IDS),
    }),
  }),
]);

export type WorldClientMessage = z.infer<typeof worldClientMessageSchema>;

export const playerStateSchema = z.object({
  characterId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  mapId: mapIdSchema,
  characterClass: characterClassInWorldSchema,
  characterName: z.string().min(1).max(64),
  level: z.number().int().positive(),
});

/** Alinhado com pastas em client/assets/sprites/mobs/<type>/ */
export const mobTypeSchema = z.enum(["goblin", "zombie", "wolf", "ent"]);

export const mobStateSchema = z.object({
  mobId: z.string().uuid(),
  mobType: mobTypeSchema,
  x: z.number(),
  y: z.number(),
  health: z.number().int().nonnegative().optional(),
});

export type MobType = z.infer<typeof mobTypeSchema>;

export const lootDropSchema = z.object({
  dropId: z.string().uuid(),
  itemId: z.string().min(1),
  amount: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
});

export type LootDrop = z.infer<typeof lootDropSchema>;

export const runeIdSchema = z.enum(RUNE_IDS);

export const derivedStatsSchema = z.object({
  maxHealth: z.number().int().positive(),
  attack: z.number().int().positive(),
  defense: z.number().int().nonnegative(),
  moveSpeed: z.number().positive(),
  worldMoveSpeed: z.number().positive(),
  power: z.number().int().nonnegative(),
  critChance: z.number().min(0).max(1),
  dodgeChance: z.number().min(0).max(1),
});

export const progressionRuneSchema = z.object({
  id: runeIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  color: z.string().min(1),
  unlockLevel: z.number().int().positive(),
  unlocked: z.boolean(),
  equippedSlotIndex: z.number().int().min(0).max(RUNE_SLOT_COUNT - 1).nullable(),
  bonuses: z.object({
    maxHealth: z.number().int(),
    attack: z.number().int(),
    defense: z.number().int(),
    moveSpeed: z.number(),
  }),
});

export const progressionSnapshotSchema = z.object({
  level: z.number().int().positive(),
  experience: z.number().int().nonnegative(),
  currentHealth: z.number().int().nonnegative(),
  experienceIntoLevel: z.number().int().nonnegative(),
  experienceForNextLevel: z.number().int().nonnegative(),
  levelProgress: z.number().min(0).max(1),
  equippedRunes: z.array(runeIdSchema.nullable()).length(RUNE_SLOT_COUNT),
  equipment: z
    .object({
      weapon: z.string().min(1).nullable(),
      armour: z.string().min(1).nullable(),
    })
    .default(DEFAULT_EQUIPMENT),
  availableRunes: z.array(progressionRuneSchema),
  stats: derivedStatsSchema,
});

export const worldCombatRejectCodeSchema = z.enum(WORLD_COMBAT_REJECT_CODES);

export const worldCombatConfigSchema = z.object({
  playerAttackRange: z.number().positive(),
  playerAttackCooldownMs: z.number().int().positive(),
  mobAttackDamage: z.number().int().positive(),
  mobDefense: z.number().int().nonnegative(),
  mobAttackRange: z.number().positive(),
  mobAttackCooldownMs: z.number().int().positive(),
});

export const npcPanelActionSchema = z.object({
  actionId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  disabled: z.boolean(),
  emphasis: z.enum(["primary", "muted", "danger"]).default("primary"),
});

export type NpcPanelAction = z.infer<typeof npcPanelActionSchema>;

export const npcPanelViewSchema = z.object({
  npcId: z.string().min(1),
  npcName: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  hint: z.string().min(1).nullable().default(null),
  actions: z.array(npcPanelActionSchema),
});

export type NpcPanelView = z.infer<typeof npcPanelViewSchema>;

export const craftStateSchema = z.object({
  active: z.boolean(),
  recipeId: recipeIdSchema.nullable(),
  progress: z.number().min(0).max(1),
  startedAt: z.number().int().nullable(),
  completesAt: z.number().int().nullable(),
  status: z.enum(["idle", "started", "cancelled", "completed"]),
});

export const gatherStateSchema = z.object({
  active: z.boolean(),
  nodeId: z.string().min(1).nullable(),
  resourceType: gatherResourceTypeSchema.nullable(),
  progress: z.number().min(0).max(1),
  startedAt: z.number().int().nullable(),
  completesAt: z.number().int().nullable(),
  yieldItemId: itemIdSchema.nullable(),
  yieldAmount: z.number().int().positive().nullable(),
  status: z.enum(["idle", "started", "cancelled", "completed"]),
});

export const questUpdateSchema = z.object({
  questId: questIdSchema,
  status: z.enum(["available", "active", "ready", "completed"]),
  progress: z.number().int().nonnegative(),
});

export const worldServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    payload: z.object({
      characterId: z.string().uuid(),
      mapId: mapIdSchema,
      position: positionSchema,
      health: z.number().int().nonnegative(),
      maxHealth: z.number().int().positive(),
      progression: progressionSnapshotSchema,
      combatConfig: worldCombatConfigSchema,
      players: z.array(playerStateSchema),
      mobs: z.array(mobStateSchema).default([]),
      loot: z.array(lootDropSchema).default([]),
      inventory: z.record(z.string(), z.number().int().nonnegative()).default({}),
      craftState: craftStateSchema.default({
        active: false,
        recipeId: null,
        progress: 0,
        startedAt: null,
        completesAt: null,
        status: "idle",
      }),
      gatherState: gatherStateSchema.default({
        active: false,
        nodeId: null,
        resourceType: null,
        progress: 0,
        startedAt: null,
        completesAt: null,
        yieldItemId: null,
        yieldAmount: null,
        status: "idle",
      }),
    }),
  }),
  z.object({
    type: z.literal("inventory"),
    payload: z.object({
      inventory: z.record(z.string(), z.number().int().nonnegative()),
    }),
  }),
  z.object({
    type: z.literal("state"),
    payload: z.object({
      players: z.array(playerStateSchema),
      mobs: z.array(mobStateSchema).default([]),
      loot: z.array(lootDropSchema).default([]),
    }),
  }),
  z.object({
    type: z.literal("craft_state"),
    payload: craftStateSchema,
  }),
  z.object({
    type: z.literal("gather_state"),
    payload: gatherStateSchema,
  }),
  z.object({
    type: z.literal("progression"),
    payload: progressionSnapshotSchema,
  }),
  z.object({
    type: z.literal("position_correction"),
    payload: positionSchema,
  }),
  z.object({
    type: z.literal("respawned"),
    payload: z.object({
      mapId: mapIdSchema,
      position: positionSchema,
      health: z.number().int().nonnegative(),
      maxHealth: z.number().int().positive(),
      progression: progressionSnapshotSchema,
    }),
  }),
  z.object({
    type: z.literal("combat_event"),
    payload: z.object({
      attackerId: z.string().uuid(),
      targetId: z.string().uuid(),
      damage: z.number().int().nonnegative(),
      targetHealth: z.number().int().nonnegative(),
      isCritical: z.boolean().optional(),
      isDodged: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("error"),
    payload: z.object({
      code: z.string().min(1),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal("pong"),
    payload: z.object({ serverTime: z.number() }),
  }),
  z.object({
    type: z.literal("npc_panel"),
    payload: npcPanelViewSchema,
  }),
  z.object({
    type: z.literal("map_changed"),
    payload: z.object({
      mapId: mapIdSchema,
      position: positionSchema,
    }),
  }),
  z.object({
    type: z.literal("quest_update"),
    payload: questUpdateSchema,
  }),
]);

export type WorldServerMessage = z.infer<typeof worldServerMessageSchema>;
