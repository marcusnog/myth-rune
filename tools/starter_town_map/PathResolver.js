'use strict';

const { registry } = require('./TileRegistry');

const PATH = {
  NONE: 0,
  DIRT: 1,
  ROAD: 2,
};

function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

function paintDisc(mask, width, height, cx, cy, radius, value) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      if (distance(x, y, cx, cy) <= radius + 0.2) {
        mask[y * width + x] = value;
      }
    }
  }
}

function paintSegment(mask, width, height, x0, y0, x1, y1, radius, value) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / Math.max(1, steps);
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    paintDisc(mask, width, height, x, y, radius, value);
  }
}

function resolveOrthogonalGid(mask, width, x, y, variants) {
  const has = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < width && mask[ny * width + nx] > 0;
  };
  const n = has(0, -1);
  const e = has(1, 0);
  const s = has(0, 1);
  const w = has(-1, 0);
  const count = Number(n) + Number(e) + Number(s) + Number(w);
  if ((n || s) && !(e || w)) return variants[0];
  if ((e || w) && !(n || s)) return variants[1];
  if (count >= 3) return variants[3];
  if ((n && e) || (e && s) || (s && w) || (w && n)) return variants[2];
  return (n || s) ? variants[0] : variants[1];
}

function buildPathMask(width, height) {
  const mask = new Uint8Array(width * height);
  paintDisc(mask, width, height, 64, 64, 4.5, PATH.DIRT);
  paintSegment(mask, width, height, 64, 46, 64, 80, 1.35, PATH.DIRT);
  paintSegment(mask, width, height, 46, 64, 82, 64, 1.35, PATH.DIRT);
  paintSegment(mask, width, height, 64, 42, 64, 10, 1.0, PATH.DIRT);
  paintSegment(mask, width, height, 64, 82, 64, 118, 1.0, PATH.DIRT);
  paintSegment(mask, width, height, 42, 64, 10, 64, 1.0, PATH.DIRT);
  paintSegment(mask, width, height, 82, 64, 118, 64, 1.0, PATH.DIRT);
  paintSegment(mask, width, height, 67, 68, 86, 88, 1.15, PATH.DIRT);
  paintDisc(mask, width, height, 87, 89, 4.6, PATH.ROAD);
  return mask;
}

function paintPaths(context, layers) {
  const mask = buildPathMask(context.width, context.height);
  context.pathMask = mask;

  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      const index = y * context.width + x;
      if (mask[index] === PATH.NONE) {
        continue;
      }
      const variants = mask[index] === PATH.ROAD ? registry.terrain.path : registry.terrain.dirt;
      layers.paths[index] = resolveOrthogonalGid(mask, context.width, x, y, variants);
    }
  }
}

module.exports = {
  PATH,
  paintPaths,
};
