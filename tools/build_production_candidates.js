'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'web-client', 'public', 'maps', 'starter_town');
const DIST_DIR = path.join(ROOT, 'web-client', 'dist', 'maps', 'starter_town');
const OUTPUT_ROOT = path.join(PUBLIC_DIR, 'production_candidates');
const DIST_OUTPUT_ROOT = path.join(DIST_DIR, 'production_candidates');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function copyFileRelative(sourceAbsolute, outputRelativePath, manifestSection, note) {
  const destination = path.join(OUTPUT_ROOT, outputRelativePath);
  ensureDir(path.dirname(destination));
  fs.copyFileSync(sourceAbsolute, destination);
  manifestSection.push({
    source: path.relative(ROOT, sourceAbsolute).replace(/\\/g, '/'),
    output: outputRelativePath.replace(/\\/g, '/'),
    note,
  });
}

function copyOptionalRootTilesetCandidates(outputManifest) {
  const candidates = [
    {
      source: path.join(ROOT, '01.png'),
      output: path.join('terrain', 'external_library', '01_candidate_tileset.png'),
      note: 'External terrain candidate 01: strong ground-transition atlas for map polish and expansion studies.',
    },
    {
      source: path.join(ROOT, '02.png'),
      output: path.join('terrain', 'external_library', '02_candidate_tileset.png'),
      note: 'External terrain candidate 02: alternate terrain mix with shoreline and stone-path coverage.',
    },
    {
      source: path.join(ROOT, '03.png'),
      output: path.join('terrain', 'external_library', '03_candidate_tileset.png'),
      note: 'External terrain candidate 03: darker terrain balance useful for forest-edge expansion.',
    },
    {
      source: path.join(ROOT, '04.png'),
      output: path.join('terrain', 'external_library', '04_candidate_tileset.png'),
      note: 'External terrain candidate 04: mixed terrain plus structure/prop sheet useful as an expansion board.',
    },
    {
      source: path.join(ROOT, 'sprites-tileset.png'),
      output: path.join('terrain', 'external_library', 'sprites_tileset_reference.png'),
      note: 'External modular reference sheet with terrain, structures, props and transitions for future atlas slicing.',
    },
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.source)) {
      continue;
    }
    copyFileRelative(
      candidate.source,
      candidate.output,
      outputManifest.externalTilesetLibrary,
      candidate.note,
    );
  }
}

function shouldSelect04Asset(asset) {
  const { category, extractedSize } = asset;
  const area = extractedSize.width * extractedSize.height;
  if (category === 'building') return true;
  if (category === 'large_prop') return area >= 600;
  if (category === 'prop') {
    return (
      (extractedSize.width >= 22 && extractedSize.height >= 22 && area >= 450) ||
      (Math.max(extractedSize.width, extractedSize.height) >= 30 && area >= 380)
    );
  }
  return false;
}

function copySelected04Assets(manifest, outputManifest) {
  const sourceRoot = path.join(PUBLIC_DIR, 'nanobanana_04');
  const selected = manifest.assets.filter(shouldSelect04Asset);

  for (const asset of selected) {
    const prefix = `04_${asset.filename}`;
    const relativeOutput = path.join('props_buildings', 'primary', asset.category, prefix);
    copyFileRelative(
      path.join(sourceRoot, asset.relativePath),
      relativeOutput,
      outputManifest.propsBuildingsPrimary,
      `Primary candidate from 04 (${asset.category}, ${asset.extractedSize.width}x${asset.extractedSize.height}).`,
    );
  }

  outputManifest.selectionSummary.primary04 = {
    selectedCount: selected.length,
    byCategory: selected.reduce((accumulator, asset) => {
      accumulator[asset.category] = (accumulator[asset.category] || 0) + 1;
      return accumulator;
    }, {}),
  };
}

function buildReadme(manifest) {
  return `# Production Candidates

This folder contains the current curated production candidates for Myth Rune starter town.

## Primary direction
- Terrain base: use the 04 safe hybrid first.
- Props/buildings: prefer curated extracted assets from the 04 sheet.
- Trees/foliage and resources: use 02 reference blocks for the next dedicated generation or extraction pass.

## Package contents
- \`terrain/primary\`: current best terrain candidates.
- \`terrain/fallback\`: fallback terrain candidates from earlier rounds.
- \`terrain/external_library\`: external tileset candidates staged from the repo root for map improvement and expansion work.
- \`terrain/reference\`: terrain reference blocks for further prompting.
- \`props_buildings/primary\`: selected extracted assets from 04 ready for manual naming and promotion.
- \`props_buildings/fallback_atlases\`: full atlases kept as backup/reference.
- \`trees_foliage/reference\`: current foliage reference block from 02.
- \`resources/reference\`: current resource reference block from 02.
- \`prompts\`: prompting material that still matters for the next image-generation pass.

## Selection summary
- Primary 04 extracted selections: ${manifest.selectionSummary.primary04.selectedCount}
- By category: ${Object.entries(manifest.selectionSummary.primary04.byCategory)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')}

## Recommended next step
- Rename the selected 04 props/buildings by function (\`house_small\`, \`well\`, \`torch\`, \`crate\`, etc).
- Promote only the hand-checked winners into the runtime atlas.
- Compare \`terrain/external_library\` candidates against the current safe hybrid before expanding into a second map sheet.
- Keep trees/resources in a separate pass to avoid overloading the starter_town tileset semantics.
`;
}

function main() {
  clearDir(OUTPUT_ROOT);

  const outputManifest = {
    generatedAt: new Date().toISOString(),
    terrainPrimary: [],
    terrainFallback: [],
    externalTilesetLibrary: [],
    terrainReference: [],
    propsBuildingsPrimary: [],
    propsBuildingsFallbackAtlases: [],
    treesFoliageReference: [],
    resourcesReference: [],
    prompts: [],
    selectionSummary: {},
  };

  const manifest04 = readJson(path.join(PUBLIC_DIR, 'nanobanana_04', 'extracted_manifest.json'));
  const manifest02 = readJson(path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', 'manifest.json'));

  copyFileRelative(
    path.join(PUBLIC_DIR, 'nanobanana_04', 'tileset_04_safe_hybrid.png'),
    path.join('terrain', 'primary', 'tileset_04_safe_hybrid.png'),
    outputManifest.terrainPrimary,
    'Primary terrain candidate based on 04.',
  );
  copyFileRelative(
    path.join(PUBLIC_DIR, 'nanobanana_04', 'terrain_source.png'),
    path.join('terrain', 'primary', 'terrain_source_04.png'),
    outputManifest.terrainPrimary,
    'Primary terrain source extracted from 04.',
  );
  copyFileRelative(
    path.join(PUBLIC_DIR, 'preview_nanobanana_test.png'),
    path.join('terrain', 'primary', 'preview_current_map.png'),
    outputManifest.terrainPrimary,
    'Current starter_town preview rendered with the active safe hybrid.',
  );

  copyFileRelative(
    path.join(PUBLIC_DIR, 'nanobanana_03', 'tileset_03_safe_hybrid.png'),
    path.join('terrain', 'fallback', 'tileset_03_safe_hybrid.png'),
    outputManifest.terrainFallback,
    'Fallback terrain candidate from 03.',
  );
  copyFileRelative(
    path.join(PUBLIC_DIR, 'tileset_01_safe_hybrid.png'),
    path.join('terrain', 'fallback', 'tileset_01_safe_hybrid.png'),
    outputManifest.terrainFallback,
    'Fallback terrain candidate from 01.',
  );

  copyOptionalRootTilesetCandidates(outputManifest);

  const terrainReferenceIds = [
    'terrain_overview_top',
    'terrain_ground_variants_bottom',
    'terrain_path_water_left',
    'terrain_pond_center',
    'terrain_plaza_center',
    'terrain_forest_mine_right',
  ];

  for (const block of manifest02.blocks.filter((block) => terrainReferenceIds.includes(block.id))) {
    copyFileRelative(
      path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', block.output),
      path.join('terrain', 'reference', block.output),
      outputManifest.terrainReference,
      block.note,
    );
  }

  copySelected04Assets(manifest04, outputManifest);

  copyFileRelative(
    path.join(PUBLIC_DIR, 'nanobanana_04', 'props_buildings_atlas.png'),
    path.join('props_buildings', 'fallback_atlases', 'props_buildings_atlas_04.png'),
    outputManifest.propsBuildingsFallbackAtlases,
    'Full extracted atlas from 04 kept as reference and fallback.',
  );
  copyFileRelative(
    path.join(PUBLIC_DIR, 'nanobanana_03', 'props_buildings_atlas.png'),
    path.join('props_buildings', 'fallback_atlases', 'props_buildings_atlas_03.png'),
    outputManifest.propsBuildingsFallbackAtlases,
    'Full extracted atlas from 03 kept as backup reference.',
  );

  const treesBlock = manifest02.blocks.find((block) => block.id === 'trees_foliage_sheet');
  const resourcesBlock = manifest02.blocks.find((block) => block.id === 'rocks_resources_sheet');

  if (treesBlock) {
    copyFileRelative(
      path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', treesBlock.output),
      path.join('trees_foliage', 'reference', treesBlock.output),
      outputManifest.treesFoliageReference,
      treesBlock.note,
    );
  }

  if (resourcesBlock) {
    copyFileRelative(
      path.join(PUBLIC_DIR, 'reference_boards', '02_blocks', resourcesBlock.output),
      path.join('resources', 'reference', resourcesBlock.output),
      outputManifest.resourcesReference,
      resourcesBlock.note,
    );
  }

  const promptFiles = [
    ['reference_boards/02_blocks/resource_node_prompt_from_02.md', 'prompts/resource_node_prompt_from_02.md', 'Resource-node prompt derived from 02.'],
    ['reference_boards/02_blocks/trees_foliage_prompt_from_02.md', 'prompts/trees_foliage_prompt_from_02.md', 'Trees and foliage prompt derived from 02.'],
    ['terrain_prompt_round3.md', 'prompts/terrain_prompt_round3.md', 'Current stricter terrain prompt.'],
    ['nanobanana_props/prompt_round2.md', 'prompts/props_buildings_prompt_round2.md', 'Current props/buildings prompt.'],
  ];

  for (const [sourceRelative, outputRelative, note] of promptFiles) {
    copyFileRelative(
      path.join(PUBLIC_DIR, sourceRelative),
      outputRelative,
      outputManifest.prompts,
      note,
    );
  }

  fs.writeFileSync(path.join(OUTPUT_ROOT, 'manifest.json'), JSON.stringify(outputManifest, null, 2));
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'README.md'), buildReadme(outputManifest));

  clearDir(DIST_OUTPUT_ROOT);
  fs.cpSync(OUTPUT_ROOT, DIST_OUTPUT_ROOT, { recursive: true });

  console.log(
    JSON.stringify(
      {
        outputRoot: OUTPUT_ROOT,
        distOutputRoot: DIST_OUTPUT_ROOT,
        primary04Selected: outputManifest.selectionSummary.primary04.selectedCount,
      },
      null,
      2,
    ),
  );
}

main();
