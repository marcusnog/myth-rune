import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MapId } from "@myth-of-rune/shared";
import { getMapBounds, getNpcBlockers, getPropBlockers } from "../world/worldMaps.js";

interface RawTileLayer {
  name?: string;
  type?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

interface RawMapJson {
  tilewidth?: number;
  tileheight?: number;
  width?: number;
  height?: number;
  layers?: RawTileLayer[];
}

interface CollisionMapData {
  tileWidth: number;
  tileHeight: number;
  width: number;
  height: number;
  collision: readonly number[];
}

const FOOT_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 8],
  [-7, 8],
  [7, 8],
  [0, 12],
  [-10, 12],
  [10, 12],
  [0, 16],
  [-10, 16],
  [10, 16],
];

function loadCollisionMap(): CollisionMapData {
  const mapPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../web-client/public/maps/starter_town/map.json",
  );
  const raw = JSON.parse(readFileSync(mapPath, "utf-8")) as RawMapJson;
  const collisionLayer = raw.layers?.find(
    (layer) => layer.type === "tilelayer" && layer.name === "collision",
  );
  if (
    !collisionLayer ||
    !Array.isArray(collisionLayer.data) ||
    typeof raw.tilewidth !== "number" ||
    typeof raw.tileheight !== "number" ||
    typeof collisionLayer.width !== "number" ||
    typeof collisionLayer.height !== "number"
  ) {
    throw new Error("starter_town collision layer is missing or invalid");
  }
  return {
    tileWidth: raw.tilewidth,
    tileHeight: raw.tileheight,
    width: collisionLayer.width,
    height: collisionLayer.height,
    collision: collisionLayer.data.map((value) => (typeof value === "number" ? value : 0)),
  };
}

const COLLISION_MAP = loadCollisionMap();

function clampToBounds(mapId: MapId, x: number, y: number): { x: number; y: number } {
  const bounds = getMapBounds(mapId);
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, y)),
  };
}

function worldToTileX(mapId: MapId, x: number): number {
  return Math.floor((x - getMapBounds(mapId).minX) / COLLISION_MAP.tileWidth);
}

function worldToTileY(mapId: MapId, y: number): number {
  return Math.floor((y - getMapBounds(mapId).minY) / COLLISION_MAP.tileHeight);
}

function isBlockedTile(tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= COLLISION_MAP.width || tileY >= COLLISION_MAP.height) {
    return true;
  }
  return COLLISION_MAP.collision[tileY * COLLISION_MAP.width + tileX] > 0;
}

function isBlockedByNpc(x: number, y: number): boolean {
  for (const npc of getNpcBlockers()) {
    const dx = Math.abs(x - npc.x);
    const dy = Math.abs(y - npc.y);
    if (dx / npc.radiusX + dy / npc.radiusY <= 1) return true;
  }
  return false;
}

function isBlockedByProp(x: number, y: number): boolean {
  for (const prop of getPropBlockers()) {
    if (x >= prop.x && x <= prop.x + prop.w && y >= prop.y && y <= prop.y + prop.h) return true;
  }
  return false;
}

export function isBlockedAtWorldPosition(mapId: MapId, x: number, y: number): boolean {
  return (
    FOOT_PROBES.some(([dx, dy]) =>
      isBlockedTile(worldToTileX(mapId, x + dx), worldToTileY(mapId, y + dy)),
    ) ||
    isBlockedByNpc(x, y) ||
    isBlockedByProp(x, y)
  );
}

export function findNearestWalkablePosition(mapId: MapId, x: number, y: number): { x: number; y: number } {
  const clamped = clampToBounds(mapId, x, y);
  if (!isBlockedAtWorldPosition(mapId, clamped.x, clamped.y)) {
    return clamped;
  }

  const step = Math.max(8, Math.floor(COLLISION_MAP.tileWidth / 2));
  const maxRings = 12;
  for (let ring = 1; ring <= maxRings; ring += 1) {
    let bestCandidate: { x: number; y: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let oy = -ring; oy <= ring; oy += 1) {
      for (let ox = -ring; ox <= ring; ox += 1) {
        if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) {
          continue;
        }
        const candidate = clampToBounds(mapId, clamped.x + ox * step, clamped.y + oy * step);
        if (isBlockedAtWorldPosition(mapId, candidate.x, candidate.y)) {
          continue;
        }
        const distance = Math.hypot(candidate.x - clamped.x, candidate.y - clamped.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }
    }
    if (bestCandidate) {
      return bestCandidate;
    }
  }

  return clamped;
}

export function resolveWorldCollision(
  mapId: MapId,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const safeFrom = findNearestWalkablePosition(mapId, from.x, from.y);
  const clampedTo = clampToBounds(mapId, to.x, to.y);
  if (!isBlockedAtWorldPosition(mapId, clampedTo.x, clampedTo.y)) {
    return clampedTo;
  }

  const slideX = { x: clampedTo.x, y: from.y };
  if (!isBlockedAtWorldPosition(mapId, slideX.x, slideX.y)) {
    return slideX;
  }

  const slideY = { x: from.x, y: clampedTo.y };
  if (!isBlockedAtWorldPosition(mapId, slideY.x, slideY.y)) {
    return slideY;
  }

  for (let step = 7; step >= 1; step -= 1) {
    const ratio = step / 8;
    const candidate = {
      x: from.x + (clampedTo.x - from.x) * ratio,
      y: from.y + (clampedTo.y - from.y) * ratio,
    };
    if (!isBlockedAtWorldPosition(mapId, candidate.x, candidate.y)) {
      return candidate;
    }
  }

  return safeFrom;
}
