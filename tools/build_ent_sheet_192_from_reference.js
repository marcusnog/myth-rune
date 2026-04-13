'use strict';
/**
 * build_ent_sheet_192_from_reference.js
 *
 * Builds a Phaser-compatible Ent spritesheet from the reference art:
 *   Input:  web-client/public/sprites/mobs/ent/ent_reference.png
 *   Output: web-client/public/sprites/mobs/ent/ent_sprite_sheet.png
 *
 * Output layout must match `VISUAL_SPECS.ent` in `web-client/src/data/sprites.ts`:
 * - 192×192 frames
 * - 8 columns × 12 rows
 * - Rows 0–3: walk up/down/left/right
 * - Rows 4–7: idle up/down/left/right
 * - Rows 8–11: attack up/down/left/right
 *   - Row 9 first 3 frames = hurt
 *   - Row 11 first 6 frames = death
 *
 * The reference sheet includes white text labels; we ignore near-white pixels
 * when detecting content bands/frames.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FRAME = 192;
const OUT_COLS = 8;
const OUT_ROWS = 12;
const OUT_W = FRAME * OUT_COLS;
const OUT_H = FRAME * OUT_ROWS;

const ROOT = path.join(__dirname, '..');
const IN_PATH = path.join(
  ROOT,
  'web-client',
  'public',
  'sprites',
  'mobs',
  'ent',
  'ent_reference.png',
);
const OUT_PATH = path.join(
  ROOT,
  'web-client',
  'public',
  'sprites',
  'mobs',
  'ent',
  'ent_sprite_sheet.png',
);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function brightness(r, g, b) {
  return r + g + b;
}

function isNearBlack(r, g, b) {
  return r <= 2 && g <= 2 && b <= 2;
}

function isNearWhite(r, g, b) {
  return r >= 235 && g >= 235 && b >= 235;
}

function shouldCopyPixel(r, g, b, a) {
  return isDetectableContent(r, g, b, a);
}

function isDetectableContent(r, g, b, a) {
  if (a === 0) return false;
  // Reference has opaque black background; treat near-black as background.
  if (isNearBlack(r, g, b)) return false;
  // Ignore label text (pure/near white).
  if (isNearWhite(r, g, b)) return false;
  // Ignore bright UI/text-ish pixels (the labels are light gray, not always pure white).
  if (brightness(r, g, b) >= 560) return false;
  return true;
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function rowActivity(src, y) {
  let count = 0;
  for (let x = 0; x < src.width; x++) {
    const i = (y * src.width + x) * 4;
    if (isDetectableContent(src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3])) {
      count++;
    }
  }
  return count;
}

function colActivityInBand(src, x, band) {
  let count = 0;
  for (let y = band.y0; y <= band.y1; y++) {
    const i = (y * src.width + x) * 4;
    if (isDetectableContent(src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3])) {
      count++;
    }
  }
  return count;
}

function findBands(src) {
  const threshold = Math.max(12, Math.floor(src.width * 0.01)); // needs at least some pixels
  const bands = [];
  let inBand = false;
  let y0 = 0;

  for (let y = 0; y < src.height; y++) {
    const active = rowActivity(src, y) >= threshold;
    if (active && !inBand) {
      inBand = true;
      y0 = y;
    } else if (!active && inBand) {
      inBand = false;
      const y1 = y - 1;
      if (y1 - y0 >= 10) bands.push({ y0, y1 });
    }
  }
  if (inBand) {
    const y1 = src.height - 1;
    if (y1 - y0 >= 10) bands.push({ y0, y1 });
  }

  return bands;
}

function findColumnsInBand(src, band) {
  const threshold = Math.max(10, Math.floor((band.y1 - band.y0 + 1) * 0.06));
  const cols = [];
  let inCol = false;
  let x0 = 0;
  for (let x = 0; x < src.width; x++) {
    const active = colActivityInBand(src, x, band) >= threshold;
    if (active && !inCol) {
      inCol = true;
      x0 = x;
    } else if (!active && inCol) {
      inCol = false;
      const x1 = x - 1;
      if (x1 - x0 >= 10) cols.push({ x0, x1 });
    }
  }
  if (inCol) {
    const x1 = src.width - 1;
    if (x1 - x0 >= 10) cols.push({ x0, x1 });
  }
  return cols;
}

function computeContentBounds(src, rect) {
  const rectH = rect.y1 - rect.y0 + 1;
  const rectW = rect.x1 - rect.x0 + 1;
  const yScanMax = rect.y0 + Math.floor(rectH * 0.82);
  const localHeight = yScanMax - rect.y0 + 1;
  const visited = new Uint8Array(rectW * localHeight);

  let best = null;
  const centerX = (rect.x0 + rect.x1) / 2;
  const centerY = (rect.y0 + yScanMax) / 2;

  function idx(localX, localY) {
    return localY * rectW + localX;
  }

  for (let y = rect.y0; y <= yScanMax; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const localX = x - rect.x0;
      const localY = y - rect.y0;
      const startIndex = idx(localX, localY);
      if (visited[startIndex]) continue;
      visited[startIndex] = 1;

      const i = (y * src.width + x) * 4;
      if (!isDetectableContent(src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3])) {
        continue;
      }

      const stack = [[x, y]];
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        for (let ny = cy - 1; ny <= cy + 1; ny++) {
          if (ny < rect.y0 || ny > yScanMax) continue;
          for (let nx = cx - 1; nx <= cx + 1; nx++) {
            if (nx < rect.x0 || nx > rect.x1) continue;
            if (nx === cx && ny === cy) continue;
            const nLocalX = nx - rect.x0;
            const nLocalY = ny - rect.y0;
            const neighborIndex = idx(nLocalX, nLocalY);
            if (visited[neighborIndex]) continue;
            visited[neighborIndex] = 1;
            const ni = (ny * src.width + nx) * 4;
            if (isDetectableContent(src.data[ni], src.data[ni + 1], src.data[ni + 2], src.data[ni + 3])) {
              stack.push([nx, ny]);
            }
          }
        }
      }

      const componentCenterX = (minX + maxX) / 2;
      const componentCenterY = (minY + maxY) / 2;
      const score =
        area * 1000 -
        Math.abs(componentCenterX - centerX) * 8 -
        Math.abs(componentCenterY - centerY) * 4;

      if (!best || score > best.score) {
        best = { minX, minY, maxX, maxY, score };
      }
    }
  }

  if (!best) return null;

  // Expand bounds to reduce over-zooming (tiny crops get scaled up too much).
  // Also add padding to better include outlines/limbs.
  const pad = 14;
  let x0 = clamp(best.minX - pad, rect.x0, rect.x1);
  let y0 = clamp(best.minY - pad, rect.y0, rect.y1);
  let x1 = clamp(best.maxX + pad, rect.x0, rect.x1);
  let y1 = clamp(best.maxY + pad, rect.y0, rect.y1);

  const minDim = 120;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < minDim || h < minDim) {
    const cx = Math.round((x0 + x1) / 2);
    const cy = Math.round((y0 + y1) / 2);
    const halfW = Math.ceil(Math.max(w, minDim) / 2);
    const halfH = Math.ceil(Math.max(h, minDim) / 2);
    x0 = clamp(cx - halfW, rect.x0, rect.x1);
    x1 = clamp(cx + halfW, rect.x0, rect.x1);
    y0 = clamp(cy - halfH, rect.y0, rect.y1);
    y1 = clamp(cy + halfH, rect.y0, rect.y1);
  }

  return { x0, y0, x1, y1 };
}

function extractFrames(src) {
  const bands = findBands(src);
  // Expect at least 4 main bands (idle, walk, attack, hurt/death). If there are more,
  // we still process them but will only consume what we need.
  const framesByBand = bands.map((band) => {
    const cols = findColumnsInBand(src, band);
    const rects = cols
      .map((c) => ({ x0: c.x0, x1: c.x1, y0: band.y0, y1: band.y1 }))
      .map((r) => computeContentBounds(src, r))
      .filter(Boolean);
    // Sort left-to-right by x0
    rects.sort((a, b) => a.x0 - b.x0);
    return rects;
  });

  return { bands, framesByBand };
}

function copyFrameScaled(dst, dstCol, dstRow, src, srcRect, { flipH = false } = {}) {
  const sw = srcRect.x1 - srcRect.x0 + 1;
  const sh = srcRect.y1 - srcRect.y0 + 1;
  const scale = Math.min(FRAME / sw, FRAME / sh) * 0.92;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const ox = Math.round((FRAME - dw) / 2);
  const oy = Math.round((FRAME - dh) / 2);
  const baseX = dstCol * FRAME;
  const baseY = dstRow * FRAME;

  for (let dy = 0; dy < dh; dy++) {
    const spy = Math.min(sh - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < dw; dx++) {
      const spx = Math.min(sw - 1, Math.floor(dx / scale));
      const sx = srcRect.x0 + spx;
      const sy = srcRect.y0 + spy;
      const si = (sy * src.width + sx) * 4;
      const r = src.data[si];
      const g = src.data[si + 1];
      const b = src.data[si + 2];
      const a = src.data[si + 3];

      if (!shouldCopyPixel(r, g, b, a)) {
        continue;
      }

      const ddx = flipH ? dw - 1 - dx : dx;
      const tx = baseX + ox + ddx;
      const ty = baseY + oy + dy;
      const di = (ty * dst.width + tx) * 4;

      dst.data[di] = r;
      dst.data[di + 1] = g;
      dst.data[di + 2] = b;
      dst.data[di + 3] = a;
    }
  }
}

function fillRow(dst, dstRow, frames, { flipH = false } = {}) {
  for (let col = 0; col < OUT_COLS; col++) {
    const frame = frames[Math.min(col, frames.length - 1)];
    copyFrameScaled(dst, col, dstRow, srcPng, frame, { flipH });
  }
}

function clearPixel(dst, x, y) {
  const i = (y * dst.width + x) * 4;
  dst.data[i] = 0;
  dst.data[i + 1] = 0;
  dst.data[i + 2] = 0;
  dst.data[i + 3] = 0;
}

function isInsideExpandedBox(a, b, padding) {
  return (
    a.x0 >= b.x0 - padding &&
    a.x1 <= b.x1 + padding &&
    a.y0 >= b.y0 - padding &&
    a.y1 <= b.y1 + padding
  );
}

function cleanupFrame(dst, frameCol, frameRow) {
  const baseX = frameCol * FRAME;
  const baseY = frameRow * FRAME;
  const visited = new Uint8Array(FRAME * FRAME);
  const components = [];

  function localIndex(x, y) {
    return y * FRAME + x;
  }

  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const startIndex = localIndex(x, y);
      if (visited[startIndex]) continue;
      visited[startIndex] = 1;

      const startAlphaIndex = ((baseY + y) * dst.width + (baseX + x)) * 4 + 3;
      if (dst.data[startAlphaIndex] === 0) continue;

      const stack = [[x, y]];
      const pixels = [];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        for (let ny = cy - 1; ny <= cy + 1; ny++) {
          if (ny < 0 || ny >= FRAME) continue;
          for (let nx = cx - 1; nx <= cx + 1; nx++) {
            if (nx < 0 || nx >= FRAME) continue;
            if (nx === cx && ny === cy) continue;
            const neighborIndex = localIndex(nx, ny);
            if (visited[neighborIndex]) continue;
            visited[neighborIndex] = 1;
            const alphaIndex = ((baseY + ny) * dst.width + (baseX + nx)) * 4 + 3;
            if (dst.data[alphaIndex] === 0) continue;
            stack.push([nx, ny]);
          }
        }
      }

      components.push({
        area: pixels.length,
        bbox: { x0: minX, y0: minY, x1: maxX, y1: maxY },
        pixels,
      });
    }
  }

  if (components.length <= 1) return;

  const largest = components.reduce((best, component) =>
    component.area > best.area ? component : best
  );
  const areaThreshold = Math.max(48, Math.floor(largest.area * 0.08));

  for (const component of components) {
    const centerY = (component.bbox.y0 + component.bbox.y1) / 2;
    const keep =
      component === largest ||
      isInsideExpandedBox(component.bbox, largest.bbox, 4) ||
      (component.area >= areaThreshold && centerY >= largest.bbox.y0);

    if (keep) continue;
    for (const [x, y] of component.pixels) {
      clearPixel(dst, baseX + x, baseY + y);
    }
  }
}

function cleanupOutputSheet(dst) {
  for (let row = 0; row < OUT_ROWS; row++) {
    for (let col = 0; col < OUT_COLS; col++) {
      cleanupFrame(dst, col, row);
    }
  }
}

// --- Main ---
if (!fs.existsSync(IN_PATH)) {
  console.error(`Missing input: ${IN_PATH}`);
  process.exit(1);
}

const srcPng = readPng(IN_PATH);
console.log(`Input: ${IN_PATH}`);
console.log(`  size: ${srcPng.width}×${srcPng.height}`);

const { bands, framesByBand } = extractFrames(srcPng);
console.log(`Detected bands: ${bands.length}`);
framesByBand.forEach((frames, i) =>
  console.log(`  Band ${i}: ${frames.length} frames`),
);

// Some bands may be noise (e.g. thin lines) that yield 0 frame columns.
// Only keep bands with at least 2 frames, preserving order.
const nonEmptyBands = framesByBand.filter((frames) => frames.length > 1);
console.log(`Usable bands: ${nonEmptyBands.length}`);
nonEmptyBands.forEach((frames, i) =>
  console.log(`  UseBand ${i}: ${frames.length} frames`),
);

const idleFrames = nonEmptyBands[0] ?? [];
const walkFrames = nonEmptyBands[1] ?? [];
const attackFrames = nonEmptyBands[2] ?? [];
const hurtDeathFrames = nonEmptyBands[3] ?? [];

if (idleFrames.length < 2 || walkFrames.length < 3 || attackFrames.length < 3) {
  console.error('Frame detection failed (not enough frames).');
  process.exit(2);
}

// Reference commonly has: hurt 2 frames, death 3 frames; we will repeat to fill.
const hurtFrames = hurtDeathFrames.slice(0, 2);
const deathFrames = hurtDeathFrames.slice(2, 5);

const dst = new PNG({ width: OUT_W, height: OUT_H });
dst.data.fill(0);

// walk rows
fillRow(dst, 0, walkFrames, { flipH: false }); // up (reuse)
fillRow(dst, 1, walkFrames, { flipH: false }); // down
fillRow(dst, 2, walkFrames, { flipH: true }); // left
fillRow(dst, 3, walkFrames, { flipH: false }); // right

// idle rows
fillRow(dst, 4, idleFrames, { flipH: false }); // up
fillRow(dst, 5, idleFrames, { flipH: false }); // down
fillRow(dst, 6, idleFrames, { flipH: true }); // left
fillRow(dst, 7, idleFrames, { flipH: false }); // right

// attack rows
fillRow(dst, 8, attackFrames, { flipH: false }); // up

// Row 9: first 3 = hurt, rest = attack_down
for (let col = 0; col < OUT_COLS; col++) {
  if (col < 3) {
    const hf = hurtFrames[Math.min(col, hurtFrames.length - 1)] ?? attackFrames[0];
    copyFrameScaled(dst, col, 9, srcPng, hf, { flipH: false });
  } else {
    const af = attackFrames[Math.min(col - 3, attackFrames.length - 1)];
    copyFrameScaled(dst, col, 9, srcPng, af, { flipH: false });
  }
}

fillRow(dst, 10, attackFrames, { flipH: true }); // left

// Row 11: first 6 = death, rest = attack_right
for (let col = 0; col < OUT_COLS; col++) {
  if (col < 6) {
    const df = deathFrames[Math.min(col, deathFrames.length - 1)] ?? attackFrames[0];
    copyFrameScaled(dst, col, 11, srcPng, df, { flipH: false });
  } else {
    const af = attackFrames[Math.min(col - 6, attackFrames.length - 1)];
    copyFrameScaled(dst, col, 11, srcPng, af, { flipH: false });
  }
}

cleanupOutputSheet(dst);

writePng(OUT_PATH, dst);
console.log(`Output: ${OUT_PATH}`);
console.log(`  size: ${dst.width}×${dst.height}`);
