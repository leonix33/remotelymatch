import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const iconsDir = path.join(publicDir, 'icons');
const svgPath = path.join(publicDir, 'logo.svg');

const sizes = [180, 192, 512];

fs.mkdirSync(iconsDir, { recursive: true });
const svg = fs.readFileSync(svgPath);

for (const size of sizes) {
  const out = path.join(iconsDir, `icon-${size}.png`);
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`Wrote ${out}`);
}
