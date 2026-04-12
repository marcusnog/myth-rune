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

function requireStrongSecret(name: string): string {
  const secret = requireEnv(name);
  if (secret.length < 32) {
    throw new Error(`${name} must be at least 32 characters long.`);
  }
  return secret;
}

export const config = {
  port: Number(process.env.LOGIN_SERVER_PORT ?? "3001"),
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  jwtSecret: requireStrongSecret("JWT_SECRET"),
  jwtExpiresSeconds: Number(process.env.JWT_EXPIRES_SECONDS ?? "3600"),
  nodeEnv: process.env.NODE_ENV ?? "development",
};
