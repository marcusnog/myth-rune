'use strict';
const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SCALE = 16;
const WEATHER = path.join(__dirname, 'web-client/public/sprites/weather');

function upscale(src, scale, bgR = 40, bgG = 60, bgB = 40) {
  const out = new PNG({ width: src.width * scale, height: src.height * scale });
  for (let dy = 0; dy < out.height; dy++) {
    for (let dx = 0; dx < out.width; dx++) {
      const sx = Math.floor(dx / scale), sy = Math.floor(dy / scale);
      const si = (sy * src.width + sx) * 4;
      const r = src.data[si], g = src.data[si+1], b = src.data[si+2], a = src.data[si+3];
      const alpha = a / 255;
      const di = (dy * out.width + dx) * 4;
      out.data[di]   = Math.round(r * alpha + bgR * (1 - alpha));
      out.data[di+1] = Math.round(g * alpha + bgG * (1 - alpha));
      out.data[di+2] = Math.round(b * alpha + bgB * (1 - alpha));
      out.data[di+3] = 255;
    }
  }
  return out;
}

for (const name of ['weather_rain.png', 'weather_snow.png']) {
  const src = PNG.sync.read(fs.readFileSync(path.join(WEATHER, name)));
  const out = upscale(src, SCALE);
  const outName = name.replace('.png', '_preview.png');
  fs.writeFileSync(path.join(WEATHER, outName), PNG.sync.write(out));
  console.log(`${outName}: ${out.width}×${out.height}`);
}
