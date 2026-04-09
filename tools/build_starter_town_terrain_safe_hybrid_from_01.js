'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, '01.png');
const PUBLIC_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const DIST_DIR = path.join(ROOT, 'web-client', 'dist', 'maps', 'starter_town');
const ORIGINAL_PATH = path.join(PUBLIC_DIR, 'tileset_original_pre_nanobanana.png');
const ACTIVE_PATH = path.join(PUBLIC_DIR, 'tileset.png');
const OUTPUT_NAME = 'tileset_01_safe_hybrid.png';
const DEBUG_SLICES_PATH = path.join(PUBLIC_DIR, 'terrain_01_slices_debug.json');

const TILE_SIZE = 32;
const ALPHA_THRESHOLD = 16;

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function findTransparentSpans(image, axis) {
  const spans = [];
  const length = axis === 'x' ? image.width : image.height;
  const orthogonal = axis === 'x' ? image.height : image.width;

  let currentStart = null;
  let currentEnd = null;

  for (let index = 0; index < length; index++) {
    let transparentCount = 0;

    for (let other = 0; other < orthogonal; other++) {
      const x = axis === 'x' ? index : other;
      const y = axis === 'x' ? other : index;
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha < ALPHA_THRESHOLD) {
        transparentCount += 1;
      }
    }

    const isTransparentLine = transparentCount / orthogonal > 0.95;
    if (isTransparentLine) {
      if (currentStart === null) {
        currentStart = index;
      }
      currentEnd = index;
    } else if (currentStart !== null) {
      spans.push([currentStart, currentEnd]);
      currentStart = null;
      currentEnd = null;
    }
  }

  if (currentStart !== null) {
    spans.push([currentStart, currentEnd]);
  }

  return spans;
}

function spansToCells(spans, maxIndex) {
  const cells = [];
  for (let i = 0; i < spans.length - 1; i++) {
    const start = spans[i][1] + 1;
    const end = spans[i + 1][0] - 1;
    if (end >= start) {
      cells.push([start, end]);
    }
  }

  if (spans.length === 0 && maxIndex >= 0) {
    cells.push([0, maxIndex]);
  }

  return cells;
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

function cropCell(source, xRange, yRange) {
  const width = xRange[1] - xRange[0] + 1;
  const height = yRange[1] - yRange[0] + 1;
  const cell = new PNG({ width, height });
  cell.data.fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((yRange[0] + y) * source.width + (xRange[0] + x)) * 4;
      const dstIndex = (y * width + x) * 4;
      cell.data[dstIndex] = source.data[srcIndex];
      cell.data[dstIndex + 1] = source.data[srcIndex + 1];
      cell.data[dstIndex + 2] = source.data[srcIndex + 2];
      cell.data[dstIndex + 3] = source.data[srcIndex + 3];
    }
  }

  return resizeNearest(cell, TILE_SIZE, TILE_SIZE);
}

function copyTile(sourceTile, targetAtlas, column, row) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const srcIndex = (y * TILE_SIZE + x) * 4;
      const dstIndex = (((row * TILE_SIZE + y) * targetAtlas.width) + (column * TILE_SIZE + x)) * 4;
      targetAtlas.data[dstIndex] = sourceTile.data[srcIndex];
      targetAtlas.data[dstIndex + 1] = sourceTile.data[srcIndex + 1];
      targetAtlas.data[dstIndex + 2] = sourceTile.data[srcIndex + 2];
      targetAtlas.data[dstIndex + 3] = sourceTile.data[srcIndex + 3];
    }
  }
}

function sliceSourceGrid(source) {
  const columnSpans = findTransparentSpans(source, 'x');
  const rowSpans = findTransparentSpans(source, 'y');
  const cellsX = spansToCells(columnSpans, source.width - 1);
  const cellsY = spansToCells(rowSpans, source.height - 1);

  const tiles = [];
  for (let row = 0; row < cellsY.length; row++) {
    for (let col = 0; col < cellsX.length; col++) {
      tiles.push({
        row,
        col,
        xRange: cellsX[col],
        yRange: cellsY[row],
        tile: cropCell(source, cellsX[col], cellsY[row]),
      });
    }
  }

  return {
    columnSpans,
    rowSpans,
    cellsX,
    cellsY,
    tiles,
  };
}

function getTile(slices, row, col) {
  const found = slices.tiles.find((tile) => tile.row === row && tile.col === col);
  if (!found) {
    throw new Error(`Missing source tile at row ${row}, col ${col}`);
  }
  return found.tile;
}

function main() {
  const source = loadPng(SOURCE_PATH);
  const original = loadPng(ORIGINAL_PATH);
  const slices = sliceSourceGrid(source);

  const output = new PNG({ width: original.width, height: original.height });
  output.data.set(original.data);

  const replacements = [
    { dst: [0, 0], src: [0, 0] },
    { dst: [1, 0], src: [0, 1] },
    { dst: [2, 0], src: [0, 2] },
    { dst: [3, 0], src: [0, 3] },
    { dst: [4, 0], src: [0, 1] },
    { dst: [5, 0], src: [0, 2] },
    { dst: [6, 0], src: [0, 3] },
    { dst: [7, 0], src: [0, 4] },
    { dst: [8, 0], src: [1, 0] },
    { dst: [9, 0], src: [1, 1] },
    { dst: [10, 0], src: [1, 2] },
    { dst: [11, 0], src: [1, 3] },
    { dst: [12, 0], src: [1, 5] },
    { dst: [13, 0], src: [1, 6] },
    { dst: [14, 0], src: [1, 7] },
    { dst: [15, 0], src: [1, 8] },
    { dst: [0, 1], src: [2, 0] },
    { dst: [1, 1], src: [2, 1] },
    { dst: [2, 1], src: [2, 2] },
    { dst: [3, 1], src: [2, 3] },
    { dst: [4, 1], src: [2, 7] },
    { dst: [5, 1], src: [2, 8] },
    { dst: [6, 1], src: [2, 9] },
  ];

  for (const replacement of replacements) {
    const [dstCol, dstRow] = replacement.dst;
    const [srcRow, srcCol] = replacement.src;
    copyTile(getTile(slices, srcRow, srcCol), output, dstCol, dstRow);
  }

  const publicOutputPath = path.join(PUBLIC_DIR, OUTPUT_NAME);
  const distOutputPath = path.join(DIST_DIR, OUTPUT_NAME);

  writePng(publicOutputPath, output);
  writePng(distOutputPath, output);
  writePng(path.join(PUBLIC_DIR, 'tileset.png'), output);
  writePng(path.join(DIST_DIR, 'tileset.png'), output);

  fs.writeFileSync(
    DEBUG_SLICES_PATH,
    JSON.stringify(
      {
        source: path.relative(ROOT, SOURCE_PATH).replace(/\\/g, '/'),
        grid: {
          columns: slices.cellsX.length,
          rows: slices.cellsY.length,
          columnSpans: slices.columnSpans,
          rowSpans: slices.rowSpans,
          cellsX: slices.cellsX,
          cellsY: slices.cellsY,
        },
        replacements,
      },
      null,
      2,
    ),
  );
  fs.copyFileSync(DEBUG_SLICES_PATH, path.join(DIST_DIR, 'terrain_01_slices_debug.json'));

  console.log(
    JSON.stringify(
      {
        source: SOURCE_PATH,
        publicOutputPath,
        distOutputPath,
        grid: {
          columns: slices.cellsX.length,
          rows: slices.cellsY.length,
        },
        replacements,
      },
      null,
      2,
    ),
  );
}

main();
