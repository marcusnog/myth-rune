import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const fileFlagIndex = argv.findIndex((arg) => arg === "--file");
  return {
    envFile:
      fileFlagIndex >= 0 && argv[fileFlagIndex + 1]
        ? resolve(argv[fileFlagIndex + 1])
        : resolve(process.cwd(), ".env"),
  };
}

function parseDotEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, "utf8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }
  return entries;
}

function isValidUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "redis:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function parsePort(raw) {
  const value = Number.parseInt(String(raw), 10);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : null;
}

const { envFile } = parseArgs(process.argv.slice(2));
const fileEnv = parseDotEnvFile(envFile);
const env = { ...fileEnv, ...process.env };

const errors = [];
const warnings = [];
const info = [];

function requireNonEmpty(name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${name} is missing.`);
    return null;
  }
  return value.trim();
}

function requireUrl(name) {
  const value = requireNonEmpty(name);
  if (!value) {
    return null;
  }
  if (!isValidUrl(value)) {
    errors.push(`${name} must be a valid URL.`);
    return null;
  }
  return value;
}

function requirePortEnv(name) {
  const value = requireNonEmpty(name);
  if (!value) {
    return null;
  }
  const port = parsePort(value);
  if (port === null) {
    errors.push(`${name} must be a valid TCP port.`);
    return null;
  }
  return port;
}

const nodeEnv = env.NODE_ENV?.trim() || "development";
const jwtSecret = requireNonEmpty("JWT_SECRET");
if (jwtSecret && jwtSecret.length < 32) {
  errors.push("JWT_SECRET must be at least 32 characters long.");
}

const jwtExpiresSeconds = Number.parseInt(env.JWT_EXPIRES_SECONDS ?? "3600", 10);
if (!Number.isInteger(jwtExpiresSeconds) || jwtExpiresSeconds <= 0) {
  errors.push("JWT_EXPIRES_SECONDS must be a positive integer.");
}

requireUrl("DATABASE_URL");
requireUrl("REDIS_URL");
requireUrl("LOGIN_SERVER_URL");
requireUrl("WORLD_SERVER_URL");
requireUrl("COMBAT_SERVER_URL");

requirePortEnv("GATEWAY_PORT");
requirePortEnv("LOGIN_SERVER_PORT");
requirePortEnv("WORLD_SERVER_PORT");
requirePortEnv("COMBAT_SERVER_PORT");

const allowedOrigins = env.ALLOWED_ORIGINS?.trim();
if (!allowedOrigins) {
  warnings.push("ALLOWED_ORIGINS is not set. Gateway will fall back to localhost only.");
} else {
  const invalidOrigins = allowedOrigins
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !isValidUrl(entry));
  if (invalidOrigins.length > 0) {
    errors.push(`ALLOWED_ORIGINS has invalid URL(s): ${invalidOrigins.join(", ")}.`);
  }
}

const gmSecret = env.GM_SECRET?.trim() ?? "";
if (nodeEnv === "production" && gmSecret.length === 0) {
  warnings.push("GM_SECRET is empty. GM endpoints will remain disabled in production.");
}

if (existsSync(envFile)) {
  info.push(`Loaded ${envFile}`);
} else {
  warnings.push(`Env file not found at ${envFile}; using process environment only.`);
}

for (const line of info) {
  console.log(`info: ${line}`);
}
for (const line of warnings) {
  console.log(`warn: ${line}`);
}
for (const line of errors) {
  console.log(`error: ${line}`);
}

if (errors.length === 0) {
  console.log("ok: environment validation passed");
}

process.exit(errors.length > 0 ? 1 : 0);
