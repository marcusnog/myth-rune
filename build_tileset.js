/**
 * build_tileset.js
 * Reads sprites-tileset.png (16px tiles) and assembles a new 32px tileset.png
 * that matches the exact GID layout of the current tileset-phaser-metadata.json.
 *
 * Strategy: extract 16px tiles from sprites-tileset.png, scale 2x (nearest-neighbor),
 * and place them at the correct positions in the new 512×352 (16×11 tiles at 32px) image.
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const SRC_TILE = 16;    // source tile size in sprites-tileset.png
const DST_TILE = 32;    // output tile size
const DST_COLS = 16;
const DST_ROWS = 11;
const DST_WIDTH = DST_COLS * DST_TILE;   // 512
const DST_HEIGHT = DST_ROWS * DST_TILE;  // 352

// Load source tileset
const srcData = fs.readFileSync('./sprites-tileset.png');
const src = PNG.sync.read(srcData);
const SRC_COLS = Math.floor(src.width / SRC_TILE); // 42
// const SRC_ROWS = Math.floor(src.height / SRC_TILE); // 23

// Create destination PNG (opaque black background)
const dst = new PNG({ width: DST_WIDTH, height: DST_HEIGHT });
dst.data.fill(0);

/**
 * Read a pixel from source (handles out-of-bounds → black)
 */
function srcPixel(sx, sy) {
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return [0, 0, 0, 255];
  const i = (sy * src.width + sx) * 4;
  return [src.data[i], src.data[i+1], src.data[i+2], src.data[i+3]];
}

/**
 * Get a pixel from source tile (col, row) at local pixel offset (px, py)
 */
function srcTilePx(col, row, px, py) {
  return srcPixel(col * SRC_TILE + px, row * SRC_TILE + py);
}

/**
 * Sample a source tile region with nearest-neighbor 2x scaling,
 * compositing onto a background color (for semi-transparent tiles).
 * bgColor = [r,g,b] to composite against.
 */
function extractTile(srcCol, srcRow, bgColor = null) {
  const pixels = [];
  for (let dy = 0; dy < DST_TILE; dy++) {
    for (let dx = 0; dx < DST_TILE; dx++) {
      const sx = Math.floor(dx / 2);
      const sy = Math.floor(dy / 2);
      let [r, g, b, a] = srcTilePx(srcCol, srcRow, sx, sy);
      if (bgColor && a < 255) {
        // Alpha composite over background
        const alpha = a / 255;
        r = Math.round(r * alpha + bgColor[0] * (1 - alpha));
        g = Math.round(g * alpha + bgColor[1] * (1 - alpha));
        b = Math.round(b * alpha + bgColor[2] * (1 - alpha));
        a = 255;
      }
      pixels.push([r, g, b, a]);
    }
  }
  return pixels;
}

/**
 * Extract a 2×1 source tile region (32x16 src → 64x32 dst) centered to produce 32×32.
 * Used for tiles that span 2 source columns (only take left half of combined or right half).
 */
function extractTileMixed(srcCol1, srcRow1, srcCol2, srcRow2, bgColor = null) {
  // Take left half from tile1, right half from tile2
  const pixels = [];
  for (let dy = 0; dy < DST_TILE; dy++) {
    for (let dx = 0; dx < DST_TILE; dx++) {
      const sx = Math.floor(dx / 2);
      const sy = Math.floor(dy / 2);
      let px1, px2, r, g, b, a;
      if (dx < 16) {
        [r, g, b, a] = srcTilePx(srcCol1, srcRow1, sx, sy);
      } else {
        [r, g, b, a] = srcTilePx(srcCol2, srcRow2, sx - 8, sy);
      }
      if (bgColor && a < 255) {
        const alpha = a / 255;
        r = Math.round(r * alpha + bgColor[0] * (1 - alpha));
        g = Math.round(g * alpha + bgColor[1] * (1 - alpha));
        b = Math.round(b * alpha + bgColor[2] * (1 - alpha));
        a = 255;
      }
      pixels.push([r, g, b, a]);
    }
  }
  return pixels;
}

/**
 * Generate a solid-color tile with slight noise variation
 */
function solidTile(r, g, b, noiseAmt = 8) {
  const pixels = [];
  // Deterministic noise
  for (let dy = 0; dy < DST_TILE; dy++) {
    for (let dx = 0; dx < DST_TILE; dx++) {
      const h = ((dx * 374761393 + dy * 1013904223) >>> 0);
      const n = ((h ^ (h >>> 16)) >>> 0) % (noiseAmt * 2 + 1) - noiseAmt;
      pixels.push([
        Math.max(0, Math.min(255, r + n)),
        Math.max(0, Math.min(255, g + n)),
        Math.max(0, Math.min(255, b + n)),
        255,
      ]);
    }
  }
  return pixels;
}

/**
 * Place pixels (array of [r,g,b,a]) into destination at dst tile position (dstCol, dstRow)
 */
function placeTile(dstCol, dstRow, pixels) {
  const ox = dstCol * DST_TILE;
  const oy = dstRow * DST_TILE;
  for (let dy = 0; dy < DST_TILE; dy++) {
    for (let dx = 0; dx < DST_TILE; dx++) {
      const pi = dy * DST_TILE + dx;
      const [r, g, b, a] = pixels[pi];
      const di = ((oy + dy) * DST_WIDTH + (ox + dx)) * 4;
      dst.data[di] = r;
      dst.data[di+1] = g;
      dst.data[di+2] = b;
      dst.data[di+3] = a;
    }
  }
}

/**
 * Place a tile from sprites-tileset at a given dst position with optional bg composite.
 */
function place(dstCol, dstRow, srcCol, srcRow, bg = null) {
  placeTile(dstCol, dstRow, extractTile(srcCol, srcRow, bg));
}

/**
 * Place a solid-color tile (for tiles we don't have good source for)
 */
function placeSolid(dstCol, dstRow, r, g, b, noise = 8) {
  placeTile(dstCol, dstRow, solidTile(r, g, b, noise));
}

// ─────────────────────────────────────────────────────────────
// Reference - current tileset layout (must match exactly):
//
// Row 0: grass_light ×4, grass_dark ×4, dirt ×4, road ×4
// Row 1: forest_floor ×4, water ×3, dark_on_light_mask ×9
// Row 2: dark_on_light_mask 9-15 (7 tiles), inner corners ×4, dirt_on_grass_mask ×5
// Row 3: dirt_on_grass_mask 5-15 (11 tiles), inner corners ×4, road_on_dirt_mask_0
// Row 4: road_on_dirt_mask 1-15 (15 tiles), inner corners... continue
// Row 5: road_on_dirt_inner_nw/se/sw, forest_on_dark_mask 0-12 (13 tiles)
// Row 6: forest_on_dark_mask 13-15, inner corners ×4, tree_oak ×6, tree_pine ×4
// Row 7: tree_pine_base, tree_small, leaf_litter ×4, bush/rock ×6, log ×2
// Row 8: wall_plaster/stone/window/door/corners/roofs ×14
// Row 9: roof_blue_gable, fence ×4, well ×2, signs ×3, cave ×2, barrel/crate, bench ×2
// Row 10: torch_base, fire ×3, lantern, collision ×3
// ─────────────────────────────────────────────────────────────

// Background colors for compositing
const BG_GRASS_LIGHT = [104, 145, 60];   // light green
const BG_GRASS_DARK  = [58, 95, 35];     // dark green
const BG_DIRT        = [150, 115, 65];   // brown dirt
const BG_STONE       = [140, 138, 130];  // gray stone
const BG_FOREST      = [45, 75, 28];     // forest floor
const BG_WATER       = [60, 120, 180];   // water blue
const BG_ROAD        = [130, 120, 100];  // road/stone

// ── ROW 0: grass_light (4), grass_dark (4), dirt (4), road (4) ──

// grass_light: use sprites-tileset row 3, cols 0,7,8,9 (solid green grass)
// Composited against light green bg
place(0, 0, 0, 3, BG_GRASS_LIGHT);
place(1, 0, 7, 3, BG_GRASS_LIGHT);
place(2, 0, 8, 3, BG_GRASS_LIGHT);
place(3, 0, 9, 3, BG_GRASS_LIGHT);

// grass_dark: use sprites-tileset row 7, cols 0,1,2,3 (dark_grass)
place(4, 0, 0, 7, BG_GRASS_DARK);
place(5, 0, 1, 7, BG_GRASS_DARK);
place(6, 0, 2, 7, BG_GRASS_DARK);
place(7, 0, 3, 7, BG_GRASS_DARK);

// dirt: use sprites-tileset row 3, col 15,16 and row 4 col 5,7
place(8, 0, 15, 3, BG_DIRT);
place(9, 0, 16, 3, BG_DIRT);
place(10, 0, 20, 3, BG_DIRT);
place(11, 0, 21, 3, BG_DIRT);

// road/stone: use row 5 cols 0,1,7,8
place(12, 0, 0, 5, BG_STONE);
place(13, 0, 1, 5, BG_STONE);
place(14, 0, 7, 5, BG_STONE);
place(15, 0, 8, 5, BG_STONE);

// ── ROW 1: forest_floor (4), water (3), dark_on_light_mask 0-8 ──

// forest_floor: row 7 cols 5,7,9,11 (forest green)
place(0, 1, 5, 7, BG_FOREST);
place(1, 1, 7, 7, BG_FOREST);
place(2, 1, 9, 7, BG_FOREST);
place(3, 1, 11, 7, BG_FOREST);

// water: row 7 cols 32-37 (water tiles)
place(4, 1, 32, 7, null);
place(5, 1, 34, 7, null);
place(6, 1, 36, 7, null);

// dark_on_light_mask 0-8: edge transitions dark grass on light grass
// These are alpha-blended edges. Use transparent overlay approach.
// Masks are gradients from dark to transparent. We'll generate them procedurally.
// North edge (dark comes from top)
for (let i = 0; i < 9; i++) {
  // Generate gradient mask tiles
  const pixels = [];
  for (let dy = 0; dy < DST_TILE; dy++) {
    for (let dx = 0; dx < DST_TILE; dx++) {
      // Determine how much dark grass to show
      let darkAmt = 0;
      // Bitmask positions: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW + 8=full
      // Simplified: use noise + directional gradient
      const centerFrac = 0; // will be set per mask
      darkAmt = 0;
      pixels.push([...BG_GRASS_LIGHT, 255]);
    }
  }
  // Just use light grass for masks (transitions will be added via map design)
  placeSolid(7 + i, 1, ...BG_GRASS_LIGHT, 6);
}

// ── ROW 2-4: transition masks ──
// dark_on_light_mask 9-15, inner corners, dirt_on_grass masks
// Use solid colors for simplicity (they're mostly used as edge blends)
for (let c = 0; c < 7; c++) placeSolid(c, 2, ...BG_GRASS_LIGHT, 6);
for (let c = 7; c < 11; c++) placeSolid(c, 2, ...BG_GRASS_DARK, 5);   // inner corners
for (let c = 11; c < 16; c++) placeSolid(c, 2, ...BG_GRASS_LIGHT, 8); // dirt_on_grass 0-4

for (let c = 0; c < 11; c++) placeSolid(c, 3, ...BG_GRASS_LIGHT, 8);  // dirt_on_grass 5-15
for (let c = 11; c < 15; c++) placeSolid(c, 3, ...BG_DIRT, 6);         // inner corners
placeSolid(15, 3, ...BG_DIRT, 6);  // road_on_dirt 0

for (let c = 0; c < 15; c++) placeSolid(c, 4, ...BG_DIRT, 7);   // road_on_dirt 1-15
placeSolid(15, 4, ...BG_STONE, 5); // road_on_dirt inner_ne

// ── ROW 5: more transition masks ──
for (let c = 0; c < 3; c++) placeSolid(c, 5, ...BG_STONE, 5);    // road_on_dirt inner
for (let c = 3; c < 16; c++) placeSolid(c, 5, ...BG_FOREST, 6);  // forest_on_dark 0-12

// ── ROW 6: forest_on_dark 13-15, inner corners, tree_oak ──
for (let c = 0; c < 3; c++) placeSolid(c, 6, ...BG_FOREST, 6);   // forest_on_dark 13-15
for (let c = 3; c < 7; c++) placeSolid(c, 6, ...BG_GRASS_DARK, 5); // inner corners

// tree_oak: 2x2 tile oak tree (top-left, top-right, bottom-left, bottom-right) + 2 base tiles
// From sprites-tileset: trees appear to be in the middle rows as semi-transparent sprites
// Use green for top parts, brown trunk for base
placeSolid(7, 6, 40, 90, 20, 15);   // tree_oak_top_tl
placeSolid(8, 6, 45, 95, 22, 15);   // tree_oak_top_tr
placeSolid(9, 6, 38, 85, 18, 12);   // tree_oak_top_bl
placeSolid(10, 6, 42, 88, 20, 13);  // tree_oak_top_br
placeSolid(11, 6, 80, 55, 25, 8);   // tree_oak_base_l (trunk)
placeSolid(12, 6, 75, 52, 22, 8);   // tree_oak_base_r (trunk)

// tree_pine
placeSolid(13, 6, 30, 75, 15, 12);  // tree_pine_top_tl
placeSolid(14, 6, 35, 78, 18, 12);  // tree_pine_top_tr
placeSolid(15, 6, 28, 70, 14, 10);  // tree_pine_top_bl

// ── ROW 7 ──
placeSolid(0, 7, 32, 72, 16, 10);   // tree_pine_top_br
placeSolid(1, 7, 78, 52, 22, 8);    // tree_pine_base_l
placeSolid(2, 7, 72, 49, 20, 8);    // tree_pine_base_r
placeSolid(3, 7, 55, 100, 30, 12);  // tree_small_top
placeSolid(4, 7, 75, 52, 22, 6);    // tree_small_base

// leaf_litter variants
for (let c = 5; c < 9; c++) placeSolid(c, 7, ...BG_FOREST, 15);

// bushes
placeSolid(9, 7, 35, 100, 20, 18);
placeSolid(11, 7, 30, 95, 18, 18);
placeSolid(13, 7, 32, 98, 19, 18);

// rocks
placeSolid(10, 7, 120, 115, 108, 15);
placeSolid(12, 7, 115, 110, 105, 15);
placeSolid(14, 7, 118, 112, 107, 12);

// logs
placeSolid(15, 7, 110, 70, 35, 10);
placeSolid(0, 8, 105, 65, 32, 10);

// ── ROW 8: building parts ──
placeSolid(1, 8, 220, 200, 170, 10);  // wall_plaster (beige)
placeSolid(2, 8, 140, 135, 125, 10);  // wall_stone (gray)
placeSolid(3, 8, 200, 185, 155, 8);   // wall_window
placeSolid(4, 8, 160, 100, 60, 8);    // wall_door (brown)
placeSolid(5, 8, 200, 185, 155, 8);   // wall_corner_l
placeSolid(6, 8, 200, 185, 155, 8);   // wall_corner_r
placeSolid(7, 8, 200, 60, 50, 10);    // roof_red_center
placeSolid(8, 8, 60, 100, 200, 10);   // roof_blue_center
placeSolid(9, 8, 185, 50, 40, 10);    // roof_red_edge_l
placeSolid(10, 8, 50, 90, 185, 10);   // roof_blue_edge_l
placeSolid(11, 8, 185, 50, 40, 10);   // roof_red_edge_r
placeSolid(12, 8, 50, 90, 185, 10);   // roof_blue_edge_r
placeSolid(13, 8, 175, 45, 35, 8);    // roof_red_ridge
placeSolid(14, 8, 45, 85, 175, 8);    // roof_blue_ridge
placeSolid(15, 8, 180, 48, 38, 10);   // roof_red_gable

// ── ROW 9 ──
placeSolid(0, 9, 45, 85, 175, 10);   // roof_blue_gable
placeSolid(1, 9, 110, 70, 35, 8);    // fence_h
placeSolid(2, 9, 110, 70, 35, 8);    // fence_v
placeSolid(3, 9, 105, 65, 32, 6);    // fence_post
placeSolid(4, 9, 110, 70, 35, 8);    // fence_gate
placeSolid(5, 9, 140, 135, 125, 10); // well_base
placeSolid(6, 9, 140, 135, 125, 10); // well_top
placeSolid(7, 9, 200, 185, 155, 8);  // sign_blank
placeSolid(8, 9, 190, 140, 90, 8);   // sign_tavern
placeSolid(9, 9, 190, 140, 90, 8);   // sign_shop
placeSolid(10, 9, 60, 55, 50, 8);    // cave_l (dark rock)
placeSolid(11, 9, 60, 55, 50, 8);    // cave_r
placeSolid(12, 9, 130, 80, 40, 8);   // barrel
placeSolid(13, 9, 150, 100, 55, 8);  // crate
placeSolid(14, 9, 110, 70, 35, 8);   // bench_l
placeSolid(15, 9, 110, 70, 35, 8);   // bench_r

// ── ROW 10: torch, fire, collision ──
placeSolid(0, 10, 80, 55, 25, 6);    // torch_base
placeSolid(1, 10, 240, 160, 30, 20); // fire_0
placeSolid(2, 10, 245, 140, 20, 20); // fire_1
placeSolid(3, 10, 250, 120, 15, 20); // fire_2
placeSolid(4, 10, 220, 200, 80, 15); // lantern
// Collision tiles: solid colors used internally
placeSolid(5, 10, 255, 0, 0, 0);     // collision_full (red)
placeSolid(6, 10, 255, 128, 0, 0);   // collision_half (orange)
placeSolid(7, 10, 0, 100, 255, 0);   // collision_water (blue)

// ─────────────────────────────────────────────────────────────
// NOW: Generate better terrain tiles using actual source pixels
// We'll overlay actual sprite pixels on the solid tiles for ground rows
// ─────────────────────────────────────────────────────────────

// Re-do grass_light tiles with actual source art (row 3 from sprites-tileset)
// These should look much better than solid-color generation
[0, 1, 2, 3].forEach((dstCol, i) => {
  const srcCols = [0, 1, 6, 10]; // varied grass tiles from row 3
  place(dstCol, 0, srcCols[i], 3, BG_GRASS_LIGHT);
});

// Re-do grass_dark tiles (row 7 from sprites-tileset)
[4, 5, 6, 7].forEach((dstCol, i) => {
  const srcCols = [0, 1, 2, 3];
  place(dstCol, 0, srcCols[i], 7, BG_GRASS_DARK);
});

// Re-do dirt tiles (row 3-4 from sprites-tileset)
place(8, 0, 15, 3, BG_DIRT);
place(9, 0, 16, 3, BG_DIRT);
place(10, 0, 23, 3, BG_DIRT);
place(11, 0, 24, 3, BG_DIRT);

// Re-do stone/road (row 5)
place(12, 0, 0, 5, BG_STONE);
place(13, 0, 1, 5, BG_STONE);
place(14, 0, 7, 5, BG_STONE);
place(15, 0, 8, 5, BG_STONE);

// Re-do forest floor (row 7 from sprites-tileset)
place(0, 1, 5, 7, BG_FOREST);
place(1, 1, 7, 7, BG_FOREST);
place(2, 1, 9, 7, BG_FOREST);
place(3, 1, 11, 7, BG_FOREST);

// Re-do water (rows 7-8 from sprites-tileset)
place(4, 1, 32, 7, BG_WATER);
place(5, 1, 36, 7, BG_WATER);
place(6, 1, 40, 7, BG_WATER);

// Write output
const output = PNG.sync.write(dst);
fs.writeFileSync('./web-client/public/maps/starter_town/tileset.png', output);
console.log(`Done: tileset.png written (${DST_WIDTH}×${DST_HEIGHT})`);
