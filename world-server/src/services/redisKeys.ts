import { config } from "../config.js";

export function positionKey(characterId: string): string {
  return `pos:${characterId}`;
}

export function mapEventsChannel(mapId: string): string {
  return `events:map:${mapId}`;
}

export const defaultMapEventsChannel = mapEventsChannel(config.mapId);
