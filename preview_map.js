'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const MAP_PATH = path.join(__dirname, 'web-client/public/maps/starter_town/map.json');
const TILESET_PATH = path.join(__dirname, 'web-client/public/maps/starter_town/tileset.png');
const OUTPUT_PATH = path.join(
  __dirname,
  'web-client/public/maps/starter_town/preview_nanobanana_test.png',
);

const EXCLUDED_LAYERS = new Set(['collision']);
const SCALE_DIVISOR = 4; // 32px tiles render to 8px in the preview.

const map = require(MAP_PATH);
const tileset = PNG.sync.read(fs.readFileSync(TILESET_PATH));

const mapWidth = map.width;
const mapHeight = map.height;
const tileWidth = map.tilewidth;
const tileHeight = map.tileheight;
const previewTileWidth = Math.max(1, Math.floor(tileWidth / SCALE_DIVISOR));
const previewTileHeight = Math.max(1, Math.floor(tileHeight / SCALE_DIVISOR));

const preview = new PNG({
  width: mapWidth * previewTileWidth,
  height: mapHeight * previewTileHeight,
});
preview.data.fill(0);

function isVisibleTileLayer(layer) {
  return layer && layer.type === 'tilelayer' && layer.visible !== false && !EXCLUDED_LAYERS.has(layer.name);
}

function sampleTilePixel(tileColumn, tileRow, localX, localY) {
  const sourceX = tileColumn * tileWidth + Math.floor(((localX + 0.5) / previewTileWidth) * tileWidth);
  const sourceY = tileRow * tileHeight + Math.floor(((localY + 0.5) / previewTileHeight) * tileHeight);
  const clampedX = Math.max(0, Math.min(tileset.width - 1, sourceX));
  const clampedY = Math.max(0, Math.min(tileset.height - 1, sourceY));
  const index = (clampedY * tileset.width + clampedX) * 4;
  return [
    tileset.data[index],
    tileset.data[index + 1],
    tileset.data[index + 2],
    tileset.data[index + 3],
  ];
}

function blitTile(gid, mapX, mapY) {
  if (!gid || gid <= 0) return;
  const tileIndex = gid - 1;
  const tileColumn = tileIndex % map.tilesets[0].columns;
  const tileRow = Math.floor(tileIndex / map.tilesets[0].columns);

  if ((tileRow + 1) * tileHeight > tileset.height) {
    return;
  }

  for (let py = 0; py < previewTileHeight; py++) {
    for (let px = 0; px < previewTileWidth; px++) {
      const [r, g, b, a] = sampleTilePixel(tileColumn, tileRow, px, py);
      if (a === 0) continue;

      const destX = mapX * previewTileWidth + px;
      const destY = mapY * previewTileHeight + py;
      const destIndex = (destY * preview.width + destX) * 4;
      preview.data[destIndex] = r;
      preview.data[destIndex + 1] = g;
      preview.data[destIndex + 2] = b;
      preview.data[destIndex + 3] = 255;
    }
  }
}

for (const layer of map.layers.filter(isVisibleTileLayer)) {
  const data = layer.data || [];
  for (let tileY = 0; tileY < mapHeight; tileY++) {
    for (let tileX = 0; tileX < mapWidth; tileX++) {
      const gid = data[tileY * mapWidth + tileX] || 0;
      blitTile(gid, tileX, tileY);
    }
  }
}

fs.writeFileSync(OUTPUT_PATH, PNG.sync.write(preview));
console.log(
  JSON.stringify(
    {
      map: MAP_PATH,
      tileset: TILESET_PATH,
      output: OUTPUT_PATH,
      previewSize: {
        width: preview.width,
        height: preview.height,
      },
      previewTileSize: {
        width: previewTileWidth,
        height: previewTileHeight,
      },
    },
    null,
    2,
  ),
);
