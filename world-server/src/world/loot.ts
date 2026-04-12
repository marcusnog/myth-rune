import { randomUUID } from "node:crypto";
import type { LootDrop, MapId, MobType } from "@myth-of-rune/shared";
import type { Redis } from "ioredis";
import type { ConnectedPlayer } from "./room.js";

interface DropRule {
  itemId: string;
  min: number;
  max: number;
  chance: number;
}

interface LootEntity {
  dropId: string;
  mapId: MapId;
  itemId: string;
  amount: number;
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

const DROP_TTL_MS = 60_000;
const PICKUP_RANGE = 64;
const storeByMap = new Map<MapId, Map<string, LootEntity>>();
let redisClient: Redis | null = null;

const DROP_TABLE: Readonly<Record<MobType, readonly DropRule[]>> = Object.freeze({
  goblin: [
    { itemId: "gold_coin", min: 2, max: 6, chance: 1 },
    { itemId: "wood", min: 1, max: 3, chance: 0.55 },
    { itemId: "stone", min: 1, max: 2, chance: 0.25 },
  ],
  zombie: [
    { itemId: "gold_coin", min: 3, max: 7, chance: 1 },
    { itemId: "wood", min: 1, max: 2, chance: 0.35 },
    { itemId: "stone", min: 1, max: 3, chance: 0.35 },
  ],
  wolf: [
    { itemId: "gold_coin", min: 1, max: 4, chance: 1 },
    { itemId: "wood_handle", min: 1, max: 1, chance: 0.2 },
  ],
  ent: [
    { itemId: "gold_coin", min: 5, max: 11, chance: 1 },
    { itemId: "wood", min: 4, max: 9, chance: 0.9 },
    { itemId: "plank", min: 1, max: 2, chance: 0.25 },
  ],
});

function mapStore(mapId: MapId): Map<string, LootEntity> {
  let existing = storeByMap.get(mapId);
  if (!existing) {
    existing = new Map<string, LootEntity>();
    storeByMap.set(mapId, existing);
  }
  return existing;
}

function indexKey(mapId: MapId): string {
  return `loot:index:${mapId}`;
}

function dropKey(dropId: string): string {
  return `loot:drop:${dropId}`;
}

function randInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function cleanup(nowMs: number): void {
  for (const [mapId, targetStore] of storeByMap.entries()) {
    for (const [id, drop] of targetStore.entries()) {
      if (drop.expiresAt <= nowMs) {
        targetStore.delete(id);
      }
    }
    if (targetStore.size === 0) {
      storeByMap.delete(mapId);
    }
  }
}

async function persistDrop(drop: LootEntity): Promise<void> {
  if (!redisClient) {
    return;
  }
  const ttlSeconds = Math.max(1, Math.ceil((drop.expiresAt - Date.now()) / 1000));
  await redisClient.multi()
    .setex(dropKey(drop.dropId), ttlSeconds, JSON.stringify(drop))
    .sadd(indexKey(drop.mapId), drop.dropId)
    .exec();
}

async function removePersistedDrop(mapId: MapId, dropId: string): Promise<void> {
  if (!redisClient) {
    return;
  }
  await redisClient.multi().del(dropKey(dropId)).srem(indexKey(mapId), dropId).exec();
}

export async function configureLootPersistence(redis: Redis): Promise<void> {
  redisClient = redis;
  for (const mapId of ["default", "forest_edge"] as const) {
    const ids = await redis.smembers(indexKey(mapId));
    for (const dropId of ids) {
      const raw = await redis.get(dropKey(dropId));
      if (!raw) {
        await redis.srem(indexKey(mapId), dropId);
        continue;
      }
      const parsed = JSON.parse(raw) as LootEntity;
      if (parsed.expiresAt <= Date.now()) {
        await removePersistedDrop(mapId, dropId);
        continue;
      }
      mapStore(mapId).set(parsed.dropId, parsed);
    }
  }
  cleanup(Date.now());
}

export function snapshotLootForClient(mapId: MapId, nowMs: number = Date.now()): LootDrop[] {
  cleanup(nowMs);
  return [...mapStore(mapId).values()].map((drop) => ({
    dropId: drop.dropId,
    itemId: drop.itemId,
    amount: drop.amount,
    x: drop.x,
    y: drop.y,
  }));
}

export function spawnLootForMobDeath(
  mapId: MapId,
  mobType: MobType,
  x: number,
  y: number,
  nowMs: number = Date.now(),
): boolean {
  cleanup(nowMs);
  const rules = DROP_TABLE[mobType] ?? [];
  let changed = false;
  for (const rule of rules) {
    if (Math.random() > rule.chance) {
      continue;
    }
    const amount = randInt(rule.min, rule.max);
    if (amount <= 0) {
      continue;
    }
    const entity: LootEntity = {
      dropId: randomUUID(),
      mapId,
      itemId: rule.itemId,
      amount,
      x,
      y,
      createdAt: nowMs,
      expiresAt: nowMs + DROP_TTL_MS,
    };
    mapStore(mapId).set(entity.dropId, entity);
    void persistDrop(entity).catch(() => undefined);
    changed = true;
  }
  return changed;
}

export function tryPickupLoot(
  self: ConnectedPlayer,
  dropId: string,
  inventory: Record<string, number>,
  nowMs: number = Date.now(),
): { ok: true; changed: boolean } | { ok: false; code: string; message: string } {
  cleanup(nowMs);
  const targetStore = mapStore(self.mapId);
  const drop = targetStore.get(dropId);
  if (!drop) {
    return { ok: false, code: "NOT_FOUND", message: "Loot nao encontrado." };
  }
  if (distance(self.x, self.y, drop.x, drop.y) > PICKUP_RANGE) {
    return { ok: false, code: "OUT_OF_RANGE", message: "Fora de alcance." };
  }
  targetStore.delete(dropId);
  void removePersistedDrop(self.mapId, dropId).catch(() => undefined);
  inventory[drop.itemId] = (inventory[drop.itemId] ?? 0) + drop.amount;
  return { ok: true, changed: true };
}
