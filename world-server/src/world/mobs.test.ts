import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { WebSocket } from "ws";
import {
  buildProgressionSnapshot,
  defaultStarterRunesForClass,
  DEFAULT_EQUIPMENT,
  WORLD_COMBAT_CONFIG,
  PLAYER_ATTACK_PROFILES,
} from "@myth-of-rune/shared";
import {
  applyPlayerAoeAttack,
  applyPlayerAttack,
  resetMobsForTests,
  snapshotMobsForClient,
  tickMobs,
} from "./mobs.js";
import { createDefaultQuestState } from "./npcServices.js";
import {
  findNearestWalkablePosition,
  isBlockedAtWorldPosition,
  resolveWorldCollision,
} from "../services/mapCollision.js";
import { validateMove } from "../services/movement.js";
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
    userId: `${characterId}-user`,
    characterClass,
    characterName: characterId,
    mapId: "default",
    x,
    y,
    health: progression.stats.maxHealth,
    invulnerableUntilMs: 0,
    lastMoveAt: 0,
    lastPersistAt: 0,
    lastAttackAt: 0,
    lastSkillAtById: {},
    level: progression.level,
    experience: progression.experience,
    equippedRunes: [...progression.equippedRunes],
    equipment: progression.equipment,
    questState: createDefaultQuestState(),
    stats: progression.stats,
    socket: makeFakeSocket(),
    isAuthenticated: true,
    messageRateLimit: new Map(),
    activeCraft: null,
    activeGather: null,
  };
}

function firstMobId(): string {
  const snapshot = snapshotMobsForClient("default");
  assert.ok(snapshot.length > 0, "expected at least one mob in snapshot");
  return snapshot[0]!.mobId;
}

function mobById(mobId: string): { mobId: string; x: number; y: number } {
  const mob = snapshotMobsForClient("default").find((m) => m.mobId === mobId);
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

test("mage basic attack reaches beyond melee range", () => {
  resetMobsForTests([{ x: 250, y: 100 }]);
  const mage = makePlayer("mage-ranged", 100, 100, "mage");
  const warrior = makePlayer("warrior-melee", 100, 100, "warrior");
  const targetMobId = firstMobId();

  const mageDistance = 150;
  assert.ok(mageDistance > WORLD_COMBAT_CONFIG.playerAttackRange);
  assert.ok(mageDistance < PLAYER_ATTACK_PROFILES["mage"].range);

  const mageResult = applyPlayerAttack(mage, targetMobId, 10_000);
  assert.equal(mageResult.ok, true);

  resetMobsForTests([{ x: 250, y: 100 }]);
  const warriorResult = applyPlayerAttack(warrior, firstMobId(), 10_000);
  assert.equal(warriorResult.ok, false);
  if (!warriorResult.ok) {
    assert.equal(warriorResult.code, "OUT_OF_RANGE");
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
    if (killResult.ok && killResult.mobDied) {
      break;
    }
    nowMs += WORLD_COMBAT_CONFIG.playerAttackCooldownMs;
  }

  assert.ok(killResult);
  assert.equal(killResult.ok, true);
  if (killResult.ok) {
    assert.equal(killResult.mobDied, true);
    assert.equal(killResult.event.targetHealth, 0);
  }

  const afterDeath = applyPlayerAttack(
    attacker,
    targetMobId,
    nowMs + WORLD_COMBAT_CONFIG.playerAttackCooldownMs,
  );
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

test("rogue basic attack can crit", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const rogue = makePlayer("rogue-crit", 100, 100, "rogue");
  const critResult = applyPlayerAttack(rogue, firstMobId(), 35_000, () => 0);

  assert.equal(critResult.ok, true);
  if (critResult.ok) {
    assert.equal(critResult.event.isCritical, true);
    assert.ok(critResult.event.damage >= 17);
  }
});

test("mage basic attack damage includes power contribution without crit", () => {
  resetMobsForTests([{ x: 110, y: 100 }]);
  const mage = makePlayer("mage-dmg", 100, 100, "mage");
  const result = applyPlayerAttack(mage, firstMobId(), 10_000, () => 0.99);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.isCritical, undefined);
    assert.ok(result.event.damage >= 17);
  }
});

test("aoe skill can hit multiple mobs in one authoritative server call", () => {
  resetMobsForTests([
    { x: 100, y: 100 },
    { x: 118, y: 100 },
    { x: 220, y: 100 },
  ]);
  const mage = makePlayer("mage-aoe", 100, 100, "mage");
  const result = applyPlayerAoeAttack(mage, "mage_arcane_blast", 55_000, () => 0.99);

  assert.equal(result.ok, true);
  if (result.ok) {
    const damagingHits = result.events.filter((event) => event.damage > 0);
    assert.equal(damagingHits.length, 3);
  }
});

test("mob attack uses telegraph and applies player defense", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const player = makePlayer("target-1", 120, 100, "warrior");
  const startHealth = player.health;
  const startMs = 40_000;

  const telegraphTick = tickMobs(0.1, [player], startMs);
  assert.equal(telegraphTick.combatEventsByMap.get("default")?.length ?? 0, 0);

  const hitTick = tickMobs(0.1, [player], startMs + 300);
  assert.equal(hitTick.combatEventsByMap.get("default")?.length ?? 0, 1);
  const ev = hitTick.combatEventsByMap.get("default")![0]!;
  assert.equal(ev.targetId, player.characterId);
  assert.equal(ev.damage, 3);
  assert.equal(ev.targetHealth, startHealth - ev.damage);
});

test("rogue can dodge a mob hit", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const rogue = makePlayer("rogue-dodge", 120, 100, "rogue");
  const startHealth = rogue.health;
  const startMs = 45_000;

  const telegraphTick = tickMobs(0.1, [rogue], startMs, () => 0.99);
  assert.equal(telegraphTick.combatEventsByMap.get("default")?.length ?? 0, 0);

  const hitTick = tickMobs(0.1, [rogue], startMs + 300, () => 0);
  assert.equal(hitTick.combatEventsByMap.get("default")?.length ?? 0, 1);
  const ev = hitTick.combatEventsByMap.get("default")![0]!;
  assert.equal(ev.isDodged, true);
  assert.equal(ev.damage, 0);
  assert.equal(ev.targetHealth, startHealth);
});

test("player post-hit invulnerability blocks parallel mob attacks", () => {
  resetMobsForTests([
    { x: 100, y: 100 },
    { x: 102, y: 100 },
  ]);
  const player = makePlayer("target-2", 120, 100, "warrior");
  const startMs = 50_000;

  const telegraphTick = tickMobs(0.1, [player], startMs);
  assert.equal(telegraphTick.combatEventsByMap.get("default")?.length ?? 0, 0);

  const hitTick = tickMobs(0.1, [player], startMs + 300);
  assert.equal(hitTick.combatEventsByMap.get("default")?.length ?? 0, 1);
  assert.equal(hitTick.combatEventsByMap.get("default")![0]!.targetId, player.characterId);
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
  assert.equal(telegraphTick.combatEventsByMap.get("default")?.length ?? 0, 0);

  targetA.x = 132;
  targetB.x = 121;

  const resolveTick = tickMobs(0.1, [targetA, targetB], startMs + 300);
  assert.equal(resolveTick.combatEventsByMap.get("default")?.length ?? 0, 1);
  assert.equal(resolveTick.combatEventsByMap.get("default")![0]!.targetId, targetA.characterId);
});

test("mob disengages and returns after crossing leash distance", () => {
  resetMobsForTests([{ x: 150, y: 600 }]);
  const mobId = firstMobId();
  const kitingPlayer = makePlayer("kite", 350, 600, "warrior");
  const startMs = 80_000;

  const chaseTick = tickMobs(5.0, [kitingPlayer], startMs);
  assert.equal(chaseTick.combatEventsByMap.get("default")?.length ?? 0, 0);
  const chasedPos = mobById(mobId);
  assert.ok(chasedPos.x > 320);

  const returnTick = tickMobs(0.2, [kitingPlayer], startMs + 200);
  assert.equal(returnTick.combatEventsByMap.get("default")?.length ?? 0, 0);
  const returningPos = mobById(mobId);
  assert.ok(returningPos.x < chasedPos.x);
});

test("wander branch uses injected rng instead of Math.random directly", () => {
  resetMobsForTests([{ x: 100, y: 100 }]);
  const mobId = firstMobId();
  const before = mobById(mobId);
  const wanderTick = tickMobs(0.2, [], 90_000, () => 0);
  const after = mobById(mobId);

  assert.equal(wanderTick.combatEventsByMap.get("default")?.length ?? 0, 0);
  assert.ok(wanderTick.changedMaps.has("default"));
  assert.ok(after.x !== before.x || after.y !== before.y);
});

test("collision service keeps village center blocked and resolves to walkable ground", () => {
  assert.equal(isBlockedAtWorldPosition("default", 400, 300), true);

  const safe = findNearestWalkablePosition("default", 400, 300);
  assert.equal(isBlockedAtWorldPosition("default", safe.x, safe.y), false);

  const resolved = resolveWorldCollision(
    "default",
    { x: 272, y: 172 },
    { x: 400, y: 300 },
  );
  assert.equal(isBlockedAtWorldPosition("default", resolved.x, resolved.y), false);
  assert.ok(
    Math.round(resolved.x) !== 400 || Math.round(resolved.y) !== 300,
    "resolved position should differ from the blocked target",
  );
});

test("resolveWorldCollision keeps result on the same side as from", () => {
  const from = { x: 272, y: 172 };
  const to   = { x: 400, y: 300 };
  const resolved = resolveWorldCollision("default", from, to);

  const distFromToResolved = Math.hypot(resolved.x - from.x, resolved.y - from.y);
  const distToToResolved   = Math.hypot(resolved.x - to.x,   resolved.y - to.y);

  assert.ok(
    distFromToResolved <= distToToResolved,
    `resultado (${resolved.x}, ${resolved.y}) estÃ¡ mais longe de from do que de to â€” possivelmente no lado errado do obstÃ¡culo`,
  );
});

test("server move validation resolves blocked destinations instead of accepting them", () => {
  const result = validateMove(
    "default",
    { x: 272, y: 172 },
    { x: 400, y: 300 },
    240,
    1,
  );

  assert.equal(result.ok, true);
  assert.equal(isBlockedAtWorldPosition("default", result.position.x, result.position.y), false);
  assert.ok(
    Math.round(result.position.x) !== 400 || Math.round(result.position.y) !== 300,
    "validated move should stop at a walkable position",
  );
});

