import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { pool } from "./db.js";
import { renderMetrics } from "./services/metrics.js";
import { logError, logInfo } from "./services/logger.js";
import { attachWorldHandlers, persistAllPlayers, subscribeCombatEvents, tickPlayerActivities } from "./world/wsHandler.js";
import * as characterRepository from "./repositories/characterRepository.js";
import * as mobs from "./world/mobs.js";
import * as loot from "./world/loot.js";
import * as room from "./world/room.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

function requireGm(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!config.gmSecret) {
    res.status(503).json({ error: "GM tools disabled" });
    return;
  }
  if (req.header("x-gm-secret") !== config.gmSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "world-server" });
});

app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(renderMetrics());
});

app.get("/gm/players", requireGm, (_req, res) => {
  res.json({
    players: room.allPlayers().map((player) => ({
      characterId: player.characterId,
      userId: player.userId,
      name: player.characterName,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      health: player.health,
      level: player.level,
    })),
  });
});

app.post("/gm/teleport", requireGm, async (req, res) => {
  const { characterId, x, y } = req.body ?? {};
  if (typeof characterId !== "string" || typeof x !== "number" || typeof y !== "number") {
    res.status(400).json({ error: "characterId, x and y are required" });
    return;
  }
  const player = room.getPlayer(characterId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  player.x = x;
  player.y = y;
  await pool.connect().then(async (client) => {
    try {
      await characterRepository.updateMapPosition(client, player.characterId, player.mapId, x, y);
    } finally {
      client.release();
    }
  }).catch(() => undefined);
  room.broadcastJson(
    {
      type: "position_correction",
      payload: { x, y },
    },
    player.mapId,
  );
  res.json({ ok: true });
});

app.post("/gm/give-item", requireGm, async (req, res) => {
  const { characterId, itemId, quantity } = req.body ?? {};
  if (typeof characterId !== "string" || typeof itemId !== "string" || typeof quantity !== "number") {
    res.status(400).json({ error: "characterId, itemId and quantity are required" });
    return;
  }
  await pool.connect().then(async (client) => {
    try {
      const row = await characterRepository.getCharacterById(client, characterId);
      if (!row) {
        res.status(404).json({ error: "Player not found" });
        return;
      }
      const inventory = row.inventory ?? {};
      inventory[itemId] = (inventory[itemId] ?? 0) + Math.max(1, Math.floor(quantity));
      await characterRepository.updateInventory(client, characterId, inventory);
      const player = room.getPlayer(characterId);
      if (player) {
        player.socket.send(JSON.stringify({ type: "inventory", payload: { inventory } }));
      }
      res.json({ ok: true, inventory });
    } finally {
      client.release();
    }
  }).catch((error) => {
    res.status(500).json({ error: String(error) });
  });
});

app.post("/gm/kick", requireGm, (req, res) => {
  const { characterId } = req.body ?? {};
  if (typeof characterId !== "string") {
    res.status(400).json({ error: "characterId is required" });
    return;
  }
  const player = room.getPlayer(characterId);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  try {
    player.socket.close(4003, "Kicked by GM");
  } catch {}
  room.removePlayer(characterId);
  res.json({ ok: true });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

const redis = new Redis(config.redisUrl);
const subscriber = new Redis(config.redisUrl);

attachWorldHandlers(wss, pool, redis);
subscribeCombatEvents(subscriber, pool);
void loot.configureLootPersistence(redis).catch((err) => {
  logError("loot_persistence_init_failed", { error: String(err) });
});

mobs.initMobs();

const MOB_TICK_S = 0.16;
setInterval(() => {
  const players = room.allPlayers();
  void (async () => {
    await tickPlayerActivities(pool, redis);
    if (players.length === 0) {
      return;
    }
    const { changedMaps, combatEventsByMap } = mobs.tickMobs(
      MOB_TICK_S,
      players,
      Date.now(),
    );
    const combatEvents = [...combatEventsByMap.values()].flat();
    if (combatEvents.length > 0) {
      const client = await pool.connect();
      try {
        const latestHealthByPlayer = new Map<string, number>();
        for (const ev of combatEvents) {
          latestHealthByPlayer.set(ev.targetId, ev.targetHealth);
        }
        for (const [characterId, health] of latestHealthByPlayer) {
          await characterRepository.updateHealth(client, characterId, health);
        }
      } finally {
        client.release();
      }
      for (const [mapId, events] of combatEventsByMap) {
        for (const ev of events) {
          room.broadcastJson({ type: "combat_event", payload: ev }, mapId);
        }
      }
    }
    for (const mapId of changedMaps) {
      room.broadcastJson({
        type: "state",
        payload: {
          players: room.snapshotForClient(mapId),
          mobs: mobs.snapshotMobsForClient(mapId),
          loot: loot.snapshotLootForClient(mapId),
        },
      }, mapId);
    }
  })().catch((err) => {
    logError("mob_tick_error", { error: String(err) });
  });
}, Math.round(MOB_TICK_S * 1000));

server.listen(config.port, () => {
  logInfo("world-server listening", { port: config.port, env: config.nodeEnv });
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logInfo("world-server shutdown started", { signal });
  wss.clients.forEach((client) => {
    try {
      client.close(1012, "Server shutting down");
    } catch {}
  });
  await persistAllPlayers(pool, redis);
  await subscriber.quit().catch(() => undefined);
  await redis.quit().catch(() => undefined);
  await pool.end().catch(() => undefined);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
