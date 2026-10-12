/**
 * Injected into the page (isolated world). Handles metrics, scrolling, HTML reconstruction.
 * Original implementation for Neill Full Page Capture.
 */

(function () {
  if (globalThis.__NeillFullPageTools) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  function isScrollable(el) {
    if (!el || el === document.documentElement || el === document.body) return false;
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return el.scrollHeight > el.clientHeight + 4;
  }

  function findInnerScrollContainers() {
    const candidates = document.querySelectorAll('main, [role="main"], .content, #content, .region-main, article, section, div');
    const out = [];
    for (const el of candidates) {
      if (isScrollable(el) && el.clientHeight > 120) {
        out.push({
          selector: cssPath(el),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    }
    out.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return out.slice(0, 8);
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.nodeName.toLowerCase();
      if (node.classList && node.classList.length) {
        const cls = [...node.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
        part += cls;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.nodeName === node.nodeName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function collectStickyMeta() {
    const fixed = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.height < 4 || rect.width < 4) continue;
        fixed.push({
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          position: style.position,
        });
      }
    }
    const headerOverlap = fixed
      .filter((f) => f.top <= 2)
      .reduce((max, f) => Math.max(max, f.height), 0);
    return { headerOverlap, fixedCount: fixed.length };
  }

  function getPageMetrics() {
    const doc = document.documentElement;
    const body = document.body;
    const width = Math.max(
      doc.scrollWidth,
      body ? body.scrollWidth : 0,
      doc.clientWidth,
      window.innerWidth
    );
    const height = Math.max(
      doc.scrollHeight,
      body ? body.scrollHeight : 0,
      doc.clientHeight,
      window.innerHeight
    );
    const sticky = collectStickyMeta();
    return {
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: getDevicePixelRatio(),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      sticky,
      innerScrolls: findInnerScrollContainers(),
      title: document.title,
      url: location.href,
    };
  }

  async function expandLazyContent(options = {}) {
    const maxSteps = options.maxScrollSteps ?? 80;
    const step = Math.max(200, Math.floor(window.innerHeight * 0.85));
    const originalY = window.scrollY;
    const originalX = window.scrollX;
    let y = 0;
    const maxY = document.documentElement.scrollHeight;
    for (let i = 0; i < maxSteps && y < maxY; i++) {
      window.scrollTo(0, y);
      await sleep(options.settleMs ?? 120);
      y += step;
    }
    window.scrollTo(originalX, originalY);
    await sleep(options.settleMs ?? 120);

    const inner = findInnerScrollContainers();
    for (const info of inner.slice(0, 3)) {
      const el = document.querySelector(info.selector);
      if (!el) continue;
      const orig = el.scrollTop;
      let iy = 0;
      for (let i = 0; i < 40 && iy < el.scrollHeight; i++) {
        el.scrollTop = iy;
        await sleep(80);
        iy += Math.max(150, Math.floor(el.clientHeight * 0.8));
      }
      el.scrollTop = orig;
    }
    await sleep(options.lazyMs ?? 200);
    return getPageMetrics();
  }

  async function prepareForCapture(options = {}) {
    document.documentElement.style.scrollBehavior = 'auto';
    if (document.body) document.body.style.scrollBehavior = 'auto';
    if (options.expandLazy) {
      return expandLazyContent(options);
    }
    return getPageMetrics();
  }

  function scrollToY(y) {
    window.scrollTo(0, y);
  }

  function buildScrollPlan(metrics, overlapPx = 80) {
    const vh = metrics.viewportHeight;
    const total = metrics.height;
    const header = metrics.sticky?.headerOverlap ?? 0;
    const effectiveOverlap = Math.max(overlapPx, header);
    const positions = [];
    let y = 0;
    while (y < total - 1) {
      positions.push(Math.round(y));
      if (y + vh >= total) break;
      y += vh - effectiveOverlap;
    }
    const last = Math.max(0, total - vh);
    if (!positions.length || positions[positions.length - 1] !== last) {
      positions.push(Math.round(last));
    }
    return { positions, overlap: effectiveOverlap, sliceHeight: vh };
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function imageToDataUrl(img) {
    try {
      if (img.src && img.src.startsWith('data:')) return img.src;
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return img.currentSrc || img.src || '';
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return img.currentSrc || img.src || '';
    }
  }

  function serializeFormState(root) {
    root.querySelectorAll('input').forEach((input) => {
      const type = (input.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (input.checked) input.setAttribute('checked', 'checked');
        else input.removeAttribute('checked');
      } else if (type !== 'file') {
        input.setAttribute('value', input.value);
      }
    });
    root.querySelectorAll('textarea').forEach((ta) => {
      ta.textContent = ta.value;
    });
    root.querySelectorAll('select').forEach((sel) => {
      [...sel.options].forEach((opt) => {
        if (opt.selected) opt.setAttribute('selected', 'selected');
        else opt.removeAttribute('selected');
      });
    });
  }

  function ensureHead(clone) {
    let head = clone.querySelector('head');
    if (!head) {
      head = document.createElement('head');
      const html = clone.nodeName === 'HTML' ? clone : clone.querySelector('html') || clone;
      html.insertBefore(head, html.firstChild);
    }
    return head;
  }

  async function inlineStyles(clone, baseUrl) {
    const head = ensureHead(clone);
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-fullpage', 'inlined-author');
    const chunks = [];
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        const parts = [];
        for (const rule of rules) {
          parts.push(rule.cssText);
        }
        if (parts.length) chunks.push(parts.join('\n'));
      } catch {
        if (sheet.href) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = new URL(sheet.href, baseUrl).href;
          head.appendChild(link);
        }
      }
    }
    if (chunks.length) {
      styleEl.textContent = chunks.join('\n\n');
      head.appendChild(styleEl);
    }
    clone.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
  }

  async function inlineImages(clone, baseUrl) {
    const imgs = clone.querySelectorAll('img');
    for (const img of imgs) {
      const live = document.querySelector(`img[src="${img.getAttribute('src')}"]`);
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) continue;
      try {
        const abs = new URL(src, baseUrl).href;
        const res = await fetch(abs, { credentials: 'include', mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          img.setAttribute('src', await blobToDataUrl(blob));
        }
      } catch {
        if (live) {
          const data = await imageToDataUrl(live);
          if (data) img.setAttribute('src', data);
        }
      }
    }
  }

  async function reconstructHtml(options = {}) {
    const baseUrl = location.href;
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, noscript').forEach((n) => n.remove());
    clone.querySelectorAll('iframe, video, audio').forEach((n) => {
      const placeholder = document.createElement('div');
      placeholder.textContent = `[${n.nodeName.toLowerCase()} omitted]`;
      n.replaceWith(placeholder);
    });
    serializeFormState(clone);
    await inlineStyles(clone, baseUrl);
    if (options.inlineImages !== false) {
      await inlineImages(clone, baseUrl);
    }
    const head = ensureHead(clone);
    const meta = document.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    meta.setAttribute('data-fullpage-captured', new Date().toISOString());
    head.prepend(meta);
    const base = document.createElement('base');
    base.href = baseUrl;
    head.prepend(base);
    const doctype = '<!DOCTYPE html>\n';
    return doctype + clone.outerHTML;
  }

  function findPaginationLinks(limit = 25) {
    const url = new URL(location.href);
    const links = [...document.querySelectorAll('a[href]')];
    const scored = [];
    const nextWords = /^(next|continue|older|newer|›|»|→)/i;
    for (const a of links) {
      const text = (a.textContent || '').trim();
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      const href = a.href;
      if (!href || href.startsWith('javascript:')) continue;
      let score = 0;
      if (rel === 'next') score += 50;
      if (nextWords.test(text)) score += 40;
      if (/page=\d+|[?&]p=\d+|\/page\/\d+/i.test(href)) score += 25;
      if (a.classList.contains('next') || a.getAttribute('aria-label')?.toLowerCase().includes('next')) {
        score += 30;
      }
      try {
        const target = new URL(href);
        if (target.origin === url.origin) score += 10;
      } catch {
        continue;
      }
      if (score > 0) scored.push({ href, text, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set([location.href.split('#')[0]]);
    const chain = [];
    for (const item of scored) {
      const key = item.href.split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(item);
      if (chain.length >= limit) break;
    }
    return chain.map((x) => x.href);
  }

  globalThis.__NeillFullPageTools = {
    getPageMetrics,
    prepareForCapture,
    buildScrollPlan,
    scrollToY,
    reconstructHtml,
    findPaginationLinks,
    expandLazyContent,
  };
})();
