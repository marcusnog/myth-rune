import type { Position } from "./schemas/common.js";

export const MAP_IDS = ["default", "forest_edge"] as const;

export type MapId = (typeof MAP_IDS)[number];

export interface MapPortalDefinition {
  id: string;
  fromMapId: MapId;
  toMapId: MapId;
  x: number;
  y: number;
  radius: number;
  label: string;
  arrival: Position;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  spawn: Position;
  defaultWeather: "clear" | "light_rain";
}

export const MAP_DEFINITIONS: Readonly<Record<MapId, MapDefinition>> = Object.freeze({
  default: {
    id: "default",
    name: "Starter Town",
    description: "Vila inicial protegida pela cerca central.",
    spawn: { x: 384, y: 256 },
    defaultWeather: "clear",
  },
  forest_edge: {
    id: "forest_edge",
    name: "Forest Edge",
    description: "Borda da floresta com presenca maior de bestas e recursos.",
    spawn: { x: 1536, y: 960 },
    defaultWeather: "light_rain",
  },
});

export const MAP_PORTALS: readonly MapPortalDefinition[] = Object.freeze([
  {
    id: "starter_to_forest",
    fromMapId: "default",
    toMapId: "forest_edge",
    x: 1536,
    y: 960,
    radius: 78,
    label: "Entrar na borda da floresta",
    arrival: { x: -224, y: 1712 },
  },
  {
    id: "forest_to_starter",
    fromMapId: "forest_edge",
    toMapId: "default",
    x: -224,
    y: 1712,
    radius: 78,
    label: "Voltar para a vila",
    arrival: { x: 1536, y: 960 },
  },
]);

export function getPortalForPosition(
  mapId: MapId,
  x: number,
  y: number,
): MapPortalDefinition | null {
  let best: MapPortalDefinition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const portal of MAP_PORTALS) {
    if (portal.fromMapId !== mapId) {
      continue;
    }
    const distance = Math.hypot(portal.x - x, portal.y - y);
    if (distance <= portal.radius && distance < bestDistance) {
      best = portal;
      bestDistance = distance;
    }
  }
  return best;
}
