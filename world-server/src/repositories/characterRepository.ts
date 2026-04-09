import type pg from "pg";
import type { CharacterClassId } from "@myth-of-rune/shared";

export interface CharacterRow {
  id: string;
  name: string;
  character_class: CharacterClassId;
  map_id: string;
  x: number;
  y: number;
  health: number;
  inventory: Record<string, number>;
}

export async function getCharacterById(
  client: pg.PoolClient,
  id: string,
): Promise<CharacterRow | null> {
  const r = await client.query<CharacterRow>(
    `SELECT id, name, character_class, map_id, x, y, health, inventory
     FROM characters WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function updateInventory(
  client: pg.PoolClient,
  characterId: string,
  inventory: Record<string, number>,
): Promise<void> {
  await client.query(
    `UPDATE characters SET inventory = $2 WHERE id = $1`,
    [characterId, JSON.stringify(inventory)],
  );
}

export async function updatePosition(
  client: pg.PoolClient,
  characterId: string,
  x: number,
  y: number,
): Promise<void> {
  await client.query(
    `UPDATE characters SET x = $2, y = $3 WHERE id = $1`,
    [characterId, x, y],
  );
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
