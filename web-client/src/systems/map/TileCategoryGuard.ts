import Phaser from "phaser";
import {
  getStarterTownAllowedRuntimeFrames,
  getStarterTownForbiddenTiles,
  getStarterTownLayerWhitelist,
} from "./TileRegistry";

const CANONICAL_LAYERS = [
  "ground",
  "ground_variation",
  "paths",
  "water",
  "transitions",
  "structures",
  "props",
  "collision",
  "above_player",
] as const;

export function assertStarterTownTilemapIsSafe(
  tilemap: Phaser.Tilemaps.Tilemap,
): void {
  const forbidden = getStarterTownForbiddenTiles();

  for (const layerName of CANONICAL_LAYERS) {
    const mapLayer = tilemap.layers.find((layer) => layer.name === layerName);
    if (!mapLayer) {
      continue;
    }
    const whitelist = getStarterTownLayerWhitelist(layerName);
    for (const row of mapLayer.data) {
      for (const tile of row) {
        const gid = tile.index;
        if (gid <= 0) {
          continue;
        }
        if (forbidden.has(gid)) {
          throw new Error(
            `starter_town layer '${layerName}' is using forbidden gid ${gid}.`,
          );
        }
        if (!whitelist.has(gid)) {
          throw new Error(
            `starter_town layer '${layerName}' is using non-whitelisted gid ${gid}.`,
          );
        }
      }
    }
  }
}

export function assertStarterTownRuntimePropFrameIsSafe(frameId: string): void {
  if (!getStarterTownAllowedRuntimeFrames().has(frameId)) {
    throw new Error(`starter_town runtime prop frame '${frameId}' is not whitelisted.`);
  }
}
