import { WebSocket } from "ws";
import type {
  CharacterClassId,
  DerivedCharacterStats,
  EquipmentLoadout,
  RuneId,
} from "@myth-of-rune/shared";

export interface ConnectedPlayer {
  characterId: string;
  characterClass: CharacterClassId;
  characterName: string;
  x: number;
  y: number;
  health: number;
  invulnerableUntilMs: number;
  lastMoveAt: number;
  lastPersistAt: number;
  lastAttackAt: number;
  level: number;
  experience: number;
  equippedRunes: Array<RuneId | null>;
  equipment: EquipmentLoadout;
  stats: DerivedCharacterStats;
  socket: WebSocket;
}

const players = new Map<string, ConnectedPlayer>();

export function addPlayer(p: ConnectedPlayer): void {
  players.set(p.characterId, p);
}

export function removePlayer(characterId: string): void {
  players.delete(characterId);
}

export function getPlayer(characterId: string): ConnectedPlayer | undefined {
  return players.get(characterId);
}

export function updatePlayerHealth(
  characterId: string,
  health: number,
): void {
  const p = players.get(characterId);
  if (!p) {
    return;
  }
  p.health = Math.max(0, health);
}

export function allPlayers(): ConnectedPlayer[] {
  return [...players.values()];
}

export function broadcastJson(obj: unknown): void {
  const raw = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.socket.readyState === p.socket.OPEN) {
      p.socket.send(raw);
    }
  }
}

export function snapshotForClient(): Array<{
  characterId: string;
  x: number;
  y: number;
  characterClass: CharacterClassId;
  characterName: string;
  level: number;
}> {
  return allPlayers().map((p) => ({
    characterId: p.characterId,
    x: p.x,
    y: p.y,
    characterClass: p.characterClass,
    characterName: p.characterName,
    level: p.level,
  }));
}
