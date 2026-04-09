'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = process.cwd();
const MAP_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const OUTPUT_DIR = path.join(MAP_DIR, 'runtime_resources');

const ITEMS = [
  {
    id: 'oak_tree_resource_a',
    category: 'tree',
    label: 'Oak tree resource A',
    source: path.join(
      MAP_DIR,
      'nanobanana_props',
      'extracted',
      'tree',
      'asset_007_tree.png',
    ),
  },
  {
    id: 'oak_tree_resource_b',
    category: 'tree',
    label: 'Oak tree resource B',
    source: path.join(
      MAP_DIR,
      'nanobanana_props',
      'extracted',
      'tree',
      'asset_037_tree.png',
    ),
  },
  {
    id: 'pine_tree_resource_a',
    category: 'tree',
    label: 'Pine tree resource A',
    source: path.join(
      MAP_DIR,
      'nanobanana_props',
      'extracted',
      'tree',
      'asset_006_tree.png',
    ),
  },
  {
    id: 'stone_deposit_resource_a',
    category: 'ore',
    label: 'Stone deposit resource A',
    source: path.join(
      MAP_DIR,
      'production_candidates',
      'props_buildings',
      'renamed',
      'large_prop',
      'rock_cluster_small_a.png',
    ),
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function copyPng(source, dest, dx, dy) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const si = (y * source.width + x) * 4;
      const di = ((dy + y) * dest.width + (dx + x)) * 4;
      dest.data[di] = source.data[si];
      dest.data[di + 1] = source.data[si + 1];
      dest.data[di + 2] = source.data[si + 2];
      dest.data[di + 3] = source.data[si + 3];
    }
  }
}

function main() {
  ensureDir(OUTPUT_DIR);

  const loaded = ITEMS.map((item) => ({ ...item, png: loadPng(item.source) }));
  const padding = 12;
  const width = loaded.reduce((sum, item) => sum + item.png.width, 0) + padding * (loaded.length + 1);
  const height = Math.max(...loaded.map((item) => item.png.height)) + padding * 2;
  const atlas = new PNG({ width, height });
  atlas.data.fill(0);

  let cursorX = padding;
  const items = {};
  for (const item of loaded) {
    const y = height - padding - item.png.height;
    copyPng(item.png, atlas, cursorX, y);
    items[item.id] = {
      category: item.category,
      label: item.label,
      x: cursorX,
      y,
      width: item.png.width,
      height: item.png.height,
    };
    cursorX += item.png.width + padding;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'atlas.png'), PNG.sync.write(atlas));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'atlas.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        image: 'atlas.png',
        items,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'README.md'),
    [
      '# Runtime Resource Atlas',
      '',
      '- dedicated atlas for gameplay resource nodes',
      '- keeps trees and ore visuals out of the terrain tileset',
      '- source images are reused from existing starter_town assets',
    ].join('\n'),
  );
  console.log('runtime resource atlas generated');
}

main();
