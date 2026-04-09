import type pg from "pg";
import type { CharacterClassId } from "@myth-of-rune/shared";

export interface CharacterRow {
  id: string;
  map_id: string;
  x: number;
  y: number;
  health: number;
  character_class: CharacterClassId;
}

export async function getCharacterById(
  client: pg.PoolClient,
  id: string,
): Promise<CharacterRow | null> {
  const r = await client.query<CharacterRow>(
    `SELECT id, map_id, x, y, health, character_class FROM characters WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function updateHealth(
  client: pg.PoolClient,
  characterId: string,
  health: number,
): Promise<void> {
  await client.query(`UPDATE characters SET health = $2 WHERE id = $1`, [
    characterId,
    health,
  ]);
}
