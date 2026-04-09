import { config } from "../config.js";

export function positionKey(characterId: string): string {
  return `pos:${characterId}`;
}

export function cooldownKey(attackerId: string, skillId: string): string {
  return `cd:${attackerId}:${skillId}`;
}

export function mapEventsChannel(mapId: string): string {
  return `events:map:${mapId}`;
}

export const defaultMapEventsChannel = mapEventsChannel(config.mapId);
