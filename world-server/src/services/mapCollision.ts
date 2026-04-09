import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_BOUNDS } from "../config.js";

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
    collision: collisionLayer.data.map((value) =>
      typeof value === "number" ? value : 0,
    ),
  };
}

const COLLISION_MAP = loadCollisionMap();

function clampToBounds(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(MAP_BOUNDS.maxX, Math.max(MAP_BOUNDS.minX, x)),
    y: Math.min(MAP_BOUNDS.maxY, Math.max(MAP_BOUNDS.minY, y)),
  };
}

function worldToTileX(x: number): number {
  return Math.floor((x - MAP_BOUNDS.minX) / COLLISION_MAP.tileWidth);
}

function worldToTileY(y: number): number {
  return Math.floor((y - MAP_BOUNDS.minY) / COLLISION_MAP.tileHeight);
}

function isBlockedTile(tileX: number, tileY: number): boolean {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= COLLISION_MAP.width ||
    tileY >= COLLISION_MAP.height
  ) {
    return true;
  }
  return COLLISION_MAP.collision[tileY * COLLISION_MAP.width + tileX] > 0;
}

export function isBlockedAtWorldPosition(x: number, y: number): boolean {
  const probes: ReadonlyArray<readonly [number, number]> = [
    [x, y + 16],
    [x - 9, y + 16],
    [x + 9, y + 16],
    [x, y + 8],
  ];
  return probes.some(([px, py]) => isBlockedTile(worldToTileX(px), worldToTileY(py)));
}

export function findNearestWalkablePosition(
  x: number,
  y: number,
): { x: number; y: number } {
  const clamped = clampToBounds(x, y);
  if (!isBlockedAtWorldPosition(clamped.x, clamped.y)) {
    return clamped;
  }

  const step = Math.max(8, Math.floor(COLLISION_MAP.tileWidth / 2));
  const maxRings = 12;
  for (let ring = 1; ring <= maxRings; ring += 1) {
    for (let oy = -ring; oy <= ring; oy += 1) {
      for (let ox = -ring; ox <= ring; ox += 1) {
        if (Math.abs(ox) !== ring && Math.abs(oy) !== ring) {
          continue;
        }
        const candidate = clampToBounds(
          clamped.x + ox * step,
          clamped.y + oy * step,
        );
        if (!isBlockedAtWorldPosition(candidate.x, candidate.y)) {
          return candidate;
        }
      }
    }
  }

  return clamped;
}

export function resolveWorldCollision(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const safeFrom = findNearestWalkablePosition(from.x, from.y);
  const clampedTo = clampToBounds(to.x, to.y);
  if (!isBlockedAtWorldPosition(clampedTo.x, clampedTo.y)) {
    return clampedTo;
  }

  const slideX = { x: clampedTo.x, y: safeFrom.y };
  if (!isBlockedAtWorldPosition(slideX.x, slideX.y)) {
    return slideX;
  }

  const slideY = { x: safeFrom.x, y: clampedTo.y };
  if (!isBlockedAtWorldPosition(slideY.x, slideY.y)) {
    return slideY;
  }

  for (let step = 7; step >= 1; step -= 1) {
    const ratio = step / 8;
    const candidate = {
      x: safeFrom.x + (clampedTo.x - safeFrom.x) * ratio,
      y: safeFrom.y + (clampedTo.y - safeFrom.y) * ratio,
    };
    if (!isBlockedAtWorldPosition(candidate.x, candidate.y)) {
      return candidate;
    }
  }

  return safeFrom;
}
