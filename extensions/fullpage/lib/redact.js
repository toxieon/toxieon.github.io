/**
 * Redaction rects in **capture image coordinates** (same space as textLayer items).
 * @typedef {{ x: number, y: number, width: number, height: number, mode: 'blur'|'black' }} RedactionRect
 */

export function normalizeRedactions(list) {
  return (list || []).map((r) => ({
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    width: Math.max(1, Number(r.width) || 1),
    height: Math.max(1, Number(r.height) || 1),
    mode: r.mode === 'blur' ? 'blur' : 'black',
  }));
}

function itemBox(item) {
  return {
    x: item.left,
    y: item.top,
    width: item.width,
    height: item.height,
  };
}

function hitsRedaction(box, redactions) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return redactions.some(
    (r) => cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height
  );
}

export function applyRedactionsToTextLayer(textLayer, redactions) {
  const reds = normalizeRedactions(redactions);
  if (!reds.length || !textLayer?.items) return textLayer;
  const items = textLayer.items.filter((item) => !hitsRedaction(itemBox(item), reds));
  return {
    ...textLayer,
    items,
    plainText: items.map((i) => i.text).join('\n'),
  };
}

function scrubPageTextHeuristic(pageText, redactions) {
  if (!pageText) return '';
  const lines = pageText.split('\n');
  return lines
    .filter((line, idx) => {
      const approxY = idx * 20;
      const covered = redactions.some((r) => approxY >= r.y - 8 && approxY <= r.y + r.height + 8);
      return !covered || !line.trim();
    })
    .join('\n')
    .trim();
}

export function applyRedactionsToPageText(pageText, textLayer, redactions) {
  const reds = normalizeRedactions(redactions);
  if (!reds.length) return pageText || '';
  if (textLayer?.items?.length) {
    const filtered = applyRedactionsToTextLayer(textLayer, reds).plainText || '';
    if (filtered || reds.length) return filtered;
  }
  return scrubPageTextHeuristic(pageText, reds);
}

export function applyRedactionsToHtml(html, redactions) {
  const reds = normalizeRedactions(redactions);
  if (!reds.length || !html) return html;
  const overlays = reds
    .map(
      (r, i) =>
        `.fp-redact-${i}{position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;background:#000;z-index:2147483646;pointer-events:none;}${
          r.mode === 'blur' ? `.fp-redact-${i}{backdrop-filter:blur(10px);background:rgba(0,0,0,.4);}` : ''
        }`
    )
    .join('');
  const divs = reds.map((_, i) => `<div class="fp-redact-${i}" aria-hidden="true"></div>`).join('');
  const style = `<style data-fullpage-redact>${overlays}body{position:relative}</style>`;
  const injected = `${style}${divs}`;
  if (html.includes('</head>')) return html.replace('</head>', `${injected}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${injected}`);
  return injected + html;
}
