import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.WORLD_SERVER_PORT ?? "3002"),
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  jwtSecret: requireEnv("JWT_SECRET"),
  mapId: "default" as const,
  nodeEnv: process.env.NODE_ENV ?? "development",
};

/**
 * World bounds (server units), aligned to starter_town map placement on client.
 * The client anchors tilemap center at (400,300) and offsets a 128x128 map (32px tiles).
 */
export const MAP_BOUNDS = { minX: -1664, maxX: 2432, minY: -1764, maxY: 2332 };

export const RESPAWN_POINT = {
  x: 384,
  y: 256,
} as const;
