'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, '03.png');

const PUBLIC_MAP_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const DIST_MAP_DIR = path.join(ROOT, 'web-client', 'dist', 'maps', 'starter_town');

const OUTPUT_ROOT = path.join(PUBLIC_MAP_DIR, 'nanobanana_03');
const DIST_OUTPUT_ROOT = path.join(DIST_MAP_DIR, 'nanobanana_03');

const ORIGINAL_TILESET_PATH = path.join(PUBLIC_MAP_DIR, 'tileset_original_pre_nanobanana.png');
const ACTIVE_TILESET_PATH = path.join(PUBLIC_MAP_DIR, 'tileset.png');
const HYBRID_OUTPUT_NAME = 'tileset_03_safe_hybrid.png';

const TILE_SIZE = 32;
const ALPHA_THRESHOLD = 16;
const EXTRACT_PADDING = 4;
const ATLAS_PADDING = 6;
const ATLAS_COLUMNS = 8;

const TERRAIN_SOURCE_BOX = { x: 5, y: 7, width: 603, height: 194 };
const PROPS_SOURCE_BOX = { x: 0, y: 206, width: 612, height: 192 };

const TERRAIN_ROWS = [
  [0, 43],
  [50, 93],
  [99, 143],
  [149, 193],
];

const TERRAIN_COLS = [
  [1, 45],
  [50, 93],
  [98, 142],
  [147, 190],
  [195, 239],
  [245, 288],
  [293, 337],
  [342, 402],
  [407, 452],
  [458, 501],
  [507, 552],
  [558, 600],
];

const TERRAIN_REPLACEMENTS = [
  { dst: [0, 0], src: [0, 0], label: 'grass_light_0' },
  { dst: [1, 0], src: [0, 1], label: 'grass_light_1' },
  { dst: [2, 0], src: [0, 2], label: 'grass_light_2' },
  { dst: [3, 0], src: [0, 3], label: 'grass_light_3' },
  { dst: [4, 0], src: [0, 4], label: 'grass_dark_0' },
  { dst: [5, 0], src: [0, 5], label: 'grass_dark_1' },
  { dst: [6, 0], src: [0, 6], label: 'grass_dark_2' },
  { dst: [7, 0], src: [0, 7], label: 'grass_dark_3' },
  { dst: [8, 0], src: [1, 0], label: 'dirt_0' },
  { dst: [9, 0], src: [1, 1], label: 'dirt_1' },
  { dst: [10, 0], src: [1, 2], label: 'dirt_2' },
  { dst: [11, 0], src: [1, 3], label: 'dirt_3' },
  { dst: [12, 0], src: [2, 4], label: 'road_0' },
  { dst: [13, 0], src: [2, 5], label: 'road_1' },
  { dst: [14, 0], src: [2, 6], label: 'road_2' },
  { dst: [15, 0], src: [2, 5], label: 'road_3' },
  { dst: [0, 1], src: [2, 0], label: 'forest_floor_0' },
  { dst: [1, 1], src: [2, 1], label: 'forest_floor_1' },
  { dst: [2, 1], src: [2, 2], label: 'forest_floor_2' },
  { dst: [3, 1], src: [2, 3], label: 'forest_floor_3' },
  { dst: [4, 1], src: [1, 8], label: 'water_0' },
  { dst: [5, 1], src: [1, 9], label: 'water_1' },
  { dst: [6, 1], src: [1, 10], label: 'water_2' },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function cropRegion(source, box) {
  const output = new PNG({ width: box.width, height: box.height });
  output.data.fill(0);

  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const srcX = box.x + x;
      const srcY = box.y + y;
      if (srcX < 0 || srcY < 0 || srcX >= source.width || srcY >= source.height) {
        continue;
      }
      const srcIndex = (srcY * source.width + srcX) * 4;
      const dstIndex = (y * output.width + x) * 4;
      output.data[dstIndex] = source.data[srcIndex];
      output.data[dstIndex + 1] = source.data[srcIndex + 1];
      output.data[dstIndex + 2] = source.data[srcIndex + 2];
      output.data[dstIndex + 3] = source.data[srcIndex + 3];
    }
  }

  return output;
}

function trimTransparent(image, padding) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return image;
  }

  const box = {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(image.width - 1, maxX + padding) - Math.max(0, minX - padding) + 1,
    height: Math.min(image.height - 1, maxY + padding) - Math.max(0, minY - padding) + 1,
  };

  return cropRegion(image, box);
}

function resizeNearest(source, width, height) {
  const output = new PNG({ width, height });
  output.data.fill(0);

  for (let y = 0; y < height; y++) {
    const sourceY = Math.max(0, Math.min(source.height - 1, Math.floor((y / height) * source.height)));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.max(0, Math.min(source.width - 1, Math.floor((x / width) * source.width)));
      const srcIndex = (sourceY * source.width + sourceX) * 4;
      const dstIndex = (y * width + x) * 4;
      output.data[dstIndex] = source.data[srcIndex];
      output.data[dstIndex + 1] = source.data[srcIndex + 1];
      output.data[dstIndex + 2] = source.data[srcIndex + 2];
      output.data[dstIndex + 3] = source.data[srcIndex + 3];
    }
  }

  return output;
}

function cropTerrainCell(source, rowIndex, colIndex) {
  const yRange = TERRAIN_ROWS[rowIndex];
  const xRange = TERRAIN_COLS[colIndex];
  const cell = cropRegion(source, {
    x: xRange[0],
    y: yRange[0],
    width: xRange[1] - xRange[0] + 1,
    height: yRange[1] - yRange[0] + 1,
  });
  return resizeNearest(cell, TILE_SIZE, TILE_SIZE);
}

function copyTile(tile, atlas, column, row) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const srcIndex = (y * TILE_SIZE + x) * 4;
      const dstIndex = (((row * TILE_SIZE + y) * atlas.width) + (column * TILE_SIZE + x)) * 4;
      atlas.data[dstIndex] = tile.data[srcIndex];
      atlas.data[dstIndex + 1] = tile.data[srcIndex + 1];
      atlas.data[dstIndex + 2] = tile.data[srcIndex + 2];
      atlas.data[dstIndex + 3] = tile.data[srcIndex + 3];
    }
  }
}

function detectComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const startIndex = y * image.width + x;
      const alpha = image.data[startIndex * 4 + 3];
      if (visited[startIndex] || alpha < ALPHA_THRESHOLD) continue;

      const queue = [[x, y]];
      let queueIndex = 0;
      visited[startIndex] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      while (queueIndex < queue.length) {
        const [currentX, currentY] = queue[queueIndex++];
        pixelCount += 1;
        if (currentX < minX) minX = currentX;
        if (currentX > maxX) maxX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;

        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ];

        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue;
          const nextIndex = nextY * image.width + nextX;
          const nextAlpha = image.data[nextIndex * 4 + 3];
          if (visited[nextIndex] || nextAlpha < ALPHA_THRESHOLD) continue;
          visited[nextIndex] = 1;
          queue.push([nextX, nextY]);
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (pixelCount < 80 || width < 6 || height < 6) continue;

      components.push({
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        pixelCount,
        area: width * height,
      });
    }
  }

  return components.sort((left, right) => left.minY - right.minY || left.minX - right.minX);
}

function classifyPropComponent(component) {
  if (component.width >= 70 || component.height >= 70 || component.area >= 4200) {
    return 'building';
  }
  if (component.width >= 42 || component.height >= 42 || component.area >= 1300) {
    return 'large_prop';
  }
  return 'prop';
}

function createAtlas(entries) {
  if (!entries.length) {
    return null;
  }

  const maxWidth = Math.max(...entries.map((entry) => entry.extracted.width));
  const maxHeight = Math.max(...entries.map((entry) => entry.extracted.height));
  const cellWidth = Math.ceil((maxWidth + ATLAS_PADDING * 2) / 32) * 32;
  const cellHeight = Math.ceil((maxHeight + ATLAS_PADDING * 2) / 32) * 32;
  const rows = Math.ceil(entries.length / ATLAS_COLUMNS);
  const atlas = new PNG({ width: ATLAS_COLUMNS * cellWidth, height: rows * cellHeight });
  atlas.data.fill(0);

  const items = [];

  entries.forEach((entry, index) => {
    const column = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    const destX = column * cellWidth + Math.floor((cellWidth - entry.extracted.width) / 2);
    const destY = row * cellHeight + Math.floor((cellHeight - entry.extracted.height) / 2);

    for (let y = 0; y < entry.extracted.height; y++) {
      for (let x = 0; x < entry.extracted.width; x++) {
        const srcIndex = (y * entry.extracted.width + x) * 4;
        const alpha = entry.extracted.png.data[srcIndex + 3];
        if (alpha === 0) continue;
        const dstIndex = ((destY + y) * atlas.width + (destX + x)) * 4;
        atlas.data[dstIndex] = entry.extracted.png.data[srcIndex];
        atlas.data[dstIndex + 1] = entry.extracted.png.data[srcIndex + 1];
        atlas.data[dstIndex + 2] = entry.extracted.png.data[srcIndex + 2];
        atlas.data[dstIndex + 3] = alpha;
      }
    }

    items.push({
      id: entry.id,
      filename: entry.filename,
      category: entry.category,
      sourceBox: entry.bounds,
      atlasCell: { column, row, x: column * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight },
      placedBox: { x: destX, y: destY, width: entry.extracted.width, height: entry.extracted.height },
    });
  });

  return {
    atlas,
    manifest: {
      image: 'props_buildings_atlas.png',
      cellWidth,
      cellHeight,
      columns: ATLAS_COLUMNS,
      rows,
      itemCount: entries.length,
      items,
    },
  };
}

function buildTerrainHybrid(terrainSource) {
  const original = loadPng(ORIGINAL_TILESET_PATH);
  const output = new PNG({ width: original.width, height: original.height });
  output.data.set(original.data);

  for (const replacement of TERRAIN_REPLACEMENTS) {
    const [dstCol, dstRow] = replacement.dst;
    const [srcRow, srcCol] = replacement.src;
    copyTile(cropTerrainCell(terrainSource, srcRow, srcCol), output, dstCol, dstRow);
  }

  return output;
}

function extractProps(propsSource, outputRoot) {
  const extractedRoot = path.join(outputRoot, 'extracted');
  ensureDir(extractedRoot);

  const components = detectComponents(propsSource).filter((component) => component.maxY >= 8);
  const entries = [];
  let index = 1;

  for (const component of components) {
    const category = classifyPropComponent(component);
    const categoryDir = path.join(extractedRoot, category);
    ensureDir(categoryDir);

    const extractedPng = trimTransparent(
      cropRegion(propsSource, {
        x: Math.max(0, component.minX - EXTRACT_PADDING),
        y: Math.max(0, component.minY - EXTRACT_PADDING),
        width: Math.min(propsSource.width - 1, component.maxX + EXTRACT_PADDING) - Math.max(0, component.minX - EXTRACT_PADDING) + 1,
        height: Math.min(propsSource.height - 1, component.maxY + EXTRACT_PADDING) - Math.max(0, component.minY - EXTRACT_PADDING) + 1,
      }),
      0,
    );

    const id = `asset_${String(index).padStart(3, '0')}`;
    const filename = `${id}_${category}.png`;
    const outPath = path.join(categoryDir, filename);
    writePng(outPath, extractedPng);

    entries.push({
      id,
      filename,
      relativePath: path.relative(outputRoot, outPath).replace(/\\/g, '/'),
      category,
      bounds: component,
      extracted: {
        png: extractedPng,
        width: extractedPng.width,
        height: extractedPng.height,
      },
    });

    index += 1;
  }

  const atlasResult = createAtlas(entries);
  if (atlasResult) {
    writePng(path.join(outputRoot, 'props_buildings_atlas.png'), atlasResult.atlas);
    fs.writeFileSync(
      path.join(outputRoot, 'props_buildings_atlas.json'),
      JSON.stringify(atlasResult.manifest, null, 2),
    );
  }

  fs.writeFileSync(
    path.join(outputRoot, 'extracted_manifest.json'),
    JSON.stringify(
      {
        sourceImage: path.relative(ROOT, SOURCE_PATH).replace(/\\/g, '/'),
        sourceRegion: PROPS_SOURCE_BOX,
        extractedCount: entries.length,
        categories: entries.reduce((accumulator, entry) => {
          accumulator[entry.category] = (accumulator[entry.category] || 0) + 1;
          return accumulator;
        }, {}),
        assets: entries.map((entry) => ({
          id: entry.id,
          filename: entry.filename,
          relativePath: entry.relativePath,
          category: entry.category,
          sourceBox: entry.bounds,
          extractedSize: { width: entry.extracted.width, height: entry.extracted.height },
        })),
      },
      null,
      2,
    ),
  );

  return {
    components,
    entries,
  };
}

function mirrorDirectory(sourceDir, destinationDir) {
  clearDir(destinationDir);
  fs.cpSync(sourceDir, destinationDir, { recursive: true });
}

function main() {
  clearDir(OUTPUT_ROOT);

  const source = loadPng(SOURCE_PATH);
  const terrainSource = trimTransparent(cropRegion(source, TERRAIN_SOURCE_BOX), 0);
  const propsSource = trimTransparent(cropRegion(source, PROPS_SOURCE_BOX), 0);

  writePng(path.join(OUTPUT_ROOT, 'terrain_source.png'), terrainSource);
  writePng(path.join(OUTPUT_ROOT, 'props_source.png'), propsSource);

  const terrainHybrid = buildTerrainHybrid(terrainSource);
  writePng(path.join(OUTPUT_ROOT, HYBRID_OUTPUT_NAME), terrainHybrid);
  writePng(path.join(PUBLIC_MAP_DIR, HYBRID_OUTPUT_NAME), terrainHybrid);
  writePng(path.join(PUBLIC_MAP_DIR, 'tileset.png'), terrainHybrid);
  writePng(path.join(DIST_MAP_DIR, HYBRID_OUTPUT_NAME), terrainHybrid);
  writePng(path.join(DIST_MAP_DIR, 'tileset.png'), terrainHybrid);

  const propsResult = extractProps(propsSource, OUTPUT_ROOT);

  fs.writeFileSync(
    path.join(OUTPUT_ROOT, 'terrain_mapping_debug.json'),
    JSON.stringify(
      {
        source: path.relative(ROOT, SOURCE_PATH).replace(/\\/g, '/'),
        terrainSourceBox: TERRAIN_SOURCE_BOX,
        propsSourceBox: PROPS_SOURCE_BOX,
        terrainGrid: {
          rows: TERRAIN_ROWS,
          cols: TERRAIN_COLS,
        },
        replacements: TERRAIN_REPLACEMENTS,
        extractedPropsCount: propsResult.entries.length,
      },
      null,
      2,
    ),
  );

  mirrorDirectory(OUTPUT_ROOT, DIST_OUTPUT_ROOT);

  console.log(
    JSON.stringify(
      {
        outputRoot: OUTPUT_ROOT,
        distOutputRoot: DIST_OUTPUT_ROOT,
        terrainSource: path.join(OUTPUT_ROOT, 'terrain_source.png'),
        propsSource: path.join(OUTPUT_ROOT, 'props_source.png'),
        hybrid: path.join(PUBLIC_MAP_DIR, HYBRID_OUTPUT_NAME),
        extractedPropsCount: propsResult.entries.length,
      },
      null,
      2,
    ),
  );
}

main();
