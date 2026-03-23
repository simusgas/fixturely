const sharp = require('sharp');
const path = require('path');

const SVG = path.join(__dirname, '..', 'public', 'icons', 'icon.svg');
const OUT = path.join(__dirname, '..', 'public', 'icons');

async function generate() {
  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    await sharp(SVG)
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, name));
    console.log(`✓ ${name} (${size}x${size})`);
  }
}

generate().catch(err => { console.error(err); process.exit(1); });
