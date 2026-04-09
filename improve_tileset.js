/**
 * improve_tileset.js
 * Enhance tileset.png grass, dirt, stone tiles using actual pixels from sprites-tileset.png,
 * and generate proper tree, fence, and building tiles.
 */
'use strict';

const fs = require('fs');
const { PNG } = require('pngjs');

const TILE = 16, DST = 32, COLS = 16;
const DST_W = COLS * DST; // 512
const DST_H = 11 * DST;   // 352

const src = PNG.sync.read(fs.readFileSync('./sprites-tileset.png'));
const SRC_W = src.width; // 677

// Load existing tileset (so we only modify what we want)
const dst = PNG.sync.read(fs.readFileSync('./web-client/public/maps/starter_town/tileset.png'));

function srcPx(sx, sy) {
  if (sx < 0 || sy < 0 || sx >= SRC_W || sy >= src.height) return [0,0,0,255];
  const i = (sy * SRC_W + sx) * 4;
  return [src.data[i], src.data[i+1], src.data[i+2], src.data[i+3]];
}

// Get pixel from source tile (col, row) at local pixel offset
function srcTile(col, row, px, py) {
  return srcPx(col * TILE + px, row * TILE + py);
}

// Sample source tile with 2x nearest-neighbor scaling
// bgColor = [r,g,b] to composite semi-transparent pixels against
function extract(srcCol, srcRow, bgR, bgG, bgB) {
  const result = [];
  for (let dy = 0; dy < DST; dy++) {
    for (let dx = 0; dx < DST; dx++) {
      const sx = Math.floor(dx / 2);
      const sy = Math.floor(dy / 2);
      let [r, g, b, a] = srcTile(srcCol, srcRow, sx, sy);
      if (a < 255 && bgR !== undefined) {
        const alpha = a / 255;
        r = Math.round(r * alpha + bgR * (1 - alpha));
        g = Math.round(g * alpha + bgG * (1 - alpha));
        b = Math.round(b * alpha + bgB * (1 - alpha));
        a = 255;
      }
      result.push(r, g, b, a);
    }
  }
  return result;
}

// Write pixel data to dst at tile position (dstCol, dstRow)
function writeTile(dstCol, dstRow, pixels) {
  const ox = dstCol * DST, oy = dstRow * DST;
  for (let dy = 0; dy < DST; dy++) {
    for (let dx = 0; dx < DST; dx++) {
      const pi = (dy * DST + dx) * 4;
      const di = ((oy + dy) * DST_W + (ox + dx)) * 4;
      dst.data[di]   = pixels[pi];
      dst.data[di+1] = pixels[pi+1];
      dst.data[di+2] = pixels[pi+2];
      dst.data[di+3] = pixels[pi+3];
    }
  }
}

function place(dstCol, dstRow, srcCol, srcRow, bgR, bgG, bgB) {
  writeTile(dstCol, dstRow, extract(srcCol, srcRow, bgR, bgG, bgB));
}

// Generate solid-noise tile with given base color
function solidNoise(r, g, b, noise = 10, seed = 0) {
  const pixels = [];
  for (let dy = 0; dy < DST; dy++) {
    for (let dx = 0; dx < DST; dx++) {
      let h = (dx * 374761393 + dy * 1013904223 + seed * 2246822519) >>> 0;
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13;
      const n = (h % (noise * 2 + 1)) - noise;
      pixels.push(
        Math.max(0, Math.min(255, r + n)),
        Math.max(0, Math.min(255, g + n)),
        Math.max(0, Math.min(255, b + n)),
        255,
      );
    }
  }
  return pixels;
}

function placeSolid(dstCol, dstRow, r, g, b, noise = 8, seed = 0) {
  writeTile(dstCol, dstRow, solidNoise(r, g, b, noise, seed));
}

// ─── Row 0: grass_light, grass_dark, dirt, road/stone ─────────────────────────
// Use sprites-tileset row 3 for grass variants (solid alpha)
// Row 3 has good green grass tiles at cols 0-12
const GL_BG = [100, 142, 55]; // background for compositing
place(0, 0, 0, 3, ...GL_BG);
place(1, 0, 4, 3, ...GL_BG);
place(2, 0, 8, 3, ...GL_BG);
place(3, 0, 11, 3, ...GL_BG);

// Dark grass from row 7 (forest_dark tiles)
const GD_BG = [52, 88, 30];
place(4, 0, 0, 7, ...GD_BG);
place(5, 0, 1, 7, ...GD_BG);
place(6, 0, 2, 7, ...GD_BG);
place(7, 0, 3, 7, ...GD_BG);

// Dirt from row 3-4
const DT_BG = [148, 112, 62];
place(8, 0, 15, 3, ...DT_BG);
place(9, 0, 16, 3, ...DT_BG);
place(10, 0, 23, 3, ...DT_BG);
place(11, 0, 24, 3, ...DT_BG);

// Stone/road from row 5 (gray stone tiles)
const ST_BG = [135, 133, 125];
place(12, 0, 0, 5, ...ST_BG);
place(13, 0, 1, 5, ...ST_BG);
place(14, 0, 7, 5, ...ST_BG);
place(15, 0, 8, 5, ...ST_BG);

// ─── Row 1: forest_floor, water, transition masks ──────────────────────────────
const FF_BG = [42, 70, 24];
place(0, 1, 5, 7, ...FF_BG);
place(1, 1, 7, 7, ...FF_BG);
place(2, 1, 9, 7, ...FF_BG);
place(3, 1, 11, 7, ...FF_BG);

// Water tiles from row 7 (solid water at cols 32-41)
const WA_BG = [55, 108, 168];
place(4, 1, 32, 7, ...WA_BG);
place(5, 1, 34, 7, ...WA_BG);
place(6, 1, 36, 7, ...WA_BG);

// Transition masks (dark_on_light 0-8): blend between dark and light grass
// These need to be solid light grass with noise (used as overlay in ground_details)
for (let c = 0; c < 9; c++) {
  placeSolid(7 + c, 1, ...GL_BG, 8, c);
}

// ─── Row 2: transitions ─────────────────────────────────────────────────────────
// dark_on_light_mask 9-15 (cols 0-6)
for (let c = 0; c < 7; c++) placeSolid(c, 2, ...GL_BG, 8, c + 10);
// inner corners (cols 7-10)
for (let c = 7; c < 11; c++) placeSolid(c, 2, ...GD_BG, 6, c);
// dirt_on_grass 0-4 (cols 11-15)
for (let c = 11; c < 16; c++) placeSolid(c, 2, ...GL_BG, 10, c);

// ─── Row 3: dirt_on_grass 5-15 + inner corners + road_on_dirt_0 ────────────────
for (let c = 0; c < 11; c++) placeSolid(c, 3, ...GL_BG, 10, c + 20);
for (let c = 11; c < 15; c++) placeSolid(c, 3, ...DT_BG, 6, c);
placeSolid(15, 3, ...DT_BG, 8, 35);

// ─── Row 4: road_on_dirt 1-15 + inner_ne ──────────────────────────────────────
for (let c = 0; c < 15; c++) placeSolid(c, 4, ...DT_BG, 8, c + 40);
placeSolid(15, 4, ...ST_BG, 6, 55);

// ─── Row 5: road_on_dirt inner + forest_on_dark 0-12 ─────────────────────────
for (let c = 0; c < 3; c++) placeSolid(c, 5, ...ST_BG, 6, c + 60);
for (let c = 3; c < 16; c++) placeSolid(c, 5, ...FF_BG, 7, c + 65);

// ─── Row 6: forest_on_dark 13-15 + inner corners + tree tiles ────────────────
for (let c = 0; c < 3; c++) placeSolid(c, 6, ...FF_BG, 7, c + 80);
for (let c = 3; c < 7; c++) placeSolid(c, 6, ...GD_BG, 6, c + 90);

// Tree oak canopy (4 tiles: TL, TR, BL, BR) — rich green
const OAK_DARK = [25, 80, 15, 12, 100];  // r,g,b,noise,seed
const OAK_MED  = [35, 95, 18, 15, 101];
placeSolid(7, 6,  30, 85, 18, 18, 200);  // oak_top_tl
placeSolid(8, 6,  35, 90, 20, 18, 201);  // oak_top_tr
placeSolid(9, 6,  28, 82, 16, 15, 202);  // oak_top_bl
placeSolid(10, 6, 32, 87, 19, 15, 203);  // oak_top_br
placeSolid(11, 6, 82, 58, 28, 8, 204);   // oak_base_l (brown trunk)
placeSolid(12, 6, 76, 54, 24, 8, 205);   // oak_base_r

// Pine canopy (darker, pointed)
placeSolid(13, 6, 22, 68, 14, 15, 210);  // pine_top_tl
placeSolid(14, 6, 26, 72, 16, 15, 211);  // pine_top_tr
placeSolid(15, 6, 20, 65, 13, 12, 212);  // pine_top_bl

// ─── Row 7 ──────────────────────────────────────────────────────────────────────
placeSolid(0, 7,  24, 62, 12, 12, 213);  // pine_top_br
placeSolid(1, 7,  80, 56, 26, 8, 214);   // pine_base_l
placeSolid(2, 7,  74, 51, 22, 8, 215);   // pine_base_r
placeSolid(3, 7,  48, 108, 28, 18, 216); // small_top (green)
placeSolid(4, 7,  76, 52, 22, 6, 217);   // small_base (trunk)

// Leaf litter variants
for (let c = 5; c < 9; c++) {
  placeSolid(c, 7, 38, 72, 22, 20, c + 220);
}

// Bushes (round, green)
placeSolid(9, 7,  38, 108, 22, 20, 230);
placeSolid(11, 7, 34, 102, 19, 18, 232);
placeSolid(13, 7, 36, 105, 21, 18, 234);

// Rocks (gray with variation)
placeSolid(10, 7, 125, 120, 112, 18, 231);
placeSolid(12, 7, 118, 114, 108, 16, 233);
placeSolid(14, 7, 120, 116, 110, 14, 235);

// Logs (wood texture)
placeSolid(15, 7, 112, 75, 38, 12, 240);
placeSolid(0, 8,  106, 68, 32, 12, 241);

// ─── Row 8: Building tiles — extracted from sprites-tileset.png ────────────────
const WALL_BG = [225, 204, 172];
const ROOF_R_BG = [190, 58, 45];
const ROOF_B_BG = [55, 98, 192];
const WOOD_BG = [148, 112, 62];
// Wall plaster: sprites-tileset row 19, col 17 (solid beige wall)
place(1, 8,  17, 19, ...WALL_BG);  // wall_plaster
place(2, 8,  26, 11, 140, 135, 124); // wall_stone (gray stone)
place(3, 8,  18, 20, ...WALL_BG);  // wall_window (plaster variant)
place(4, 8,   9, 12, ...WOOD_BG);  // wall_door (wood brown)
place(5, 8,  25, 20, ...WALL_BG);  // wall_corner_l
place(6, 8,  26, 20, ...WALL_BG);  // wall_corner_r

// Red roof: sprites-tileset row 17, col 24
place(7, 8,  24, 17, ...ROOF_R_BG); // roof_red_center
// Blue roof: sprites-tileset row 19-20, col 22-23
place(8, 8,  22, 19, ...ROOF_B_BG); // roof_blue_center
place(9, 8,  24, 17, ...ROOF_R_BG); // roof_red_edge_l
place(10, 8, 21, 19, ...ROOF_B_BG); // roof_blue_edge_l
place(11, 8, 24, 17, ...ROOF_R_BG); // roof_red_edge_r
place(12, 8, 23, 19, ...ROOF_B_BG); // roof_blue_edge_r
placeSolid(13, 8, 165, 42, 32, 10, 316);  // roof_red_ridge (darker red)
placeSolid(14, 8, 42, 82, 165, 10, 317);  // roof_blue_ridge (darker blue)
placeSolid(15, 8, 172, 46, 36, 12, 318);  // roof_red_gable

// ─── Row 9 ──────────────────────────────────────────────────────────────────────
placeSolid(0, 9,  46, 82, 172, 12, 319);  // roof_blue_gable
// Fence: use wood brown from row 12 of sprites-tileset
place(1, 9,  13, 12, ...WOOD_BG);  // fence_h
place(2, 9,  13, 12, ...WOOD_BG);  // fence_v
place(3, 9,  12, 12, ...WOOD_BG);  // fence_post
place(4, 9,  13, 12, ...WOOD_BG);  // fence_gate
// Well: gray stone
place(5, 9,  28, 11, 140, 135, 124); // well_base
place(6, 9,  24, 11, 140, 135, 124); // well_top
placeSolid(7, 9,  195, 180, 148, 8, 326);  // sign_blank
placeSolid(8, 9,  188, 138, 88, 10, 327);  // sign_tavern
placeSolid(9, 9,  188, 138, 88, 10, 328);  // sign_shop
// Cave: dark stone from row 14
place(10, 9, 30, 14, 40, 38, 36);  // cave_l
place(11, 9, 30, 14, 40, 38, 36);  // cave_r
place(12, 9,  0, 12, ...WOOD_BG);  // barrel (brown floor variant)
place(13, 9,  1, 12, ...WOOD_BG);  // crate
place(14, 9, 15, 12, ...WOOD_BG);  // bench_l
place(15, 9, 17, 12, ...WOOD_BG);  // bench_r

// ─── Row 10: lights + collision ────────────────────────────────────────────────
placeSolid(0, 10, 78, 52, 22, 6, 340);    // torch_base
placeSolid(1, 10, 238, 158, 28, 25, 341); // fire_0
placeSolid(2, 10, 242, 138, 18, 25, 342); // fire_1
placeSolid(3, 10, 248, 118, 12, 25, 343); // fire_2
placeSolid(4, 10, 218, 198, 78, 18, 344); // lantern
// Collision — bright marker colors (invisible in game since layer is hidden)
writeTile(5, 10, solidNoise(255, 0, 0, 0, 350));
writeTile(6, 10, solidNoise(255, 128, 0, 0, 351));
writeTile(7, 10, solidNoise(0, 100, 255, 0, 352));

// Write output
const out = PNG.sync.write(dst);
fs.writeFileSync('./web-client/public/maps/starter_town/tileset.png', out);
console.log('✓ tileset.png updated');
