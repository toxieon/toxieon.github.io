/**
 * Renders invisible selectable text over a captured PNG for search / Ctrl+F.
 */
export function mountTextLayer(wrap, img, textLayer, metrics) {
  const layer = document.createElement('div');
  layer.className = 'text-layer';
  layer.setAttribute('aria-hidden', 'false');

  const pageW = textLayer.pageWidth || metrics?.width || img.naturalWidth;
  const pageH = textLayer.pageHeight || metrics?.height || img.naturalHeight;

  function layout() {
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    if (!displayW || !displayH) return;
    layer.style.width = `${displayW}px`;
    layer.style.height = `${displayH}px`;
    const sx = displayW / pageW;
    const sy = displayH / pageH;
    layer.querySelectorAll('span').forEach((span) => {
      const left = Number(span.dataset.left) * sx;
      const top = Number(span.dataset.top) * sy;
      const width = Number(span.dataset.width) * sx;
      const height = Number(span.dataset.height) * sy;
      span.style.left = `${left}px`;
      span.style.top = `${top}px`;
      span.style.width = `${width}px`;
      span.style.height = `${height}px`;
      span.style.fontSize = `${Math.max(8, height * 0.92)}px`;
    });
  }

  for (const item of textLayer.items || []) {
    const span = document.createElement('span');
    span.textContent = item.text;
    span.dataset.left = String(item.left);
    span.dataset.top = String(item.top);
    span.dataset.width = String(item.width);
    span.dataset.height = String(item.height);
    layer.appendChild(span);
  }

  wrap.appendChild(layer);
  img.addEventListener('load', layout);
  if (img.complete) layout();
  window.addEventListener('resize', layout);

  return {
    layer,
    layout,
    highlight(query) {
      const q = query.trim().toLowerCase();
      let hits = 0;
      layer.querySelectorAll('span').forEach((span) => {
        const match = q && span.textContent.toLowerCase().includes(q);
        span.classList.toggle('search-hit', match);
        if (match) hits++;
      });
      const first = layer.querySelector('.search-hit');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return hits;
    },
    destroy() {
      layer.remove();
      window.removeEventListener('resize', layout);
    },
  };
}
