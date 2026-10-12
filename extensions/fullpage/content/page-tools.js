/**
 * Injected into the page (isolated world). Metrics, scrolling, HTML reconstruction.
 */
(function () {
  if (globalThis.__NeillFullPageTools) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const IGNORED_SCROLLER_SELECTORS = [
    '[data-region="drawer"]',
    '.drawer',
    '[data-region="fixed-drawer"]',
    '#theme_boost-drawers-courseindex',
    '.drawercontent',
    '.courseindex',
    '[data-blockregion="side-pre"]',
    '[data-blockregion="side-post"]',
    '.block_column',
    '.quizreviewsummary + .block',
  ].join(',');

  function isIgnoredScroller(el) {
    if (!el) return true;
    try {
      if (el.closest(IGNORED_SCROLLER_SELECTORS)) return true;
      const id = (el.id || '').toLowerCase();
      const cls = (el.className || '').toString().toLowerCase();
      if (id.includes('drawer') || id.includes('courseindex')) return true;
      if (cls.includes('drawer') && !cls.includes('drawer-open')) return true;
      if (el.getAttribute('data-region') === 'drawer') return true;
    } catch {
      return false;
    }
    return false;
  }

  function getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
  }

  function documentScrollHeight() {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(
      doc.scrollHeight,
      body ? body.scrollHeight : 0,
      doc.clientHeight,
      window.innerHeight
    );
  }

  function isScrollable(el) {
    if (!el || el === document.documentElement) return false;
    if (isIgnoredScroller(el)) return false;
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false;
    return el.scrollHeight > el.clientHeight + 4;
  }

  let captureScrollState = null;
  let fixedHiddenForCapture = false;

  function pickPrimaryScroller() {
    const docH = documentScrollHeight();
    if (docH > window.innerHeight + 60) {
      return { mode: 'window', selector: null, el: null };
    }
    const moodleSelectors = ['#page', '#page-wrapper', '#region-main', '#page-content', 'main[role="main"]'];
    for (const sel of moodleSelectors) {
      const el = document.querySelector(sel);
      if (!el || isIgnoredScroller(el)) continue;
      if (isScrollable(el) && el.scrollHeight > window.innerHeight + 60) {
        return { mode: 'element', selector: sel, el };
      }
    }
    return { mode: 'window', selector: null, el: null };
  }

  function collectStickyMeta() {
    const fixed = [];
    for (const el of document.querySelectorAll('body *')) {
      if (isIgnoredScroller(el)) continue;
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 4 || rect.width < 4) continue;
      fixed.push({ top: Math.round(rect.top), height: Math.round(rect.height) });
    }
    const headerOverlap = fixed.filter((f) => f.top <= 2).reduce((max, f) => Math.max(max, f.height), 0);
    return { headerOverlap, fixedCount: fixed.length };
  }

  function getPageMetrics() {
    const scroller = pickPrimaryScroller();
    let width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth);
    let height = documentScrollHeight();
    let viewportHeight = window.innerHeight;

    if (scroller.mode === 'element' && scroller.el) {
      height = Math.max(height, scroller.el.scrollHeight);
      width = Math.max(width, scroller.el.scrollWidth, scroller.el.clientWidth);
      viewportHeight = window.innerHeight;
    }

    return {
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight,
      devicePixelRatio: getDevicePixelRatio(),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollMode: scroller.mode,
      scrollSelector: scroller.selector,
      sticky: collectStickyMeta(),
      title: document.title,
      url: location.href,
    };
  }

  function readScrollMetrics() {
    const main =
      document.querySelector('#region-main, #page-content, [role="main"]') || document.body;
    const sample = (main?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    let y = window.scrollY;
    if (captureScrollState?.mode === 'element' && captureScrollState.element) {
      y = captureScrollState.element.scrollTop;
    }
    return { y: Math.round(y), sample };
  }

  function hideExtensionUi() {
    document.getElementById('neill-fullpage-progress-root')?.remove();
    document.querySelectorAll('[data-neill-fullpage]').forEach((n) => {
      n.style.setProperty('display', 'none', 'important');
    });
  }

  function maskFixedAndSticky() {
    if (fixedHiddenForCapture) return;
    fixedHiddenForCapture = true;
    for (const el of document.querySelectorAll('body *')) {
      if (isIgnoredScroller(el)) continue;
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 && rect.height < 4) continue;
      if (!el.dataset.fullpageVis) el.dataset.fullpageVis = el.style.visibility || '';
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  }

  function unmaskFixedAndSticky() {
    if (!fixedHiddenForCapture) return;
    fixedHiddenForCapture = false;
    document.querySelectorAll('[data-fullpage-vis]').forEach((el) => {
      el.style.visibility = el.dataset.fullpageVis || '';
      delete el.dataset.fullpageVis;
    });
  }

  async function expandLazyContent(options = {}) {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.85));
    const ox = window.scrollX;
    const oy = window.scrollY;
    const maxY = documentScrollHeight();
    for (let y = 0, i = 0; i < 35 && y < maxY; i++) {
      window.scrollTo(0, y);
      await sleep(options.settleMs ?? 120);
      y += step;
    }
    window.scrollTo(ox, oy);
    await sleep(options.settleMs ?? 120);
    await sleep(options.lazyMs ?? 200);
    return getPageMetrics();
  }

  async function prepareForCapture(options = {}) {
    document.documentElement.style.scrollBehavior = 'auto';
    if (document.body) document.body.style.scrollBehavior = 'auto';
    unmaskFixedAndSticky();
    hideExtensionUi();

    const scroller = pickPrimaryScroller();
    captureScrollState = {
      mode: scroller.mode,
      windowX: window.scrollX,
      windowY: window.scrollY,
      element: null,
      elementTop: 0,
      lastY: -1,
      lastSample: '',
    };

    if (scroller.mode === 'element' && scroller.el) {
      captureScrollState.element = scroller.el;
      captureScrollState.elementTop = scroller.el.scrollTop;
    }

    return options.expandLazy ? expandLazyContent(options) : getPageMetrics();
  }

  function scrollToY(y) {
    hideExtensionUi();
    if (captureScrollState?.mode === 'element' && captureScrollState.element) {
      captureScrollState.element.scrollTop = y;
      window.scrollTo(captureScrollState.windowX, 0);
    } else {
      window.scrollTo(captureScrollState?.windowX ?? window.scrollX, y);
    }
  }

  function scrollToCaptureY(y, sliceIndex = 0) {
    if (sliceIndex > 0) maskFixedAndSticky();
    hideExtensionUi();
    const before = readScrollMetrics();
    scrollToY(y);
    const after = readScrollMetrics();
    const moved = Math.abs(after.y - before.y) > 3 || after.sample !== before.sample;
    const duplicate = sliceIndex > 0 && !moved;
    captureScrollState.lastY = after.y;
    captureScrollState.lastSample = after.sample;
    return {
      requestedY: y,
      actualY: after.y,
      moved,
      duplicate,
      sample: after.sample.slice(0, 80),
    };
  }

  function beforeCaptureSlice(sliceIndex) {
    hideExtensionUi();
    if (sliceIndex > 0) maskFixedAndSticky();
    return readScrollMetrics();
  }

  function restoreScrollPosition() {
    unmaskFixedAndSticky();
    hideExtensionUi();
    if (captureScrollState?.element) {
      captureScrollState.element.scrollTop = captureScrollState.elementTop;
    }
    window.scrollTo(captureScrollState?.windowX ?? 0, captureScrollState?.windowY ?? 0);
    captureScrollState = null;
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
      if (img.src?.startsWith('data:')) return img.src;
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return img.currentSrc || img.src || '';
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0);
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
      } else if (type !== 'file') input.setAttribute('value', input.value);
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
      (clone.querySelector('html') || clone).insertBefore(head, clone.firstChild);
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
        const parts = [];
        for (const rule of sheet.cssRules) parts.push(rule.cssText);
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
    for (const img of clone.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) continue;
      const live = document.querySelector(`img[src="${CSS.escape(src)}"]`);
      try {
        const res = await fetch(new URL(src, baseUrl).href, { credentials: 'include' });
        if (res.ok) img.setAttribute('src', await blobToDataUrl(await res.blob()));
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
    serializeFormState(clone);
    await inlineStyles(clone, baseUrl);
    if (options.inlineImages !== false) await inlineImages(clone, baseUrl);
    const head = ensureHead(clone);
    head.prepend(Object.assign(document.createElement('meta'), { charset: 'utf-8' }));
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function findPaginationLinks(limit = 25) {
    const url = new URL(location.href);
    const scored = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href;
      if (!href || href.startsWith('javascript:')) continue;
      let score = 0;
      if ((a.getAttribute('rel') || '').toLowerCase() === 'next') score += 50;
      if (/^(next|continue|›|»)/i.test((a.textContent || '').trim())) score += 40;
      if (/page=\d+/i.test(href)) score += 25;
      try {
        if (new URL(href).origin === url.origin) score += 10;
      } catch {
        continue;
      }
      if (score > 0) scored.push({ href, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set([location.href.split('#')[0]]);
    const out = [];
    for (const item of scored) {
      const key = item.href.split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item.href);
      if (out.length >= limit) break;
    }
    return out;
  }

  globalThis.__NeillFullPageTools = {
    getPageMetrics,
    prepareForCapture,
    buildScrollPlan,
    scrollToY,
    scrollToCaptureY,
    beforeCaptureSlice,
    restoreScrollPosition,
    reconstructHtml,
    findPaginationLinks,
  };
})();
