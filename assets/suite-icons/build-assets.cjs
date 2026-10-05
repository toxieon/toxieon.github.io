/* Rebuild original Neill icon exports. Uses bundled/local sharp when available. */
const fs = require('node:fs');
const path = require('node:path');
const icons = require('../suite-icons.js');
const destination = __dirname;

async function build() {
  const catalog = icons.list();
  let sharp;
  try { sharp = require(process.env.ND_SHARP_PATH || 'sharp'); }
  catch { console.warn('SVG exports will be built. Set ND_SHARP_PATH to generate PNGs with an existing sharp installation.'); }
  for (const icon of catalog) {
    const folder = path.join(destination, icon.kind === 'app' ? 'apps' : 'ui');
    fs.mkdirSync(folder, { recursive: true });
    const name = icon.id.replace(/^(app|ui)-/, '');
    fs.writeFileSync(path.join(folder, name + '.svg'), icons.svg(icon.id, { size: icon.kind === 'app' ? 48 : 24 }) + '\n');
    if (sharp && icon.kind === 'app') {
      for (const size of [32, 180, 192, 512]) {
        const buffer = Buffer.from(icons.svg(icon.id, { size }));
        await sharp(buffer).png().toFile(path.join(folder, name + '-' + size + '.png'));
      }
    }
  }
  fs.writeFileSync(path.join(destination, 'catalog.json'), JSON.stringify({ version: icons.version,
    provenance: 'Original geometric SVG artwork created for Neill Data Suite, October 2026. No third-party artwork or icon-font dependency.',
    pngSizes: [32, 180, 192, 512], icons: catalog }, null, 2) + '\n');
  if (sharp) {
    const appIcons = catalog.filter(icon => icon.kind === 'app');
    const shift = (Math.ceil(appIcons.length / 4) - 3) * 145; // utility section moves down per extra app row
    const height = 850 + shift;
    let content = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="' + height + '" viewBox="0 0 1200 ' + height + '"><rect width="1200" height="' + height + '" fill="#0b1219"/><g font-family="Arial,sans-serif" fill="#edf6ff"><text x="48" y="52" font-size="28" font-weight="700">Neill Data Suite — icon family</text><text x="48" y="83" font-size="16" fill="#a6b7c7">Original SVGs · existing app colours · 16 / 32 / 64 px comparisons</text>';
    appIcons.forEach((icon, index) => {
      const x = 48 + (index % 4) * 292;
      const y = 120 + Math.floor(index / 4) * 145;
      content += '<text x="' + x + '" y="' + y + '" font-size="17">' + icon.label + '</text>';
      [16, 32, 64].forEach((size, offset) => {
        content += '<g transform="translate(' + (x + [0, 42, 105][offset]) + ' ' + (y + 20) + ')">' + icons.svg(icon.id, { size, title: '' }) + '</g>';
      });
    });
    content += '<text x="48" y="' + (590 + shift) + '" font-size="23" font-weight="700">24 utility symbols</text><text x="48" y="' + (620 + shift) + '" font-size="15" fill="#a6b7c7">Use inline with currentColor; accessible labels are included.</text>';
    catalog.filter(icon => icon.kind === 'ui').forEach((icon, index) => {
      const x = 48 + (index % 12) * 94;
      const y = 648 + shift + Math.floor(index / 12) * 85;
      content += '<g transform="translate(' + (x + 20) + ' ' + y + ')">' + icons.svg(icon.id, { size: 32, color: '#b8dacf', title: '' }) + '</g><text x="' + (x + 36) + '" y="' + (y + 55) + '" font-size="10" text-anchor="middle">' + icon.id.slice(3) + '</text>';
    });
    content += '</g></svg>';
    fs.writeFileSync(path.join(destination, 'preview.svg'), content + '\n');
    await sharp(Buffer.from(content)).png().toFile(path.join(destination, 'preview.png'));
  }
  console.log('Exported ' + catalog.length + ' original SVG icons' + (sharp ? ', ' + catalog.filter(icon => icon.kind === 'app').length * 4 + ' app PNGs and preview.' : '.'));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
