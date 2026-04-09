// Analyze sprites-tileset.png to extract tile colors at each position
const fs = require('fs');
const { PNG } = require('pngjs');

const TILE_SIZE = 16;
const src = fs.readFileSync('./sprites-tileset.png');
const png = PNG.sync.read(src);

const cols = Math.floor(png.width / TILE_SIZE);
const rows = Math.floor(png.height / TILE_SIZE);

console.log(`Image: ${png.width}x${png.height}`);
console.log(`Tiles: ${cols} cols × ${rows} rows`);
console.log('');

// Get average color of a tile
function getTileAvgColor(col, row) {
  let r = 0, g = 0, b = 0, a = 0, count = 0;
  for (let py = 0; py < TILE_SIZE; py++) {
    for (let px = 0; px < TILE_SIZE; px++) {
      const idx = ((row * TILE_SIZE + py) * png.width + (col * TILE_SIZE + px)) * 4;
      r += png.data[idx];
      g += png.data[idx + 1];
      b += png.data[idx + 2];
      a += png.data[idx + 3];
      count++;
    }
  }
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
    a: Math.round(a / count),
  };
}

// Get top-left pixel of a tile
function getTileCornerPixel(col, row) {
  const idx = (row * TILE_SIZE * png.width + col * TILE_SIZE) * 4;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

// Classify tile by color
function classifyTile(avg) {
  if (avg.a < 50) return 'EMPTY';
  const { r, g, b } = avg;
  // Dark forest green
  if (g > r + 20 && g > b + 20 && g < 100) return 'forest_dark';
  // Medium green
  if (g > r + 15 && g > b + 15 && g >= 100 && g < 150) return 'grass_med';
  // Light green
  if (g > r + 10 && g > b + 10 && g >= 130) return 'grass_light';
  // Brown/dirt
  if (r > 100 && g > 60 && b < 80 && r > g) return 'dirt';
  // Gray stone
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r > 80 && r < 180) return 'stone';
  // Blue water
  if (b > r + 20 && b > g - 10) return 'water';
  // Sandy/path
  if (r > 150 && g > 130 && b < 100 && r > g) return 'path';
  // Dark (cave/black)
  if (r < 60 && g < 60 && b < 60) return 'dark';
  return `rgb(${r},${g},${b})`;
}

console.log('First 8 rows, first 20 columns:');
console.log('Row | Col | AvgColor | Class');
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 20; col++) {
    const avg = getTileAvgColor(col, row);
    const cls = classifyTile(avg);
    console.log(`  ${String(row).padStart(2)} | ${String(col).padStart(3)} | r:${String(avg.r).padStart(3)} g:${String(avg.g).padStart(3)} b:${String(avg.b).padStart(3)} a:${String(avg.a).padStart(3)} | ${cls}`);
  }
}
