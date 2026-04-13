export function positionKey(characterId: string): string {
  return `pos:${characterId}`;
}

export function mapEventsChannel(mapId: string): string {
  return `events:map:${mapId}`;
}

export function gatherCooldownKey(mapId: string, nodeId: string): string {
  return `gather_cd:${mapId}:${nodeId}`;
}
