const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = [
  path.join(root, "web-client", "public", "maps", "starter_town", "map.json"),
  path.join(root, "web-client", "dist", "maps", "starter_town", "map.json"),
];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function classifyGid(gid) {
  if (gid >= 1 && gid <= 4) return "grass_light";
  if (gid >= 5 && gid <= 8) return "grass_dark";
  if (gid >= 9 && gid <= 12) return "dirt";
  if (gid >= 13 && gid <= 16) return "road";
  if (gid >= 17 && gid <= 20) return "forest_floor";
  if (gid >= 21 && gid <= 23) return "water";
  if (gid >= 24 && gid <= 43) return "dark_on_light";
  if (gid >= 44 && gid <= 63) return "dirt_on_grass";
  if (gid >= 64 && gid <= 83) return "road_on_dirt";
  if (gid >= 84 && gid <= 103) return "forest_on_dark";
  return "other";
}

function chooseFallback(y, height) {
  const band = y / Math.max(1, height - 1);
  if (band < 0.25) return 6;
  if (band < 0.55) return 5;
  if (band < 0.82) return 6;
  return 17;
}

function fillGroundLayer(layer, width, height) {
  const original = layer.data.slice();
  const result = layer.data.slice();
  let changed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (original[index] !== 0) {
        continue;
      }

      const candidates = [];
      for (let radius = 1; radius <= 3; radius++) {
        for (let oy = -radius; oy <= radius; oy++) {
          for (let ox = -radius; ox <= radius; ox++) {
            if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) {
              continue;
            }
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const neighbor = original[ny * width + nx];
            if (!neighbor) {
              continue;
            }
            const kind = classifyGid(neighbor);
            if (
              kind === "water" ||
              kind === "other" ||
              kind === "dark_on_light" ||
              kind === "dirt_on_grass" ||
              kind === "road_on_dirt" ||
              kind === "forest_on_dark"
            ) {
              continue;
            }
            candidates.push({ gid: neighbor, kind, distance: Math.abs(ox) + Math.abs(oy) });
          }
        }
        if (candidates.length) {
          break;
        }
      }

      if (candidates.length) {
        candidates.sort((a, b) => a.distance - b.distance);
        result[index] = candidates[0].gid;
      } else {
        result[index] = chooseFallback(y, height);
      }
      changed++;
    }
  }

  layer.data = result;
  return changed;
}

for (const target of targets) {
  const map = loadJson(target);
  const ground = map.layers.find((layer) => layer.type === "tilelayer" && layer.name === "ground");
  if (!ground) {
    throw new Error(`Ground layer not found in ${target}`);
  }

  const changed = fillGroundLayer(ground, map.width, map.height);
  saveJson(target, map);
  console.log(JSON.stringify({ file: target, changed }, null, 2));
}
