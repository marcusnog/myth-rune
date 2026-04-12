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
  inventory: Record<string, number>;
  equipment: Record<string, string | null>;
  quest_state: Record<string, unknown>;
}

export async function getCharacterById(
  client: pg.PoolClient,
  id: string,
): Promise<CharacterRow | null> {
  const r = await client.query<CharacterRow>(
    `SELECT id, user_id, name, character_class, map_id, x, y, health, inventory, equipment, quest_state
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

export async function updateEquipment(
  client: pg.PoolClient,
  characterId: string,
  equipment: Record<string, string | null>,
): Promise<void> {
  await client.query(`UPDATE characters SET equipment = $2 WHERE id = $1`, [
    characterId,
    JSON.stringify(equipment),
  ]);
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

export async function updateMapPosition(
  client: pg.PoolClient,
  characterId: string,
  mapId: MapId,
  x: number,
  y: number,
): Promise<void> {
  await client.query(
    `UPDATE characters SET map_id = $2, x = $3, y = $4 WHERE id = $1`,
    [characterId, mapId, x, y],
  );
}

export async function updateQuestState(
  client: pg.PoolClient,
  characterId: string,
  questState: unknown,
): Promise<void> {
  await client.query(`UPDATE characters SET quest_state = $2 WHERE id = $1`, [
    characterId,
    JSON.stringify(questState),
  ]);
}
