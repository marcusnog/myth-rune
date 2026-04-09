// Sample specific regions of 01.png and 03.png to understand layout
const fs = require('fs');
const { PNG } = require('pngjs');

function sample(fname, x, y, w, h) {
  const img = PNG.sync.read(fs.readFileSync(`./${fname}`));
  let r=0,g=0,b=0,a=0,n=0;
  for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) {
    if(px<0||py<0||px>=img.width||py>=img.height) continue;
    const i=(py*img.width+px)*4;
    r+=img.data[i]; g+=img.data[i+1]; b+=img.data[i+2]; a+=img.data[i+3]; n++;
  }
  return {r:r/n|0,g:g/n|0,b:b/n|0,a:a/n|0};
}

// Check if tiles are at 51px grid (1px border, 50px tile)
// By sampling the first few grid positions in 01.png
const img01 = PNG.sync.read(fs.readFileSync('./01.png'));
const img03 = PNG.sync.read(fs.readFileSync('./03.png'));

console.log('=== 01.png - Checking tile grid ===');
// Sample top-left pixel of each potential tile at 51px grid
for(let row=0; row<6; row++) {
  const rowSamples = [];
  for(let col=0; col<8; col++) {
    // Try 51px grid (1px border + 50px tile)
    const tx = 1 + col * 51;
    const ty = 1 + row * 51;
    const c = sample('01.png', tx+5, ty+5, 10, 10); // sample center
    const dominant = c.r>c.g && c.r>c.b && c.r>100 ? 'BROWN' :
                     c.g>c.r && c.g>c.b && c.g>80 ? 'GREEN' :
                     c.b>c.r && c.b>c.g && c.b>80 ? 'BLUE' :
                     Math.abs(c.r-c.g)<20&&c.r>100 ? 'GRAY' : `rgb(${c.r},${c.g},${c.b})`;
    rowSamples.push(`[${col},${row}]:${dominant}`);
  }
  console.log(rowSamples.join('  '));
}

console.log('\n=== 03.png - Checking tile grid ===');
for(let row=0; row<4; row++) {
  const rowSamples = [];
  for(let col=0; col<8; col++) {
    const tx = 1 + col * 51;
    const ty = 1 + row * 51;
    const c = sample('03.png', tx+5, ty+5, 10, 10);
    const dominant = c.a < 50 ? 'EMPTY' :
                     c.r>c.g && c.r>c.b && c.r>100 ? 'BROWN' :
                     c.g>c.r && c.g>c.b && c.g>80 ? 'GREEN' :
                     c.b>c.r && c.b>c.g && c.b>80 ? 'BLUE' :
                     Math.abs(c.r-c.g)<20&&c.r>100 ? 'GRAY' : `rgb(${c.r},${c.g},${c.b})`;
    rowSamples.push(`[${col},${row}]:${dominant}`);
  }
  console.log(rowSamples.join('  '));
}

// Write a test crop of tiles 0,0 through 3,3 from 01.png
const TSIZE = 50;
const BORDER = 1;
const COLS = 4, ROWS = 3;
const out = new PNG({width: COLS*(TSIZE+2), height: ROWS*(TSIZE+2)});
out.data.fill(0xff);
for(let row=0;row<ROWS;row++) {
  for(let col=0;col<COLS;col++) {
    const sx = BORDER + col*(TSIZE+BORDER);
    const sy = BORDER + row*(TSIZE+BORDER);
    for(let py=0;py<TSIZE;py++) {
      for(let px=0;px<TSIZE;px++) {
        const si = ((sy+py)*img01.width+(sx+px))*4;
        const di = ((row*(TSIZE+2)+py)*(COLS*(TSIZE+2))+(col*(TSIZE+2)+px))*4;
        out.data[di]=img01.data[si]; out.data[di+1]=img01.data[si+1];
        out.data[di+2]=img01.data[si+2]; out.data[di+3]=img01.data[si+3];
      }
    }
  }
}
fs.writeFileSync('./tile_sample_01.png', PNG.sync.write(out));
console.log('\nWrote tile_sample_01.png (first 4×3 tiles from 01.png)');
