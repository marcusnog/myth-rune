'use strict';

const { registry } = require('./TileRegistry');

function rng(x, y, seed = 0) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function pick(list, x, y, seed = 0) {
  return list[Math.floor(rng(x, y, seed) * list.length) % list.length];
}

function paintPatch(layers, width, x0, y0, radius, allowedGround, variations, seed) {
  for (let y = y0 - radius; y <= y0 + radius; y += 1) {
    for (let x = x0 - radius; x <= x0 + radius; x += 1) {
      if (x < 0 || y < 0) {
        continue;
      }
      const index = y * width + x;
      if (!allowedGround.has(layers.ground[index]) || layers.water[index] > 0 || layers.paths[index] > 0) {
        continue;
      }
      const distance = Math.hypot(x - x0, y - y0);
      if (distance <= radius - 0.35 + rng(x, y, seed) * 0.4) {
        layers.ground_variation[index] = pick(variations, x, y, seed + 5);
      }
    }
  }
}

function applyTerrainVariationPass(context, layers) {
  const grassBase = new Set(registry.terrain.grassBase);
  const wildBase = new Set(registry.terrain.wildGrassBase);
  const forestBase = new Set(registry.terrain.forestBase);

  for (let y = 6; y < context.height - 6; y += 4) {
    for (let x = 6; x < context.width - 6; x += 4) {
      const roll = rng(x, y, 101);
      if (roll < 0.07) {
        paintPatch(layers, context.width, x, y, 2, grassBase, registry.terrain.grassVariation, 101);
      } else if (roll < 0.14) {
        paintPatch(layers, context.width, x, y, 2, wildBase, registry.terrain.wildGrassVariation, 202);
      } else if (roll < 0.2) {
        paintPatch(layers, context.width, x, y, 2, forestBase, registry.terrain.forestVariation, 303);
      }
    }
  }
}

module.exports = {
  applyTerrainVariationPass,
};
