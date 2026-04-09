// Extract all tiles from 01.png and 03.png as a labeled proof sheet (32px scaled)
const fs = require('fs');
const { PNG } = require('pngjs');

const TSIZE = 50, BORDER = 1, STRIDE = 51, THUMB = 32;

function extractTile32(img, col, row) {
  const sx = BORDER + col * STRIDE;
  const sy = BORDER + row * STRIDE;
  const out = [];
  for (let dy = 0; dy < THUMB; dy++) {
    for (let dx = 0; dx < THUMB; dx++) {
      const spx = Math.floor(dx * TSIZE / THUMB);
      const spy = Math.floor(dy * TSIZE / THUMB);
      const i = ((sy + spy) * img.width + (sx + spx)) * 4;
      out.push(img.data[i], img.data[i+1], img.data[i+2], img.data[i+3]);
    }
  }
  return out;
}

for (const fname of ['01.png', '03.png']) {
  const img = PNG.sync.read(fs.readFileSync(`./${fname}`));
  const cols = Math.floor((img.width - BORDER) / STRIDE);
  const rows = Math.floor((img.height - BORDER) / STRIDE);

  const out = new PNG({ width: cols * THUMB, height: rows * THUMB });
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const pixels = extractTile32(img, col, row);
      for (let dy = 0; dy < THUMB; dy++) {
        for (let dx = 0; dx < THUMB; dx++) {
          const pi = (dy * THUMB + dx) * 4;
          const di = ((row * THUMB + dy) * out.width + (col * THUMB + dx)) * 4;
          out.data[di]   = pixels[pi];
          out.data[di+1] = pixels[pi+1];
          out.data[di+2] = pixels[pi+2];
          out.data[di+3] = pixels[pi+3];
        }
      }
    }
  }
  const outName = `proof_${fname}`;
  fs.writeFileSync(outName, PNG.sync.write(out));
  console.log(`${outName}: ${cols}×${rows} tiles at 32px`);
}
