import type pg from "pg";
import type { CharacterClassId, MapId } from "@myth-of-rune/shared";

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  character_class: CharacterClassId;
  map_id: MapId;
  x: number;
  y: number;
  health: number;
}

export async function findCharacterByUserId(
  client: pg.PoolClient,
  userId: string,
): Promise<CharacterRow | null> {
  const r = await client.query<CharacterRow>(
    `SELECT id, user_id, name, character_class, map_id, x, y, health
     FROM characters WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function createCharacter(
  client: pg.PoolClient,
  input: {
    userId: string;
    name: string;
    characterClass: CharacterClassId;
    health: number;
  },
): Promise<CharacterRow> {
  const r = await client.query<CharacterRow>(
    `INSERT INTO characters (user_id, name, character_class, health)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, name, character_class, map_id, x, y, health`,
    [input.userId, input.name, input.characterClass, input.health],
  );
  return r.rows[0]!;
}

export async function getCharacterById(
  client: pg.PoolClient,
  characterId: string,
): Promise<CharacterRow | null> {
  const r = await client.query<CharacterRow>(
    `SELECT id, user_id, name, character_class, map_id, x, y, health
     FROM characters WHERE id = $1`,
    [characterId],
  );
  return r.rows[0] ?? null;
}
