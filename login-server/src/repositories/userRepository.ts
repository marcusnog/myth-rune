import type pg from "pg";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export async function findUserByEmail(
  client: pg.PoolClient,
  email: string,
): Promise<UserRow | null> {
  const r = await client.query<UserRow>(
    `SELECT id, email, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  return r.rows[0] ?? null;
}

export async function findUserByCharacterName(
  client: pg.PoolClient,
  characterName: string,
): Promise<UserRow | null> {
  const r = await client.query<UserRow>(
    `SELECT u.id, u.email, u.password_hash
     FROM users u
     INNER JOIN characters c ON c.user_id = u.id
     WHERE LOWER(c.name) = LOWER($1)
     LIMIT 1`,
    [characterName.trim()],
  );
  return r.rows[0] ?? null;
}

export async function createUser(
  client: pg.PoolClient,
  email: string,
  passwordHash: string,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
    [email.toLowerCase(), passwordHash],
  );
  return r.rows[0]!.id;
}
