import { randomUUID } from "node:crypto";
import {
  WORLD_COMBAT_CONFIG,
  WORLD_COMBAT_REJECT_MESSAGES,
  type MobType,
  type WorldCombatRejectCode,
} from "@myth-of-rune/shared";
import { clampToMap } from "../services/movement.js";
import {
  findNearestWalkablePosition,
  resolveWorldCollision,
} from "../services/mapCollision.js";
import type { ConnectedPlayer } from "./room.js";

interface Mob {
  id: string;
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
}

export interface TickResult {
  changed: boolean;
  combatEvents: CombatEventPayload[];
}

export type PlayerAttackResult =
  | {
      ok: true;
      event: CombatEventPayload;
      mobDied: boolean;
      experienceAwarded: number;
    }
  | {
      ok: false;
      code: WorldCombatRejectCode;
      message: string;
    };

const store = new Map<string, Mob>();

const DEFAULT_SPAWNS: ReadonlyArray<{ x: number; y: number }> = Object.freeze([
  { x: 140, y: 180 },
  { x: 620, y: 420 },
  { x: 400, y: 100 },
  { x: -368, y: -404 },
  { x: 1136, y: -372 },
  { x: 976, y: 1132 },
  { x: -304, y: 1324 },
  { x: 1392, y: 1292 },
]);

const MOB_MAX_HEALTH: Readonly<Record<MobType, number>> = Object.freeze({
  goblin: 52,
  zombie: 52,
  wolf: 52,
  ent: 180,
});
const MOB_DETECT_RANGE = 250;
const MOB_LEASH_RANGE = 320;
const MOB_RETURN_TO_SPAWN_RANGE = 18;
const MOB_CHASE_SPEED = 86;
const MOB_RETURN_SPEED = 92;
const MOB_WANDER_SPEED = 32;
const MOB_ATTACK_TELEGRAPH_MS = 260;
const MOB_ATTACK_REACH_BUFFER = 6;
const PLAYER_HIT_INVULNERABILITY_MS = 320;
const MOB_HIT_INVULNERABILITY_MS = 220;
const MOB_EXPERIENCE_REWARD: Readonly<Record<MobType, number>> = Object.freeze({
  goblin: 26,
  zombie: 34,
  wolf: 30,
  ent: 85,
});

function randVel(): number {
  return (Math.random() - 0.5) * MOB_WANDER_SPEED * 2.0;
}

function mobTypeForSpawn(spawnIndex: number): MobType {
  const pattern: readonly MobType[] = ["goblin", "zombie", "wolf", "goblin", "wolf", "zombie", "ent", "goblin"];
  return pattern[spawnIndex % pattern.length]!;
}

function seedMobs(spawns: ReadonlyArray<{ x: number; y: number }>): void {
  spawns.forEach((s, index) => {
    const safeSpawn = findNearestWalkablePosition(s.x, s.y);
    const id = randomUUID();
    const type = mobTypeForSpawn(index);
    store.set(id, {
      id,
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

function livingPlayers(players: ConnectedPlayer[]): ConnectedPlayer[] {
  return players.filter((p) => p.health > 0);
}

function nearestPlayer(
  mob: Mob,
  players: ConnectedPlayer[],
): { player: ConnectedPlayer; distance: number } | null {
  let best: ConnectedPlayer | null = null;
  let bestDist = Infinity;
  for (const p of players) {
    const dist = Math.hypot(p.x - mob.x, p.y - mob.y);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  if (!best) {
    return null;
  }
  return { player: best, distance: bestDist };
}

export function initMobs(): void {
  if (store.size > 0) {
    return;
  }
  seedMobs(DEFAULT_SPAWNS);
}

export function resetMobsForTests(
  spawns: ReadonlyArray<{ x: number; y: number }> = DEFAULT_SPAWNS,
): void {
  store.clear();
  seedMobs(spawns);
}

export function snapshotMobsForClient(): Array<{
  mobId: string;
  mobType: MobType;
  x: number;
  y: number;
}> {
  return [...store.values()].map((m) => ({
    mobId: m.id,
    mobType: m.type,
    x: m.x,
    y: m.y,
  }));
}

export function applyPlayerAttack(
  attacker: ConnectedPlayer,
  targetMobId: string,
  nowMs: number,
): PlayerAttackResult {
  if (
    nowMs - attacker.lastAttackAt <
    WORLD_COMBAT_CONFIG.playerAttackCooldownMs
  ) {
    return {
      ok: false,
      code: "COOLDOWN",
      message: WORLD_COMBAT_REJECT_MESSAGES.COOLDOWN,
    };
  }

  const mob = store.get(targetMobId);
  if (!mob) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: WORLD_COMBAT_REJECT_MESSAGES.NOT_FOUND,
    };
  }

  const targetDistance = dist(attacker.x, attacker.y, mob.x, mob.y);
  if (targetDistance > WORLD_COMBAT_CONFIG.playerAttackRange) {
    return {
      ok: false,
      code: "OUT_OF_RANGE",
      message: WORLD_COMBAT_REJECT_MESSAGES.OUT_OF_RANGE,
    };
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

  const damage = Math.max(1, attacker.stats.attack - WORLD_COMBAT_CONFIG.mobDefense);
  mob.hp = Math.max(0, mob.hp - damage);
  if (mob.hp > 0) {
    mob.invulnerableUntilMs = nowMs + MOB_HIT_INVULNERABILITY_MS;
  }

  const event: CombatEventPayload = {
    attackerId: attacker.characterId,
    targetId: mob.id,
    damage,
    targetHealth: mob.hp,
  };

  if (mob.hp <= 0) {
    const experienceAwarded = MOB_EXPERIENCE_REWARD[mob.type];
    store.delete(mob.id);
    return { ok: true, event, mobDied: true, experienceAwarded };
  }
  return { ok: true, event, mobDied: false, experienceAwarded: 0 };
}

/** Wander by default; chase and attack nearby living players. */
export function tickMobs(
  dtSeconds: number,
  players: ConnectedPlayer[],
  nowMs: number,
): TickResult {
  let changed = false;
  const combatEvents: CombatEventPayload[] = [];
  const livePlayers = livingPlayers(players);

  for (const m of store.values()) {
    const target = nearestPlayer(m, livePlayers);
    const distanceFromSpawn = dist(m.x, m.y, m.spawnX, m.spawnY);
    const shouldReturnToSpawn = distanceFromSpawn > MOB_LEASH_RANGE;

    if (shouldReturnToSpawn) {
      resetAttackTelegraph(m);
      moveTowards(m, m.spawnX, m.spawnY, MOB_RETURN_SPEED);
    } else {
      const targetWithinLeash =
        target != null &&
        dist(target.player.x, target.player.y, m.spawnX, m.spawnY) <=
          MOB_LEASH_RANGE * 1.1;
      const canChase =
        target != null &&
        targetWithinLeash &&
        target.distance <= MOB_DETECT_RANGE;

      if (canChase && target) {
        const { player, distance } = target;
        if (distance <= WORLD_COMBAT_CONFIG.mobAttackRange) {
          m.vx = 0;
          m.vy = 0;
          const offCooldown =
            nowMs - m.lastAttackAt >= WORLD_COMBAT_CONFIG.mobAttackCooldownMs;
          if (offCooldown) {
            const telegraphTarget =
              m.telegraphTargetId == null
                ? null
                : (livePlayers.find((p) => p.characterId === m.telegraphTargetId) ??
                    null);
            if (telegraphTarget == null) {
              m.telegraphTargetId = player.characterId;
              m.telegraphEndsAt = nowMs + MOB_ATTACK_TELEGRAPH_MS;
            } else if (nowMs >= m.telegraphEndsAt) {
              const distanceAfterTelegraph = dist(
                m.x,
                m.y,
                telegraphTarget.x,
                telegraphTarget.y,
              );
              const inRange =
                distanceAfterTelegraph <=
                WORLD_COMBAT_CONFIG.mobAttackRange + MOB_ATTACK_REACH_BUFFER;
              const canTakeHit =
                nowMs >= telegraphTarget.invulnerableUntilMs &&
                telegraphTarget.health > 0;
              if (inRange && canTakeHit) {
                const damage = Math.max(
                  1,
                  WORLD_COMBAT_CONFIG.mobAttackDamage - telegraphTarget.stats.defense,
                );
                telegraphTarget.health = Math.max(
                  0,
                  telegraphTarget.health - damage,
                );
                telegraphTarget.invulnerableUntilMs =
                  nowMs + PLAYER_HIT_INVULNERABILITY_MS;
                combatEvents.push({
                  attackerId: m.id,
                  targetId: telegraphTarget.characterId,
                  damage,
                  targetHealth: telegraphTarget.health,
                });
              }
              m.lastAttackAt = nowMs;
              resetAttackTelegraph(m);
            }
          } else {
            resetAttackTelegraph(m);
          }
        } else {
          resetAttackTelegraph(m);
          moveTowards(m, player.x, player.y, MOB_CHASE_SPEED);
        }
      } else {
        resetAttackTelegraph(m);
        if (distanceFromSpawn > MOB_RETURN_TO_SPAWN_RANGE) {
          moveTowards(m, m.spawnX, m.spawnY, MOB_RETURN_SPEED);
        } else if (Math.random() < 0.04) {
          m.vx = randVel();
          m.vy = randVel();
        }
      }
    }

    let nx = m.x + m.vx * dtSeconds;
    let ny = m.y + m.vy * dtSeconds;
    const c = clampToMap(nx, ny);
    if (Math.abs(c.x - nx) > 1e-6) {
      m.vx *= -1;
    }
    if (Math.abs(c.y - ny) > 1e-6) {
      m.vy *= -1;
    }
    nx = m.x + m.vx * dtSeconds;
    ny = m.y + m.vy * dtSeconds;
    const next = resolveWorldCollision({ x: m.x, y: m.y }, clampToMap(nx, ny));
    if (Math.abs(next.x - nx) > 1e-3) {
      m.vx = 0;
    }
    if (Math.abs(next.y - ny) > 1e-3) {
      m.vy = 0;
    }
    if (Math.abs(next.x - m.x) > 1e-3 || Math.abs(next.y - m.y) > 1e-3) {
      changed = true;
    }
    m.x = next.x;
    m.y = next.y;
  }

  return { changed, combatEvents };
}
