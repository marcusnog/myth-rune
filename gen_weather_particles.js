'use strict';
/**
 * gen_weather_particles.js — crisp pixel-art weather particles for Phaser 3.
 *
 * weather_rain.png  18×16  — 3 frames of 6×16  (straight, 1px diagonal, 2px diagonal)
 * weather_snow.png  64×16  — 4 frames of 16×16 (dot, cross, 6-arm, 6-arm+barbs)
 */

const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, 'web-client/public/sprites/weather');

// ─── pixel helpers ────────────────────────────────────────────────────────────

function newPng(w, h) {
  const p = new PNG({ width: w, height: h });
  p.data.fill(0);
  return p;
}

// Force-set pixel (no compositing — used for opaque center regions)
function forcePixel(png, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i]   = r;
  png.data[i+1] = g;
  png.data[i+2] = b;
  png.data[i+3] = a;
}

// Alpha-composite src OVER existing dst (Porter-Duff src-over)
function blendPixel(png, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || a <= 0) return;
  const i = (y * png.width + x) * 4;
  const dstA = png.data[i+3];
  if (dstA === 0) {
    png.data[i]=r; png.data[i+1]=g; png.data[i+2]=b; png.data[i+3]=a;
    return;
  }
  const sA = a / 255, dA = dstA / 255;
  const oA = sA + dA * (1 - sA);
  png.data[i]   = Math.round((r   * sA + png.data[i]   * dA * (1 - sA)) / oA);
  png.data[i+1] = Math.round((g   * sA + png.data[i+1] * dA * (1 - sA)) / oA);
  png.data[i+2] = Math.round((b   * sA + png.data[i+2] * dA * (1 - sA)) / oA);
  png.data[i+3] = Math.round(oA * 255);
}

function save(png, name) {
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(png));
  console.log(`✓  ${name}  (${png.width}×${png.height})`);
}

// ─── RAIN ─────────────────────────────────────────────────────────────────────
// Each frame 6×16. Streak: 1-pixel-wide core + 1px soft edge, 12px tall.
// Diagonal 0/1/2 = horizontal shift accumulated over the streak height.

function paintRainFrame(png, ox, diagonal) {
  const H = 13, Y0 = 2;
  const MX = ox + 3; // center x of this 6px frame

  for (let dy = 0; dy < H; dy++) {
    const t  = dy / (H - 1);
    const px = MX + Math.round(diagonal * t);   // integer x shift for diagonal
    const py = Y0 + dy;

    // Alpha: fade in top 25%, solid below
    const fadeIn = Math.min(1, t / 0.25);
    const coreA  = Math.round(fadeIn * 230);
    const edgeA  = Math.round(fadeIn * 70);

    // Color: white → pale ice-blue
    const r = Math.round(255 - 55 * t);
    const g = Math.round(255 - 30 * t);
    const b = 255;

    // 1px core
    forcePixel(png, px, py, r, g, b, coreA);
    // 1px left soft fringe
    blendPixel(png, px - 1, py, r, g, b, edgeA);
    // 1px right soft fringe (only for first two thirds, gives teardrop taper at tip)
    if (t < 0.85) blendPixel(png, px + 1, py, r, g, b, Math.round(edgeA * (1 - t)));
  }

  // Bright sharp tip at very bottom (leading edge of falling drop)
  const tipPx = MX + diagonal;
  const tipPy = Y0 + H - 1;
  forcePixel(png, tipPx, tipPy, 255, 255, 255, 255);
}

function makeRainTexture() {
  const FRAME_W = 6, FRAME_H = 16, FRAMES = 3;
  const png = newPng(FRAME_W * FRAMES, FRAME_H);
  paintRainFrame(png, 0,  0);   // straight
  paintRainFrame(png, 6,  1);   // 1px diagonal
  paintRainFrame(png, 12, 2);   // 2px diagonal
  save(png, 'weather_rain.png');
}

// ─── SNOW ─────────────────────────────────────────────────────────────────────
// Each frame 16×16. CX=CY=7.5 (float center, half-pixel centered).

const CX = 7.5, CY = 7.5;

// Soft circular dot
function paintDot(png, ox, radius) {
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius + 0.5) continue;
      const edge = Math.max(0, d - (radius - 0.5)); // 0=full, 1=transparent
      const a    = Math.round(255 * (1 - edge));
      blendPixel(png, ox + Math.round(CX + dx), Math.round(CY + dy), 255, 255, 255, a);
    }
  }
}

// Draw arm from center outward at given angle
function paintArm(png, ox, angle, length, baseAlpha) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let r = 0; r <= length; r++) {
    const t    = r / length;
    const a    = Math.round(baseAlpha * (1 - t * 0.4));
    const xf   = CX + cos * r, yf = CY + sin * r;
    const xi   = Math.round(xf), yi = Math.round(yf);
    const xFrac = xf - xi + 0.5, yFrac = yf - yi + 0.5; // [0..1]

    // Bilinear splat onto 2×2 footprint
    for (let sy = 0; sy <= 1; sy++) {
      for (let sx = 0; sx <= 1; sx++) {
        const weight = (sx === 0 ? (1 - xFrac) : xFrac) * (sy === 0 ? (1 - yFrac) : yFrac);
        if (weight < 0.05) continue;
        blendPixel(png, ox + xi + sx - 1, yi + sy - 1, 255, 255, 255, Math.round(a * weight));
      }
    }
  }
}

// Small barbs branching off an arm
function paintBarbs(png, ox, angle, armLen, barbLen) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const perpA = angle + Math.PI / 2;
  const pcx = Math.cos(perpA), pcy = Math.sin(perpA);

  const midR = armLen * 0.5;
  const mx = CX + cos * midR, my = CY + sin * midR;

  for (let b = 1; b <= barbLen; b++) {
    const t  = b / barbLen;
    const ba = Math.round(200 * (1 - t));
    const bx1 = Math.round(mx + pcx * b), by1 = Math.round(my + pcy * b);
    const bx2 = Math.round(mx - pcx * b), by2 = Math.round(my - pcy * b);
    blendPixel(png, ox + bx1, by1, 255, 255, 255, ba);
    blendPixel(png, ox + bx2, by2, 255, 255, 255, ba);
  }
}

function paintSnowCenter(png, ox) {
  // Hard-force a clean 3×3 white center AFTER arms are drawn (prevents blue bleed)
  const cx = Math.round(CX), cy = Math.round(CY);
  forcePixel(png, ox + cx,   cy,   255, 255, 255, 255);
  forcePixel(png, ox + cx+1, cy,   255, 255, 255, 190);
  forcePixel(png, ox + cx-1, cy,   255, 255, 255, 190);
  forcePixel(png, ox + cx,   cy+1, 255, 255, 255, 190);
  forcePixel(png, ox + cx,   cy-1, 255, 255, 255, 190);
}

function paintFlake(png, ox, arms, armLen, barbLen = 0) {
  for (let a = 0; a < arms; a++) {
    const angle = (a / arms) * Math.PI * 2;
    paintArm(png, ox, angle, armLen, 240);
    if (barbLen > 0) paintBarbs(png, ox, angle, armLen, barbLen);
  }
  paintSnowCenter(png, ox);
}

function makeSnowTexture() {
  const FRAME_W = 16, FRAMES = 4;
  const png = newPng(FRAME_W * FRAMES, 16);

  // Frame 0: tiny dot (radius 1.2) + two micro scatter pixels
  paintDot(png, 0, 1.2);
  blendPixel(png, 3,  4, 255, 255, 255, 100);
  blendPixel(png, 2, 11, 255, 255, 255, 70);

  // Frame 1: small 4-arm cross (arm length 2.5, no barbs)
  paintFlake(png, 16, 4, 2.5);

  // Frame 2: medium 6-arm flake (arm length 4.5, no barbs)
  paintFlake(png, 32, 6, 4.5);

  // Frame 3: large 6-arm flake with barbs (arm length 5.8, barbs 1.5)
  paintFlake(png, 48, 6, 5.8, 2);

  save(png, 'weather_snow.png');
}

makeRainTexture();
makeSnowTexture();
