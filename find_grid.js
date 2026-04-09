// Find tile grid size by detecting borders/seams in the image
const fs = require('fs');
const { PNG } = require('pngjs');

for (const fname of ['01.png', '02.png', '03.png']) {
  const img = PNG.sync.read(fs.readFileSync(`./${fname}`));
  console.log(`\n=== ${fname} (${img.width}×${img.height}) ===`);

  // Look for horizontal seam lines (rows where alpha is low or color is uniform)
  function rowSimilarity(y) {
    let sum = 0;
    for (let x = 1; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const j = (y * img.width + x - 1) * 4;
      const dr = Math.abs(img.data[i] - img.data[j]);
      const dg = Math.abs(img.data[i+1] - img.data[j+1]);
      const db = Math.abs(img.data[i+2] - img.data[j+2]);
      sum += dr + dg + db;
    }
    return sum / img.width;
  }

  // Find seam rows (low horizontal variance = solid color row)
  const seamRows = [];
  for (let y = 0; y < img.height; y++) {
    if (rowSimilarity(y) < 30) seamRows.push(y);
  }

  // Find gaps between seam groups
  const gaps = [];
  let lastSeam = -1;
  for (const y of seamRows) {
    if (lastSeam >= 0 && y - lastSeam > 2) {
      gaps.push(y - lastSeam - 1);
    }
    lastSeam = y;
  }

  // Find most common gap
  const gapCounts = {};
  for (const g of gaps) gapCounts[g] = (gapCounts[g] || 0) + 1;
  const sortedGaps = Object.entries(gapCounts).sort((a,b) => b[1]-a[1]);
  console.log('Seam rows:', seamRows.slice(0, 10), '...');
  console.log('Most common row gaps:', sortedGaps.slice(0, 5));

  // Try different tile sizes
  console.log('Clean divisors (width):');
  for (let ts = 16; ts <= 128; ts++) {
    if (img.width % ts === 0) {
      console.log(`  ${ts}px → ${img.width/ts} cols`);
    }
  }
  console.log('Clean divisors (height):');
  for (let ts = 16; ts <= 128; ts++) {
    if (img.height % ts === 0) {
      console.log(`  ${ts}px → ${img.height/ts} rows`);
    }
  }
}
