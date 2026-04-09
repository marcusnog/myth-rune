'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, '02.png');
const OUTPUT_ROOT = path.join(
  ROOT,
  'web-client',
  'public',
  'maps',
  'starter_town',
  'reference_boards',
  '02_blocks',
);
const DIST_OUTPUT_ROOT = path.join(
  ROOT,
  'web-client',
  'dist',
  'maps',
  'starter_town',
  'reference_boards',
  '02_blocks',
);

const ALPHA_THRESHOLD = 16;
const TRIM_PADDING = 4;

const BLOCKS = [
  {
    id: 'terrain_overview_top',
    kind: 'terrain_reference',
    box: { x: 0, y: 33, width: 606, height: 252 },
    note: 'Top mixed terrain block with roads, ponds, plazas, forest edge and ground chunks.',
  },
  {
    id: 'terrain_path_water_left',
    kind: 'terrain_reference',
    box: { x: 0, y: 33, width: 170, height: 110 },
    note: 'Path and bridge composition reference from the upper-left area.',
  },
  {
    id: 'terrain_pond_center',
    kind: 'terrain_reference',
    box: { x: 168, y: 33, width: 138, height: 112 },
    note: 'Central pond and shoreline reference block.',
  },
  {
    id: 'terrain_plaza_center',
    kind: 'terrain_reference',
    box: { x: 331, y: 33, width: 110, height: 110 },
    note: 'Stone plaza and village-road composition reference.',
  },
  {
    id: 'terrain_forest_mine_right',
    kind: 'terrain_reference',
    box: { x: 470, y: 33, width: 136, height: 110 },
    note: 'Forest floor and mine/resource composition reference from the upper-right area.',
  },
  {
    id: 'terrain_ground_variants_bottom',
    kind: 'terrain_reference',
    box: { x: 0, y: 140, width: 606, height: 145 },
    note: 'Bottom terrain block with grass, paths, water borders and town-road variants.',
  },
  {
    id: 'trees_foliage_sheet',
    kind: 'foliage_reference',
    box: { x: 0, y: 310, width: 135, height: 102 },
    note: 'Trees and foliage reference group.',
  },
  {
    id: 'rocks_resources_sheet',
    kind: 'resource_reference',
    box: { x: 136, y: 310, width: 134, height: 82 },
    note: 'Rocks, ore clusters and cave reference group.',
  },
  {
    id: 'props_utilities_sheet',
    kind: 'props_reference',
    box: { x: 271, y: 275, width: 335, height: 137 },
    note: 'Village props, fences, tools, utility objects and small clutter.',
  },
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

function trimTransparentBounds(image, padding) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha < ALPHA_THRESHOLD) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return image;
  }

  const paddedMinX = Math.max(0, minX - padding);
  const paddedMinY = Math.max(0, minY - padding);
  const paddedMaxX = Math.min(image.width - 1, maxX + padding);
  const paddedMaxY = Math.min(image.height - 1, maxY + padding);
  const width = paddedMaxX - paddedMinX + 1;
  const height = paddedMaxY - paddedMinY + 1;

  const output = new PNG({ width, height });
  output.data.fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = ((paddedMinY + y) * image.width + (paddedMinX + x)) * 4;
      const dstIndex = (y * output.width + x) * 4;
      output.data[dstIndex] = image.data[srcIndex];
      output.data[dstIndex + 1] = image.data[srcIndex + 1];
      output.data[dstIndex + 2] = image.data[srcIndex + 2];
      output.data[dstIndex + 3] = image.data[srcIndex + 3];
    }
  }

  return output;
}

function createPromptFiles(outputRoot) {
  const resourcePrompt = `# Starter Town Resource Node Prompt

## Tipo de asset
\`resource_node\`

## Direcao visual
Create gatherable resource nodes for Myth Rune starter areas, matching the warm top-down fantasy MMORPG look seen in the current village references: readable silhouettes, clean material separation, slightly painterly but still gameplay-first, and consistent scale with the existing starter-town map.

## Prompt final
\`\`\`text
Create one production-ready transparent PNG sheet for Myth Rune resource nodes only.

This is not a mixed board and not a scene composition.
Generate only gatherable resource nodes for a top-down slight-isometric 2D fantasy MMORPG starter zone.

Style rules:
- handcrafted classic MMORPG look
- warm light from above
- readable silhouette first
- clean material separation
- compact shapes that stay clear in gameplay
- no photorealism
- no glossy rendering
- no mockup board
- no labels
- no text

Include only resource-node families such as:
- small copper or iron ore rocks
- richer ore clusters
- crystal nodes in blue or gold variants
- loose stone piles
- cave entrance node or mine opening
- herb patch or simple gatherable natural cluster if needed

Critical rules:
- every node must read as gatherable
- transparent background only
- each item isolated with breathing room
- no terrain tiles
- no roads
- no buildings
- no trees
- no characters
- no UI
- keep each node reusable as an individual asset

Deliver a clean extraction-friendly PNG sheet for Myth Rune starter-town gathering content.
\`\`\`

## Variacao
\`\`\`text
Create the same Myth Rune resource-node sheet, but push it slightly more rustic and practical: smaller ore outcrops, clearer rock silhouettes, more believable starter-zone mining nodes, and less decorative fantasy exaggeration. Keep transparent background and resource-only scope.
\`\`\`

## Observacoes de integracao
- Target use: isolated transparent assets, not terrain tiles.
- Best fit paths: future resource folders for rocks, ore and mine entrances.
- Keep assets readable at small runtime scale.
- Reject any output that mixes terrain chunks or village props into the same sheet.
`;

  const foliagePrompt = `# Starter Town Trees And Foliage Prompt

## Tipo de asset
\`environment_tile\`

## Direcao visual
Create trees and foliage for Myth Rune starter areas, matching the same top-down slight-isometric fantasy MMORPG language as the current starter-town references: warm overhead light, controlled palette, rounded readable canopies, and trunks or bases that still read cleanly in gameplay.

## Prompt final
\`\`\`text
Create one production-ready transparent PNG sheet for Myth Rune trees and foliage only.

This is not a mixed reference board and not a terrain atlas.
Generate only environment assets for a top-down slight-isometric 2D fantasy MMORPG starter town and nearby forest edge.

Style rules:
- handcrafted classic MMORPG style
- warm light from above
- readable silhouettes first
- clean separation between leaves, trunk, shadow and ground contact
- vibrant but controlled greens
- no photorealism
- no glossy rendering
- no labels
- no text
- no mockup presentation

Include only foliage families such as:
- small rounded village tree
- medium broadleaf tree
- taller pine tree
- compact shrub cluster
- trimmed bush
- darker forest-edge foliage mass

Critical rules:
- transparent background only
- each asset isolated with enough spacing for extraction
- keep scale coherent across the sheet
- no terrain tiles
- no roads
- no water chunks
- no buildings
- no tools or props
- no characters

Deliver a clean extraction-friendly PNG sheet of starter-town trees and foliage for Myth Rune.
\`\`\`

## Variacao
\`\`\`text
Create the same Myth Rune trees-and-foliage sheet, but make it slightly denser and more forest-edge oriented: darker lower foliage, richer canopy variety, and stronger silhouette contrast between village trees and pine trees. Keep transparent background and foliage-only scope.
\`\`\`

## Observacoes de integracao
- Target use: isolated transparent environment assets.
- Best fit paths: tree, bush and foliage libraries for starter_town.
- Keep silhouettes readable at small map scale.
- Reject any output that mixes props, mining nodes or terrain transitions into the sheet.
`;

  fs.writeFileSync(path.join(outputRoot, 'resource_node_prompt_from_02.md'), resourcePrompt);
  fs.writeFileSync(path.join(outputRoot, 'trees_foliage_prompt_from_02.md'), foliagePrompt);
}

function mirrorDirectory(sourceDir, destinationDir) {
  clearDir(destinationDir);
  fs.cpSync(sourceDir, destinationDir, { recursive: true });
}

function main() {
  clearDir(OUTPUT_ROOT);
  const image = loadPng(SOURCE_PATH);

  const manifest = {
    sourceImage: path.relative(ROOT, SOURCE_PATH).replace(/\\/g, '/'),
    blocks: [],
  };

  for (const block of BLOCKS) {
    const raw = cropRegion(image, block.box);
    const trimmed = trimTransparentBounds(raw, TRIM_PADDING);
    const filename = `${block.id}.png`;
    const outPath = path.join(OUTPUT_ROOT, filename);
    writePng(outPath, trimmed);

    manifest.blocks.push({
      id: block.id,
      kind: block.kind,
      note: block.note,
      sourceBox: block.box,
      output: filename,
      outputSize: {
        width: trimmed.width,
        height: trimmed.height,
      },
    });
  }

  fs.writeFileSync(path.join(OUTPUT_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  createPromptFiles(OUTPUT_ROOT);
  mirrorDirectory(OUTPUT_ROOT, DIST_OUTPUT_ROOT);

  console.log(JSON.stringify({
    outputRoot: OUTPUT_ROOT,
    distOutputRoot: DIST_OUTPUT_ROOT,
    blockCount: manifest.blocks.length,
    blocks: manifest.blocks,
  }, null, 2));
}

main();
