const fs = require('fs');
const { PNG } = require('pngjs');

for (const f of ['01.png','02.png','03.png','04.png','sprites-tileset.png']) {
  try {
    const p = PNG.sync.read(fs.readFileSync(`./${f}`));
    console.log(`${f}: ${p.width}x${p.height}`);
    // Check if it divides evenly by common tile sizes
    for (const ts of [16, 32, 48, 64]) {
      if (p.width % ts === 0 && p.height % ts === 0) {
        console.log(`  → ${ts}px tiles: ${p.width/ts} cols × ${p.height/ts} rows`);
      }
    }
  } catch(e) { console.log(`${f}: error - ${e.message}`); }
}
