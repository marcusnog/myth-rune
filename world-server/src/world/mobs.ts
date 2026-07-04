import { randomUUID } from "node:crypto";
import {
  SKILL_DEFINITIONS,
  WORLD_COMBAT_CONFIG,
  PLAYER_ATTACK_PROFILES,
  type MapId,
  type MobType,
  type SkillId,
  type WorldCombatRejectCode,
} from "@myth-of-rune/shared";
import { clampToMap } from "../services/movement.js";
import { findNearestWalkablePosition, resolveWorldCollision } from "../services/mapCollision.js";
import type { ConnectedPlayer } from "./room.js";
import { getMobSpawns, isInSafezone } from "./worldMaps.js";

interface Mob {
  id: string;
  mapId: MapId;
  type: MobType;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  vx: number;
  vy: number;
  hp: number;
  invulnerableUntilMs: number;
  lastAttackAt: number;
  telegraphTargetId: string | null;
  telegraphEndsAt: number;
}

export interface CombatEventPayload {
  attackerId: string;
  targetId: string;
  damage: number;
  targetHealth: number;
  isCritical?: boolean;
  isDodged?: boolean;
}

export interface TickResult {
  changedMaps: Set<MapId>;
  combatEventsByMap: Map<MapId, CombatEventPayload[]>;
}

export type PlayerAttackResult =
  | {
      ok: true;
      event: CombatEventPayload;
      mobDied: boolean;
      experienceAwarded: number;
      diedAt?: { x: number; y: number; mobType: MobType; mapId: MapId };
    }
  | {
      ok: false;
      code: WorldCombatRejectCode;
      message: string;
    };

export type PlayerAoeAttackResult =
  | {
      ok: true;
      events: CombatEventPayload[];
      kills: Array<{ x: number; y: number; mobType: MobType; mapId: MapId }>;
      experienceAwarded: number;
    }
  | {
      ok: false;
      code: WorldCombatRejectCode;
      message: string;
    };

const MOB_RESPAWN_MS = 18_000;
const storeByMap = new Map<MapId, Map<string, Mob>>();

interface PendingRespawn {
  mapId: MapId;
  spawnX: number;
  spawnY: number;
  mobType: MobType;
  at: number;
}

const pendingRespawns: PendingRespawn[] = [];

const MOB_MAX_HEALTH: Readonly<Record<MobType, number>> = Object.freeze({
  goblin: 52,
  zombie: 52,
  wolf: 52,
  ent: 180,
});

const MOB_DETECT_RANGE = 250;
const MOB_LEASH_RANGE = 320;
const MOB_RETURN_TO_SPAWN_RANGE = 18;
const MOB_CHASE_SPEEDS: Readonly<Record<MobType, number>> = Object.freeze({
  goblin: 70,
  zombie: 58,
  wolf: 90,
  ent: 48,
});
const MOB_RETURN_SPEED = 92;
const MOB_WANDER_SPEED = 32;
const MOB_ATTACK_TELEGRAPH_MS = 260;
const MOB_ATTACK_REACH_BUFFER = 6;
const PLAYER_HIT_INVULNERABILITY_MS = 320;
const MOB_HIT_INVULNERABILITY_MS = 220;
const BASIC_ATTACK_POWER_SCALE = 0.2;
const CRIT_DAMAGE_MULTIPLIER = 1.75;
const CRIT_MINIMUM_BONUS = 1;

const MOB_EXPERIENCE_REWARD: Readonly<Record<MobType, number>> = Object.freeze({
  goblin: 26,
  zombie: 34,
  wolf: 30,
  ent: 85,
});

function mapStore(mapId: MapId): Map<string, Mob> {
  let existing = storeByMap.get(mapId);
  if (!existing) {
    existing = new Map<string, Mob>();
    storeByMap.set(mapId, existing);
  }
  return existing;
}

function randVel(rng: () => number = Math.random): number {
  return (rng() - 0.5) * MOB_WANDER_SPEED * 2;
}

function mobTypeForSpawn(mapId: MapId, spawnIndex: number): MobType {
  const defaultPattern: readonly MobType[] = [
    "goblin", "zombie", "wolf", "goblin", "wolf",
    "zombie", "ent", "goblin", "wolf", "zombie",
    "goblin", "goblin", "wolf", "zombie", "goblin",
    "ent", "wolf", "goblin", "zombie", "wolf",
    "goblin", "zombie", "goblin", "wolf", "goblin",
  ];
  const forestPattern: readonly MobType[] = [
    "wolf", "wolf", "goblin", "wolf", "ent", "goblin",
    "wolf", "zombie", "ent", "wolf", "goblin", "wolf",
  ];
  const pattern = mapId === "forest_edge" ? forestPattern : defaultPattern;
  return pattern[spawnIndex % pattern.length]!;
}

function seedMobs(mapId: MapId, spawns: ReadonlyArray<{ x: number; y: number }>): void {
  const targetStore = mapStore(mapId);
  targetStore.clear();
  spawns.forEach((spawn, index) => {
    const safeSpawn = findNearestWalkablePosition(mapId, spawn.x, spawn.y);
    const type = mobTypeForSpawn(mapId, index);
    const id = randomUUID();
    targetStore.set(id, {
      id,
      mapId,
      type,
      x: safeSpawn.x,
      y: safeSpawn.y,
      spawnX: safeSpawn.x,
      spawnY: safeSpawn.y,
      vx: randVel(),
      vy: randVel(),
      hp: MOB_MAX_HEALTH[type],
      invulnerableUntilMs: 0,
      lastAttackAt: 0,
      telegraphTargetId: null,
      telegraphEndsAt: 0,
    });
  });
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function rollChance(chance: number, rng: () => number): boolean {
  return chance > 0 && rng() < chance;
}

function playerBaseDamage(attacker: ConnectedPlayer): number {
  return Math.max(
    1,
    attacker.stats.attack +
      Math.floor(attacker.stats.power * BASIC_ATTACK_POWER_SCALE) -
      WORLD_COMBAT_CONFIG.mobDefense,
  );
}

const DAMAGE_VARIANCE = 0.2;

function rollPlayerDamage(
  attacker: ConnectedPlayer,
  rng: () => number,
): { damage: number; isCritical?: boolean } {
  const variance = 1 - DAMAGE_VARIANCE + Math.random() * DAMAGE_VARIANCE * 2;
  const baseDamage = Math.max(1, Math.round(playerBaseDamage(attacker) * variance));
  const isCritical = rollChance(attacker.stats.critChance, rng);
  if (!isCritical) {
    return { damage: baseDamage };
  }
  return {
    damage: Math.max(
      baseDamage + CRIT_MINIMUM_BONUS,
      Math.floor(baseDamage * CRIT_DAMAGE_MULTIPLIER),
    ),
    isCritical: true,
  };
}

function resetAttackTelegraph(mob: Mob): void {
  mob.telegraphTargetId = null;
  mob.telegraphEndsAt = 0;
}

function moveTowards(mob: Mob, x: number, y: number, speed: number): void {
  const dx = x - mob.x;
  const dy = y - mob.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  mob.vx = (dx / len) * speed;
  mob.vy = (dy / len) * speed;
}

function livingPlayers(players: ConnectedPlayer[], mapId: MapId): ConnectedPlayer[] {
  return players.filter((player) => player.mapId === mapId && player.health > 0);
}

function nearestPlayer(
  mob: Mob,
  players: ConnectedPlayer[],
): { player: ConnectedPlayer; distance: number } | null {
  let best: ConnectedPlayer | null = null;
  let bestDistance = Infinity;
  for (const player of players) {
    const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }
  return best ? { player: best, distance: bestDistance } : null;
}

function scheduleRespawn(mapId: MapId, spawnX: number, spawnY: number, mobType: MobType): void {
  pendingRespawns.push({ mapId, spawnX, spawnY, mobType, at: Date.now() + MOB_RESPAWN_MS });
}

function flushPendingRespawns(): void {
  const now = Date.now();
  let index = 0;
  while (index < pendingRespawns.length) {
    const entry = pendingRespawns[index]!;
    if (now >= entry.at) {
      const safe = findNearestWalkablePosition(entry.mapId, entry.spawnX, entry.spawnY);
      const id = randomUUID();
      mapStore(entry.mapId).set(id, {
        id,
        mapId: entry.mapId,
        type: entry.mobType,
        x: safe.x,
        y: safe.y,
        spawnX: safe.x,
        spawnY: safe.y,
        vx: randVel(),
        vy: randVel(),
        hp: MOB_MAX_HEALTH[entry.mobType],
        invulnerableUntilMs: 0,
        lastAttackAt: 0,
        telegraphTargetId: null,
        telegraphEndsAt: 0,
      });
      pendingRespawns.splice(index, 1);
    } else {
      index += 1;
    }
  }
}

export function initMobs(): void {
  if (storeByMap.size > 0) {
    return;
  }
  seedMobs("default", getMobSpawns("default"));
  seedMobs("forest_edge", getMobSpawns("forest_edge"));
}

export function resetMobsForTests(
  spawns: ReadonlyArray<{ x: number; y: number }> = getMobSpawns("default"),
  mapId: MapId = "default",
): void {
  storeByMap.clear();
  pendingRespawns.length = 0;
  seedMobs(mapId, spawns);
}

export function snapshotMobsForClient(mapId: MapId): Array<{
  mobId: string;
  mobType: MobType;
  x: number;
  y: number;
}> {
  return [...mapStore(mapId).values()].map((mob) => ({
    mobId: mob.id,
    mobType: mob.type,
    x: mob.x,
    y: mob.y,
  }));
}

export function applyPlayerAttack(
  attacker: ConnectedPlayer,
  targetMobId: string,
  nowMs: number,
  rng: () => number = Math.random,
): PlayerAttackResult {
  const playerAttackRange = PLAYER_ATTACK_PROFILES[attacker.characterClass].range;
  if (nowMs - attacker.lastAttackAt < WORLD_COMBAT_CONFIG.playerAttackCooldownMs) {
    return { ok: false, code: "COOLDOWN", message: "Basic attack is on cooldown" };
  }

  const mob = mapStore(attacker.mapId).get(targetMobId);
  if (!mob) {
    return { ok: false, code: "NOT_FOUND", message: "Mob not found" };
  }

  if (dist(attacker.x, attacker.y, mob.x, mob.y) > playerAttackRange) {
    return { ok: false, code: "OUT_OF_RANGE", message: "Mob is out of range" };
  }

  attacker.lastAttackAt = nowMs;

  if (nowMs < mob.invulnerableUntilMs) {
    return {
      ok: true,
      event: {
        attackerId: attacker.characterId,
        targetId: mob.id,
        damage: 0,
        targetHealth: mob.hp,
      },
      mobDied: false,
      experienceAwarded: 0,
    };
  }

  const rolled = rollPlayerDamage(attacker, rng);
  mob.hp = Math.max(0, mob.hp - rolled.damage);
  if (mob.hp > 0) {
    mob.invulnerableUntilMs = nowMs + MOB_HIT_INVULNERABILITY_MS;
  }

  const event: CombatEventPayload = {
    attackerId: attacker.characterId,
    targetId: mob.id,
    damage: rolled.damage,
    targetHealth: mob.hp,
    isCritical: rolled.isCritical,
  };

  if (mob.hp <= 0) {
    const diedAt = { x: mob.x, y: mob.y, mobType: mob.type, mapId: mob.mapId };
    const experienceAwarded = MOB_EXPERIENCE_REWARD[mob.type];
    scheduleRespawn(mob.mapId, mob.spawnX, mob.spawnY, mob.type);
    mapStore(attacker.mapId).delete(mob.id);
    return { ok: true, event, mobDied: true, experienceAwarded, diedAt };
  }

  return { ok: true, event, mobDied: false, experienceAwarded: 0 };
}

export function applyPlayerAoeAttack(
  attacker: ConnectedPlayer,
  skillId: SkillId,
  nowMs: number,
  rng: () => number = Math.random,
): PlayerAoeAttackResult {
  const radius = SKILL_DEFINITIONS[skillId].impactRadius ?? 0;
  if (radius <= 0) {
    return { ok: false, code: "NOT_FOUND", message: "Mob not found" };
  }

  const events: CombatEventPayload[] = [];
  const kills: Array<{ x: number; y: number; mobType: MobType; mapId: MapId }> = [];
  let experienceAwarded = 0;
  const targetStore = mapStore(attacker.mapId);

  for (const mob of [...targetStore.values()]) {
    if (dist(attacker.x, attacker.y, mob.x, mob.y) > radius) {
      continue;
    }

    if (nowMs < mob.invulnerableUntilMs) {
      events.push({
        attackerId: attacker.characterId,
        targetId: mob.id,
        damage: 0,
        targetHealth: mob.hp,
      });
      continue;
    }

    const rolled = rollPlayerDamage(attacker, rng);
    mob.hp = Math.max(0, mob.hp - rolled.damage);
    if (mob.hp > 0) {
      mob.invulnerableUntilMs = nowMs + MOB_HIT_INVULNERABILITY_MS;
    }

    events.push({
      attackerId: attacker.characterId,
      targetId: mob.id,
      damage: rolled.damage,
      targetHealth: mob.hp,
      isCritical: rolled.isCritical,
    });

    if (mob.hp <= 0) {
      experienceAwarded += MOB_EXPERIENCE_REWARD[mob.type];
      kills.push({ x: mob.x, y: mob.y, mobType: mob.type, mapId: mob.mapId });
      scheduleRespawn(mob.mapId, mob.spawnX, mob.spawnY, mob.type);
      targetStore.delete(mob.id);
    }
  }

  return { ok: true, events, kills, experienceAwarded };
}

export function tickMobs(
  dtSeconds: number,
  players: ConnectedPlayer[],
  nowMs: number,
  rng: () => number = Math.random,
): TickResult {
  flushPendingRespawns();
  const changedMaps = new Set<MapId>();
  const combatEventsByMap = new Map<MapId, CombatEventPayload[]>();

  for (const [mapId, targetStore] of storeByMap.entries()) {
    const livePlayers = livingPlayers(players, mapId);

    for (const mob of targetStore.values()) {
      const target = nearestPlayer(mob, livePlayers);
      const distanceFromSpawn = dist(mob.x, mob.y, mob.spawnX, mob.spawnY);
      const shouldReturnToSpawn = distanceFromSpawn > MOB_LEASH_RANGE;

      if (shouldReturnToSpawn) {
        resetAttackTelegraph(mob);
        moveTowards(mob, mob.spawnX, mob.spawnY, MOB_RETURN_SPEED);
      } else {
        const targetInSafezone = target != null && isInSafezone(target.player.x, target.player.y);
        const targetWithinLeash =
          target != null && !targetInSafezone &&
          dist(target.player.x, target.player.y, mob.spawnX, mob.spawnY) <= MOB_LEASH_RANGE * 1.1;
        const canChase = target != null && !targetInSafezone && targetWithinLeash && target.distance <= MOB_DETECT_RANGE;

        if (canChase && target) {
          const { player, distance } = target;
          if (distance <= WORLD_COMBAT_CONFIG.mobAttackRange) {
            mob.vx = 0;
            mob.vy = 0;
            const offCooldown =
              nowMs - mob.lastAttackAt >= WORLD_COMBAT_CONFIG.mobAttackCooldownMs;
            if (offCooldown) {
              const telegraphTarget =
                mob.telegraphTargetId == null
                  ? null
                  : livePlayers.find((entry) => entry.characterId === mob.telegraphTargetId) ?? null;
              if (telegraphTarget == null) {
                mob.telegraphTargetId = player.characterId;
                mob.telegraphEndsAt = nowMs + MOB_ATTACK_TELEGRAPH_MS;
              } else if (nowMs >= mob.telegraphEndsAt) {
                const distanceAfterTelegraph = dist(mob.x, mob.y, telegraphTarget.x, telegraphTarget.y);
                const inRange =
                  distanceAfterTelegraph <= WORLD_COMBAT_CONFIG.mobAttackRange + MOB_ATTACK_REACH_BUFFER;
                const canTakeHit = nowMs >= telegraphTarget.invulnerableUntilMs && telegraphTarget.health > 0;
                if (inRange && canTakeHit) {
                  const mapEvents = combatEventsByMap.get(mapId) ?? [];
                  if (rollChance(telegraphTarget.stats.dodgeChance, rng)) {
                    telegraphTarget.invulnerableUntilMs = nowMs + PLAYER_HIT_INVULNERABILITY_MS;
                    mapEvents.push({
                      attackerId: mob.id,
                      targetId: telegraphTarget.characterId,
                      damage: 0,
                      targetHealth: telegraphTarget.health,
                      isDodged: true,
                    });
                  } else {
                    const damage = Math.max(
                      1,
                      WORLD_COMBAT_CONFIG.mobAttackDamage - telegraphTarget.stats.defense,
                    );
                    telegraphTarget.health = Math.max(0, telegraphTarget.health - damage);
                    telegraphTarget.invulnerableUntilMs = nowMs + PLAYER_HIT_INVULNERABILITY_MS;
                    mapEvents.push({
                      attackerId: mob.id,
                      targetId: telegraphTarget.characterId,
                      damage,
                      targetHealth: telegraphTarget.health,
                    });
                  }
                  combatEventsByMap.set(mapId, mapEvents);
                }
                mob.lastAttackAt = nowMs;
                resetAttackTelegraph(mob);
              }
            } else {
              resetAttackTelegraph(mob);
            }
          } else {
            resetAttackTelegraph(mob);
            moveTowards(mob, player.x, player.y, MOB_CHASE_SPEEDS[mob.type]);
          }
        } else {
          resetAttackTelegraph(mob);
          if (distanceFromSpawn > MOB_RETURN_TO_SPAWN_RANGE) {
            moveTowards(mob, mob.spawnX, mob.spawnY, MOB_RETURN_SPEED);
          } else if (rng() < 0.04) {
            mob.vx = randVel(rng);
            mob.vy = randVel(rng);
          }
        }
      }

      let nx = mob.x + mob.vx * dtSeconds;
      let ny = mob.y + mob.vy * dtSeconds;
      const clamped = clampToMap(mapId, nx, ny);
      if (Math.abs(clamped.x - nx) > 1e-6) {
        mob.vx *= -1;
      }
      if (Math.abs(clamped.y - ny) > 1e-6) {
        mob.vy *= -1;
      }
      nx = mob.x + mob.vx * dtSeconds;
      ny = mob.y + mob.vy * dtSeconds;
      const next = resolveWorldCollision(mapId, { x: mob.x, y: mob.y }, clampToMap(mapId, nx, ny));
      if (Math.abs(next.x - nx) > 1e-3) {
        mob.vx = 0;
      }
      if (Math.abs(next.y - ny) > 1e-3) {
        mob.vy = 0;
      }
      if (Math.abs(next.x - mob.x) > 1e-3 || Math.abs(next.y - mob.y) > 1e-3) {
        changedMaps.add(mapId);
      }
      mob.x = next.x;
      mob.y = next.y;
    }
  }

  return { changedMaps, combatEventsByMap };
}