'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = process.cwd();
const MAP_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const OUTPUT_DIR = path.join(MAP_DIR, 'runtime_resources');

const STATIC_ITEMS = [
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

const ORE_VARIANT_SHEET = path.join(
  MAP_DIR,
  'production_candidates',
  'resources',
  'reference',
  'rocks_resources_sheet.png',
);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function cropPng(source, bounds) {
  const out = new PNG({ width: bounds.width, height: bounds.height });
  out.data.fill(0);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const si = ((bounds.y + y) * source.width + (bounds.x + x)) * 4;
      const di = (y * bounds.width + x) * 4;
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }
  return out;
}

function extractOpaqueComponents(source) {
  const visited = new Uint8Array(source.width * source.height);
  const indexOf = (x, y) => y * source.width + x;
  const components = [];

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const startIndex = indexOf(x, y);
      if (visited[startIndex]) continue;
      visited[startIndex] = 1;
      if (source.data[startIndex * 4 + 3] === 0) continue;

      const stack = [[x, y]];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let pixelCount = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        pixelCount += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
          const neighborIndex = indexOf(nx, ny);
          if (visited[neighborIndex]) continue;
          visited[neighborIndex] = 1;
          if (source.data[neighborIndex * 4 + 3] === 0) continue;
          stack.push([nx, ny]);
        }
      }

      components.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixelCount,
      });
    }
  }

  return components;
}

function buildOreVariantItems() {
  const sheet = loadPng(ORE_VARIANT_SHEET);
  const clusters = extractOpaqueComponents(sheet)
    .filter((entry) => entry.width <= 40 && entry.height <= 40 && entry.pixelCount >= 250)
    .sort((left, right) => left.y - right.y || left.x - right.x);

  if (clusters.length < 3) {
    throw new Error(`Expected at least 3 ore clusters in ${ORE_VARIANT_SHEET}, found ${clusters.length}`);
  }

  return [
    {
      id: 'silver_deposit_resource_a',
      category: 'ore',
      label: 'Silver deposit resource A',
      png: cropPng(sheet, clusters[0]),
    },
    {
      id: 'iron_deposit_resource_a',
      category: 'ore',
      label: 'Iron deposit resource A',
      png: cropPng(sheet, clusters[1]),
    },
    {
      id: 'copper_deposit_resource_a',
      category: 'ore',
      label: 'Copper deposit resource A',
      png: cropPng(sheet, clusters[2]),
    },
  ];
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

  const loaded = [
    ...STATIC_ITEMS.map((item) => ({ ...item, png: loadPng(item.source) })),
    ...buildOreVariantItems(),
  ];
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
