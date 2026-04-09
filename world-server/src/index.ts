import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { pool } from "./db.js";
import { attachWorldHandlers, subscribeCombatEvents } from "./world/wsHandler.js";
import * as characterRepository from "./repositories/characterRepository.js";
import * as mobs from "./world/mobs.js";
import * as room from "./world/room.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "world-server" });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

const redis = new Redis(config.redisUrl);
const subscriber = new Redis(config.redisUrl);

attachWorldHandlers(wss, pool, redis);
subscribeCombatEvents(subscriber, pool);

mobs.initMobs();

const MOB_TICK_S = 0.16;
setInterval(() => {
  const players = room.allPlayers();
  if (players.length === 0) {
    return;
  }
  void (async () => {
    const { changed, combatEvents } = mobs.tickMobs(
      MOB_TICK_S,
      players,
      Date.now(),
    );
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
      for (const ev of combatEvents) {
        room.broadcastJson({
          type: "combat_event",
          payload: ev,
        });
      }
    }
    if (changed) {
      room.broadcastJson({
        type: "state",
        payload: {
          players: room.snapshotForClient(),
          mobs: mobs.snapshotMobsForClient(),
        },
      });
    }
  })().catch((err) => {
    console.error(JSON.stringify({ msg: "mob_tick_error", error: String(err) }));
  });
}, Math.round(MOB_TICK_S * 1000));

server.listen(config.port, () => {
  console.log(
    JSON.stringify({
      msg: "world-server listening",
      port: config.port,
      env: config.nodeEnv,
    }),
  );
});
