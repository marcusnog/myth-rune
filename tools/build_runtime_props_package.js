const fs = require("fs");
const path = require("path");

const root = process.cwd();

const targets = [
  path.join(root, "web-client", "public", "maps", "starter_town"),
  path.join(root, "web-client", "dist", "maps", "starter_town"),
];

const plannedLayout = {
  generatedAt: new Date().toISOString(),
  image: "atlas.png",
  notes:
    "Initial safe runtime props pass. Buildings are intentionally excluded from live placement until larger blockers/footprints are curated.",
  placements: [
    { id: "house_wood_small_straw_a", tileX: 58, tileY: 62, blocker: { width: 28, height: 14, offsetY: -1 } },
    { id: "house_wood_medium_brown_a", tileX: 64, tileY: 59, blocker: { width: 30, height: 14, offsetY: -1 } },
    { id: "house_wood_small_tan_a", tileX: 70, tileY: 62, blocker: { width: 28, height: 14, offsetY: -1 } },
    { id: "well_stone_wood_a", tileX: 64, tileY: 64, blocker: { width: 20, height: 14, offsetY: -2 } },
    { id: "torch_standing_a", tileX: 61, tileY: 64 },
    { id: "torch_standing_b", tileX: 67, tileY: 64 },
    { id: "bench_wood_a", tileX: 60, tileY: 67 },
    { id: "notice_board_small_a", tileX: 69, tileY: 67, blocker: { width: 18, height: 8, offsetY: -2 } },
    { id: "signpost_standing_a", tileX: 58, tileY: 64 },
    { id: "signpost_cross_large_a", tileX: 56, tileY: 68 },
    { id: "fence_straight_long_a", tileX: 60, tileY: 69, blocker: { width: 44, height: 8, offsetY: -1 } },
    { id: "fence_straight_short_a", tileX: 65, tileY: 69, blocker: { width: 34, height: 8, offsetY: -1 } },
    { id: "fence_diagonal_right_a", tileX: 70, tileY: 68, blocker: { width: 20, height: 8, offsetY: -1 } },
    { id: "crates_stacked_double_a", tileX: 71, tileY: 65, blocker: { width: 18, height: 10, offsetY: -1 } },
    { id: "crate_single_a", tileX: 70, tileY: 65, blocker: { width: 12, height: 10, offsetY: -1 } },
    { id: "barrel_large_a", tileX: 72, tileY: 65, blocker: { width: 14, height: 10, offsetY: -1 } },
    { id: "barrel_small_a", tileX: 73, tileY: 65, blocker: { width: 12, height: 8, offsetY: -1 } },
    { id: "anvil_small_a", tileX: 73, tileY: 64, blocker: { width: 18, height: 8, offsetY: -1 } },
    { id: "weapon_rack_sword_a", tileX: 75, tileY: 64, blocker: { width: 18, height: 10, offsetY: -1 } },
    { id: "forge_clutter_station_a", tileX: 76, tileY: 64, blocker: { width: 26, height: 14, offsetY: -2 } },
    { id: "hanging_sign_small_a", tileX: 66, tileY: 61 },
    { id: "lantern_hanging_a", tileX: 65, tileY: 61 },
    { id: "cave_entrance_mossy_a", tileX: 87, tileY: 89, blocker: { width: 34, height: 16, offsetY: -2 } },
  ],
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copy(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function buildForTarget(targetBase) {
  const sourceBase = path.join(
    targetBase,
    "production_candidates",
    "runtime_props_atlas"
  );
  const runtimeBase = path.join(targetBase, "runtime_props");
  ensureDir(runtimeBase);

  const atlasSource = path.join(sourceBase, "starter_town_runtime_props_atlas.png");
  const atlasMetaSource = path.join(sourceBase, "starter_town_runtime_props_atlas.json");

  const atlasMeta = JSON.parse(fs.readFileSync(atlasMetaSource, "utf8"));
  const simplifiedMeta = {
    generatedAt: new Date().toISOString(),
    image: "atlas.png",
    cellWidth: atlasMeta.cellWidth,
    cellHeight: atlasMeta.cellHeight,
    itemCount: atlasMeta.itemCount,
    items: Object.fromEntries(
      atlasMeta.items.map((item) => [
        item.id,
        {
          category: item.category,
          label: item.label,
          confidence: item.confidence,
          x: item.placedBox.x,
          y: item.placedBox.y,
          width: item.placedBox.width,
          height: item.placedBox.height,
          notes: item.notes,
        },
      ])
    ),
  };

  copy(atlasSource, path.join(runtimeBase, "atlas.png"));
  fs.writeFileSync(
    path.join(runtimeBase, "atlas.json"),
    JSON.stringify(simplifiedMeta, null, 2)
  );
  fs.writeFileSync(
    path.join(runtimeBase, "layout.json"),
    JSON.stringify(plannedLayout, null, 2)
  );
  fs.writeFileSync(
    path.join(runtimeBase, "README.md"),
    [
      "# Runtime Props Package",
      "",
      "This package promotes a safe subset of shortlist props into a runtime-oriented atlas plus an initial placement layout.",
      "",
      "## Intent",
      "- keep terrain atlas untouched",
      "- place props as world sprites with named frames",
      "- use blockers only for the clearest solid props",
      "- exclude buildings from this first live pass",
      "",
      "## Files",
      "- `atlas.png`: packed runtime props atlas",
      "- `atlas.json`: named frame metadata",
      "- `layout.json`: initial starter-town placements",
    ].join("\n")
  );
}

for (const target of targets) {
  buildForTarget(target);
}

console.log("Runtime props package generated.");
