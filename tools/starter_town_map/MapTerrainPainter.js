'use strict';

const { registry } = require('./TileRegistry');

const TERRAIN = {
  VILLAGE_GREEN: 1,
  WILD_GRASS: 2,
  FOREST: 3,
  WATER: 4,
};

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

function paintDisc(mask, width, height, cx, cy, radius, value) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      if (distance(x, y, cx, cy) <= radius + 0.15) {
        mask[y * width + x] = value;
      }
    }
  }
}

function rng(x, y, seed = 0) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function pick(list, x, y, seed = 0) {
  return list[Math.floor(rng(x, y, seed) * list.length) % list.length];
}

function createTerrainContext(width, height) {
  return {
    width,
    height,
    terrainMask: new Uint8Array(width * height),
    waterMask: new Uint8Array(width * height),
  };
}

function paintTerrainZones(context, layers) {
  const { width, height, terrainMask, waterMask } = context;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = distance(x, y, 64, 64);
      let terrain = TERRAIN.FOREST;
      if (x >= 44 && x <= 84 && y >= 46 && y <= 82) {
        terrain = TERRAIN.VILLAGE_GREEN;
      } else if (d < 42 || (x >= 34 && x <= 94 && y >= 32 && y <= 94 && rng(x, y, 11) > 0.48)) {
        terrain = TERRAIN.WILD_GRASS;
      }
      if (y < 26 || y > 102 || x < 22 || x > 106) {
        terrain = TERRAIN.FOREST;
      }
      terrainMask[y * width + x] = terrain;
    }
  }

  paintDisc(waterMask, width, height, 19, 24, 5.2, 1);
  paintDisc(waterMask, width, height, 21, 27, 4.2, 1);

  for (let index = 0; index < terrainMask.length; index += 1) {
    const terrain = terrainMask[index];
    const gid =
      terrain === TERRAIN.VILLAGE_GREEN
        ? registry.terrain.grassBase[0]
        : terrain === TERRAIN.WILD_GRASS
          ? registry.terrain.wildGrassBase[0]
          : registry.terrain.forestBase[0];
    layers.ground[index] = gid;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (waterMask[index] === 1) {
        layers.water[index] = pick(registry.terrain.water, x, y, 5);
        layers.collision[index] = registry.collision.water[0];
        continue;
      }
      const terrain = terrainMask[index];
      const roll = rng(x, y, 77);
      if (terrain === TERRAIN.VILLAGE_GREEN && roll < 0.05) {
        layers.ground_variation[index] = pick(registry.terrain.grassVariation, x, y, 1);
      } else if (terrain === TERRAIN.WILD_GRASS && roll < 0.08) {
        layers.ground_variation[index] = pick(registry.terrain.wildGrassVariation, x, y, 2);
      } else if (terrain === TERRAIN.FOREST && roll < 0.07) {
        layers.ground_variation[index] = pick(registry.terrain.forestVariation, x, y, 3);
      }
    }
  }
}

module.exports = {
  TERRAIN,
  createTerrainContext,
  paintTerrainZones,
};
