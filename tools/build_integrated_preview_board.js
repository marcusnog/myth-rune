'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const DIST_DIR = path.join(ROOT, 'web-client', 'dist', 'maps', 'starter_town');

const BOARD_PATH = path.join(PUBLIC_DIR, 'starter_town_integrated_preview_board.png');
const DIST_BOARD_PATH = path.join(DIST_DIR, 'starter_town_integrated_preview_board.png');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'starter_town_integrated_preview_board.json');
const DIST_MANIFEST_PATH = path.join(DIST_DIR, 'starter_town_integrated_preview_board.json');

const BOARD_WIDTH = 2600;
const BOARD_HEIGHT = 1900;
const PANEL_BG = [20, 24, 22, 255];
const PANEL_STROKE = [88, 104, 90, 255];
const BOARD_BG = [10, 14, 13, 255];

const SLOTS = [
  {
    id: 'main_map_preview',
    source: path.join(PUBLIC_DIR, 'preview_nanobanana_test.png'),
    x: 40, y: 40, width: 1500, height: 1500,
    fit: 'contain',
  },
  {
    id: 'terrain_hybrid_04',
    source: path.join(PUBLIC_DIR, 'nanobanana_04', 'tileset_04_safe_hybrid.png'),
    x: 1580, y: 40, width: 470, height: 300,
    fit: 'contain',
  },
  {
    id: 'props_atlas_04',
    source: path.join(PUBLIC_DIR, 'nanobanana_04', 'props_buildings_atlas.png'),
    x: 2090, y: 40, width: 470, height: 300,
    fit: 'contain',
  },
  {
    id: 'trees_foliage_02',
    source: path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', 'trees_foliage_sheet.png'),
    x: 1580, y: 380, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'resources_02',
    source: path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', 'rocks_resources_sheet.png'),
    x: 2090, y: 380, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'props_atlas_03',
    source: path.join(PUBLIC_DIR, 'nanobanana_03', 'props_buildings_atlas.png'),
    x: 1580, y: 670, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'terrain_hybrid_01',
    source: path.join(PUBLIC_DIR, 'tileset_01_safe_hybrid.png'),
    x: 2090, y: 670, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'terrain_source_04',
    source: path.join(PUBLIC_DIR, 'nanobanana_04', 'terrain_source.png'),
    x: 1580, y: 960, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'props_source_04',
    source: path.join(PUBLIC_DIR, 'nanobanana_04', 'props_source.png'),
    x: 2090, y: 960, width: 470, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_mros',
    source: path.join(ROOT, 'Gemini_Generated_Image_mrosl5mrosl5mros.png'),
    x: 40, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_k1fk',
    source: path.join(ROOT, 'Gemini_Generated_Image_k1fk25k1fk25k1fk-removebg-preview.png'),
    x: 350, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_qthq',
    source: path.join(ROOT, 'Gemini_Generated_Image_qthqiyqthqiyqthq-removebg-preview.png'),
    x: 660, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_chatgpt_board',
    source: path.join(ROOT, 'ChatGPT Image 9 de abr. de 2026, 01_39_34.png'),
    x: 970, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_01',
    source: path.join(ROOT, '01.png'),
    x: 1280, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_02',
    source: path.join(ROOT, '02.png'),
    x: 1590, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_03',
    source: path.join(ROOT, '03.png'),
    x: 1900, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
  {
    id: 'source_04',
    source: path.join(ROOT, '04.png'),
    x: 2210, y: 1590, width: 290, height: 250,
    fit: 'contain',
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function createCanvas(width, height, rgba) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return png;
}

function drawRect(target, x, y, width, height, rgba) {
  const startX = Math.max(0, x);
  const startY = Math.max(0, y);
  const endX = Math.min(target.width, x + width);
  const endY = Math.min(target.height, y + height);
  for (let py = startY; py < endY; py++) {
    for (let px = startX; px < endX; px++) {
      const index = (py * target.width + px) * 4;
      target.data[index] = rgba[0];
      target.data[index + 1] = rgba[1];
      target.data[index + 2] = rgba[2];
      target.data[index + 3] = rgba[3];
    }
  }
}

function drawPanel(target, x, y, width, height) {
  drawRect(target, x, y, width, height, PANEL_BG);
  drawRect(target, x, y, width, 2, PANEL_STROKE);
  drawRect(target, x, y + height - 2, width, 2, PANEL_STROKE);
  drawRect(target, x, y, 2, height, PANEL_STROKE);
  drawRect(target, x + width - 2, y, 2, height, PANEL_STROKE);
}

function blitScaled(source, target, box) {
  const margin = 12;
  const innerWidth = Math.max(1, box.width - margin * 2);
  const innerHeight = Math.max(1, box.height - margin * 2);
  const scale = Math.min(innerWidth / source.width, innerHeight / source.height);
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));
  const offsetX = box.x + Math.floor((box.width - width) / 2);
  const offsetY = box.y + Math.floor((box.height - height) / 2);

  for (let y = 0; y < height; y++) {
    const sourceY = Math.max(0, Math.min(source.height - 1, Math.floor((y / height) * source.height)));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.max(0, Math.min(source.width - 1, Math.floor((x / width) * source.width)));
      const srcIndex = (sourceY * source.width + sourceX) * 4;
      const alpha = source.data[srcIndex + 3];
      if (alpha === 0) continue;

      const dstX = offsetX + x;
      const dstY = offsetY + y;
      if (dstX < 0 || dstY < 0 || dstX >= target.width || dstY >= target.height) continue;
      const dstIndex = (dstY * target.width + dstX) * 4;

      target.data[dstIndex] = source.data[srcIndex];
      target.data[dstIndex + 1] = source.data[srcIndex + 1];
      target.data[dstIndex + 2] = source.data[srcIndex + 2];
      target.data[dstIndex + 3] = 255;
    }
  }

  return {
    x: offsetX,
    y: offsetY,
    width,
    height,
  };
}

function main() {
  ensureDir(path.dirname(BOARD_PATH));
  const board = createCanvas(BOARD_WIDTH, BOARD_HEIGHT, BOARD_BG);
  const manifest = {
    board: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
    },
    slots: [],
  };

  for (const slot of SLOTS) {
    drawPanel(board, slot.x, slot.y, slot.width, slot.height);
    const image = loadPng(slot.source);
    const placed = blitScaled(image, board, slot);
    manifest.slots.push({
      id: slot.id,
      source: path.relative(ROOT, slot.source).replace(/\\/g, '/'),
      panel: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
      placed,
      sourceSize: { width: image.width, height: image.height },
    });
  }

  fs.writeFileSync(BOARD_PATH, PNG.sync.write(board));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  fs.copyFileSync(BOARD_PATH, DIST_BOARD_PATH);
  fs.copyFileSync(MANIFEST_PATH, DIST_MANIFEST_PATH);

  console.log(JSON.stringify({
    board: BOARD_PATH,
    manifest: MANIFEST_PATH,
    slots: manifest.slots.length,
  }, null, 2));
}

main();
