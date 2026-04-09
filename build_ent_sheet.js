'use strict';
/**
 * build_ent_sheet.js
 * Extracts frames from ent.png (reference sheet) and assembles a
 * Phaser-compatible sprite sheet: 128×128 frames, 8 cols × 12 rows.
 *
 * Source layout (ent.png):
 *   Row 0 (Idle):   4 frames  — Idle1..4
 *   Row 1 (Walk):   7 frames  — Walk1..7
 *   Row 2 (Attack): 7 frames  — Atk1..7
 *   Row 3 (Hurt/Death): Hit1, Hit2, Die1, Die2, Die3
 *
 * Target layout (matching DIRECTIONAL_ROWS in sprites.ts):
 *   Row 0:  walk_up    — mirror walk frames
 *   Row 1:  walk_down  — walk frames (forward-facing)
 *   Row 2:  walk_left  — mirror of row 3
 *   Row 3:  walk_right — walk frames
 *   Row 4:  idle_up    — idle frames
 *   Row 5:  idle_down  — idle frames
 *   Row 6:  idle_left  — mirror idle
 *   Row 7:  idle_right — idle frames
 *   Row 8:  attack_up  — attack frames
 *   Row 9:  attack_down / hurt (first 3 = hurt)
 *   Row 10: attack_left
 *   Row 11: attack_right / death (first 6 = death)
 */

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Load source
const src = PNG.sync.read(fs.readFileSync('./ent.png'));
console.log(`Source: ${src.width}×${src.height}`);

// ─── Detect frame grid in source ─────────────────────────────────────────────
// The source has rows separated by labels/whitespace.
// We scan for non-transparent, non-white pixel groups to find frame bounding boxes.

function rowAlpha(y) {
  let sum = 0;
  for (let x = 0; x < src.width; x++) {
    sum += src.data[(y * src.width + x) * 4 + 3];
  }
  return sum / src.width;
}

// Find row bands (groups of rows with content)
const bands = [];
let inBand = false, bandStart = 0;
for (let y = 0; y < src.height; y++) {
  const a = rowAlpha(y);
  if (a > 8 && !inBand) { inBand = true; bandStart = y; }
  if (a <= 8 && inBand) { inBand = false; bands.push({ y0: bandStart, y1: y - 1 }); }
}
if (inBand) bands.push({ y0: bandStart, y1: src.height - 1 });

console.log('Content bands:', bands.map(b => `y=${b.y0}..${b.y1} h=${b.y1-b.y0+1}`).join(', '));

// For each band, find column groups
function colAlphaInBand(x, band) {
  let sum = 0;
  for (let y = band.y0; y <= band.y1; y++) {
    sum += src.data[(y * src.width + x) * 4 + 3];
  }
  return sum / (band.y1 - band.y0 + 1);
}

const sourceFrames = []; // { x0, y0, x1, y1 } for each frame

for (const band of bands) {
  const cols = [];
  let inCol = false, colStart = 0;
  for (let x = 0; x < src.width; x++) {
    const a = colAlphaInBand(x, band);
    if (a > 4 && !inCol) { inCol = true; colStart = x; }
    if (a <= 4 && inCol) {
      inCol = false;
      cols.push({ x0: colStart, x1: x - 1 });
    }
  }
  if (inCol) cols.push({ x0: colStart, x1: src.width - 1 });

  for (const col of cols) {
    sourceFrames.push({ x0: col.x0, y0: band.y0, x1: col.x1, y1: band.y1 });
  }
}

console.log(`Found ${sourceFrames.length} source frames`);
sourceFrames.forEach((f, i) => {
  console.log(`  Frame ${i}: x=${f.x0}..${f.x1} (w=${f.x1-f.x0+1}) y=${f.y0}..${f.y1} (h=${f.y1-f.y0+1})`);
});

// ─── Build output sheet ───────────────────────────────────────────────────────
const FRAME = 128;
const OUT_COLS = 8;
const OUT_ROWS = 12;
const OUT_W = FRAME * OUT_COLS;
const OUT_H = FRAME * OUT_ROWS;

const dst = new PNG({ width: OUT_W, height: OUT_H });
dst.data.fill(0);

/**
 * Copy a source frame into a dst tile, centering it and scaling to fit.
 * dstCol, dstRow: position in output grid.
 * srcFrame: { x0, y0, x1, y1 } in source image.
 * flipH: mirror horizontally.
 */
function copyFrame(dstCol, dstRow, srcFrame, flipH = false) {
  const sw = srcFrame.x1 - srcFrame.x0 + 1;
  const sh = srcFrame.y1 - srcFrame.y0 + 1;

  // Scale to fit FRAME×FRAME keeping aspect ratio
  const scale = Math.min(FRAME / sw, FRAME / sh) * 0.92; // slight margin
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  // Center in frame
  const ox = Math.round((FRAME - dw) / 2);
  const oy = Math.round((FRAME - dh) / 2);

  const dstBaseX = dstCol * FRAME;
  const dstBaseY = dstRow * FRAME;

  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      // Sample source pixel (bilinear-ish nearest)
      const spx = Math.min(sw - 1, Math.floor(dx / scale));
      const spy = Math.min(sh - 1, Math.floor(dy / scale));
      const si = ((srcFrame.y0 + spy) * src.width + (srcFrame.x0 + spx)) * 4;

      const ddx = flipH ? (dw - 1 - dx) : dx;
      const di = ((dstBaseY + oy + dy) * OUT_W + (dstBaseX + ox + ddx)) * 4;

      dst.data[di]   = src.data[si];
      dst.data[di+1] = src.data[si+1];
      dst.data[di+2] = src.data[si+2];
      dst.data[di+3] = src.data[si+3];
    }
  }
}

// Source frame groups (by order found):
// Idle frames are the first group found
// Walk frames are second group
// Attack frames are third group
// Hurt/Death frames are fourth group

// We expect 4 groups corresponding to the 4 rows of reference art
// Map source frame index ranges:
//   idle:   frames 0..3  (4 frames)
//   walk:   frames 4..10 (7 frames)
//   attack: frames 11..17 (7 frames)
//   hurt/death: frames 18.. (5 frames: hit1, hit2, die1, die2, die3)

// Detect groups by y-band
const groupedFrames = {};
const bandSet = [...new Set(sourceFrames.map(f => f.y0))].sort((a,b)=>a-b);
bandSet.forEach((y0, gi) => {
  groupedFrames[gi] = sourceFrames.filter(f => f.y0 === y0);
});

console.log('\nGroups by row:');
Object.entries(groupedFrames).forEach(([gi, frames]) => {
  console.log(`  Group ${gi}: ${frames.length} frames`);
});

const idleFrames   = groupedFrames[0] || [];
const walkFrames   = groupedFrames[1] || [];
const attackFrames = groupedFrames[2] || [];
const hurtFrames   = (groupedFrames[3] || []).slice(0, 2);
const deathFrames  = (groupedFrames[3] || []).slice(2, 5);

console.log(`\nIdle:${idleFrames.length} Walk:${walkFrames.length} Attack:${attackFrames.length} Hurt:${hurtFrames.length} Death:${deathFrames.length}`);

// Helper: fill a full output row with frames, repeating last frame if needed
function fillRow(dstRow, frames, flipH = false) {
  for (let col = 0; col < OUT_COLS; col++) {
    const frame = frames[Math.min(col, frames.length - 1)];
    copyFrame(col, dstRow, frame, flipH);
  }
}

// Row 0: walk_up (use walk frames, slightly darkened / same)
fillRow(0, walkFrames, false);
// Row 1: walk_down (walk frames, forward facing)
fillRow(1, walkFrames, false);
// Row 2: walk_left (mirrored walk)
fillRow(2, walkFrames, true);
// Row 3: walk_right (walk frames)
fillRow(3, walkFrames, false);

// Row 4: idle_up
fillRow(4, idleFrames, false);
// Row 5: idle_down
fillRow(5, idleFrames, false);
// Row 6: idle_left (mirrored)
fillRow(6, idleFrames, true);
// Row 7: idle_right
fillRow(7, idleFrames, false);

// Row 8: attack_up
fillRow(8, attackFrames, false);
// Row 9: attack_down — first 3 cols = hurt frames, rest = attack
for (let col = 0; col < OUT_COLS; col++) {
  if (col < hurtFrames.length) {
    copyFrame(col, 9, hurtFrames[col]);
  } else {
    const af = attackFrames[Math.min(col - hurtFrames.length, attackFrames.length - 1)];
    copyFrame(col, 9, af);
  }
}
// Row 10: attack_left (mirrored attack)
fillRow(10, attackFrames, true);
// Row 11: attack_right — first 6 cols = death, rest = attack
for (let col = 0; col < OUT_COLS; col++) {
  if (col < deathFrames.length) {
    copyFrame(col, 11, deathFrames[col]);
  } else {
    const af = attackFrames[Math.min(col - deathFrames.length, attackFrames.length - 1)];
    copyFrame(col, 11, af);
  }
}

const outPath = './web-client/public/sprites/mobs/ent/ent_sprite_sheet.png';
fs.writeFileSync(outPath, PNG.sync.write(dst));
console.log(`\n✓ ${outPath} (${OUT_W}×${OUT_H})`);
