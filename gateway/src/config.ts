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
  port: Number(process.env.GATEWAY_PORT ?? "3000"),
  loginServerUrl: requireEnv("LOGIN_SERVER_URL"),
  worldServerUrl: requireEnv("WORLD_SERVER_URL"),
  combatServerUrl: requireEnv("COMBAT_SERVER_URL"),
  nodeEnv: process.env.NODE_ENV ?? "development",
};
