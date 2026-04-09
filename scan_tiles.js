// Scan for interesting non-empty tiles in sprites-tileset.png
const fs = require('fs');
const { PNG } = require('pngjs');

const TILE = 16;
const src = PNG.sync.read(fs.readFileSync('./sprites-tileset.png'));
const SRC_W = src.width;
const COLS = Math.floor(SRC_W / TILE);
const ROWS = Math.floor(src.height / TILE);

function tileAvg(col, row) {
  let r=0,g=0,b=0,a=0,n=0;
  for(let py=0;py<TILE;py++) for(let px=0;px<TILE;px++) {
    const i = ((row*TILE+py)*SRC_W+(col*TILE+px))*4;
    r+=src.data[i]; g+=src.data[i+1]; b+=src.data[i+2]; a+=src.data[i+3]; n++;
  }
  return {r:r/n|0,g:g/n|0,b:b/n|0,a:a/n|0};
}

// Scan rows 8-22 for building-like solid tiles
console.log('Rows 8-22 solid tiles (alpha>180):');
for(let row=8;row<ROWS;row++) {
  const found = [];
  for(let col=0;col<COLS;col++) {
    const c = tileAvg(col,row);
    if(c.a > 180) {
      let type = `rgb(${c.r},${c.g},${c.b})`;
      if(c.r>150&&c.g>120&&c.b>90&&c.r<230&&Math.abs(c.r-c.g)<40) type='WALL/PLASTER';
      else if(c.r>150&&c.g>50&&c.b<80&&c.r>c.g+50) type='RED_ROOF';
      else if(c.b>140&&c.b>c.r+50) type='BLUE_ROOF';
      else if(c.r>100&&c.g>60&&c.b<60&&c.r>c.g) type='WOOD/BROWN';
      else if(Math.abs(c.r-c.g)<25&&Math.abs(c.g-c.b)<25&&c.r>80) type='STONE/GRAY';
      found.push(`c${col}:${type}`);
    }
  }
  if(found.length) console.log(`  Row ${row}: ${found.join(' | ')}`);
}
