'use strict';
/**
 * gen_ent_sprite.js
 * Generates a pixel-art Ent (tree monster) sprite sheet matching the shared VisualSpec layout.
 *
 * Layout: 192×192 px frames, 8 columns, 12 rows
 *   Row 0:  walk_up    (8 frames)
 *   Row 1:  walk_down  (8 frames)
 *   Row 2:  walk_left  (8 frames)
 *   Row 3:  walk_right (8 frames)
 *   Row 4:  idle_up    (8 frames)
 *   Row 5:  idle_down  (8 frames)
 *   Row 6:  idle_left  (8 frames)
 *   Row 7:  idle_right (8 frames)
 *   Row 8:  attack_up  (8 frames)
 *   Row 9:  attack_down / hurt (8 frames, first 3 = hurt)
 *   Row 10: attack_left (8 frames)
 *   Row 11: attack_right / death (8 frames)
 *
 * The Ent is drawn as a large tree-creature: thick bark trunk, wide leafy canopy,
 * root-like legs, gnarled branch arms.
 *
 * Because this is pixel-art generated programmatically, we build the Ent from
 * geometric shapes layered with colour variation and shading, matching the style
 * of the reference (Ent0_* sprite sheet provided by the user).
 */

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FRAME = 192;
const COLS  = 8;
const ROWS  = 12;
const OUT_W = FRAME * COLS;
const OUT_H = FRAME * ROWS;

const dst = new PNG({ width: OUT_W, height: OUT_H });
dst.data.fill(0); // transparent

// ─── Pixel helpers ────────────────────────────────────────────────────────────

function px(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= OUT_W || y >= OUT_H || a === 0) return;
  const i = (y * OUT_W + x) * 4;
  // src-over composite
  const sA = a / 255, dA = dst.data[i+3] / 255;
  const oA = sA + dA * (1 - sA);
  if (oA === 0) return;
  dst.data[i]   = Math.round((r * sA + dst.data[i]   * dA * (1-sA)) / oA);
  dst.data[i+1] = Math.round((g * sA + dst.data[i+1] * dA * (1-sA)) / oA);
  dst.data[i+2] = Math.round((b * sA + dst.data[i+2] * dA * (1-sA)) / oA);
  dst.data[i+3] = Math.round(oA * 255);
}

function fpx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= OUT_W || y >= OUT_H) return;
  const i = (y * OUT_W + x) * 4;
  dst.data[i]=r; dst.data[i+1]=g; dst.data[i+2]=b; dst.data[i+3]=a;
}

function ellipse(cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx*dx)/(rx*rx) + (dy*dy)/(ry*ry);
      if (d > 1) continue;
      const edge = Math.max(0, d - 0.75) * 4; // soft edge
      const alpha = Math.round(a * (1 - edge));
      px(Math.round(cx+dx), Math.round(cy+dy), r, g, b, alpha);
    }
  }
}

function rect(x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      px(x, y, r, g, b, a);
}

function line(x0, y0, x1, y1, thickness, r, g, b, a = 255) {
  const dx = x1-x0, dy = y1-y0;
  const len = Math.sqrt(dx*dx+dy*dy);
  if (len < 1) return;
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i/steps;
    const cx = x0 + dx*t, cy = y0 + dy*t;
    for (let ty = -thickness; ty <= thickness; ty++)
      for (let tx = -thickness; tx <= thickness; tx++)
        if (tx*tx+ty*ty <= thickness*thickness)
          px(Math.round(cx+tx), Math.round(cy+ty), r, g, b, a);
  }
}

// hash for deterministic variation
function h(x, y, seed = 0) {
  let v = (x * 374761393 + y * 1013904223 + seed * 2246822519) >>> 0;
  v ^= v >>> 16; v = Math.imul(v, 0x85ebca6b) >>> 0;
  v ^= v >>> 13; v = Math.imul(v, 0xc2b2ae35) >>> 0;
  return (v >>> 0) / 0xFFFFFFFF;
}

// ─── Ent colour palette ───────────────────────────────────────────────────────
const BARK_DARK  = [62,  38, 20];   // very dark brown (shadows)
const BARK_MED   = [90,  58, 28];   // main trunk bark
const BARK_LIGHT = [118, 80, 42];   // highlight bark
const BARK_HIGH2 = [145, 102, 55];  // brightest bark highlight
const LEAF_DARK  = [28,  72, 18];   // deep forest shadow
const LEAF_MED   = [48,  108, 30];  // main foliage
const LEAF_LIGHT = [75,  145, 42];  // highlight foliage
const LEAF_LIME  = [95,  170, 50];  // bright top highlights
const EYE_AMBER  = [220, 148, 30];  // glowing eyes
const EYE_GLOW   = [255, 200, 80];  // eye core
const ROOT_DARK  = [52,  30, 12];   // root shadow
const ROOT_MED   = [78,  48, 22];   // root colour
const DIRT_1     = [110, 80, 48];   // ground dirt on roots

// ─── Draw functions ──────────────────────────────────────────────────────────

/**
 * Draw the Ent body centered at (cx, cy) into the sheet.
 * cx, cy = pixel coords in sheet (center of frame).
 * phase: animation frame 0-7 → drives subtle motion offsets.
 * action: 'idle'|'walk'|'attack'|'hurt'|'death'
 * facing: 'down'|'up'|'left'|'right'
 */
function drawEnt(cx, cy, phase, action, facing) {
  const t = phase / 7; // 0..1
  // Breathing / sway
  const sway = Math.sin(t * Math.PI * 2) * 1.5;
  const bob  = Math.cos(t * Math.PI * 2) * 1.0;

  // Action overrides
  let trunkOffX = 0, trunkOffY = 0;
  let armLOffX = 0, armLOffY = 0;
  let armROffX = 0, armROffY = 0;
  let canopyScale = 1.0;
  let legSplay = 0;
  let alpha = 255;
  let tilt = 0;

  const walkPhase = Math.sin(t * Math.PI * 2);
  const attackPhase = Math.sin(t * Math.PI); // 0→peak→0

  if (action === 'idle') {
    trunkOffX = sway * 0.4;
    trunkOffY = bob * 0.6;
    armLOffX = -sway;
    armROffX = sway;
    canopyScale = 1.0 + Math.abs(bob) * 0.01;
  } else if (action === 'walk') {
    trunkOffX = walkPhase * 2;
    trunkOffY = Math.abs(walkPhase) * 1.5;
    armLOffY = walkPhase * 5;
    armROffY = -walkPhase * 5;
    legSplay = walkPhase * 4;
  } else if (action === 'attack') {
    // Lurch forward aggressively
    trunkOffX = (facing === 'right' ? 1 : facing === 'left' ? -1 : 0) * attackPhase * 10;
    trunkOffY = attackPhase * 4;
    armROffX  = (facing === 'right' ? 1 : -1) * attackPhase * 18;
    armROffY  = -attackPhase * 12;
    armLOffX  = -(facing === 'right' ? 1 : -1) * attackPhase * 6;
    armLOffY  = attackPhase * 8;
    canopyScale = 1.0 + attackPhase * 0.04;
    tilt = attackPhase * 8;
  } else if (action === 'hurt') {
    trunkOffX = (phase < 2 ? -6 : 6);
    canopyScale = 0.96;
    alpha = 200 + Math.round(55 * (1 - phase / 2));
  } else if (action === 'death') {
    // Ent falls over
    trunkOffY = phase * 5;
    trunkOffX = phase * 8;
    canopyScale = 1 - phase * 0.08;
    alpha = Math.max(0, 255 - phase * 28);
    tilt = phase * 18;
  }

  // Mirror for left-facing (just flip arm offsets for now — full mirroring done in sheet copy)
  if (facing === 'left') {
    trunkOffX = -trunkOffX;
    armLOffX  = -armLOffX;
    armROffX  = -armROffX;
    legSplay  = -legSplay;
    tilt      = -tilt;
  }

  const tx = Math.round(cx + trunkOffX);
  const ty = Math.round(cy + trunkOffY);

  // --- Roots / feet ---
  // Left root
  line(tx - 14, ty + 38,
       tx - 24 - legSplay, ty + 54,
       5, ...ROOT_MED, alpha);
  line(tx - 10, ty + 40,
       tx - 18 - legSplay, ty + 58,
       3, ...ROOT_DARK, alpha);
  // Right root
  line(tx + 14, ty + 38,
       tx + 24 + legSplay, ty + 54,
       5, ...ROOT_MED, alpha);
  line(tx + 10, ty + 40,
       tx + 18 + legSplay, ty + 58,
       3, ...ROOT_DARK, alpha);
  // Centre root (smaller)
  line(tx, ty + 42,
       tx + legSplay*0.3, ty + 58,
       3, ...ROOT_DARK, alpha);

  // Dirt splats at root tips
  ellipse(tx - 24 - legSplay, ty + 55, 4, 2, ...DIRT_1, Math.round(alpha*0.7));
  ellipse(tx + 24 + legSplay, ty + 55, 4, 2, ...DIRT_1, Math.round(alpha*0.7));

  // --- Trunk ---
  // Main trunk body (tapers from wide at bottom to slightly narrower at top)
  for (let dy = -30; dy <= 38; dy++) {
    const yt = ty + dy;
    const widthFrac = (dy + 30) / 68; // 0 (top) → 1 (bottom)
    const hw = Math.round(14 + widthFrac * 6); // 14..20 px half-width

    for (let dx = -hw; dx <= hw; dx++) {
      const xp = tx + dx;
      const edgeFrac = Math.abs(dx) / hw;
      // Bark colour varies with position
      const vn = h(xp, yt, 7);
      let r = BARK_MED[0], g = BARK_MED[1], b = BARK_MED[2];
      if (edgeFrac < 0.25) { r=BARK_HIGH2[0]; g=BARK_HIGH2[1]; b=BARK_HIGH2[2]; }
      else if (edgeFrac < 0.55) { r=BARK_LIGHT[0]; g=BARK_LIGHT[1]; b=BARK_LIGHT[2]; }
      if (vn < 0.25) { r=BARK_DARK[0]; g=BARK_DARK[1]; b=BARK_DARK[2]; }
      px(xp, yt, r, g, b, alpha);
    }
  }

  // Bark detail lines (vertical grooves)
  for (const gx of [-8, 0, 8]) {
    for (let dy = -26; dy <= 34; dy++) {
      if (h(tx+gx, ty+dy, 9) < 0.4) {
        px(tx+gx, ty+dy, ...BARK_DARK, Math.round(alpha * 0.55));
      }
    }
  }

  // Moss patches (dark green splotches on trunk)
  for (let m = 0; m < 6; m++) {
    const mx2 = tx + Math.round((h(m,0,1) - 0.5) * 22);
    const my2 = ty + Math.round(h(m,0,2) * 56 - 24);
    ellipse(mx2, my2, 3 + Math.round(h(m,0,3)*3), 2, 30, 82, 20, Math.round(alpha*0.5));
  }

  // --- Eyes (glow) ---
  const eyeY = ty - 12;
  const eyeOff = facing === 'up' ? 0 : 8;
  if (facing !== 'up') {
    ellipse(tx - eyeOff,   eyeY, 5, 4, ...EYE_AMBER, alpha);
    ellipse(tx + eyeOff,   eyeY, 5, 4, ...EYE_AMBER, alpha);
    ellipse(tx - eyeOff,   eyeY, 2, 2, ...EYE_GLOW, alpha);
    ellipse(tx + eyeOff,   eyeY, 2, 2, ...EYE_GLOW, alpha);
    // Angry brow
    line(tx - eyeOff - 5, eyeY - 5, tx - eyeOff + 5, eyeY - 3, 2, ...BARK_DARK, alpha);
    line(tx + eyeOff - 5, eyeY - 3, tx + eyeOff + 5, eyeY - 5, 2, ...BARK_DARK, alpha);
  }

  // --- Arms ---
  // Left arm
  const lAx = tx - 18 + Math.round(armLOffX);
  const lAy = ty - 8  + Math.round(armLOffY);
  line(tx - 16, ty - 8, lAx - 12, lAy + 16, 6, ...BARK_MED, alpha);
  line(tx - 16, ty - 8, lAx - 12, lAy + 16, 3, ...BARK_DARK, alpha);
  // Claw tips
  line(lAx - 12, lAy + 16, lAx - 18, lAy + 22, 3, ...BARK_DARK, alpha);
  line(lAx - 12, lAy + 16, lAx -  8, lAy + 24, 3, ...BARK_DARK, alpha);
  line(lAx - 12, lAy + 16, lAx -  2, lAy + 22, 2, ...BARK_DARK, alpha);

  // Right arm
  const rAx = tx + 18 + Math.round(armROffX);
  const rAy = ty - 8  + Math.round(armROffY);
  line(tx + 16, ty - 8, rAx + 12, rAy + 16, 6, ...BARK_MED, alpha);
  line(tx + 16, ty - 8, rAx + 12, rAy + 16, 3, ...BARK_DARK, alpha);
  line(rAx + 12, rAy + 16, rAx + 18, rAy + 22, 3, ...BARK_DARK, alpha);
  line(rAx + 12, rAy + 16, rAx +  8, rAy + 24, 3, ...BARK_DARK, alpha);
  line(rAx + 12, rAy + 16, rAx +  2, rAy + 22, 2, ...BARK_DARK, alpha);

  // --- Canopy (large, layered leafy crown) ---
  const cScale = canopyScale;
  const cTop = ty - 85;
  const cCX  = tx + sway * 0.3;

  // Shadow layer (behind)
  ellipse(cCX + 3, cTop + 3, Math.round(52*cScale), Math.round(44*cScale), ...LEAF_DARK, Math.round(alpha*0.5));

  // Main canopy — multi-blob organic shape
  const blobs = [
    [0, 0, 52, 44],
    [-24, 10, 30, 26],
    [24, 8, 32, 28],
    [-12, -14, 28, 24],
    [14, -12, 30, 26],
    [-30, 2, 22, 20],
    [30, 2, 22, 20],
    [0, -20, 34, 28],
  ];
  for (const [bx, by, brx, bry] of blobs) {
    ellipse(
      cCX + bx, cTop + by,
      Math.round(brx * cScale), Math.round(bry * cScale),
      ...LEAF_MED, alpha,
    );
  }
  // Mid highlights
  const hBlobs = [
    [-6, -10, 28, 22],
    [18, -6, 24, 20],
    [-20, 4, 20, 16],
    [0, -22, 22, 18],
  ];
  for (const [bx, by, brx, bry] of hBlobs) {
    ellipse(
      cCX + bx, cTop + by,
      Math.round(brx * cScale), Math.round(bry * cScale),
      ...LEAF_LIGHT, alpha,
    );
  }
  // Top highlight specks
  ellipse(cCX - 5, cTop - 18, Math.round(12*cScale), Math.round(10*cScale), ...LEAF_LIME, alpha);
  ellipse(cCX + 12, cTop - 14, Math.round(10*cScale), Math.round(8*cScale), ...LEAF_LIME, alpha);

  // Leaf scatter specks
  for (let sp = 0; sp < 18; sp++) {
    const spx = cCX + Math.round((h(sp, 0, 11) - 0.5) * 90 * cScale);
    const spy = cTop + Math.round((h(sp, 0, 12) - 0.5) * 76 * cScale);
    const size = 1 + Math.round(h(sp, 0, 13) * 2);
    ellipse(spx, spy, size, size, ...LEAF_LIME, Math.round(alpha * 0.7));
  }

  // Dark internal shadows in canopy
  ellipse(cCX - 20, cTop + 18, Math.round(16*cScale), Math.round(12*cScale), ...LEAF_DARK, Math.round(alpha*0.5));
  ellipse(cCX + 22, cTop + 14, Math.round(14*cScale), Math.round(10*cScale), ...LEAF_DARK, Math.round(alpha*0.45));

  // Hanging vines / roots from canopy edge
  for (const vx of [-38, -22, 20, 36]) {
    const vLen = 8 + Math.round(h(vx, 0, 5) * 10);
    line(
      cCX + vx, cTop + 34,
      cCX + vx + Math.round(h(vx,0,6)*4-2), cTop + 34 + vLen,
      1, ...LEAF_DARK, Math.round(alpha * 0.6),
    );
  }
}

// ─── Sheet assembly ─────────────────────────────────────────────────────────

const ACTIONS = [
  // [row, action, facing]
  [0,  'walk',   'up'],
  [1,  'walk',   'down'],
  [2,  'walk',   'left'],
  [3,  'walk',   'right'],
  [4,  'idle',   'up'],
  [5,  'idle',   'down'],
  [6,  'idle',   'left'],
  [7,  'idle',   'right'],
  [8,  'attack', 'up'],
  [9,  'attack', 'down'],
  [10, 'attack', 'left'],
  [11, 'attack', 'right'],
];

// Hurt frames: first 3 frames of row 9 override
const HURT_FRAMES = [[9, 0], [9, 1], [9, 2]];
// Death frames: first 6 frames of row 11 override
const DEATH_FRAMES = [[11, 0],[11,1],[11,2],[11,3],[11,4],[11,5]];

console.log('Generating Ent sprite sheet...');
for (const [row, action, facing] of ACTIONS) {
  for (let col = 0; col < COLS; col++) {
    // Center of this frame
    const fcx = col * FRAME + FRAME / 2;
    const fcy = row * FRAME + FRAME / 2 + 16; // shift down slightly (roots below center)

    // Determine actual action for special rows
    let act = action;
    let ph  = col;

    // Row 9: first 3 frames = hurt, rest = attack_down
    if (row === 9 && col < 3) { act = 'hurt'; ph = col; }
    // Row 11: first 6 frames = death, rest = attack_right
    if (row === 11 && col < 6) { act = 'death'; ph = col; }

    drawEnt(fcx, fcy, ph, act, facing);
  }
  process.stdout.write(`  Row ${row} done\n`);
}

// Mirror left-facing rows from right-facing (flip horizontally within each frame)
function mirrorRow(srcRow, dstRow) {
  for (let col = 0; col < COLS; col++) {
    const fx0 = col * FRAME;
    const fy0 = dstRow * FRAME;
    const sx0 = col * FRAME;
    const sy0 = srcRow * FRAME;
    for (let dy = 0; dy < FRAME; dy++) {
      for (let dx = 0; dx < FRAME; dx++) {
        const si = ((sy0 + dy) * OUT_W + (sx0 + FRAME - 1 - dx)) * 4;
        const di = ((fy0 + dy) * OUT_W + (fx0 + dx)) * 4;
        dst.data[di]   = dst.data[si];
        dst.data[di+1] = dst.data[si+1];
        dst.data[di+2] = dst.data[si+2];
        dst.data[di+3] = dst.data[si+3];
      }
    }
  }
}

// Rows 2 (walk_left) ← mirror of row 3 (walk_right)
// Rows 6 (idle_left) ← mirror of row 7 (idle_right)
// Row 10 (attack_left) ← mirror of row 11 (attack_right)
// NOTE: rows were already drawn with left facing, mirroring improves symmetry
// Instead we copy+flip right-facing rows onto left-facing:
mirrorRow(3, 2);   // walk
mirrorRow(7, 6);   // idle
mirrorRow(11, 10); // attack

const outDir = path.join(__dirname, 'web-client/public/sprites/mobs/ent');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'ent_sprite_sheet.png');
fs.writeFileSync(outPath, PNG.sync.write(dst));
console.log(`✓ ent_sprite_sheet.png written (${OUT_W}×${OUT_H})`);
