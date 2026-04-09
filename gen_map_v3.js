'use strict';

const fs = require('fs');
const path = require('path');

const { createTerrainContext, paintTerrainZones, TERRAIN } = require('./tools/starter_town_map/MapTerrainPainter');
const { applyTerrainVariationPass } = require('./tools/starter_town_map/TerrainVariationPass');
const { paintPaths, PATH } = require('./tools/starter_town_map/PathResolver');
const { placeStructures } = require('./tools/starter_town_map/StructurePlacer');
const { placeProps } = require('./tools/starter_town_map/PropPlacer');
const {
  applyGameplayNodePreservationPass,
  createResourceNodeObjects,
} = require('./tools/starter_town_map/ResourceNodePlacer');
const { validateGeneratedMap } = require('./tools/starter_town_map/MapValidationPass');
const { registry } = require('./tools/starter_town_map/TileRegistry');

const W = 128;
const H = 128;
const TILE_SIZE = 32;
const CAVE_X = 87;
const CAVE_Y = 89;
const MAP_PATH = path.resolve(__dirname, 'web-client/public/maps/starter_town/map.json');
const RUNTIME_LAYOUT_PATH = path.resolve(
  __dirname,
  'web-client/public/maps/starter_town/runtime_props/layout.json',
);

const layers = {
  ground: new Int32Array(W * H),
  ground_variation: new Int32Array(W * H),
  paths: new Int32Array(W * H),
  water: new Int32Array(W * H),
  transitions: new Int32Array(W * H),
  structures: new Int32Array(W * H),
  props: new Int32Array(W * H),
  collision: new Int32Array(W * H),
  above_player: new Int32Array(W * H),
};

function orthogonalMask(width, height, predicate, x, y) {
  let mask = 0;
  if (y > 0 && predicate(x, y - 1)) mask |= 1;
  if (x < width - 1 && predicate(x + 1, y)) mask |= 2;
  if (y < height - 1 && predicate(x, y + 1)) mask |= 4;
  if (x > 0 && predicate(x - 1, y)) mask |= 8;
  return mask;
}

function pickTransition(tiles, mask) {
  return tiles[Math.min(mask, tiles.length - 1)];
}

function resolveTransitions(context) {
  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      const index = y * context.width + x;
      if (layers.water[index] > 0) {
        continue;
      }

      if (context.pathMask[index] > 0 && context.pathMask[index] !== PATH.ROAD) {
        const roadMask = orthogonalMask(
          context.width,
          context.height,
          (nx, ny) => context.pathMask[ny * context.width + nx] === PATH.ROAD,
          x,
          y,
        );
        if (roadMask > 0) {
          layers.transitions[index] = pickTransition(registry.transitions.dirtToPath, roadMask);
        }
        continue;
      }

      if (context.pathMask[index] === 0) {
        const pathMask = orthogonalMask(
          context.width,
          context.height,
          (nx, ny) => context.pathMask[ny * context.width + nx] > 0,
          x,
          y,
        );
        if (pathMask > 0) {
          layers.transitions[index] = pickTransition(registry.transitions.grassToDirt, pathMask);
          continue;
        }
      }

      const terrain = context.terrainMask[index];
      if (terrain === TERRAIN.VILLAGE_GREEN) {
        const wildMask = orthogonalMask(
          context.width,
          context.height,
          (nx, ny) => context.terrainMask[ny * context.width + nx] === TERRAIN.WILD_GRASS,
          x,
          y,
        );
        if (wildMask > 0) {
          layers.transitions[index] = pickTransition(registry.transitions.grassToWild, wildMask);
          continue;
        }
      }

      if (terrain === TERRAIN.WILD_GRASS) {
        const forestMask = orthogonalMask(
          context.width,
          context.height,
          (nx, ny) => context.terrainMask[ny * context.width + nx] === TERRAIN.FOREST,
          x,
          y,
        );
        if (forestMask > 0) {
          layers.transitions[index] = pickTransition(registry.transitions.wildToForest, forestMask);
        }
      }
    }
  }
}

function makeLayer(name, data, id) {
  return {
    data: Array.from(data),
    height: H,
    id,
    name,
    opacity: 1,
    type: 'tilelayer',
    visible: true,
    width: W,
    x: 0,
    y: 0,
  };
}

function makeRuntimeLayout(placements) {
  return {
    generatedAt: new Date().toISOString(),
    image: 'atlas.png',
    notes:
      'Semantic starter-town runtime props layout. Tilemap layers only use the safe terrain subset; houses and props are rendered from the runtime atlas.',
    placements,
  };
}

function makeObjectLayer(name, objects, id) {
  return {
    draworder: 'topdown',
    id,
    name,
    objects,
    opacity: 1,
    type: 'objectgroup',
    visible: true,
    x: 0,
    y: 0,
  };
}

const context = createTerrainContext(W, H);
paintTerrainZones(context, layers);
paintPaths(context, layers);
applyTerrainVariationPass(context, layers);
const structurePlacements = placeStructures(context, layers);
const propPlacements = placeProps(context, layers);
const gameplayNodes = applyGameplayNodePreservationPass(layers, W);
resolveTransitions(context, layers);
const runtimePlacements = [...structurePlacements, ...propPlacements];

validateGeneratedMap(layers, runtimePlacements);

const layerOrder = [
  ['ground', layers.ground],
  ['ground_variation', layers.ground_variation],
  ['paths', layers.paths],
  ['water', layers.water],
  ['transitions', layers.transitions],
  ['structures', layers.structures],
  ['props', layers.props],
  ['collision', layers.collision],
  ['above_player', layers.above_player],
];

const resourceObjects = createResourceNodeObjects(TILE_SIZE);
const mapJson = {
  compressionlevel: -1,
  height: H,
  infinite: false,
  layers: [
    ...layerOrder.map(([name, data], index) => makeLayer(name, data, index + 1)),
    makeObjectLayer('resource_nodes', resourceObjects, layerOrder.length + 1),
  ],
  nextlayerid: layerOrder.length + 2,
  nextobjectid: resourceObjects.length + 2,
  orientation: 'orthogonal',
  properties: [
    { name: 'mapName', type: 'string', value: 'starter_town_village_forest' },
    { name: 'safeZoneCenter', type: 'string', value: '64,64' },
    { name: 'spawnZones', type: 'string', value: '60,62|68,62|64,68|58,69|70,69' },
    { name: 'caveEntrance', type: 'string', value: `${CAVE_X},${CAVE_Y}` },
  ],
  renderorder: 'right-down',
  tiledversion: '1.10.0',
  tileheight: 32,
  tilesets: [
    {
      firstgid: 1,
      name: registry.tileset.name,
      tilewidth: 32,
      tileheight: 32,
      image: registry.tileset.image,
      imagewidth: 512,
      imageheight: 352,
      columns: 16,
      tilecount: 176,
      margin: 0,
      spacing: 0,
    },
  ],
  tilewidth: 32,
  type: 'map',
  version: '1.10',
  width: W,
};

fs.writeFileSync(MAP_PATH, JSON.stringify(mapJson, null, 2));
fs.writeFileSync(RUNTIME_LAYOUT_PATH, JSON.stringify(makeRuntimeLayout(runtimePlacements), null, 2));

console.log(
  `Semantic starter town map generated with ${gameplayNodes.length} gameplay nodes and safe tile categories.`,
);
