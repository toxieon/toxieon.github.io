/** @typedef {{ x: number, y: number, width: number, height: number }} DocRegion */

export function normalizeRegion(r) {
  const x = Math.max(0, Number(r.x) || 0);
  const y = Math.max(0, Number(r.y) || 0);
  const width = Math.max(1, Number(r.width) || 1);
  const height = Math.max(1, Number(r.height) || 1);
  return { x, y, width, height };
}

export function filterTextLayerForRegion(textLayer, region) {
  if (!textLayer?.items) return textLayer;
  const r = normalizeRegion(region);
  const rx2 = r.x + r.width;
  const ry2 = r.y + r.height;
  const items = textLayer.items
    .filter((item) => {
      const ix2 = item.left + item.width;
      const iy2 = item.top + item.height;
      return item.left < rx2 && ix2 > r.x && item.top < ry2 && iy2 > r.y;
    })
    .map((item) => ({
      ...item,
      left: item.left - r.x,
      top: item.top - r.y,
    }));
  return {
    ...textLayer,
    pageWidth: r.width,
    pageHeight: r.height,
    items,
    plainText: items.map((i) => i.text).join('\n'),
  };
}

export function filterPageTextForRegion(pageText, textLayer, region) {
  const filtered = filterTextLayerForRegion(textLayer, region);
  if (filtered.plainText) return filtered.plainText;
  return pageText || '';
}

export function cropHtmlForRegion(html, region) {
  const r = normalizeRegion(region);
  const style = `<style data-fullpage-region-crop>
html,body{overflow:hidden!important;margin:0;padding:0}
body>*{max-width:none}
.fp-crop-wrap{width:${r.width}px;height:${r.height}px;overflow:hidden;position:relative}
.fp-crop-inner{position:relative;margin:-${r.y}px 0 0 -${r.x}px}
</style>`;
  const wrapOpen = `<div class="fp-crop-wrap"><div class="fp-crop-inner">`;
  const wrapClose = `</div></div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `${style}<body$1>${wrapOpen}`).replace(/<\/body>/i, `${wrapClose}</body>`);
  }
  return `${style}${wrapOpen}${html}${wrapClose}`;
}

export function rectsIntersect(a, b) {
  return a.left < b.x + b.width && a.left + a.width > b.x && a.top < b.y + b.height && a.top + a.height > b.y;
}
