import type { Redis } from "ioredis";
import type pg from "pg";
import { baseStatsForClass } from "@myth-of-rune/shared";
import * as characterRepository from "../repositories/characterRepository.js";
import type { CharacterRow } from "../repositories/characterRepository.js";
import { config } from "../config.js";
import {
  cooldownKey,
  defaultMapEventsChannel,
  positionKey,
} from "./redisKeys.js";
import type { AttackResult } from "@myth-of-rune/shared";

interface Pos {
  x: number;
  y: number;
  mapId: string;
}

async function resolvePosition(
  redis: Redis,
  _client: pg.PoolClient,
  characterId: string,
  fallback: CharacterRow,
): Promise<Pos> {
  const raw = await redis.get(positionKey(characterId));
  if (raw) {
    try {
      const p = JSON.parse(raw) as Pos;
      if (typeof p.x === "number" && typeof p.y === "number") {
        return { x: p.x, y: p.y, mapId: p.mapId ?? fallback.map_id };
      }
    } catch {
      /* use DB */
    }
  }
  return { x: fallback.x, y: fallback.y, mapId: fallback.map_id };
}

export class CombatError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CombatError";
  }
}

export async function performBasicAttack(
  redis: Redis,
  client: pg.PoolClient,
  attackerId: string,
  targetId: string,
): Promise<AttackResult> {
  if (attackerId === targetId) {
    throw new CombatError("INVALID_TARGET", "Cannot attack yourself", 400);
  }

  const attacker = await characterRepository.getCharacterById(client, attackerId);
  const target = await characterRepository.getCharacterById(client, targetId);
  if (!attacker || !target) {
    throw new CombatError("NOT_FOUND", "Character not found", 404);
  }
  if (attacker.map_id !== config.mapId || target.map_id !== config.mapId) {
    throw new CombatError("MAP", "Both characters must be on the same map", 400);
  }

  const aPos = await resolvePosition(redis, client, attackerId, attacker);
  const tPos = await resolvePosition(redis, client, targetId, target);
  if (aPos.mapId !== config.mapId || tPos.mapId !== config.mapId) {
    throw new CombatError("MAP", "Position map mismatch", 400);
  }

  const dist = Math.hypot(tPos.x - aPos.x, tPos.y - aPos.y);
  if (dist > config.attackRange) {
    throw new CombatError("OUT_OF_RANGE", "Target is out of range", 400);
  }

  const cdKey = cooldownKey(attackerId, "basic_attack");
  const locked = await redis.set(
    cdKey,
    "1",
    "PX",
    config.basicAttackCooldownMs,
    "NX",
  );
  if (locked !== "OK") {
    throw new CombatError(
      "COOLDOWN",
      "Basic attack is on cooldown",
      429,
    );
  }

  const aStats = baseStatsForClass(attacker.character_class);
  const tStats = baseStatsForClass(target.character_class);
  const damage = Math.max(1, aStats.attack - tStats.defense);
  const targetHealth = Math.max(0, target.health - damage);

  await characterRepository.updateHealth(client, targetId, targetHealth);

  const result: AttackResult = {
    attackerId,
    targetId,
    damage,
    targetHealth,
  };

  await redis.publish(
    defaultMapEventsChannel,
    JSON.stringify({
      type: "combat_event",
      payload: {
        attackerId,
        targetId,
        damage,
        targetHealth,
      },
    }),
  );

  return result;
}
