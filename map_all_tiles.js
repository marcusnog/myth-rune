// Sample ALL tiles in 01.png and 03.png (51px grid, 1px border)
const fs = require('fs');
const { PNG } = require('pngjs');

const TSIZE = 50, BORDER = 1, STRIDE = 51;

function sampleTile(img, col, row) {
  let r=0,g=0,b=0,a=0,n=0;
  const sx = BORDER + col*STRIDE, sy = BORDER + row*STRIDE;
  for(let py=4;py<TSIZE-4;py++) for(let px=4;px<TSIZE-4;px++) {
    const i=((sy+py)*img.width+(sx+px))*4;
    r+=img.data[i]; g+=img.data[i+1]; b+=img.data[i+2]; a+=img.data[i+3]; n++;
  }
  return {r:r/n|0,g:g/n|0,b:b/n|0,a:a/n|0};
}

function classify(c) {
  if(c.a < 80) return 'EMPTY';
  const {r,g,b} = c;
  if(g>r+20 && g>b+20 && g>100) return `GRASS(${g})`;
  if(g>r+10 && g>b+10 && g>60) return `D_GRASS(${g})`;
  if(b>r+30 && b>g-10 && b>120) return `WATER(${b})`;
  if(r>g+20 && r>b+20 && r>120) return `RED`;
  if(r>100 && g>70 && b<80 && r>g) return `DIRT(${r},${g})`;
  if(Math.abs(r-g)<25 && Math.abs(g-b)<25 && r>80) return `STONE(${r})`;
  if(r<60 && g<60 && b<60) return `DARK`;
  return `rgb(${r},${g},${b})`;
}

for(const fname of ['01.png','03.png']) {
  const img = PNG.sync.read(fs.readFileSync(`./${fname}`));
  const cols = Math.floor((img.width - BORDER) / STRIDE);
  const rows = Math.floor((img.height - BORDER) / STRIDE);
  console.log(`\n=== ${fname} (${img.width}x${img.height}) => ${cols}c x ${rows}r ===`);
  for(let row=0;row<rows;row++) {
    const line = [];
    for(let col=0;col<cols;col++) {
      const c = sampleTile(img, col, row);
      line.push(`[${col}]${classify(c)}`);
    }
    console.log(`Row ${row}: ${line.join('  ')}`);
  }
}
