import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import {
  GATHER_XP,
  type GatherResourceType,
  type RuneId,
  WORLD_COMBAT_CONFIG,
  worldClientMessageSchema,
  type WorldClientMessage,
} from "@myth-of-rune/shared";
import type { Redis } from "ioredis";
import type pg from "pg";
import { config, RESPAWN_POINT } from "../config.js";
import * as characterRepository from "../repositories/characterRepository.js";
import { verifyGameToken } from "../services/jwtService.js";
import { defaultMapEventsChannel, positionKey } from "../services/redisKeys.js";
import { validateMove } from "../services/movement.js";
import * as mobs from "./mobs.js";
import * as progression from "./progression.js";
import type { ConnectedPlayer } from "./room.js";
import * as room from "./room.js";

const POSITION_PERSIST_INTERVAL_MS = 250;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseToken(req: IncomingMessage): string | null {
  const u = req.url;
  if (!u) return null;
  const q = u.includes("?") ? u.slice(u.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("token");
}

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

async function persistPlayerPosition(
  pool: pg.Pool,
  redis: Redis,
  characterId: string,
  x: number,
  y: number,
): Promise<void> {
  const dbClient = await pool.connect();
  try {
    await characterRepository.updatePosition(dbClient, characterId, x, y);
  } finally {
    dbClient.release();
  }
  await redis.setex(
    positionKey(characterId),
    120,
    JSON.stringify({ x, y, mapId: config.mapId }),
  );
}

async function persistPlayerHealth(
  pool: pg.Pool,
  characterId: string,
  health: number,
): Promise<void> {
  const dbClient = await pool.connect();
  try {
    await characterRepository.updateHealth(dbClient, characterId, health);
  } finally {
    dbClient.release();
  }
}

function broadcastState(): void {
  room.broadcastJson({
    type: "state",
    payload: {
      players: room.snapshotForClient(),
      mobs: mobs.snapshotMobsForClient(),
    },
  });
}

/** Applies a XP grant to self, persists health if level changed, sends progression update. */
function applyXpGrant(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  xpAmount: number,
): void {
  const result = progression.grantExperience(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes },
    xpAmount,
  );
  self.experience = result.snapshot.experience;
  self.level = result.snapshot.level;
  self.equippedRunes = [...result.snapshot.equippedRunes];
  self.stats = result.snapshot.stats;

  if (result.levelChanged) {
    self.health = self.stats.maxHealth;
    void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
  } else {
    self.health = Math.min(self.health, self.stats.maxHealth);
  }

  const snapshot = progression.snapshotPlayerProgression(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes },
    self.health,
  );
  sendJson(ws, { type: "progression", payload: snapshot });
}

// ---------------------------------------------------------------------------
// Message handlers — one function per message type
// ---------------------------------------------------------------------------

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
    { experience: self.experience, equippedRunes: self.equippedRunes },
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

  const previousHealth = self.health;
  self.health = Math.min(self.health, self.stats.maxHealth);
  if (self.health !== previousHealth) {
    void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
  }

  const snapshot = progression.snapshotPlayerProgression(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes },
    self.health,
  );
  sendJson(ws, { type: "progression", payload: snapshot });
  broadcastState();
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

  self.x = RESPAWN_POINT.x;
  self.y = RESPAWN_POINT.y;
  self.health = self.stats.maxHealth;
  self.invulnerableUntilMs = Date.now() + 1200;

  const snapshot = progression.snapshotPlayerProgression(
    self.characterClass,
    { experience: self.experience, equippedRunes: self.equippedRunes },
    self.health,
  );
  sendJson(ws, {
    type: "respawned",
    payload: {
      position: { x: self.x, y: self.y },
      health: self.health,
      maxHealth: self.stats.maxHealth,
      progression: snapshot,
    },
  });
  broadcastState();

  void persistPlayerHealth(pool, self.characterId, self.health).catch(() => undefined);
  void persistPlayerPosition(pool, redis, self.characterId, self.x, self.y).catch(
    () => undefined,
  );
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
  room.broadcastJson({ type: "combat_event", payload: result.event });

  if (result.experienceAwarded > 0) {
    applyXpGrant(ws, pool, self, result.experienceAwarded);
  }
  if (result.mobDied) {
    broadcastState();
  }
}

function handleGatherComplete(
  ws: WebSocket,
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { resourceType: GatherResourceType },
): void {
  applyXpGrant(ws, pool, self, GATHER_XP[payload.resourceType]);
}

function handleInventorySync(
  pool: pg.Pool,
  self: ConnectedPlayer,
  payload: { inventory: Record<string, number> },
): void {
  const dbClient = pool.connect().then((client) => {
    return characterRepository
      .updateInventory(client, self.characterId, payload.inventory)
      .finally(() => client.release());
  });
  void dbClient.catch(() => undefined);
}

function handleMove(
  pool: pg.Pool,
  redis: Redis,
  characterId: string,
  self: ConnectedPlayer,
  payload: { x: number; y: number },
): void {
  const now = Date.now();
  const elapsed = Math.max(0.05, (now - self.lastMoveAt) / 1000);
  const result = validateMove(
    { x: self.x, y: self.y },
    payload,
    self.stats.worldMoveSpeed,
    elapsed,
  );
  if (!result.ok) return;

  self.x = result.position.x;
  self.y = result.position.y;
  self.lastMoveAt = now;
  broadcastState();

  if (now - self.lastPersistAt >= POSITION_PERSIST_INTERVAL_MS) {
    self.lastPersistAt = now;
    void persistPlayerPosition(pool, redis, characterId, self.x, self.y).catch((err) => {
      console.error(
        JSON.stringify({ msg: "persist_position_error", characterId, error: String(err) }),
      );
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function attachWorldHandlers(
  wss: import("ws").WebSocketServer,
  pool: pg.Pool,
  redis: Redis,
): void {
  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const token = parseToken(req);
    if (!token) {
      sendError(ws, "UNAUTHORIZED", "Missing token query parameter");
      ws.close(4001);
      return;
    }
    let characterId: string;
    try {
      const payload = verifyGameToken(token);
      characterId = payload.cid;
    } catch {
      sendError(ws, "UNAUTHORIZED", "Invalid token");
      ws.close(4001);
      return;
    }

    const client = await pool.connect();
    let row: characterRepository.CharacterRow;
    try {
      const c = await characterRepository.getCharacterById(client, characterId);
      if (!c) {
        sendError(ws, "NOT_FOUND", "Character not found");
        ws.close(4004);
        return;
      }
      row = c;
    } finally {
      client.release();
    }

    if (row.map_id !== config.mapId) {
      sendError(ws, "MAP", "Character is not on this map");
      ws.close(4009);
      return;
    }

    const initialProgression = progression.createInitialProgression(row.character_class);
    const initialStatsSnapshot = progression.snapshotPlayerProgression(
      row.character_class,
      initialProgression,
    );
    const maxHealth = initialStatsSnapshot.stats.maxHealth;
    const initialHealth = row.health > 0 ? Math.min(row.health, maxHealth) : maxHealth;
    const initialSnapshot = progression.snapshotPlayerProgression(
      row.character_class,
      initialProgression,
      initialHealth,
    );

    if (row.health <= 0) {
      const reviveClient = await pool.connect();
      try {
        await characterRepository.updateHealth(reviveClient, row.id, initialHealth);
      } finally {
        reviveClient.release();
      }
    }

    const existing = room.getPlayer(row.id);
    if (existing && existing.socket !== ws) {
      try {
        existing.socket.close(4002, "Session replaced by new connection");
      } catch {
        /* ignore close race */
      }
      room.removePlayer(row.id);
    }

    room.addPlayer({
      characterId: row.id,
      characterClass: row.character_class,
      characterName: row.name,
      x: row.x,
      y: row.y,
      health: initialHealth,
      invulnerableUntilMs: 0,
      lastMoveAt: Date.now(),
      lastPersistAt: Date.now(),
      lastAttackAt: 0,
      level: initialSnapshot.level,
      experience: initialProgression.experience,
      equippedRunes: [...initialProgression.equippedRunes],
      stats: initialSnapshot.stats,
      socket: ws,
    });

    await persistPlayerPosition(pool, redis, row.id, row.x, row.y);

    sendJson(ws, {
      type: "welcome",
      payload: {
        characterId: row.id,
        mapId: config.mapId,
        position: { x: row.x, y: row.y },
        health: initialHealth,
        maxHealth,
        progression: initialSnapshot,
        combatConfig: WORLD_COMBAT_CONFIG,
        players: room.snapshotForClient(),
        mobs: mobs.snapshotMobsForClient(),
        inventory: row.inventory ?? {},
      },
    });
    broadcastState();

    ws.on("message", (data) => {
      const msg = parseClientMessage(ws, data);
      if (!msg) return;
      const self = room.getPlayer(characterId);
      if (!self || self.socket !== ws) return;

      switch (msg.type) {
        case "ping":
          handlePing(ws);
          return;
        case "equip_rune":
          handleEquipRune(ws, pool, self, msg.payload);
          return;
        case "respawn":
          handleRespawn(ws, pool, redis, self);
          return;
        case "attack":
          handleAttack(ws, pool, self, msg.payload);
          return;
        case "gather_complete":
          handleGatherComplete(ws, pool, self, msg.payload);
          return;
        case "inventory_sync":
          handleInventorySync(pool, self, msg.payload);
          return;
        case "move":
          handleMove(pool, redis, characterId, self, msg.payload);
          return;
      }
    });

    ws.on("close", () => {
      const self = room.getPlayer(characterId);
      if (!self || self.socket !== ws) return;
      void persistPlayerPosition(pool, redis, characterId, self.x, self.y).catch((err) => {
        console.error(
          JSON.stringify({
            msg: "persist_position_on_close_error",
            characterId,
            error: String(err),
          }),
        );
      });
      room.removePlayer(characterId);
      broadcastState();
    });
  });
}

export function subscribeCombatEvents(
  subscriber: Redis,
  _pool: pg.Pool,
): void {
  subscriber.subscribe(defaultMapEventsChannel).catch((err) => {
    console.error(JSON.stringify({ msg: "redis_subscribe_error", error: String(err) }));
  });
  subscriber.on("message", (_channel, message) => {
    try {
      const parsed = JSON.parse(message) as { type?: string; payload?: unknown };
      if (parsed.type === "combat_event" && parsed.payload) {
        const payload = parsed.payload as { targetId?: string; targetHealth?: number };
        if (
          typeof payload.targetId === "string" &&
          typeof payload.targetHealth === "number"
        ) {
          room.updatePlayerHealth(payload.targetId, payload.targetHealth);
        }
        room.broadcastJson({ type: "combat_event", payload: parsed.payload });
      }
    } catch {
      /* ignore malformed */
    }
  });
}
