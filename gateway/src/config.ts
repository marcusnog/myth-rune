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

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "http://localhost:5173")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export const config = {
  port: Number(process.env.GATEWAY_PORT ?? "3000"),
  loginServerUrl: requireEnv("LOGIN_SERVER_URL"),
  worldServerUrl: requireEnv("WORLD_SERVER_URL"),
  combatServerUrl: requireEnv("COMBAT_SERVER_URL"),
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
  nodeEnv: process.env.NODE_ENV ?? "development",
};
