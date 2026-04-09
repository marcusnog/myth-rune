const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const root = process.cwd();

const targets = [
  path.join(root, "web-client", "public", "maps", "starter_town", "production_candidates"),
  path.join(root, "web-client", "dist", "maps", "starter_town", "production_candidates"),
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function blit(source, target, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sx = (y * source.width + x) * 4;
      const alpha = source.data[sx + 3];
      if (!alpha) continue;

      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const di = (ty * target.width + tx) * 4;

      const a = alpha / 255;
      const inv = 1 - a;

      target.data[di] = Math.round(source.data[sx] * a + target.data[di] * inv);
      target.data[di + 1] = Math.round(source.data[sx + 1] * a + target.data[di + 1] * inv);
      target.data[di + 2] = Math.round(source.data[sx + 2] * a + target.data[di + 2] * inv);
      target.data[di + 3] = Math.round(alpha + target.data[di + 3] * inv);
    }
  }
}

function fillRect(png, x, y, width, height, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
      const idx = (py * png.width + px) * 4;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
}

function strokeRect(png, x, y, width, height, color) {
  fillRect(png, x, y, width, 1, color);
  fillRect(png, x, y + height - 1, width, 1, color);
  fillRect(png, x, y, 1, height, color);
  fillRect(png, x + width - 1, y, 1, height, color);
}

function scaleNearest(source, factor) {
  const out = new PNG({
    width: source.width * factor,
    height: source.height * factor,
  });

  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const si = (sy * source.width + sx) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }

  return out;
}

function buildAtlas(baseDir) {
  const shortlistRoot = path.join(baseDir, "runtime_shortlist");
  const manifestPath = path.join(shortlistRoot, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const outputDir = path.join(baseDir, "runtime_props_atlas");
  cleanDir(outputDir);

  const entries = manifest.runtimeShortlist.map((entry) => {
    const imagePath = path.join(baseDir, entry.output);
    const image = readPng(imagePath);
    return { ...entry, imagePath, image };
  });

  const cellWidth = 128;
  const cellHeight = 128;
  const columns = 6;
  const rows = Math.ceil(entries.length / columns);
  const atlas = new PNG({
    width: columns * cellWidth,
    height: rows * cellHeight,
  });
  atlas.data.fill(0);

  const metadata = {
    image: "starter_town_runtime_props_atlas.png",
    generatedAt: new Date().toISOString(),
    cellWidth,
    cellHeight,
    columns,
    rows,
    itemCount: entries.length,
    items: [],
  };

  entries.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = col * cellWidth;
    const cellY = row * cellHeight;
    const dx = cellX + Math.floor((cellWidth - entry.image.width) / 2);
    const dy = cellY + Math.floor((cellHeight - entry.image.height) / 2);

    blit(entry.image, atlas, dx, dy);
    strokeRect(atlas, cellX, cellY, cellWidth, cellHeight, [56, 43, 24, 70]);

    metadata.items.push({
      id: entry.name,
      category: entry.category,
      label: entry.label,
      confidence: entry.confidence,
      atlasCell: {
        column: col,
        row,
        x: cellX,
        y: cellY,
        width: cellWidth,
        height: cellHeight,
      },
      placedBox: {
        x: dx,
        y: dy,
        width: entry.image.width,
        height: entry.image.height,
      },
      source: entry.output,
      notes: entry.notes,
    });
  });

  const atlasPath = path.join(outputDir, "starter_town_runtime_props_atlas.png");
  const metadataPath = path.join(outputDir, "starter_town_runtime_props_atlas.json");
  writePng(atlasPath, atlas);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  const previewSource = readPng(
    path.join(baseDir, "terrain", "primary", "preview_current_map.png")
  );
  const preview = scaleNearest(previewSource, 2);

  const showcase = new PNG({
    width: preview.width,
    height: preview.height,
  });
  showcase.data.set(preview.data);

  // Add subtle footer band to support readability of props near the bottom.
  fillRect(
    showcase,
    0,
    showcase.height - 180,
    showcase.width,
    180,
    [18, 14, 9, 70]
  );

  const placements = [
    ["house_wood_small_straw_a", 18, 18],
    ["house_wood_medium_brown_a", 30, 18],
    ["house_wood_small_tan_a", 43, 17],
    ["well_stone_wood_a", 32, 26],
    ["bench_wood_a", 27, 31],
    ["notice_board_small_a", 37, 31],
    ["hanging_sign_small_a", 46, 27],
    ["torch_standing_a", 24, 27],
    ["torch_standing_b", 40, 26],
    ["fence_straight_long_a", 19, 29],
    ["fence_straight_short_a", 25, 29],
    ["fence_diagonal_right_a", 35, 29],
    ["cave_entrance_mossy_a", 58, 14],
    ["weapon_rack_sword_a", 52, 26],
    ["forge_clutter_station_a", 58, 28],
    ["anvil_small_a", 54, 31],
    ["crates_stacked_double_a", 47, 31],
    ["crate_single_a", 50, 32],
    ["barrel_large_a", 44, 32],
    ["barrel_small_a", 46, 33],
    ["lantern_hanging_a", 42, 30],
    ["signpost_standing_a", 15, 28],
    ["signpost_cross_large_a", 12, 31],
  ];

  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const previewTile = 16; // preview_current_map is already 2x from 8px tiles
  const showcaseItems = [];

  for (const [name, tileX, tileY] of placements) {
    const entry = entryByName.get(name);
    if (!entry) continue;

    const groundX = tileX * previewTile;
    const groundY = tileY * previewTile;
    const drawX = Math.round(groundX - entry.image.width / 2);
    const drawY = Math.round(groundY - entry.image.height + 10);
    blit(entry.image, showcase, drawX, drawY);

    showcaseItems.push({
      id: name,
      tileX,
      tileY,
      pixelX: drawX,
      pixelY: drawY,
    });
  }

  const showcasePath = path.join(outputDir, "starter_town_runtime_props_showcase.png");
  const showcaseMetaPath = path.join(outputDir, "starter_town_runtime_props_showcase.json");
  writePng(showcasePath, showcase);
  fs.writeFileSync(
    showcaseMetaPath,
    JSON.stringify(
      {
        image: "starter_town_runtime_props_showcase.png",
        generatedAt: new Date().toISOString(),
        basedOn: "terrain/primary/preview_current_map.png",
        placements: showcaseItems,
      },
      null,
      2
    )
  );

  const readme = [
    "# Runtime Props Atlas",
    "",
    "This folder contains a runtime-oriented props atlas built from the curated shortlist.",
    "",
    "## Files",
    "- `starter_town_runtime_props_atlas.png`: packed atlas using a 128x128 cell grid.",
    "- `starter_town_runtime_props_atlas.json`: metadata for each asset in the atlas.",
    "- `starter_town_runtime_props_showcase.png`: quick visual composition over the current starter-town terrain preview.",
    "- `starter_town_runtime_props_showcase.json`: placements used for the showcase preview.",
    "",
    "## Notes",
    "- This atlas is separate from the live terrain atlas.",
    "- The showcase is for direction and readability, not a gameplay-accurate placement pass.",
    "- Next safe step is to choose which subset should be promoted into runtime map layers or a dedicated props tileset.",
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "README.md"), readme);

  return {
    atlasPath,
    metadataPath,
    showcasePath,
    showcaseMetaPath,
    outputDir,
    itemCount: entries.length,
  };
}

const results = targets.map(buildAtlas);
console.log(JSON.stringify(results, null, 2));
