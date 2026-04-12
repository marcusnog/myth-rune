import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import {
  CRAFTING_RECIPE_BY_ID,
  DEFAULT_EQUIPMENT,
  GATHER_XP,
  SKILL_DEFINITIONS,
  WORLD_COMBAT_CONFIG,
  getPortalForPosition,
  playerAttackRangeForClass,
  worldClientMessageSchema,
  type GatherResourceType,
  type QuestId,
  type RuneId,
  type SkillId,
  type WorldClientMessage,
} from "@myth-of-rune/shared";
import type { Redis } from "ioredis";
import type pg from "pg";
import * as characterRepository from "../repositories/characterRepository.js";
import { verifyGameToken } from "../services/jwtService.js";
import { findNearestWalkablePosition } from "../services/mapCollision.js";
import { positionKey } from "../services/redisKeys.js";
import { validateMove } from "../services/movement.js";
import * as loot from "./loot.js";
import * as mobs from "./mobs.js";
import * as npcServices from "./npcServices.js";
import * as progression from "./progression.js";
import type { ConnectedPlayer } from "./room.js";
import * as room from "./room.js";
import { findResourceNode, getRespawnPoint } from "./worldMaps.js";

const POSITION_PERSIST_INTERVAL_MS = 250;
const MESSAGE_RATE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  move: 20,
  attack: 5,
  aoe_attack: 2,
  use_skill: 2,
  npc_action: 2,
  craft_start: 2,
  craft_cancel: 2,
  gather_start: 2,
  gather_cancel: 2,
});

const gatherNodeCooldownUntil = new Map<string, number>();

function sendJson(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  sendJson(ws, { type: "error", payload: { code, message } });
}

function parseClientMessage(
  ws: WebSocket,
  data: import("ws").RawData,
): WorldClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString());
  } catch {
    sendError(ws, "BAD_JSON", "Invalid JSON");
    return null;
  }
  const result = worldClientMessageSchema.safeParse(parsed);
  if (!result.success) {
    sendError(ws, "VALIDATION", "Invalid message");
    return null;
  }
  return result.data;
}

async function withDb<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function persistPlayerPosition(
  pool: pg.Pool,
  redis: Redis,
  self: ConnectedPlayer,
): Promise<void> {
  await withDb(pool, (client) =>
    characterRepository.updateMapPosition(client, self.characterId, self.mapId, self.x, self.y),
  );
  await redis.setex(
    positionKey(self.characterId),
    120,
    JSON.stringify({ x: self.x, y: self.y, mapId: self.mapId }),
  );
}

async function persistPlayerHealth(
  pool: pg.Pool,
  characterId: string,
  health: number,
): Promise<void> {
  await withDb(pool, (client) => characterRepository.updateHealth(client, characterId, health));
}

function broadcastState(mapId: ConnectedPlayer["mapId"]): void {
  room.broadcastJson(
    {
      type: "state",
      payload: {
        players: room.snapshotForClient(mapId),
        mobs: mobs.snapshotMobsForClient(mapId),
        loot: loot.snapshotLootForClient(mapId),
      },
    },
    mapId,
  );
}

function sendQuestUpdates(
  ws: WebSocket,
  self: ConnectedPlayer,
  questIds: readonly QuestId[],
): void {
  const sent = new Set<QuestId>();
  for (const questId of questIds) {
    if (sent.has(questId)) {
      continue;
    }
    sent.add(questId);
    const quest = self.questState[questId];
    if (!quest) {
      continue;
    }
    sendJson(ws, {
      type: "quest_update",
      payload: {
        questId,
        status: quest.status,
        progress: quest.progress,
      },
    });
  }
}

async function syncInventoryQuestUpdates(
  client: pg.PoolClient,
  ws: WebSocket,
  self: ConnectedPlayer,
  inventory: Record<string, number>,
): Promise<QuestId[]> {
  const changedQuestIds = npcServices.syncInventoryQuestProgress(self, inventory);
  if (changedQuestIds.length <= 0) {
    return [];
  }
  await characterRepository.updateQuestState(client, self.characterId, self.questState);
  sendQuestUpdates(ws, self, changedQuestIds);
  return changedQuestIds;
}

function craftStatePayload(self: ConnectedPlayer, nowMs: number = Date.now()) {
  const task = self.activeCraft;
  if (!task) {
    return {
      active: false,
      recipeId: null,
      progress: 0,
      startedAt: null,
      completesAt: null,
      status: "idle" as const,
    };
  }
  return {
    active: true,
    recipeId: task.recipeId,
    progress: Math.max(
      0,
      Math.min(1, (nowMs - task.startedAt) / Math.max(1, task.completesAt - task.startedAt)),
    ),
    startedAt: task.startedAt,
    completesAt: task.completesAt,
    status: "started" as const,
  };
}

function gatherStatePayload(self: ConnectedPlayer, nowMs: number = Date.now()) {
  const task = self.activeGather;
  if (!task) {
    return {
      active: false,
      nodeId: null,
      resourceType: null,
      progress: 0,
      startedAt: null,
      completesAt: null,
      yieldItemId: null,
      yieldAmount: null,
      status: "idle" as const,
    };
  }
  return {
    active: true,
    nodeId: task.nodeId,
    resourceType: task.resourceType,
    progress: Math.max(
      0,
      Math.min(1, (nowMs - task.startedAt) / Math.max(1, task.completesAt - task.startedAt)),
    ),
    startedAt: task.startedAt,
    completesAt: task.completesAt,
    yieldItemId: task.yieldItemId,
    yieldAmount: task.yieldAmount,
    status: "started" as const,
  };
}

function sendProgressionSnapshot(ws: WebSocket, self: ConnectedPlayer): void {
  sendJson(ws, {
    type: "progression",
    payload: progression.snapshotPlayerProgression(
      self.characterClass,
      { experience: self.experience, equippedRunes: self.equippedRunes, equipment: self.equipment },
      self.health,
    ),
  });
}

function applyXpGrant(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  xpAmount: number,
): void {
  const result = progression.grantExperience(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes, equipment: self.equipment },
    xpAmount,
  );
  self.experience = result.snapshot.experience;
  self.level = result.snapshot.level;
  self.equippedRunes = [...result.snapshot.equippedRunes];
  self.equipment = result.snapshot.equipment;
  self.stats = result.snapshot.stats;
  if (result.levelChanged) {
    self.health = self.stats.maxHealth;
    void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
  } else {
    self.health = Math.min(self.health, self.stats.maxHealth);
  }
  sendProgressionSnapshot(ws, self);
}

function checkRate(self: ConnectedPlayer, type: string): boolean {
  const limit = MESSAGE_RATE_LIMITS[type];
  if (!limit) {
    return true;
  }
  const now = Date.now();
  const current = self.messageRateLimit.get(type) ?? { count: 0, windowStart: now };
  if (now - current.windowStart > 1000) {
    current.count = 0;
    current.windowStart = now;
  }
  current.count += 1;
  self.messageRateLimit.set(type, current);
  return current.count <= limit;
}

function handlePing(ws: WebSocket): void {
  sendJson(ws, { type: "pong", payload: { serverTime: Date.now() } });
}

function handleEquipRune(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { slotIndex: number; runeId: RuneId | null },
): void {
  const result = progression.equipRune(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes, equipment: self.equipment },
    payload.slotIndex,
    payload.runeId,
  );
  if (!result.ok) {
    sendError(ws, "RUNE", result.message);
    return;
  }
  self.equippedRunes = [...result.snapshot.equippedRunes];
  self.level = result.snapshot.level;
  self.experience = result.snapshot.experience;
  self.stats = result.snapshot.stats;
  self.health = Math.min(self.health, self.stats.maxHealth);
  sendProgressionSnapshot(ws, self);
  broadcastState(self.mapId);
  void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
}

function handleEquipItem(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { slot: "weapon" | "armour"; itemId: string | null },
): void {
  const result = progression.equipItem(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes, equipment: self.equipment },
    payload.slot,
    payload.itemId,
  );
  if (!result.ok) {
    sendError(ws, "EQUIP", result.message);
    return;
  }
  self.equipment = result.snapshot.equipment;
  self.stats = result.snapshot.stats;
  self.health = Math.min(self.health, self.stats.maxHealth);
  sendProgressionSnapshot(ws, self);
  broadcastState(self.mapId);
  void withDb(pool, async (client) => {
    await characterRepository.updateEquipment(client, self.characterId, self.equipment as any);
    await characterRepository.updateHealth(client, self.characterId, self.health);
  }).catch(() => undefined);
}

function handleRespawn(
  ws: WebSocket,
  pool: pg.Pool,
  redis: Redis,
  self: ConnectedPlayer,
): void {
  if (self.health > 0) {
    sendError(ws, "RESPAWN", "Respawn so pode ser usado apos morrer.");
    return;
  }
  const respawn = getRespawnPoint(self.mapId);
  self.x = respawn.x;
  self.y = respawn.y;
  self.health = self.stats.maxHealth;
  self.invulnerableUntilMs = Date.now() + 1200;
  sendJson(ws, {
    type: "respawned",
    payload: {
      position: { x: self.x, y: self.y },
      health: self.health,
      maxHealth: self.stats.maxHealth,
      progression: progression.snapshotPlayerProgression(
        self.characterClass,
        { experience: self.experience, equippedRunes: self.equippedRunes, equipment: self.equipment },
        self.health,
      ),
    },
  });
  broadcastState(self.mapId);
  void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
  void persistPlayerPosition(pool, redis, self).catch(() => undefined);
}

function handleAttack(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { targetMobId: string },
): void {
  const result = mobs.applyPlayerAttack(self, payload.targetMobId, Date.now());
  if (!result.ok) {
    sendError(ws, result.code, result.message);
    return;
  }
  room.broadcastJson({ type: "combat_event", payload: result.event }, self.mapId);
  if (result.experienceAwarded > 0) {
    applyXpGrant(ws, pool, self, result.experienceAwarded);
  }
  if (result.mobDied && result.diedAt) {
    const changedQuestIds = npcServices.recordMobKill(self, result.diedAt.mobType);
    if (changedQuestIds.length > 0) {
      sendQuestUpdates(ws, self, changedQuestIds);
      void withDb(pool, (client) =>
        characterRepository.updateQuestState(client, self.characterId, self.questState),
      ).catch(() => undefined);
    }
    loot.spawnLootForMobDeath(
      result.diedAt.mapId,
      result.diedAt.mobType,
      result.diedAt.x,
      result.diedAt.y,
      Date.now(),
    );
    broadcastState(self.mapId);
  }
}

function canUseSkill(self: ConnectedPlayer, skillId: SkillId, nowMs: number): boolean {
  const lastUsedAt = self.lastSkillAtById[skillId] ?? 0;
  return nowMs - lastUsedAt >= SKILL_DEFINITIONS[skillId].cooldownMs;
}

function handleUseSkill(
  ws: WebSocket,
  self: ConnectedPlayer,
  payload: { skillId: SkillId },
): void {
  const nowMs = Date.now();
  if (SKILL_DEFINITIONS[payload.skillId].classId !== self.characterClass) {
    sendError(ws, "SKILL", "Skill does not match character class");
    return;
  }
  if (!canUseSkill(self, payload.skillId, nowMs)) {
    sendError(ws, "COOLDOWN", "Skill is on cooldown");
    return;
  }
  self.lastSkillAtById[payload.skillId] = nowMs;
}

function handleAoeAttack(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { skillId: SkillId },
): void {
  const skill = SKILL_DEFINITIONS[payload.skillId];
  const nowMs = Date.now();
  if (skill.classId !== self.characterClass) {
    sendError(ws, "SKILL", "Skill does not match character class");
    return;
  }
  if ((skill.impactRadius ?? 0) <= 0) {
    sendError(ws, "SKILL", "Skill has no offensive area");
    return;
  }
  if (!canUseSkill(self, payload.skillId, nowMs)) {
    sendError(ws, "COOLDOWN", "Skill is on cooldown");
    return;
  }
  self.lastSkillAtById[payload.skillId] = nowMs;
  const result = mobs.applyPlayerAoeAttack(self, payload.skillId, nowMs);
  if (!result.ok) {
    sendError(ws, result.code, result.message);
    return;
  }
  for (const event of result.events) {
    room.broadcastJson({ type: "combat_event", payload: event }, self.mapId);
  }
  if (result.experienceAwarded > 0) {
    applyXpGrant(ws, pool, self, result.experienceAwarded);
  }
  if (result.kills.length > 0) {
    const changedQuestIds = new Set<QuestId>();
    for (const kill of result.kills) {
      for (const questId of npcServices.recordMobKill(self, kill.mobType)) {
        changedQuestIds.add(questId);
      }
      loot.spawnLootForMobDeath(kill.mapId, kill.mobType, kill.x, kill.y, nowMs);
    }
    if (changedQuestIds.size > 0) {
      sendQuestUpdates(ws, self, [...changedQuestIds]);
      void withDb(pool, (client) =>
        characterRepository.updateQuestState(client, self.characterId, self.questState),
      ).catch(() => undefined);
    }
    broadcastState(self.mapId);
  }
}

async function handlePickupLoot(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { dropId: string },
): Promise<void> {
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    const pickup = loot.tryPickupLoot(self, payload.dropId, inventory, Date.now());
    if (!pickup.ok) {
      sendError(ws, pickup.code, pickup.message);
      return;
    }
    await characterRepository.updateInventory(client, self.characterId, inventory);
    await syncInventoryQuestUpdates(client, ws, self, inventory);
    sendJson(ws, { type: "inventory", payload: { inventory } });
    broadcastState(self.mapId);
  }).catch(() => undefined);
}

async function handleUseItem(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { itemId: string },
): Promise<void> {
  if (payload.itemId !== "health_potion") {
    sendError(ws, "ITEM", "Esse item nao pode ser usado agora.");
    return;
  }
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    const result = npcServices.useHealthPotion(self, inventory);
    if (!result.ok) {
      sendError(ws, result.code, result.message);
      return;
    }
    await characterRepository.updateInventory(client, self.characterId, inventory);
    await characterRepository.updateHealth(client, self.characterId, self.health);
    await syncInventoryQuestUpdates(client, ws, self, inventory);
    sendJson(ws, { type: "inventory", payload: { inventory } });
    sendProgressionSnapshot(ws, self);
  }).catch(() => undefined);
}

async function handleOpenNpcPanel(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { npcId: string },
): Promise<void> {
  if (!npcServices.isServiceNpc(payload.npcId)) {
    sendError(ws, "NPC", "Esse NPC nao possui servicos.");
    return;
  }
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    await syncInventoryQuestUpdates(client, ws, self, inventory);
    const panel = npcServices.buildNpcPanel(self, inventory, payload.npcId);
    if (!panel) {
      sendError(ws, "NPC", "Painel indisponivel.");
      return;
    }
    sendJson(ws, { type: "npc_panel", payload: panel });
  }).catch(() => undefined);
}

async function handleNpcAction(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { npcId: string; actionId: string },
): Promise<void> {
  if (!npcServices.isServiceNpc(payload.npcId)) {
    sendError(ws, "NPC", "Esse NPC nao possui servicos.");
    return;
  }
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    const result = npcServices.applyNpcAction(self, inventory, payload.npcId, payload.actionId);
    if (!result.ok) {
      sendError(ws, result.code, result.message);
      return;
    }
    const changedInventoryQuestIds = npcServices.syncInventoryQuestProgress(self, inventory);
    await characterRepository.updateInventory(client, self.characterId, inventory);
    await characterRepository.updateHealth(client, self.characterId, self.health);
    await characterRepository.updateQuestState(client, self.characterId, self.questState);
    sendJson(ws, { type: "inventory", payload: { inventory } });
    sendProgressionSnapshot(ws, self);
    sendJson(ws, { type: "npc_panel", payload: result.panel });
    sendQuestUpdates(ws, self, [
      ...npcServices.getQuestIdsForNpc(payload.npcId),
      ...changedInventoryQuestIds,
    ]);
  }).catch(() => undefined);
}

function handleMove(
  ws: WebSocket,
  pool: pg.Pool,
  redis: Redis,
  self: ConnectedPlayer,
  payload: { x: number; y: number },
): void {
  const now = Date.now();
  const elapsed = Math.max(0.05, (now - self.lastMoveAt) / 1000);
  const result = validateMove(
    self.mapId,
    { x: self.x, y: self.y },
    payload,
    self.stats.worldMoveSpeed,
    elapsed,
  );
  self.x = result.position.x;
  self.y = result.position.y;
  self.lastMoveAt = now;
  broadcastState(self.mapId);
  if (result.corrected) {
    sendJson(ws, { type: "position_correction", payload: { x: self.x, y: self.y } });
  }
  if (now - self.lastPersistAt >= POSITION_PERSIST_INTERVAL_MS) {
    self.lastPersistAt = now;
    void persistPlayerPosition(pool, redis, self).catch(() => undefined);
  }
}

async function handleCraftStart(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { recipeId: string },
): Promise<void> {
  if (self.activeCraft) {
    sendError(ws, "CRAFT", "Ja existe um craft em andamento.");
    return;
  }
  const recipe = CRAFTING_RECIPE_BY_ID[payload.recipeId];
  if (!recipe) {
    sendError(ws, "CRAFT", "Receita desconhecida.");
    return;
  }
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    for (const material of recipe.materials) {
      if ((inventory[material.itemId] ?? 0) < material.quantity) {
        sendError(ws, "CRAFT", "Materiais insuficientes.");
        return;
      }
    }
    for (const material of recipe.materials) {
      inventory[material.itemId] -= material.quantity;
      if (inventory[material.itemId] <= 0) {
        delete inventory[material.itemId];
      }
    }
    await characterRepository.updateInventory(client, self.characterId, inventory);
    await syncInventoryQuestUpdates(client, ws, self, inventory);
    const startedAt = Date.now();
    self.activeCraft = {
      recipeId: recipe.id,
      outputItemId: recipe.outputItemId,
      outputQuantity: recipe.outputQuantity,
      materials: recipe.materials,
      startedAt,
      completesAt: startedAt + recipe.craftTimeMs,
    };
    sendJson(ws, { type: "inventory", payload: { inventory } });
    sendJson(ws, { type: "craft_state", payload: craftStatePayload(self, startedAt) });
  }).catch(() => undefined);
}

async function handleCraftCancel(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
): Promise<void> {
  if (!self.activeCraft) {
    sendError(ws, "CRAFT", "Nenhum craft ativo.");
    return;
  }
  const task = self.activeCraft;
  self.activeCraft = null;
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    const inventory = row?.inventory ?? {};
    for (const material of task.materials) {
      inventory[material.itemId] = (inventory[material.itemId] ?? 0) + material.quantity;
    }
    await characterRepository.updateInventory(client, self.characterId, inventory);
    await syncInventoryQuestUpdates(client, ws, self, inventory);
    sendJson(ws, { type: "inventory", payload: { inventory } });
    sendJson(ws, {
      type: "craft_state",
      payload: {
        active: false,
        recipeId: task.recipeId,
        progress: 0,
        startedAt: task.startedAt,
        completesAt: task.completesAt,
        status: "cancelled",
      },
    });
  }).catch(() => undefined);
}

async function handleGatherStart(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { nodeId: string; resourceType: GatherResourceType },
): Promise<void> {
  if (self.activeGather) {
    sendError(ws, "GATHER", "Ja existe uma coleta em andamento.");
    return;
  }
  const node = findResourceNode(self.mapId, payload.nodeId);
  if (!node || node.resourceType !== payload.resourceType) {
    sendError(ws, "GATHER", "Nodo invalido.");
    return;
  }
  if ((gatherNodeCooldownUntil.get(`${self.mapId}:${node.nodeId}`) ?? 0) > Date.now()) {
    sendError(ws, "GATHER", "Esse recurso ainda nao reapareceu.");
    return;
  }
  if (Math.hypot(self.x - node.x, self.y - node.y) > node.interactDistance) {
    sendError(ws, "OUT_OF_RANGE", "Fora de alcance.");
    return;
  }
  await withDb(pool, async (client) => {
    const row = await characterRepository.getCharacterById(client, self.characterId);
    if (!row) {
      sendError(ws, "NOT_FOUND", "Character not found");
      return;
    }
    const inventory = row.inventory ?? {};
    if ((inventory[node.requiredTool] ?? 0) <= 0) {
      sendError(ws, "GATHER", "Ferramenta obrigatoria ausente.");
      return;
    }
    const startedAt = Date.now();
    self.activeGather = {
      nodeId: node.nodeId,
      resourceType: node.resourceType,
      yieldItemId: node.yieldItemId,
      yieldAmount: node.yieldAmount,
      startedAt,
      completesAt: startedAt + node.gatherTimeMs,
    };
    sendJson(ws, { type: "gather_state", payload: gatherStatePayload(self, startedAt) });
  }).catch(() => undefined);
}

function handleGatherCancel(ws: WebSocket, self: ConnectedPlayer): void {
  if (!self.activeGather) {
    sendError(ws, "GATHER", "Nenhuma coleta ativa.");
    return;
  }
  const task = self.activeGather;
  self.activeGather = null;
  sendJson(ws, {
    type: "gather_state",
    payload: {
      active: false,
      nodeId: task.nodeId,
      resourceType: task.resourceType,
      progress: 0,
      startedAt: task.startedAt,
      completesAt: task.completesAt,
      yieldItemId: task.yieldItemId,
      yieldAmount: task.yieldAmount,
      status: "cancelled",
    },
  });
}

async function handleChangeMap(
  ws: WebSocket,
  pool: pg.Pool,
  redis: Redis,
  self: ConnectedPlayer,
  payload: { portalId: string },
): Promise<void> {
  if (self.health <= 0) {
    sendError(ws, "MAP", "Nao e possivel trocar de mapa enquanto estiver derrotado.");
    return;
  }
  if (self.activeCraft || self.activeGather) {
    sendError(ws, "MAP", "Conclua ou cancele a acao atual antes de trocar de mapa.");
    return;
  }
  const portal = getPortalForPosition(self.mapId, self.x, self.y);
  if (!portal || portal.id !== payload.portalId) {
    sendError(ws, "MAP", "Aproxime-se do portal para trocar de mapa.");
    return;
  }

  const previousMapId = self.mapId;
  const nextPosition = findNearestWalkablePosition(
    portal.toMapId,
    portal.arrival.x,
    portal.arrival.y,
  );
  room.setPlayerMap(self.characterId, portal.toMapId, nextPosition);
  self.lastMoveAt = Date.now();
  self.lastPersistAt = self.lastMoveAt;

  await persistPlayerPosition(pool, redis, self);
  sendJson(ws, {
    type: "map_changed",
    payload: {
      mapId: self.mapId,
      position: nextPosition,
    },
  });
  broadcastState(previousMapId);
  broadcastState(self.mapId);
}

async function authenticateConnection(
  ws: WebSocket,
  pool: pg.Pool,
  redis: Redis,
  token: string,
): Promise<ConnectedPlayer | null> {
  let payload: { sub: string; cid: string };
  try {
    payload = verifyGameToken(token);
  } catch {
    sendError(ws, "UNAUTHORIZED", "Invalid token");
    ws.close(4001);
    return null;
  }
  const row = await withDb(pool, (client) => characterRepository.getCharacterById(client, payload.cid));
  if (!row) {
    sendError(ws, "NOT_FOUND", "Character not found");
    ws.close(4004);
    return null;
  }
  const initialProgression = progression.createInitialProgression(row.character_class);
  initialProgression.equipment =
    (row.equipment as unknown as typeof initialProgression.equipment) ?? { ...DEFAULT_EQUIPMENT };
  const initialSnapshot = progression.snapshotPlayerProgression(
    row.character_class,
    initialProgression,
    row.health,
  );
  const existing = room.getPlayer(row.id);
  if (existing && existing.socket !== ws) {
    try {
      existing.socket.close(4002, "Session replaced by new connection");
    } catch {}
    room.removePlayer(row.id);
  }
  const self: ConnectedPlayer = {
    characterId: row.id,
    userId: row.user_id,
    characterClass: row.character_class,
    characterName: row.name,
    mapId: row.map_id,
    x: row.x,
    y: row.y,
    health: Math.max(0, Math.min(row.health, initialSnapshot.stats.maxHealth)),
    invulnerableUntilMs: 0,
    lastMoveAt: Date.now(),
    lastPersistAt: Date.now(),
    lastAttackAt: 0,
    lastSkillAtById: {},
    level: initialSnapshot.level,
    experience: initialProgression.experience,
    equippedRunes: [...initialProgression.equippedRunes],
    equipment: initialProgression.equipment,
    questState: npcServices.normalizeQuestState(row.quest_state),
    stats: initialSnapshot.stats,
    socket: ws,
    isAuthenticated: true,
    messageRateLimit: new Map(),
    activeCraft: null,
    activeGather: null,
  };
  room.addPlayer(self);
  await persistPlayerPosition(pool, redis, self);
  sendJson(ws, {
    type: "welcome",
    payload: {
      characterId: row.id,
      mapId: self.mapId,
      position: { x: self.x, y: self.y },
      health: self.health,
      maxHealth: initialSnapshot.stats.maxHealth,
      progression: initialSnapshot,
      combatConfig: {
        ...WORLD_COMBAT_CONFIG,
        playerAttackRange: playerAttackRangeForClass(row.character_class),
      },
      players: room.snapshotForClient(self.mapId),
      mobs: mobs.snapshotMobsForClient(self.mapId),
      loot: loot.snapshotLootForClient(self.mapId),
      inventory: row.inventory ?? {},
      craftState: craftStatePayload(self),
      gatherState: gatherStatePayload(self),
    },
  });
  broadcastState(self.mapId);
  return self;
}

export function attachWorldHandlers(
  wss: import("ws").WebSocketServer,
  pool: pg.Pool,
  redis: Redis,
): void {
  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let characterId: string | null = null;

    ws.on("message", (data) => {
      const msg = parseClientMessage(ws, data);
      if (!msg) {
        return;
      }
      if (msg.type === "auth") {
        if (characterId) {
          sendError(ws, "AUTH", "Connection already authenticated.");
          return;
        }
        void authenticateConnection(ws, pool, redis, msg.payload.token)
          .then((player) => {
            characterId = player?.characterId ?? null;
          })
          .catch(() => {
            sendError(ws, "UNAUTHORIZED", "Authentication failed");
            ws.close(4001);
          });
        return;
      }

      if (!characterId) {
        sendError(ws, "UNAUTHORIZED", "Authenticate first.");
        ws.close(4001);
        return;
      }

      const self = room.getPlayer(characterId);
      if (!self || self.socket !== ws) {
        return;
      }
      if (!checkRate(self, msg.type)) {
        sendError(ws, "RATE_LIMIT", "Muitas mensagens desse tipo.");
        return;
      }

      switch (msg.type) {
        case "ping":
          handlePing(ws);
          return;
        case "equip_rune":
          handleEquipRune(ws, pool, self, msg.payload);
          return;
        case "equip_item":
          handleEquipItem(ws, pool, self, msg.payload);
          return;
        case "respawn":
          handleRespawn(ws, pool, redis, self);
          return;
        case "attack":
          handleAttack(ws, pool, self, msg.payload);
          return;
        case "aoe_attack":
          handleAoeAttack(ws, pool, self, msg.payload);
          return;
        case "use_skill":
          handleUseSkill(ws, self, msg.payload);
          return;
        case "pickup_loot":
          void handlePickupLoot(ws, pool, self, msg.payload);
          return;
        case "use_item":
          void handleUseItem(ws, pool, self, msg.payload);
          return;
        case "open_npc_panel":
          void handleOpenNpcPanel(ws, pool, self, msg.payload);
          return;
        case "npc_action":
          void handleNpcAction(ws, pool, self, msg.payload);
          return;
        case "move":
          handleMove(ws, pool, redis, self, msg.payload);
          return;
        case "craft_start":
          void handleCraftStart(ws, pool, self, msg.payload);
          return;
        case "craft_cancel":
          void handleCraftCancel(ws, pool, self);
          return;
        case "gather_start":
          void handleGatherStart(ws, pool, self, msg.payload);
          return;
        case "gather_cancel":
          handleGatherCancel(ws, self);
          return;
        case "change_map":
          void handleChangeMap(ws, pool, redis, self, msg.payload).catch(() => {
            sendError(ws, "MAP", "Falha ao trocar de mapa.");
          });
          return;
      }
    });

    ws.on("close", () => {
      if (!characterId) {
        return;
      }
      const self = room.getPlayer(characterId);
      if (!self || self.socket !== ws) {
        return;
      }
      self.activeGather = null;
      if (self.activeCraft) {
        const task = self.activeCraft;
        self.activeCraft = null;
        void withDb(pool, async (client) => {
          const row = await characterRepository.getCharacterById(client, self.characterId);
          const inventory = row?.inventory ?? {};
          for (const material of task.materials) {
            inventory[material.itemId] = (inventory[material.itemId] ?? 0) + material.quantity;
          }
          await characterRepository.updateInventory(client, self.characterId, inventory);
          await syncInventoryQuestUpdates(client, ws, self, inventory);
        }).catch(() => undefined);
      }
      void persistPlayerPosition(pool, redis, self).catch(() => undefined);
      room.removePlayer(characterId);
      broadcastState(self.mapId);
    });
  });
}

export async function tickPlayerActivities(pool: pg.Pool): Promise<void> {
  const now = Date.now();
  for (const self of room.allPlayers()) {
    if (self.activeCraft && now >= self.activeCraft.completesAt) {
      const task = self.activeCraft;
      self.activeCraft = null;
      await withDb(pool, async (client) => {
        const row = await characterRepository.getCharacterById(client, self.characterId);
        const inventory = row?.inventory ?? {};
        inventory[task.outputItemId] = (inventory[task.outputItemId] ?? 0) + task.outputQuantity;
        await characterRepository.updateInventory(client, self.characterId, inventory);
        await syncInventoryQuestUpdates(client, self.socket, self, inventory);
        sendJson(self.socket, { type: "inventory", payload: { inventory } });
        sendJson(self.socket, {
          type: "craft_state",
          payload: {
            active: false,
            recipeId: task.recipeId,
            progress: 1,
            startedAt: task.startedAt,
            completesAt: task.completesAt,
            status: "completed",
          },
        });
      }).catch(() => undefined);
    }

    if (self.activeGather && now >= self.activeGather.completesAt) {
      const task = self.activeGather;
      self.activeGather = null;
      gatherNodeCooldownUntil.set(`${self.mapId}:${task.nodeId}`, now + 300000);
      await withDb(pool, async (client) => {
        const row = await characterRepository.getCharacterById(client, self.characterId);
        const inventory = row?.inventory ?? {};
        inventory[task.yieldItemId] = (inventory[task.yieldItemId] ?? 0) + task.yieldAmount;
        await characterRepository.updateInventory(client, self.characterId, inventory);
        await syncInventoryQuestUpdates(client, self.socket, self, inventory);
        sendJson(self.socket, { type: "inventory", payload: { inventory } });
        sendJson(self.socket, {
          type: "gather_state",
          payload: {
            active: false,
            nodeId: task.nodeId,
            resourceType: task.resourceType,
            progress: 1,
            startedAt: task.startedAt,
            completesAt: task.completesAt,
            yieldItemId: task.yieldItemId,
            yieldAmount: task.yieldAmount,
            status: "completed",
          },
        });
      }).catch(() => undefined);
      applyXpGrant(self.socket, pool, self, GATHER_XP[task.resourceType]);
    }
  }
}

export async function persistAllPlayers(pool: pg.Pool, redis: Redis): Promise<void> {
  for (const self of room.allPlayers()) {
    await persistPlayerPosition(pool, redis, self);
    await persistPlayerHealth(pool, self.characterId, self.health);
  }
}

export function subscribeCombatEvents(_subscriber: Redis, _pool: pg.Pool): void {
  // Combat is resolved inside the world-server for now.
}
