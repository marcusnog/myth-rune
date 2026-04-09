import { MAP_BOUNDS } from "../config.js";

/**
 * Network jitter can make client-reported positions slightly ahead of expected
 * speed*dt. Keep a small buffer and a practical floor to avoid rubber-banding.
 */
const MOVE_JITTER_BUFFER_UNITS = 10;
const MIN_ALLOWED_MOVE_UNITS_PER_TICK = 18;

export function clampToMap(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(MAP_BOUNDS.maxX, Math.max(MAP_BOUNDS.minX, x)),
    y: Math.min(MAP_BOUNDS.maxY, Math.max(MAP_BOUNDS.minY, y)),
  };
}

/**
 * Validates that the client cannot move faster than moveSpeed * dt (seconds).
 */
export function validateMove(
  from: { x: number; y: number },
  to: { x: number; y: number },
  worldMoveSpeed: number,
  elapsedSeconds: number,
): { ok: boolean; position: { x: number; y: number } } {
  const maxDist = Math.max(
    MIN_ALLOWED_MOVE_UNITS_PER_TICK,
    elapsedSeconds * worldMoveSpeed + MOVE_JITTER_BUFFER_UNITS,
  );
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDist + 1e-3) {
    return { ok: true, position: clampToMap(to.x, to.y) };
  }
  const scale = maxDist / dist;
  const nx = from.x + dx * scale;
  const ny = from.y + dy * scale;
  return { ok: true, position: clampToMap(nx, ny) };
}
