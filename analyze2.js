// Full analysis of sprites-tileset.png
const fs = require('fs');
const { PNG } = require('pngjs');

const TILE_SIZE = 16;
const src = fs.readFileSync('./sprites-tileset.png');
const png = PNG.sync.read(src);

const cols = Math.floor(png.width / TILE_SIZE);
const rows = Math.floor(png.height / TILE_SIZE);

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

function isSolid(avg) { return avg.a > 200; }
function isEmpty(avg) { return avg.a < 30; }

console.log(`Total: ${cols} cols × ${rows} rows`);
console.log('\nSolid tiles (alpha > 200):');
for (let row = 0; row < rows; row++) {
  const solidTiles = [];
  for (let col = 0; col < cols; col++) {
    const avg = getTileAvgColor(col, row);
    if (isSolid(avg)) {
      let type = '?';
      const { r, g, b } = avg;
      if (g > r + 15 && g > b + 15 && g >= 100) type = 'GRASS';
      else if (g > r + 10 && g > b + 10 && g < 100) type = 'DARK_GRASS';
      else if (r > g && r > b && r > 100 && g > 60) type = 'DIRT';
      else if (Math.abs(r-g) < 25 && Math.abs(g-b) < 25 && r > 80) type = 'STONE';
      else if (b > r && b > g) type = 'WATER';
      else if (r < 60 && g < 60 && b < 60) type = 'BLACK';
      else if (r > 150 && g > 100 && b < 80) type = 'BROWN';
      else type = `r${r}g${g}b${b}`;
      solidTiles.push(`c${col}:${type}`);
    }
  }
  if (solidTiles.length > 0) {
    console.log(`  Row ${String(row).padStart(2)}: ${solidTiles.join(' | ')}`);
  }
}
