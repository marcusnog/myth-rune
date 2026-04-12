import type { MapId } from "@myth-of-rune/shared";
import { getMapBounds } from "../world/worldMaps.js";
import { resolveWorldCollision } from "./mapCollision.js";

/**
 * Network jitter can make client-reported positions slightly ahead of expected
 * speed*dt. Keep a small buffer and a practical floor to avoid rubber-banding.
 */
const MOVE_JITTER_BUFFER_UNITS = 10;
const MIN_ALLOWED_MOVE_UNITS_PER_TICK = 18;

export function clampToMap(mapId: MapId, x: number, y: number): { x: number; y: number } {
  const bounds = getMapBounds(mapId);
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, y)),
  };
}

/**
 * Validates that the client cannot move faster than moveSpeed * dt (seconds).
 */
export function validateMove(
  mapId: MapId,
  from: { x: number; y: number },
  to: { x: number; y: number },
  worldMoveSpeed: number,
  elapsedSeconds: number,
): { ok: true; position: { x: number; y: number }; corrected: boolean } {
  const maxDist = Math.max(
    MIN_ALLOWED_MOVE_UNITS_PER_TICK,
    elapsedSeconds * worldMoveSpeed + MOVE_JITTER_BUFFER_UNITS,
  );
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const resolvedTarget =
    dist <= maxDist + 1e-3
      ? clampToMap(mapId, to.x, to.y)
      : clampToMap(mapId, from.x + dx * (maxDist / dist), from.y + dy * (maxDist / dist));
  const position = resolveWorldCollision(mapId, from, resolvedTarget);
  const corrected =
    Math.abs(position.x - to.x) > 1e-3 || Math.abs(position.y - to.y) > 1e-3;
  return { ok: true, position, corrected };
}
