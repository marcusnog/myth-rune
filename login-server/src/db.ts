import pg from "pg";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

function requireDatabaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v || v.length === 0) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return v;
}

/** Shared pool — migrations only need DATABASE_URL (no JWT). */
export const pool = new pg.Pool({
  connectionString: requireDatabaseUrl(),
  max: 10,
});
