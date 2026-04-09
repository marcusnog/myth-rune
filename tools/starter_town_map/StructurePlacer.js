'use strict';

const { registry } = require('./TileRegistry');

const HOUSE_LOTS = [
  {
    frame: 'house_wood_small_straw_a',
    tileX: 58,
    tileY: 62,
    lot: { x: 55, y: 58, width: 7, height: 6 },
    blocker: { width: 28, height: 14, offsetY: -1 },
    collision: { x: 57, y: 63, width: 3, height: 2, gid: 166 },
  },
  {
    frame: 'house_wood_medium_brown_a',
    tileX: 64,
    tileY: 59,
    lot: { x: 62, y: 55, width: 6, height: 5 },
    blocker: { width: 30, height: 14, offsetY: -1 },
    collision: { x: 63, y: 60, width: 3, height: 2, gid: 166 },
  },
  {
    frame: 'house_wood_small_tan_a',
    tileX: 70,
    tileY: 62,
    lot: { x: 68, y: 58, width: 7, height: 6 },
    blocker: { width: 28, height: 14, offsetY: -1 },
    collision: { x: 69, y: 63, width: 3, height: 2, gid: 166 },
  },
];

const SPECIAL_STRUCTURES = [
  {
    frame: 'well_stone_wood_a',
    tileX: 64,
    tileY: 64,
    blocker: { width: 20, height: 14, offsetY: -2 },
    collisionTiles: [
      [63, 64, 167],
      [64, 64, 167],
      [63, 65, 167],
      [64, 65, 167],
    ],
  },
  {
    frame: 'cave_entrance_mossy_a',
    tileX: 87,
    tileY: 89,
    blocker: { width: 34, height: 16, offsetY: -2 },
    collisionTiles: [
      [86, 89, 166],
      [87, 89, 166],
      [88, 89, 166],
    ],
  },
];

function stampClearGround(layers, width, lot) {
  for (let y = lot.y; y < lot.y + lot.height; y += 1) {
    for (let x = lot.x; x < lot.x + lot.width; x += 1) {
      layers.ground[y * width + x] = registry.terrain.grassBase[0];
      layers.ground_variation[y * width + x] = 0;
      layers.transitions[y * width + x] = 0;
    }
  }
}

function stampCollisionRect(layers, width, rect) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      layers.collision[y * width + x] = rect.gid;
    }
  }
}

function placeStructures(context, layers) {
  const placements = [];

  for (const house of HOUSE_LOTS) {
    stampClearGround(layers, context.width, house.lot);
    stampCollisionRect(layers, context.width, house.collision);
    placements.push({
      id: house.frame,
      tileX: house.tileX,
      tileY: house.tileY,
      blocker: house.blocker,
    });
  }

  for (const structure of SPECIAL_STRUCTURES) {
    for (const [x, y, gid] of structure.collisionTiles) {
      layers.collision[y * context.width + x] = gid;
    }
    placements.push({
      id: structure.frame,
      tileX: structure.tileX,
      tileY: structure.tileY,
      blocker: structure.blocker,
    });
  }

  return placements;
}

module.exports = {
  placeStructures,
};
