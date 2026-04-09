import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { WebSocket } from "ws";
import {
  buildProgressionSnapshot,
  defaultStarterRunesForClass,
  DEFAULT_EQUIPMENT,
  WORLD_COMBAT_CONFIG,
} from "@myth-of-rune/shared";
import {
  applyPlayerAttack,
  resetMobsForTests,
  snapshotMobsForClient,
  tickMobs,
} from "./mobs.js";
import {
  findNearestWalkablePosition,
  isBlockedAtWorldPosition,
  resolveWorldCollision,
} from "../services/mapCollision.js";
import type { ConnectedPlayer } from "./room.js";

function makeFakeSocket(): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send: () => undefined,
  } as unknown as WebSocket;
}

function makePlayer(
  characterId: string,
  x: number,
  y: number,
  characterClass: ConnectedPlayer["characterClass"] = "warrior",
): ConnectedPlayer {
  const progression = buildProgressionSnapshot(
    characterClass,
    0,
    defaultStarterRunesForClass(characterClass),
    DEFAULT_EQUIPMENT,
  );
  return {
    characterId,
    characterClass,
    characterName: characterId,
    x,
    y,
    health: progression.stats.maxHealth,
    invulnerableUntilMs: 0,
    lastMoveAt: 0,
    lastPersistAt: 0,
    lastAttackAt: 0,
    level: progression.level,
    experience: progression.experience,
    equippedRunes: [...progression.equippedRunes],
    equipment: progression.equipment,
    stats: progression.stats,
    socket: makeFakeSocket(),
  };
}

function firstMobId(): string {
  const snapshot = snapshotMobsForClient();
  assert.ok(snapshot.length > 0, "expected at least one mob in snapshot");
  return snapshot[0]!.mobId;
}

function mobById(mobId: string): { mobId: string; x: number; y: number } {
  const mob = snapshotMobsForClient().find((m) => m.mobId === mobId);
  assert.ok(mob, `expected mob ${mobId} to exist`);
  return { mobId: mob.mobId, x: mob.x, y: mob.y };
}

beforeEach(() => {
  resetMobsForTests([{ x: 100, y: 100 }]);
});

test("player attack rejects targets out of range", () => {
  const attacker = makePlayer("attacker-1", 0, 0);
  const result = applyPlayerAttack(attacker, firstMobId(), 10_000);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "OUT_OF_RANGE");
  }
});

test("player attack enforces cooldown", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const attacker = makePlayer("attacker-2", 100, 100);
  const targetMobId = firstMobId();

  const first = applyPlayerAttack(attacker, targetMobId, 10_000);
  assert.equal(first.ok, true);

  const second = applyPlayerAttack(
    attacker,
    targetMobId,
    10_000 + WORLD_COMBAT_CONFIG.playerAttackCooldownMs - 1,
  );
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.code, "COOLDOWN");
  }
});

test("player attack can kill a mob and remove it from store", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const attacker = makePlayer("attacker-3", 100, 100, "mage");
  const targetMobId = firstMobId();

  let nowMs = 20_000;
  let killResult:
    | ReturnType<typeof applyPlayerAttack>
    | null = null;
  for (let i = 0; i < 4; i += 1) {
    killResult = applyPlayerAttack(attacker, targetMobId, nowMs);
    nowMs += WORLD_COMBAT_CONFIG.playerAttackCooldownMs;
  }

  assert.ok(killResult);
  assert.equal(killResult.ok, true);
  if (killResult.ok) {
    assert.equal(killResult.mobDied, true);
    assert.equal(killResult.event.targetHealth, 0);
  }

  const afterDeath = applyPlayerAttack(attacker, targetMobId, nowMs);
  assert.equal(afterDeath.ok, false);
  if (!afterDeath.ok) {
    assert.equal(afterDeath.code, "NOT_FOUND");
  }
});

test("mob invulnerability prevents a second simultaneous hit", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const mobId = firstMobId();
  const attackerA = makePlayer("attacker-a", 100, 100);
  const attackerB = makePlayer("attacker-b", 100, 100);
  const nowMs = 30_000;

  const first = applyPlayerAttack(attackerA, mobId, nowMs);
  const second = applyPlayerAttack(attackerB, mobId, nowMs);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.ok(first.event.damage > 0);
    assert.equal(second.event.damage, 0);
    assert.equal(second.event.targetHealth, first.event.targetHealth);
  }
});

test("mob attack uses telegraph and applies player defense", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const player = makePlayer("target-1", 120, 100, "warrior");
  const startHealth = player.health;
  const startMs = 40_000;

  const telegraphTick = tickMobs(0.1, [player], startMs);
  assert.equal(telegraphTick.combatEvents.length, 0);

  const hitTick = tickMobs(0.1, [player], startMs + 300);
  assert.equal(hitTick.combatEvents.length, 1);
  const ev = hitTick.combatEvents[0]!;
  assert.equal(ev.targetId, player.characterId);
  assert.equal(ev.damage, 4);
  assert.equal(ev.targetHealth, startHealth - ev.damage);
});

test("player post-hit invulnerability blocks parallel mob attacks", () => {
  resetMobsForTests([
    { x: 100, y: 100 },
    { x: 102, y: 100 },
  ]);
  const player = makePlayer("target-2", 120, 100, "warrior");
  const startMs = 50_000;

  const telegraphTick = tickMobs(0.1, [player], startMs);
  assert.equal(telegraphTick.combatEvents.length, 0);

  const hitTick = tickMobs(0.1, [player], startMs + 300);
  assert.equal(hitTick.combatEvents.length, 1);
  assert.equal(hitTick.combatEvents[0]!.targetId, player.characterId);
});

test("multiplayer burst yields a single damaging mob hit window", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const mobId = firstMobId();
  const attackers = [
    makePlayer("burst-1", 100, 100),
    makePlayer("burst-2", 100, 100),
    makePlayer("burst-3", 100, 100),
    makePlayer("burst-4", 100, 100),
  ];
  const nowMs = 60_000;

  const results = attackers.map((attacker) =>
    applyPlayerAttack(attacker, mobId, nowMs),
  );
  const damagingHits = results.filter(
    (r): r is Extract<typeof r, { ok: true }> => r.ok && r.event.damage > 0,
  );
  const zeroHits = results.filter(
    (r): r is Extract<typeof r, { ok: true }> => r.ok && r.event.damage === 0,
  );

  assert.equal(damagingHits.length, 1);
  assert.equal(zeroHits.length, attackers.length - 1);
  const hpAfterFirstHit = damagingHits[0]!.event.targetHealth;
  for (const hit of zeroHits) {
    assert.equal(hit.event.targetHealth, hpAfterFirstHit);
  }
});

test("telegraph keeps initial target even if nearest changes mid-windup", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const targetA = makePlayer("target-a", 120, 100, "warrior");
  const targetB = makePlayer("target-b", 136, 100, "warrior");
  const startMs = 70_000;

  const telegraphTick = tickMobs(0.1, [targetA, targetB], startMs);
  assert.equal(telegraphTick.combatEvents.length, 0);

  targetA.x = 132;
  targetB.x = 121;

  const resolveTick = tickMobs(0.1, [targetA, targetB], startMs + 300);
  assert.equal(resolveTick.combatEvents.length, 1);
  assert.equal(resolveTick.combatEvents[0]!.targetId, targetA.characterId);
});

test("mob disengages and returns after crossing leash distance", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const mobId = firstMobId();
  const kitingPlayer = makePlayer("kite", 340, 100, "warrior");
  const startMs = 80_000;

  const chaseTick = tickMobs(5.0, [kitingPlayer], startMs);
  assert.equal(chaseTick.combatEvents.length, 0);
  const chasedPos = mobById(mobId);
  assert.ok(chasedPos.x > 320);

  const returnTick = tickMobs(0.2, [kitingPlayer], startMs + 200);
  assert.equal(returnTick.combatEvents.length, 0);
  const returningPos = mobById(mobId);
  assert.ok(returningPos.x < chasedPos.x);
});

test("collision service keeps village center blocked and resolves to walkable ground", () => {
  assert.equal(isBlockedAtWorldPosition(400, 300), true);

  const safe = findNearestWalkablePosition(400, 300);
  assert.equal(isBlockedAtWorldPosition(safe.x, safe.y), false);

  const resolved = resolveWorldCollision(
    { x: 272, y: 172 },
    { x: 400, y: 300 },
  );
  assert.equal(isBlockedAtWorldPosition(resolved.x, resolved.y), false);
  assert.ok(
    Math.round(resolved.x) !== 400 || Math.round(resolved.y) !== 300,
    "resolved position should differ from the blocked target",
  );
});
