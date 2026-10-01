/* Neill Data Suite — original project symbols. See trade-symbols/README.md.
 * Browser: NDTradeSymbols. Node: require('./trade-symbols.js'). No dependencies.
 * These project identification symbols do not claim drafting/code compliance.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NDTradeSymbols = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var categories = [
    { id: 'data', label: 'Data & networking', color: '#3b82f6' },
    { id: 'cctv', label: 'CCTV', color: '#8b5cf6' },
    { id: 'access', label: 'Access control', color: '#0d9488' },
    { id: 'security', label: 'Security & detection', color: '#e11d48' },
    { id: 'electrical', label: 'Electrical', color: '#d97706' },
    { id: 'containment', label: 'Cable containment', color: '#64748b' }
  ];
  // Original paths drawn on a 24 × 24 grid, with a consistent 1.7-unit stroke.
  // Geometry is fixed here; user-provided values never become SVG paths.
  var records = [
    ['data-single', 'Single data outlet', 'data', 'D1', 'One data connection at a wall outlet.', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8v7h-3v2h-2v-2H8zM10 9v3m4-3v3"/>'],
    ['data-double', 'Double data outlet', 'data', 'D2', 'Two data connections at a wall outlet.', '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M5 9h5v6H5zm9 0h5v6h-5M7 15v2m10-2v2"/>'],
    ['rack', 'Communications rack', 'data', 'RACK', 'Communications cabinet or equipment rack.', '<rect x="5" y="2" width="14" height="20" rx="1.5"/><path d="M5 7h14M5 12h14M5 17h14M8 5h1m-1 5h1m-1 5h1m-1 5h1m5-15h2m-2 5h2m-2 5h2m-2 5h2"/>'],
    ['patch-panel', 'Patch panel', 'data', 'PP', 'Rack patch panel with labelled cable terminations.', '<rect x="2" y="6" width="20" height="12" rx="1.5"/><path d="M5 10h2v4H5zm6 0h2v4h-2zm6 0h2v4h-2M5 16h2m4 0h2m4 0h2"/>'],
    ['fibre-outlet', 'Fibre outlet', 'data', 'FO', 'Fibre-optic termination or outlet.', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7v5a4 4 0 0 0 8 0V7M6 7h4m4 0h4M12 16v3"/>'],
    ['wireless-ap', 'Wireless access point', 'data', 'WAP', 'Ceiling or wall wireless access point.', '<circle cx="12" cy="14" r="6"/><path d="M3 6a13 13 0 0 1 18 0M6 8a9 9 0 0 1 12 0M10 14h4"/><circle cx="12" cy="17" r=".7"/>'],
    ['network-switch', 'Network switch', 'data', 'SW', 'Ethernet network switch.', '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M5 10h7m-2-2 2 2-2 2m9 2h-7m2-2-2 2 2 2M5 15h1m2 0h1"/>'],
    ['router', 'Router', 'data', 'RTR', 'Network router or gateway.', '<rect x="3" y="11" width="18" height="9" rx="2"/><path d="M6 11V4m12 7V4M4 4h4m8 0h4M6 16h1m3 0h1m4 0h3"/>'],
    ['fibre-splice', 'Fibre splice enclosure', 'data', 'FSP', 'Protective enclosure for fibre cable splices.', '<rect x="4" y="5" width="16" height="14" rx="4"/><path d="M1 10h3m-3 4h3m16-4h3m-3 4h3M8 9l8 6M8 15l8-6"/>'],
    ['dome-camera', 'Dome camera', 'cctv', 'DOM', 'Fixed dome surveillance camera.', '<path d="M3 8h18v3H3zM5 11a7 7 0 0 0 14 0"/><circle cx="12" cy="14" r="2"/>'],
    ['bullet-camera', 'Bullet camera', 'cctv', 'BUL', 'Fixed bullet surveillance camera.', '<path d="m3 5 14 3-2 8L1 13zM17 9l5 1-1 5-5-1M9 15v5h7m0-2v4"/>'],
    ['ptz-camera', 'PTZ camera', 'cctv', 'PTZ', 'Camera with pan, tilt and zoom movement.', '<path d="M8 3h8v4H8zM6 7h12v3a6 6 0 0 1-12 0zM3 17a12 12 0 0 0 18 0m-18 0v4m0-4h4m14 0v4m0-4h-4"/><circle cx="12" cy="11" r="2"/>'],
    ['nvr', 'Network video recorder', 'cctv', 'NVR', 'Network video recording equipment.', '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M5 10h9v4H5zM6 18v2m12-2v2"/><circle cx="18" cy="12" r="1"/>'],
    ['monitor', 'Display monitor', 'cctv', 'MON', 'Video viewing screen or security monitor.', '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10M2 14h20"/>'],
    ['card-reader', 'Card reader', 'access', 'RDR', 'Access credential or card reader.', '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 6h4M10 11h4v6h-4zM3 8a7 7 0 0 0 0 8m18-8a7 7 0 0 1 0 8"/>'],
    ['access-controller', 'Access controller', 'access', 'AC', 'Controller enclosure for access devices.', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8v7H8zM10 10h4m-7 7h1m3 0h1m3 0h1M2 8h2m-2 8h2m16-8h2m-2 8h2"/>'],
    ['electric-lock', 'Electric lock', 'access', 'EL', 'Electrically operated lock or strike.', '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-3 3-3 3h4l-3 3"/>'],
    ['intercom', 'Intercom', 'access', 'INT', 'Entry communication station.', '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 6h6M9 9h6M9 12h6"/><circle cx="12" cy="17" r="1.5"/>'],
    ['door-contact', 'Door contact', 'access', 'DC', 'Door or window position contact.', '<rect x="3" y="5" width="7" height="14" rx="1"/><rect x="15" y="7" width="6" height="10" rx="1"/><path d="M10 10h2m-2 4h2M6 3v2m0 14v2"/>'],
    ['exit-button', 'Request-to-exit button', 'access', 'REX', 'Request-to-exit push button or touch plate.', '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="12" r="5"/><path d="M9 12h6m-2-2 2 2-2 2"/>'],
    ['pir-detector', 'PIR detector', 'security', 'PIR', 'Passive infrared movement detector.', '<path d="M8 3h8v8a4 4 0 0 1-8 0zM6 15a9 9 0 0 0 12 0M3 18a13 13 0 0 0 18 0M10 7h4"/>'],
    ['alarm-panel', 'Alarm panel', 'security', 'ALM', 'Security alarm controller or keypad.', '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8v4H8zM8 14h1m3 0h1m3 0h.1M8 18h1m3 0h1m3 0h.1"/>'],
    ['siren', 'Siren', 'security', 'SIR', 'Audible alarm sounder or siren.', '<path d="M8 10h8l2 9H6zM5 19h14v2H5zM12 2v3M4 5l2 2m12 0 2-2M2 12h3m14 0h3M10 10V8a2 2 0 0 1 4 0v2"/>'],
    ['glass-break', 'Glass-break detector', 'security', 'GB', 'Detector monitoring glass breakage.', '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="m13 3-3 7 5 3-4 8M10 10l-6 2m11 1 5-4"/>'],
    ['smoke-detector', 'Smoke detector', 'security', 'SD', 'Project marker for a smoke detection device.', '<circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="2"/><path d="M9 4c-2-2 2-2 0-3m6 3c-2-2 2-2 0-3M7 13h1m8 0h1m-5 4v1"/>'],
    ['single-gpo', 'Single power outlet', 'electrical', 'GPO1', 'Single general-purpose power outlet.', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 8 2 3m6-3-2 3m-2 3v3"/>'],
    ['double-gpo', 'Double power outlet', 'electrical', 'GPO2', 'Double general-purpose power outlet.', '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m5 9 1 2m3-2-1 2m-1 3v2m8-7 1 2m3-2-1 2m-1 3v2"/>'],
    ['light-fitting', 'Light fitting', 'electrical', 'LGT', 'Project marker for a light fitting.', '<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11m0-11-11 11"/>'],
    ['light-switch', 'Light switch', 'electrical', 'LS', 'Wall-mounted light switch.', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6v10H9zM9 13l6-2"/>'],
    ['main-switchboard', 'Main switchboard', 'electrical', 'MSB', 'Main electrical switchboard location.', '<rect x="3" y="2" width="18" height="20" rx="1.5"/><path d="M3 7h18M12 7v15m-5-11v4m10-4v4M7 5h2m6 0h2"/>'],
    ['sub-board', 'Distribution board', 'electrical', 'DB', 'Sub-board or local electrical distribution board.', '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 8h14M9 12v5m6-5v5M9 6h6"/>'],
    ['earth-point', 'Earth point', 'electrical', 'EP', 'Project marker for an earth connection point.', '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M4 13h16M7 17h10m-7 4h4"/>'],
    ['isolator', 'Isolator', 'electrical', 'ISO', 'Local electrical isolation switch.', '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="m12 13 3-5M10 6h1"/>'],
    ['conduit', 'Conduit route', 'containment', 'COND', 'Indicative conduit route or pathway.', '<path d="M2 6h10a6 6 0 0 1 6 6v10M2 10h10a2 2 0 0 1 2 2v10M5 4v8m7 5h8"/>'],
    ['junction-box', 'Junction box', 'containment', 'JB', 'Cable junction or connection enclosure.', '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4m-10-3 6 6m0-6-6 6"/>'],
    ['cable-tray', 'Cable tray', 'containment', 'TRAY', 'Cable tray or ladder pathway.', '<path d="M5 2v20M19 2v20M5 5h14M5 10h14M5 15h14M5 20h14M2 8h3m14 0h3M2 18h3m14 0h3"/>']
  ];
  var byId = Object.create(null);
  records.forEach(function (row) {
    var category = categories.filter(function (item) { return item.id === row[2]; })[0];
    byId[row[0]] = {
      id: row[0], label: row[1], category: row[2], shorthand: row[3],
      description: row[4], color: category.color, code: 'ND-' + row[3],
      file: 'assets/trade-symbols/' + row[0] + '.svg', geometry: row[5]
    };
  });
  function escape(value) {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function metadata(item) {
    return { id: item.id, label: item.label, category: item.category,
      shorthand: item.shorthand, description: item.description, color: item.color,
      code: item.code, file: item.file };
  }
  function list(options) {
    options = options || {};
    var query = String(options.query || '').trim().toLowerCase();
    return records.map(function (row) { return byId[row[0]]; }).filter(function (item) {
      return (!options.category || options.category === 'all' || item.category === options.category) &&
        (!query || [item.id, item.label, item.category, item.shorthand, item.description].join(' ').toLowerCase().indexOf(query) !== -1);
    }).map(metadata);
  }
  function safeColor(color) {
    if (typeof color !== 'string') return 'currentColor';
    return /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]{1,24})$/i.test(color) ? color : 'currentColor';
  }
  function svg(id, options) {
    var item = typeof id === 'string' && byId[id];
    if (!item) return '';
    options = options || {};
    var requestedSize = Number(options.size);
    var size = Number.isFinite(requestedSize) && requestedSize >= 8 && requestedSize <= 512 ? requestedSize : 24;
    var title = options.title === undefined ? item.label : String(options.title);
    var accessible = title ? ' role="img" aria-label="' + escape(title) + '"' : ' aria-hidden="true"';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + safeColor(options.color) + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"' + accessible + '>' +
      (title ? '<title>' + escape(title) + '</title>' : '') + item.geometry + '</svg>';
  }
  function selection(ids) {
    if (ids === undefined || ids === null) return list();
    if (typeof ids === 'string') ids = [ids];
    if (!Array.isArray(ids)) return [];
    var seen = Object.create(null);
    return ids.filter(function (id) {
      if (typeof id !== 'string' || !byId[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    }).map(function (id) { return metadata(byId[id]); });
  }
  function categoryCsv(ids) {
    var rows = [['Item', 'Code', 'Description', 'Color', 'Shorthand']];
    selection(ids).forEach(function (item) {
      rows.push([item.label, item.code, item.description, item.color, item.shorthand]);
    });
    return rows.map(function (row) {
      return row.map(function (cell) {
        var value = String(cell);
        return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
      }).join(',');
    }).join('\r\n') + '\r\n';
  }
  function legend(ids, options) {
    options = options || {};
    var title = options.title === undefined ? 'Neill project symbols' : String(options.title);
    var items = selection(ids);
    var rows = items.map(function (item) {
      var category = categories.filter(function (entry) { return entry.id === item.category; })[0];
      return '<tr><td>' + svg(item.id, { size: 32, color: '#000', title: '' }) + '</td><td><strong>' + escape(item.label) + '</strong><br><span>' + escape(item.description) + '</span></td><td>' + escape(category.label) + '</td><td>' + escape(item.shorthand) + '</td></tr>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title) + '</title>' +
      '<style>body{font:14px/1.5 Arial,sans-serif;color:#111;background:#fff;max-width:960px;margin:32px auto;padding:0 24px}h1{font-size:26px;line-height:1.2;margin-bottom:10px}p{max-width:760px}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{padding:10px 8px;border-bottom:1px solid #bbb;text-align:left;vertical-align:middle}th{font-size:12px;text-transform:uppercase;letter-spacing:.03em}td:first-child{width:48px}td:last-child{font-family:monospace;font-weight:bold;white-space:nowrap}td span,footer{font-size:12px}svg{display:block}footer{margin-top:24px}tr{break-inside:avoid}@page{size:A4 portrait;margin:14mm}@media print{body{margin:0;padding:0;font-size:10pt}h1{font-size:20pt}th,td{padding:7px}thead{display:table-header-group}td span{font-size:9pt}}</style></head><body><main><h1>' + escape(title) + '</h1><p>Original Neill Data Suite project symbols. Use this legend alongside project plans. These identification symbols do not claim compliance with drafting standards or electrical codes.</p>' +
      (items.length ? '<table><thead><tr><th scope="col">Symbol</th><th scope="col">Item</th><th scope="col">Category</th><th scope="col">Shorthand</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p>No symbols selected.</p>') +
      '</main><footer>Neill Data Suite · Trade symbol library v1.0.0 · ' + items.length + (items.length === 1 ? ' symbol' : ' symbols') + '</footer></body></html>';
  }
  return Object.freeze({ version: '1.0.0', list: list, svg: svg, legend: legend,
    categoryCsv: categoryCsv, categories: function () {
      return categories.map(function (item) { return { id: item.id, label: item.label, color: item.color }; });
    } });
}));
