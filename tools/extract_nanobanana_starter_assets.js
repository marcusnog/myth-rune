'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(
  ROOT,
  'Gemini_Generated_Image_k1fk25k1fk25k1fk-removebg-preview.png',
);
const OUTPUT_ROOT = path.join(
  ROOT,
  'web-client',
  'public',
  'maps',
  'starter_town',
  'nanobanana_props',
);
const DIST_OUTPUT_ROOT = path.join(
  ROOT,
  'web-client',
  'dist',
  'maps',
  'starter_town',
  'nanobanana_props',
);

const ALPHA_THRESHOLD = 16;
const MIN_WIDTH = 6;
const MIN_HEIGHT = 6;
const MIN_PIXELS = 30;
const EXTRACT_PADDING = 4;
const ATLAS_PADDING = 4;
const ATLAS_COLUMNS = 8;
const DEFAULT_ATLAS_CATEGORIES = new Set(['building', 'building_part', 'prop']);

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

function cropPng(source, bounds, padding) {
  const minX = Math.max(0, bounds.minX - padding);
  const minY = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(source.width - 1, bounds.maxX + padding);
  const maxY = Math.min(source.height - 1, bounds.maxY + padding);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = new PNG({ width, height });
  cropped.data.fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((minY + y) * source.width + (minX + x)) * 4;
      const dstIndex = (y * width + x) * 4;
      cropped.data[dstIndex] = source.data[srcIndex];
      cropped.data[dstIndex + 1] = source.data[srcIndex + 1];
      cropped.data[dstIndex + 2] = source.data[srcIndex + 2];
      cropped.data[dstIndex + 3] = source.data[srcIndex + 3];
    }
  }

  return { png: cropped, width, height };
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3];
}

function detectComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const startIndex = y * image.width + x;
      if (visited[startIndex] || alphaAt(image, x, y) < ALPHA_THRESHOLD) {
        continue;
      }

      const queue = [[x, y]];
      let queueIndex = 0;
      visited[startIndex] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      while (queueIndex < queue.length) {
        const [currentX, currentY] = queue[queueIndex++];
        count += 1;
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
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) {
            continue;
          }
          const nextIndex = nextY * image.width + nextX;
          if (visited[nextIndex] || alphaAt(image, nextX, nextY) < ALPHA_THRESHOLD) {
            continue;
          }
          visited[nextIndex] = 1;
          queue.push([nextX, nextY]);
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (width < MIN_WIDTH || height < MIN_HEIGHT || count < MIN_PIXELS) {
        continue;
      }

      components.push({
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        pixelCount: count,
        area: width * height,
      });
    }
  }

  return components.sort((left, right) => left.minY - right.minY || left.minX - right.minX);
}

function classifyComponent(component) {
  const { minX, minY, maxX, width, height, area } = component;

  if (minY >= 320 && width > 70) {
    return 'terrain_fragment';
  }
  if (minY >= 300 && maxX > 620 && width < 30 && height < 30) {
    return 'effect';
  }
  if (minX >= 380 && minY < 140) {
    return 'tree';
  }
  if (minX >= 380 && minY < 190) {
    return 'foliage';
  }
  if (minX < 340 && minY < 180) {
    return 'building_part';
  }
  if (minX < 340 && minY < 320) {
    return 'building';
  }
  if (minX >= 340 && minY < 320) {
    return 'prop';
  }
  if (minY >= 320 && area < 500) {
    return 'effect';
  }
  return 'prop';
}

function shouldExtract(category) {
  return category !== 'effect';
}

function shouldIncludeInAtlas(category) {
  return DEFAULT_ATLAS_CATEGORIES.has(category);
}

function padNumber(value) {
  return String(value).padStart(3, '0');
}

function createAtlas(entries) {
  if (entries.length === 0) {
    return null;
  }

  const maxWidth = Math.max(...entries.map((entry) => entry.extracted.width));
  const maxHeight = Math.max(...entries.map((entry) => entry.extracted.height));
  const cellWidth = Math.ceil((maxWidth + ATLAS_PADDING * 2) / 32) * 32;
  const cellHeight = Math.ceil((maxHeight + ATLAS_PADDING * 2) / 32) * 32;
  const rows = Math.ceil(entries.length / ATLAS_COLUMNS);
  const atlas = new PNG({
    width: ATLAS_COLUMNS * cellWidth,
    height: rows * cellHeight,
  });
  atlas.data.fill(0);

  const manifestEntries = [];

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

    manifestEntries.push({
      id: entry.id,
      filename: entry.filename,
      category: entry.category,
      sourceBox: entry.bounds,
      atlasCell: {
        column,
        row,
        x: column * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      },
      placedBox: {
        x: destX,
        y: destY,
        width: entry.extracted.width,
        height: entry.extracted.height,
      },
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
      items: manifestEntries,
    },
  };
}

function createPromptFile(outputRoot) {
  const prompt = `# Starter Town Props + Buildings Prompt

## Tipo de asset
\`building_asset + prop_asset\`

## Direcao visual
Create a clean production-ready atlas sheet for Myth Rune starter town props and buildings, matching a handcrafted 2D fantasy MMORPG look, top-down slight isometric MMO perspective, warm golden light from above, readable silhouettes first, controlled palette, crisp game-art readability, and no painterly blur.

## Prompt final
\`\`\`text
Create one engine-ready PNG atlas sheet for Myth Rune starter town props and buildings only. This is not concept art, not a mood board, and not a decorative mockup. It must be a clean source sheet for extraction and atlas slicing.

Visual style:
- handcrafted classic 2D fantasy MMORPG
- top-down slight isometric MMO map perspective
- warm golden light from above
- readable silhouettes first, detail second
- clean material separation
- sharper and more game-readable than painterly concept art
- no photorealism
- no glossy rendering
- no watercolor softness

Strict sheet rules:
- transparent background only
- no visible grid lines
- no black background
- no labels
- no logos
- no scene composition
- no terrain tiles
- no dirt strips
- no grass strips
- no water strips
- no road tiles
- props and buildings only
- every item isolated with breathing room around it
- all items aligned to a regular grid layout
- each item must fit cleanly inside its own cell without touching neighbors

Deliver items in a regular grid with uniform cells, suitable for automatic slicing. Use a 64x64 or 96x96 consistent cell size across the whole sheet. Keep spacing even and predictable.

Include only starter-town relevant assets such as:
- roof pieces
- wall pieces
- door and window variants
- small house variants
- village houses
- church or chapel building
- fences and gates
- wooden signposts
- notice boards
- crates
- barrels
- sacks or storage props
- well
- market table
- tent or canopy
- benches or stools
- simple market clutter

Optional but allowed if still isolated cleanly:
- trimmed bushes
- potted plants
- village decorative shrubs

Do not include:
- terrain tiles
- trees
- giant forest canopies
- water
- path transitions
- characters
- UI
- particle sparkles
- effects
- mixed background scenery

The final sheet must look like a reusable extraction sheet for a browser MMORPG starter village, with consistent scale across items and a disciplined regular grid.
\`\`\`

## Variacao
\`\`\`text
Create the same regular-grid props and buildings sheet for Myth Rune starter town, but make it slightly more medieval and utilitarian: less ornamental detail, more practical wood-and-stone construction, cleaner fence modules, simpler barrels and crates, and more consistent small-house proportions. Keep the same transparent background, regular grid, and no-terrain rule.
\`\`\`
`;

  fs.writeFileSync(path.join(outputRoot, 'prompt_round2.md'), prompt);
}

function mirrorDirectory(sourceDir, destinationDir) {
  clearDir(destinationDir);
  fs.cpSync(sourceDir, destinationDir, { recursive: true });
}

function main() {
  ensureDir(OUTPUT_ROOT);
  clearDir(OUTPUT_ROOT);

  const image = loadPng(INPUT_PATH);
  const components = detectComponents(image);

  const extractedEntries = [];
  let extractedIndex = 1;

  for (const component of components) {
    const category = classifyComponent(component);
    if (!shouldExtract(category)) {
      continue;
    }

    const categoryDir = path.join(OUTPUT_ROOT, 'extracted', category);
    ensureDir(categoryDir);

    const extracted = cropPng(image, component, EXTRACT_PADDING);
    const id = `asset_${padNumber(extractedIndex)}`;
    const filename = `${id}_${category}.png`;
    const filePath = path.join(categoryDir, filename);
    writePng(filePath, extracted.png);

    extractedEntries.push({
      id,
      filename,
      relativePath: path.relative(OUTPUT_ROOT, filePath).replace(/\\/g, '/'),
      category,
      bounds: component,
      extracted,
      includeInAtlas: shouldIncludeInAtlas(category),
    });

    extractedIndex += 1;
  }

  const atlasEntries = extractedEntries.filter((entry) => entry.includeInAtlas);
  const atlasResult = createAtlas(atlasEntries);
  if (!atlasResult) {
    throw new Error('No atlas entries were generated.');
  }

  writePng(path.join(OUTPUT_ROOT, 'props_buildings_atlas.png'), atlasResult.atlas);
  fs.writeFileSync(
    path.join(OUTPUT_ROOT, 'props_buildings_atlas.json'),
    JSON.stringify(atlasResult.manifest, null, 2),
  );

  fs.writeFileSync(
    path.join(OUTPUT_ROOT, 'extracted_manifest.json'),
    JSON.stringify(
      {
        sourceImage: path.relative(ROOT, INPUT_PATH).replace(/\\/g, '/'),
        extractedCount: extractedEntries.length,
        atlasCount: atlasEntries.length,
        categories: extractedEntries.reduce((accumulator, entry) => {
          accumulator[entry.category] = (accumulator[entry.category] || 0) + 1;
          return accumulator;
        }, {}),
        assets: extractedEntries.map((entry) => ({
          id: entry.id,
          filename: entry.filename,
          relativePath: entry.relativePath,
          category: entry.category,
          includeInAtlas: entry.includeInAtlas,
          sourceBox: entry.bounds,
          extractedSize: {
            width: entry.extracted.width,
            height: entry.extracted.height,
          },
        })),
      },
      null,
      2,
    ),
  );

  createPromptFile(OUTPUT_ROOT);
  mirrorDirectory(OUTPUT_ROOT, DIST_OUTPUT_ROOT);

  console.log(
    JSON.stringify(
      {
        outputRoot: OUTPUT_ROOT,
        distOutputRoot: DIST_OUTPUT_ROOT,
        extractedCount: extractedEntries.length,
        atlasCount: atlasEntries.length,
        atlas: atlasResult.manifest,
      },
      null,
      2,
    ),
  );
}

main();
