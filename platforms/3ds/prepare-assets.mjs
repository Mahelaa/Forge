import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
const here = path.dirname(fileURLToPath(import.meta.url));
const png = await fs.readFile(path.resolve(here, '../../public/logo.png'));
let width, height, channels;
const compressed = [];
for (let i = 8; i < png.length;) {
  const size = png.readUInt32BE(i), type = png.toString('ascii', i + 4, i + 8);
  const data = png.subarray(i + 8, i + 8 + size);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw Error('Logo must be an 8-bit, non-interlaced RGB/RGBA PNG');
    channels = data[9] === 2 ? 3 : 4;
  }
  if (type === 'IDAT') compressed.push(data);
  i += size + 12;
}
const raw = zlib.inflateSync(Buffer.concat(compressed)), stride = width * channels;
const pixels = Buffer.alloc(width * height * channels);
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  if (filter > 4) throw Error('Invalid PNG filter');
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? pixels[y * stride + x - channels] : 0;
    const b = y ? pixels[(y - 1) * stride + x] : 0;
    const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
    pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
  }
}
// The supplied brand sheet has a white logo in its lower half.
// Normalized coordinates preserve that exact logo without regenerating it.
function logo(w, h, region = [.185, .639, .633, .223]) {
  const out = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const px = Math.min(width - 1, Math.floor((region[0] + (x + (sx + .5) / 3) / w * region[2]) * width));
      const py = Math.min(height - 1, Math.floor((region[1] + (y + (sy + .5) / 3) / h * region[3]) * height));
      const p = (py * width + px) * channels;
      sum += Math.max(0, Math.min(255, (pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722 - 24) * 255 / 231));
    }
    out[y * w + x] = Math.round(sum / 9);
  }
  return out;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
function encode(w, h, rgb) {
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  const scan = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(scan, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}
function image(w, h, mark, mw, mh, left, top) {
  const rgb = Buffer.alloc(w * h * 3, 16);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const p = ((top + y) * w + left + x) * 3, value = 16 + Math.round(mark[y * mw + x] * 239 / 255);
    rgb[p] = rgb[p + 1] = rgb[p + 2] = value;
  }
  return encode(w, h, rgb);
}
await fs.mkdir(path.join(here, 'assets'), { recursive: true });
await fs.mkdir(path.join(here, 'include'), { recursive: true });
const mark = logo(320, 75), rows = [];
for (let i = 0; i < mark.length; i += 32) rows.push('  ' + [...mark.subarray(i, i + 32)].join(','));
await fs.writeFile(path.join(here, 'include/logo.h'), '#pragma once\n#include <stdint.h>\n#define FORGE_LOGO_WIDTH 320\n#define FORGE_LOGO_HEIGHT 75\nstatic const uint8_t forge_logo[] = {\n' + rows.join(',\n') + '\n};\n');
const tower = logo(38, 32, [.187, .643, .177, .214]);
await fs.writeFile(path.join(here, 'assets/icon.png'), image(48, 48, tower, 38, 32, 5, 8));
await fs.writeFile(path.join(here, 'assets/banner.png'), image(256, 128, logo(224, 52), 224, 52, 16, 38));
const wav = Buffer.alloc(44 + 4410); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24);
wav.writeUInt32LE(44100, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4410, 40);
await fs.writeFile(path.join(here, 'assets/silence.wav'), wav);
console.log('Prepared Forge logo, HOME Menu icon and banner.');
