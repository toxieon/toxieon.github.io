function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function visiblePages(project) {
  return (project.pages || [])
    .filter((p) => !p.hidden)
    .sort((a, b) => a.order - b.order);
}

export function buildCombinedHtml(project) {
  const pages = visiblePages(project);
  const title = escapeHtml(project.title || 'Multipage capture');
  const toc = pages
    .map(
      (p, i) =>
        `<li><a href="#page-${i + 1}">${escapeHtml(p.title || `Page ${i + 1}`)}</a> <span class="url">${escapeHtml(p.url || '')}</span></li>`
    )
    .join('\n');
  const bodies = pages
    .map((p, i) => {
      const bodyMatch = p.html?.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const inner = bodyMatch ? bodyMatch[1] : p.html || '';
      return `<section class="nfp-page" id="page-${i + 1}" data-url="${escapeHtml(p.url || '')}">
<h2 class="nfp-page-title">${escapeHtml(p.title || `Page ${i + 1}`)}</h2>
${inner}
</section>`;
    })
    .join('\n<hr class="nfp-divider" />\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem 2rem 3rem; max-width: 1100px; }
nav#nfp-toc { background: #f5f5f5; padding: 1rem 1.25rem; border-radius: 8px; margin-bottom: 2rem; }
nav#nfp-toc .url { color: #666; font-size: 0.85em; }
.nfp-page { margin-bottom: 2.5rem; }
.nfp-divider { border: none; border-top: 2px solid #ddd; margin: 2rem 0; }
</style>
</head>
<body>
<header><h1>${title}</h1></header>
<nav id="nfp-toc" aria-label="Table of contents"><h2>Contents</h2><ol>${toc}</ol></nav>
${bodies}
</body>
</html>`;
}

export async function combinePngsVertical(pngDataUrls, offscreenRequest) {
  if (pngDataUrls.length === 1) {
    return { mode: 'single', pngDataUrl: pngDataUrls[0] };
  }
  const resp = await offscreenRequest('verticalStackPng', { pngDataUrls });
  if (!resp?.ok) throw new Error(resp?.error || 'PNG combine failed');
  return { mode: 'single', pngDataUrl: resp.result.pngDataUrl };
}

export function pngDataUrlsToZip(pngDataUrls, titles) {
  const files = pngDataUrls.map((url, i) => ({
    name: `${String(i + 1).padStart(2, '0')}-${sanitize(titles[i] || `page-${i + 1}`)}.png`,
    bytes: dataUrlToBytes(url),
  }));
  return storeOnlyZip(files);
}

function sanitize(name) {
  return name.replace(/[^\w\-]+/g, '_').slice(0, 40);
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Minimal ZIP (store, no compression) for permissive export without extra libs. */
export function storeOnlyZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.bytes;
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(6, 20, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);
    const localLen = local.length;
    central.push({ nameBytes, dataLen: data.length, offset });
    offset += localLen;
  }

  const centralStart = offset;
  for (const c of central) {
    const header = new Uint8Array(46 + c.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 20, true);
    view.setUint32(16, c.dataLen, true);
    view.setUint32(20, c.dataLen, true);
    view.setUint16(28, c.nameBytes.length, true);
    view.setUint32(42, c.offset, true);
    header.set(c.nameBytes, 46);
    chunks.push(header);
    offset += header.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, central.length, true);
  endView.setUint16(10, central.length, true);
  endView.setUint32(12, offset - centralStart, true);
  endView.setUint32(16, centralStart, true);
  chunks.push(end);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return new Blob([out], { type: 'application/zip' });
}
