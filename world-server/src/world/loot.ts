import { randomUUID } from "node:crypto";
import type { LootDrop, MobType } from "@myth-of-rune/shared";
import type { ConnectedPlayer } from "./room.js";

interface DropRule {
  itemId: string;
  min: number;
  max: number;
  chance: number; // 0..1
}

interface LootEntity {
  dropId: string;
  itemId: string;
  amount: number;
  x: number;
  y: number;
  createdAt: number;
}

const DROP_TTL_MS = 60_000;
const PICKUP_RANGE = 64;

const DROP_TABLE: Readonly<Record<MobType, readonly DropRule[]>> = Object.freeze({
  goblin: [
    { itemId: "wood", min: 1, max: 3, chance: 0.55 },
    { itemId: "stone", min: 1, max: 2, chance: 0.25 },
  ],
  zombie: [
    { itemId: "wood", min: 1, max: 2, chance: 0.35 },
    { itemId: "stone", min: 1, max: 3, chance: 0.35 },
  ],
  wolf: [{ itemId: "wood_handle", min: 1, max: 1, chance: 0.2 }],
  ent: [
    { itemId: "wood", min: 4, max: 9, chance: 0.9 },
    { itemId: "plank", min: 1, max: 2, chance: 0.25 },
  ],
});

const store = new Map<string, LootEntity>();

function randInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function cleanup(nowMs: number): void {
  for (const [id, drop] of store.entries()) {
    if (nowMs - drop.createdAt > DROP_TTL_MS) {
      store.delete(id);
    }
  }
}

export function snapshotLootForClient(nowMs: number = Date.now()): LootDrop[] {
  cleanup(nowMs);
  return [...store.values()].map((d) => ({
    dropId: d.dropId,
    itemId: d.itemId,
    amount: d.amount,
    x: d.x,
    y: d.y,
  }));
}

export function spawnLootForMobDeath(
  mobType: MobType,
  x: number,
  y: number,
  nowMs: number = Date.now(),
): boolean {
  cleanup(nowMs);
  const rules = DROP_TABLE[mobType] ?? [];
  let changed = false;
  for (const rule of rules) {
    if (Math.random() > rule.chance) continue;
    const amount = randInt(rule.min, rule.max);
    if (amount <= 0) continue;
    const dropId = randomUUID();
    store.set(dropId, {
      dropId,
      itemId: rule.itemId,
      amount,
      x,
      y,
      createdAt: nowMs,
    });
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
  const drop = store.get(dropId);
  if (!drop) {
    return { ok: false, code: "NOT_FOUND", message: "Loot nao encontrado." };
  }
  if (distance(self.x, self.y, drop.x, drop.y) > PICKUP_RANGE) {
    return { ok: false, code: "OUT_OF_RANGE", message: "Fora de alcance." };
  }
  store.delete(dropId);
  inventory[drop.itemId] = (inventory[drop.itemId] ?? 0) + drop.amount;
  return { ok: true, changed: true };
}

