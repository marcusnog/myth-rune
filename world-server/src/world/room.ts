import { WebSocket } from "ws";
import type {
  CharacterClassId,
  DerivedCharacterStats,
  EquipmentLoadout,
  GatherResourceType,
  MapId,
  RecipeMaterial,
  RuneId,
  SkillId,
} from "@myth-of-rune/shared";
import type { ItemId } from "@myth-of-rune/shared";
import type { PlayerQuestState } from "./npcServices.js";

export interface RateLimitWindow {
  count: number;
  windowStart: number;
}

export interface ActiveCraftTask {
  recipeId: string;
  outputItemId: ItemId;
  outputQuantity: number;
  materials: readonly RecipeMaterial[];
  startedAt: number;
  completesAt: number;
}

export interface ActiveGatherTask {
  nodeId: string;
  resourceType: GatherResourceType;
  yieldItemId: ItemId;
  yieldAmount: number;
  startedAt: number;
  completesAt: number;
}

export interface ConnectedPlayer {
  characterId: string;
  userId: string;
  characterClass: CharacterClassId;
  characterName: string;
  mapId: MapId;
  x: number;
  y: number;
  health: number;
  invulnerableUntilMs: number;
  lastMoveAt: number;
  lastPersistAt: number;
  lastAttackAt: number;
  lastSkillAtById: Partial<Record<SkillId, number>>;
  level: number;
  experience: number;
  equippedRunes: Array<RuneId | null>;
  equipment: EquipmentLoadout;
  questState: PlayerQuestState;
  stats: DerivedCharacterStats;
  socket: WebSocket;
  isAuthenticated: boolean;
  messageRateLimit: Map<string, RateLimitWindow>;
  activeCraft: ActiveCraftTask | null;
  activeGather: ActiveGatherTask | null;
}

const players = new Map<string, ConnectedPlayer>();

export function addPlayer(player: ConnectedPlayer): void {
  players.set(player.characterId, player);
}

export function removePlayer(characterId: string): void {
  players.delete(characterId);
}

export function getPlayer(characterId: string): ConnectedPlayer | undefined {
  return players.get(characterId);
}

export function allPlayers(mapId?: MapId): ConnectedPlayer[] {
  const values = [...players.values()];
  return mapId ? values.filter((player) => player.mapId === mapId) : values;
}

export function snapshotForClient(mapId: MapId): Array<{
  characterId: string;
  x: number;
  y: number;
  mapId: MapId;
  characterClass: CharacterClassId;
  characterName: string;
  level: number;
}> {
  return allPlayers(mapId).map((player) => ({
    characterId: player.characterId,
    x: player.x,
    y: player.y,
    mapId: player.mapId,
    characterClass: player.characterClass,
    characterName: player.characterName,
    level: player.level,
  }));
}

export function broadcastJson(obj: unknown, mapId?: MapId): void {
  const raw = JSON.stringify(obj);
  for (const player of players.values()) {
    if (mapId && player.mapId !== mapId) {
      continue;
    }
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(raw);
    }
  }
}

export function updatePlayerHealth(characterId: string, health: number): void {
  const player = players.get(characterId);
  if (!player) {
    return;
  }
  player.health = Math.max(0, health);
}

export function setPlayerMap(
  characterId: string,
  mapId: MapId,
  position: { x: number; y: number },
): void {
  const player = players.get(characterId);
  if (!player) {
    return;
  }
  player.mapId = mapId;
  player.x = position.x;
  player.y = position.y;
}
