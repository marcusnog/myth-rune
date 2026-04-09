const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicBase = path.join(
  root,
  "web-client",
  "public",
  "maps",
  "starter_town",
  "production_candidates"
);
const distBase = path.join(
  root,
  "web-client",
  "dist",
  "maps",
  "starter_town",
  "production_candidates"
);

const assets = [
  {
    source: "building/04_asset_002_building.png",
    category: "building",
    name: "house_wood_medium_brown_a",
    label: "Wooden medium house, brown roof",
    confidence: "high",
    shortlist: true,
    notes: "Strong candidate for generic village housing."
  },
  {
    source: "building/04_asset_003_building.png",
    category: "building",
    name: "house_wood_medium_brown_b",
    label: "Wooden medium house, brown roof alt",
    confidence: "medium",
    shortlist: true,
    notes: "Very close to asset 002; useful as an alternate house silhouette."
  },
  {
    source: "building/04_asset_005_building.png",
    category: "building",
    name: "cave_entrance_mossy_a",
    label: "Mossy cave entrance",
    confidence: "high",
    shortlist: true,
    notes: "Good landmark candidate for mine or starter cave."
  },
  {
    source: "building/04_asset_006_building.png",
    category: "building",
    name: "house_wood_small_straw_a",
    label: "Small wooden house, straw roof",
    confidence: "high",
    shortlist: true,
    notes: "Reads clearly for starter-town housing."
  },
  {
    source: "building/04_asset_024_building.png",
    category: "building",
    name: "house_wood_small_tan_a",
    label: "Small wooden house, tan roof",
    confidence: "high",
    shortlist: true,
    notes: "Useful alternate house with distinct warm roof."
  },
  {
    source: "large_prop/04_asset_001_large_prop.png",
    category: "large_prop",
    name: "hanging_sign_small_a",
    label: "Small hanging sign",
    confidence: "high",
    shortlist: true,
    notes: "Useful for shop entrances or interactable markers."
  },
  {
    source: "large_prop/04_asset_004_large_prop.png",
    category: "large_prop",
    name: "torch_standing_a",
    label: "Standing torch A",
    confidence: "high",
    shortlist: true,
    notes: "Clear silhouette and safe gameplay readability."
  },
  {
    source: "large_prop/04_asset_007_large_prop.png",
    category: "large_prop",
    name: "fence_straight_short_a",
    label: "Short straight fence",
    confidence: "high",
    shortlist: true,
    notes: "Good module for village boundaries."
  },
  {
    source: "large_prop/04_asset_008_large_prop.png",
    category: "large_prop",
    name: "fence_diagonal_right_a",
    label: "Diagonal fence right",
    confidence: "high",
    shortlist: true,
    notes: "Pairs well with straight fence sections."
  },
  {
    source: "large_prop/04_asset_009_large_prop.png",
    category: "large_prop",
    name: "fence_straight_long_a",
    label: "Long straight fence",
    confidence: "high",
    shortlist: true,
    notes: "Useful larger run for village borders."
  },
  {
    source: "large_prop/04_asset_017_large_prop.png",
    category: "large_prop",
    name: "rock_cluster_small_a",
    label: "Small rock cluster",
    confidence: "medium",
    shortlist: false,
    notes: "Can support mine dressing, but not a first runtime priority."
  },
  {
    source: "large_prop/04_asset_021_large_prop.png",
    category: "large_prop",
    name: "torch_standing_b",
    label: "Standing torch B",
    confidence: "high",
    shortlist: true,
    notes: "Alternate torch variant for repetition control."
  },
  {
    source: "large_prop/04_asset_025_large_prop.png",
    category: "large_prop",
    name: "signpost_standing_a",
    label: "Standing signpost",
    confidence: "medium",
    shortlist: true,
    notes: "Readable, even if slightly stylized."
  },
  {
    source: "large_prop/04_asset_027_large_prop.png",
    category: "large_prop",
    name: "well_stone_wood_a",
    label: "Stone village well",
    confidence: "high",
    shortlist: true,
    notes: "One of the strongest village props from the set."
  },
  {
    source: "large_prop/04_asset_031_large_prop.png",
    category: "large_prop",
    name: "weapon_rack_sword_a",
    label: "Sword rack",
    confidence: "medium",
    shortlist: true,
    notes: "Strong fit near blacksmith or training area."
  },
  {
    source: "large_prop/04_asset_032_large_prop.png",
    category: "large_prop",
    name: "forge_clutter_station_a",
    label: "Forge clutter station",
    confidence: "medium",
    shortlist: true,
    notes: "Useful as blacksmith dressing, though visually busy."
  },
  {
    source: "large_prop/04_asset_034_large_prop.png",
    category: "large_prop",
    name: "signpost_tall_a",
    label: "Tall signpost",
    confidence: "medium",
    shortlist: false,
    notes: "Functional, but secondary compared to the cleaner signs."
  },
  {
    source: "large_prop/04_asset_035_large_prop.png",
    category: "large_prop",
    name: "tool_rig_blue_a",
    label: "Blue tool rig",
    confidence: "low",
    shortlist: false,
    notes: "Readable as workshop equipment, but identity is less certain."
  },
  {
    source: "large_prop/04_asset_039_large_prop.png",
    category: "large_prop",
    name: "map_open_table_a",
    label: "Open map or document",
    confidence: "medium",
    shortlist: false,
    notes: "Useful as ambient detail, not a first-pass runtime asset."
  },
  {
    source: "large_prop/04_asset_043_large_prop.png",
    category: "large_prop",
    name: "bench_wood_a",
    label: "Wooden bench",
    confidence: "high",
    shortlist: true,
    notes: "Clean village prop with clear silhouette."
  },
  {
    source: "prop/04_asset_010_prop.png",
    category: "prop",
    name: "crates_stacked_double_a",
    label: "Double stacked crates",
    confidence: "high",
    shortlist: true,
    notes: "Safe utility prop for stores, docks, or yards."
  },
  {
    source: "prop/04_asset_011_prop.png",
    category: "prop",
    name: "barrel_large_a",
    label: "Large barrel",
    confidence: "high",
    shortlist: true,
    notes: "Core village storage prop."
  },
  {
    source: "prop/04_asset_012_prop.png",
    category: "prop",
    name: "crate_single_a",
    label: "Single crate",
    confidence: "high",
    shortlist: true,
    notes: "Core small utility prop."
  },
  {
    source: "prop/04_asset_013_prop.png",
    category: "prop",
    name: "crate_drawer_small_a",
    label: "Small crate drawer",
    confidence: "medium",
    shortlist: false,
    notes: "Useful but more specific than the generic crate."
  },
  {
    source: "prop/04_asset_014_prop.png",
    category: "prop",
    name: "barrel_small_a",
    label: "Small barrel",
    confidence: "high",
    shortlist: true,
    notes: "Good size variation for storage dressing."
  },
  {
    source: "prop/04_asset_022_prop.png",
    category: "prop",
    name: "firewood_bundle_a",
    label: "Firewood bundle",
    confidence: "medium",
    shortlist: false,
    notes: "Good ambient prop, but less essential than storage/landmark items."
  },
  {
    source: "prop/04_asset_026_prop.png",
    category: "prop",
    name: "notice_board_small_a",
    label: "Small notice board",
    confidence: "high",
    shortlist: true,
    notes: "Useful social-town prop near plaza or NPCs."
  },
  {
    source: "prop/04_asset_028_prop.png",
    category: "prop",
    name: "signpost_cross_small_a",
    label: "Small cross signpost",
    confidence: "medium",
    shortlist: false,
    notes: "Secondary sign option; keep for variety."
  },
  {
    source: "prop/04_asset_029_prop.png",
    category: "prop",
    name: "lantern_hanging_a",
    label: "Hanging lantern",
    confidence: "high",
    shortlist: true,
    notes: "Strong utility/lighting prop."
  },
  {
    source: "prop/04_asset_033_prop.png",
    category: "prop",
    name: "signpost_cross_large_a",
    label: "Large cross signpost",
    confidence: "medium",
    shortlist: true,
    notes: "Useful directional signage for outdoor paths."
  },
  {
    source: "prop/04_asset_036_prop.png",
    category: "prop",
    name: "pickaxe_ground_a",
    label: "Ground pickaxe",
    confidence: "high",
    shortlist: false,
    notes: "Good mining or smithing decoration."
  },
  {
    source: "prop/04_asset_037_prop.png",
    category: "prop",
    name: "barrel_small_b",
    label: "Small barrel B",
    confidence: "high",
    shortlist: false,
    notes: "Very close to barrel_small_a; keep as variant."
  },
  {
    source: "prop/04_asset_038_prop.png",
    category: "prop",
    name: "anvil_small_a",
    label: "Small anvil",
    confidence: "high",
    shortlist: true,
    notes: "Excellent blacksmith prop."
  },
  {
    source: "prop/04_asset_040_prop.png",
    category: "prop",
    name: "barrel_small_c",
    label: "Small barrel C",
    confidence: "medium",
    shortlist: false,
    notes: "Close to the other barrel variants; not needed in first runtime pass."
  },
  {
    source: "prop/04_asset_041_prop.png",
    category: "prop",
    name: "barrel_small_d",
    label: "Small barrel D",
    confidence: "medium",
    shortlist: false,
    notes: "Another storage variation kept for fallback only."
  }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyFileRelative(baseFrom, baseTo, fromRel, toRel) {
  const from = path.join(baseFrom, fromRel);
  const to = path.join(baseTo, toRel);
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function buildForBase(baseDir) {
  const sourceRoot = path.join(baseDir, "props_buildings", "primary");
  const renamedRoot = path.join(baseDir, "props_buildings", "renamed");
  const shortlistRoot = path.join(baseDir, "runtime_shortlist");

  cleanDir(renamedRoot);
  cleanDir(shortlistRoot);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "props_buildings/primary",
    renamed: [],
    runtimeShortlist: []
  };

  for (const asset of assets) {
    const ext = path.extname(asset.source);
    const renamedRel = path.join(
      "props_buildings",
      "renamed",
      asset.category,
      `${asset.name}${ext}`
    );
    copyFileRelative(sourceRoot, baseDir, asset.source, renamedRel);

    const entry = {
      source: asset.source.replace(/\\/g, "/"),
      output: renamedRel.replace(/\\/g, "/"),
      category: asset.category,
      name: asset.name,
      label: asset.label,
      confidence: asset.confidence,
      shortlist: asset.shortlist,
      notes: asset.notes
    };

    manifest.renamed.push(entry);

    if (asset.shortlist) {
      const shortlistRel = path.join(
        "runtime_shortlist",
        asset.category,
        `${asset.name}${ext}`
      );
      copyFileRelative(baseDir, baseDir, renamedRel, shortlistRel);
      manifest.runtimeShortlist.push({
        ...entry,
        output: shortlistRel.replace(/\\/g, "/")
      });
    }
  }

  const byCategory = {};
  for (const entry of manifest.runtimeShortlist) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
  }

  manifest.summary = {
    renamedCount: manifest.renamed.length,
    runtimeShortlistCount: manifest.runtimeShortlist.length,
    runtimeShortlistByCategory: byCategory
  };

  const readme = [
    "# Runtime Shortlist",
    "",
    "This package contains renamed production candidates from the 04 pass and a smaller runtime shortlist for safe promotion tests.",
    "",
    "## Renamed assets",
    `- Total renamed assets: ${manifest.summary.renamedCount}`,
    "- Naming style favors runtime-friendly identifiers over original extraction ids.",
    "- Confidence values indicate how certain the asset identity is from the generated sheet.",
    "",
    "## Runtime shortlist",
    `- Total shortlist assets: ${manifest.summary.runtimeShortlistCount}`,
    `- By category: ${Object.entries(byCategory).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    "- This shortlist keeps the cleanest and most readable houses, signs, fences, lights, storage props, and blacksmith set pieces.",
    "",
    "## Suggested promotion order",
    "1. Houses, cave, well, fences, torches",
    "2. Crates, barrels, bench, signboards",
    "3. Smithing props like anvil and weapon rack",
    "",
    "## Notes",
    "- Lower-confidence renamed assets stay in `props_buildings/renamed` but are excluded from the first runtime pass.",
    "- This step does not modify the live tileset atlas yet."
  ].join("\n");

  fs.writeFileSync(
    path.join(baseDir, "props_buildings", "renamed_manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  fs.writeFileSync(
    path.join(baseDir, "runtime_shortlist", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  fs.writeFileSync(path.join(baseDir, "runtime_shortlist", "README.md"), readme);
}

buildForBase(publicBase);
buildForBase(distBase);

console.log("Runtime shortlist built successfully.");
