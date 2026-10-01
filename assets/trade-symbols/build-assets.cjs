/* Regenerate committed downloads from the canonical, original path library. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const symbols = require('../trade-symbols.js');
const folder = __dirname;
const all = symbols.list();
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (name, contents) => fs.writeFileSync(path.join(folder, name), contents, 'utf8');
all.forEach(item => write(item.id + '.svg', symbols.svg(item.id, { size: 24, color: '#000' }) + '\n'));
write('catalog.json', JSON.stringify({ name: 'Neill project symbols', version: symbols.version,
  notice: 'Original project identification symbols; no claim of drafting or electrical-code compliance.',
  categories: symbols.categories(), symbols: all }, null, 2) + '\n');
write('planner-categories.csv', symbols.categoryCsv());
write('legend.html', symbols.legend());
const spriteItems = all.map(item => {
  const svg = symbols.svg(item.id, { title: '', color: 'currentColor' });
  const body = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  return '<symbol id="nd-trade-' + item.id + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</symbol>';
});
write('sprite.svg', '<svg xmlns="http://www.w3.org/2000/svg"><defs>\n' + spriteItems.join('\n') + '\n</defs></svg>\n');
const columnWidth = 380;
const rowHeight = 66;
const rows = Math.ceil(all.length / 2);
let content = '<rect width="840" height="' + (rows * rowHeight + 172) + '" fill="#fff"/><g font-family="Arial,sans-serif" fill="#111"><text x="36" y="47" font-size="25" font-weight="700">Neill project symbols</text><text x="36" y="72" font-size="12">36 original project identification symbols · Keep this legend with your plans.</text><text x="36" y="91" font-size="11">No claim of compliance with drafting standards or electrical codes.</text>';
all.forEach((item, i) => {
  const x = 36 + Math.floor(i / rows) * columnWidth;
  const y = 116 + (i % rows) * rowHeight;
  content += '<g transform="translate(' + x + ' ' + y + ')">' + symbols.svg(item.id, { size: 34, color: '#000', title: '' }) + '<text x="48" y="14" font-size="13" font-weight="700">' + xml(item.label) + '</text><text x="48" y="33" font-size="11">' + xml(item.shorthand + ' · ' + symbols.categories().find(c => c.id === item.category).label) + '</text><path d="M0 51H350" stroke="#d1d5db" stroke-width="1"/></g>';
});
content += '<text x="36" y="' + (rows * rowHeight + 150) + '" font-size="10">Neill Data Suite · Trade symbol library v' + symbols.version + ' · Original SVG artwork</text></g>';
write('legend.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 ' + (rows * rowHeight + 172) + '" width="840" height="' + (rows * rowHeight + 172) + '" role="img" aria-labelledby="legend-title legend-desc"><title id="legend-title">Neill project symbol legend</title><desc id="legend-desc">A black and white reference sheet containing all 36 symbols, labels, categories and shorthand codes.</desc>' + content + '</svg>\n');
console.log('Generated ' + all.length + ' individual symbols, sprite, catalog, Planner CSV and two legends.');
