const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const root = process.cwd();
const base = path.join(root, "web-client", "public", "maps", "starter_town");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
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

const preview = readPng(path.join(base, "preview_nanobanana_test.png"));
const atlas = readPng(path.join(base, "runtime_props", "atlas.png"));
const atlasMeta = readJson(path.join(base, "runtime_props", "atlas.json"));
const layout = readJson(path.join(base, "runtime_props", "layout.json"));

const map = readJson(path.join(base, "map.json"));
const previewTileWidth = preview.width / map.width;
const previewTileHeight = preview.height / map.height;

const out = new PNG({ width: preview.width, height: preview.height });
out.data.set(preview.data);

const placements = [...(layout.placements || [])].sort((a, b) => a.tileY - b.tileY);
for (const placement of placements) {
  const frame = atlasMeta.items[placement.id];
  if (!frame) continue;

  const sprite = new PNG({ width: frame.width, height: frame.height });
  sprite.data.fill(0);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const sx = ((frame.y + y) * atlas.width + (frame.x + x)) * 4;
      const di = (y * frame.width + x) * 4;
      sprite.data[di] = atlas.data[sx];
      sprite.data[di + 1] = atlas.data[sx + 1];
      sprite.data[di + 2] = atlas.data[sx + 2];
      sprite.data[di + 3] = atlas.data[sx + 3];
    }
  }

  const worldX = placement.tileX * previewTileWidth + previewTileWidth / 2;
  const worldY = (placement.tileY + 1) * previewTileHeight;
  const drawX = Math.round(worldX - frame.width / 2);
  const drawY = Math.round(worldY - frame.height);
  blit(sprite, out, drawX, drawY);
}

const output = path.join(base, "runtime_props", "layout_preview.png");
writePng(output, out);
console.log(JSON.stringify({ output, placementCount: placements.length }, null, 2));
