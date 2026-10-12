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
  /** @type {Set<Element>} */
  let pinnedViewportElements = new Set();

  const CHROME_MASK_SELECTORS = [
    '[data-region="drawer"]',
    '[data-region="fixed-drawer"]',
    '#theme_boost-drawers-courseindex',
    '[data-blockregion]',
    '.block_column',
    'nav.navbar.fixed-top',
    '.navbar.fixed-top',
    '.sticky-top',
    '#page-header',
    '.fixed-top',
  ].join(',');

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

  function hideElementForCapture(el) {
    if (!el || el.dataset.fullpageCapHidden === '1') return;
    el.dataset.fullpageCapHidden = '1';
    if (el.dataset.fullpageVis === undefined) el.dataset.fullpageVis = el.style.visibility || '';
    el.style.setProperty('visibility', 'hidden', 'important');
  }

  function snapshotVisibleViewportElements() {
    const map = new Map();
    for (const el of document.querySelectorAll('body *')) {
      if (el.matches('script, style, noscript, svg, path')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) continue;
      if (rect.bottom < 8 || rect.top > window.innerHeight - 8) continue;
      if (rect.right < 8 || rect.left > window.innerWidth - 8) continue;
      map.set(el, {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
    return map;
  }

  function rectsStayPinned(a, b) {
    return (
      Math.abs(a.top - b.top) <= 2 &&
      Math.abs(a.left - b.left) <= 2 &&
      Math.abs(a.w - b.w) <= 4 &&
      Math.abs(a.h - b.h) <= 4
    );
  }

  async function detectPinnedViewportElements() {
    const pinned = new Set();
    const y0 = captureScrollState?.windowY ?? window.scrollY;
    scrollToY(0);
    await sleep(120);
    const atTop = snapshotVisibleViewportElements();
    const step = Math.max(280, Math.floor(window.innerHeight * 0.55));
    const maxY = Math.max(0, documentScrollHeight() - window.innerHeight);
    scrollToY(Math.min(step, maxY));
    await sleep(120);
    const scrolled = snapshotVisibleViewportElements();
    for (const [el, r0] of atTop) {
      const r1 = scrolled.get(el);
      if (r1 && rectsStayPinned(r0, r1)) pinned.add(el);
    }
    document.querySelectorAll(CHROME_MASK_SELECTORS).forEach((el) => pinned.add(el));
    scrollToY(0);
    await sleep(80);
    window.scrollTo(captureScrollState?.windowX ?? 0, y0);
    return pinned;
  }

  function isDrawerVisibleInViewport() {
    const drawer = document.querySelector('[data-region="drawer"], [data-region="fixed-drawer"]');
    if (!drawer) return false;
    const style = getComputedStyle(drawer);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    const rect = drawer.getBoundingClientRect();
    return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function maskFixedAndSticky() {
    if (!fixedHiddenForCapture) fixedHiddenForCapture = true;
    document.querySelectorAll(CHROME_MASK_SELECTORS).forEach(hideElementForCapture);
    for (const el of pinnedViewportElements) hideElementForCapture(el);
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 && rect.height < 4) continue;
      hideElementForCapture(el);
    }
  }

  function unmaskFixedAndSticky() {
    fixedHiddenForCapture = false;
    pinnedViewportElements = new Set();
    document.querySelectorAll('[data-fullpage-vis]').forEach((el) => {
      el.style.visibility = el.dataset.fullpageVis || '';
      delete el.dataset.fullpageVis;
      delete el.dataset.fullpageCapHidden;
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

    const metrics = options.expandLazy ? await expandLazyContent(options) : getPageMetrics();
    pinnedViewportElements = await detectPinnedViewportElements();
    return metrics;
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
      drawerVisible: isDrawerVisibleInViewport(),
    };
  }

  function beforeCaptureSlice(sliceIndex) {
    hideExtensionUi();
    if (sliceIndex > 0) maskFixedAndSticky();
    return { ...readScrollMetrics(), drawerVisible: isDrawerVisibleInViewport() };
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

  function buildScrollPlan(metrics, overlapPx = 80, region) {
    const vh = metrics.viewportHeight;
    const total = metrics.height;
    const header = metrics.sticky?.headerOverlap ?? 0;
    const effectiveOverlap = Math.max(overlapPx, header);
    const positions = [];
    if (!region) {
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
      return { positions, overlap: effectiveOverlap, sliceHeight: vh, region: null };
    }
    const yMin = Math.max(0, Math.floor(region.y));
    const yMax = Math.min(total, Math.ceil(region.y + region.height));
    let y = yMin;
    while (y < yMax - 1) {
      positions.push(Math.round(y));
      if (y + vh >= yMax) break;
      y += vh - effectiveOverlap;
    }
    const last = Math.max(yMin, yMax - vh);
    if (!positions.length || positions[positions.length - 1] !== Math.round(last)) {
      positions.push(Math.round(last));
    }
    return { positions, overlap: effectiveOverlap, sliceHeight: vh, region };
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function resolveUrl(href, baseUrl) {
    if (!href || href.startsWith('data:') || href.startsWith('blob:')) return href || '';
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }

  function pickSrcsetUrl(srcset, baseUrl) {
    if (!srcset) return '';
    const parts = srcset
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return '';
    const scored = parts.map((part) => {
      const bits = part.split(/\s+/);
      const url = bits[0];
      const w = bits[1]?.endsWith('w') ? parseInt(bits[1], 10) : 0;
      const x = bits[1]?.endsWith('x') ? parseFloat(bits[1]) : 0;
      return { url, score: w || x * 1000 || 1 };
    });
    scored.sort((a, b) => b.score - a.score);
    return resolveUrl(scored[0].url, baseUrl);
  }

  function effectiveImageUrl(img) {
    if (!img) return '';
    if (img.currentSrc && !img.currentSrc.startsWith('data:')) return img.currentSrc;
    for (const attr of ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-url']) {
      const v = img.getAttribute(attr);
      if (v && !v.startsWith('data:')) return v;
    }
    const srcset = img.getAttribute('srcset');
    if (srcset) return pickSrcsetUrl(srcset, location.href);
    return img.src || '';
  }

  function promoteLazyImage(img) {
    for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-url']) {
      const v = img.getAttribute(attr);
      if (!v) continue;
      const src = img.getAttribute('src') || '';
      if (!src || src.includes('placeholder') || src.startsWith('data:image/svg')) {
        img.setAttribute('src', v);
      }
      break;
    }
    img.loading = 'eager';
  }

  async function ensureImagesLoaded() {
    const imgs = [...document.images];
    for (const img of imgs) {
      promoteLazyImage(img);
      try {
        img.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* */
      }
      if (img.complete && img.naturalWidth > 0) continue;
      await new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 5000);
      });
    }
    await sleep(120);
  }

  async function imageToDataUrl(img) {
    try {
      if (img.src?.startsWith('data:')) return img.src;
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return '';
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  async function fetchAsDataUrl(url, baseUrl, cache) {
    const abs = resolveUrl(url, baseUrl);
    if (!abs) return '';
    if (abs.startsWith('data:')) return abs;
    if (cache.has(abs)) return cache.get(abs);
    try {
      const res = await fetch(abs, { credentials: 'include', cache: 'force-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const data = await blobToDataUrl(blob);
      cache.set(abs, data);
      return data;
    } catch {
      return '';
    }
  }

  async function resourceToDataUrl(url, baseUrl, cache, liveImg) {
    const fromFetch = await fetchAsDataUrl(url, baseUrl, cache);
    if (fromFetch?.startsWith('data:')) return fromFetch;
    if (liveImg) {
      const fromCanvas = await imageToDataUrl(liveImg);
      if (fromCanvas?.startsWith('data:')) {
        const abs = resolveUrl(url, baseUrl);
        cache.set(abs, fromCanvas);
        return fromCanvas;
      }
    }
    return '';
  }

  function pairedElementWalk(liveEl, cloneEl, callback) {
    if (!liveEl || !cloneEl) return;
    callback(liveEl, cloneEl);
    let li = 0;
    let ci = 0;
    while (li < liveEl.children.length && ci < cloneEl.children.length) {
      const l = liveEl.children[li];
      const c = cloneEl.children[ci];
      if (/^(SCRIPT|NOSCRIPT)$/i.test(l.tagName)) {
        li++;
        continue;
      }
      if (/^(SCRIPT|NOSCRIPT)$/i.test(c.tagName)) {
        ci++;
        continue;
      }
      if (l.tagName === c.tagName) {
        pairedElementWalk(l, c, callback);
        li++;
        ci++;
      } else {
        li++;
      }
    }
  }

  async function inlineImagePair(cloneImg, liveImg, baseUrl, cache) {
    const urls = [];
    if (liveImg) {
      urls.push(effectiveImageUrl(liveImg));
      urls.push(liveImg.currentSrc);
    }
    urls.push(cloneImg.getAttribute('src'));
    for (const a of ['data-src', 'data-original', 'data-lazy-src', 'data-url']) {
      urls.push(cloneImg.getAttribute(a));
      if (liveImg) urls.push(liveImg.getAttribute(a));
    }
    const srcset = cloneImg.getAttribute('srcset') || liveImg?.getAttribute('srcset');
    if (srcset) urls.push(pickSrcsetUrl(srcset, baseUrl));

    let dataUrl = '';
    for (const raw of urls) {
      if (!raw) continue;
      if (raw.startsWith('data:')) {
        dataUrl = raw;
        break;
      }
      dataUrl = await resourceToDataUrl(raw, baseUrl, cache, liveImg);
      if (dataUrl?.startsWith('data:')) break;
    }
    if (!dataUrl?.startsWith('data:') && liveImg) {
      dataUrl = await imageToDataUrl(liveImg);
    }
    if (dataUrl?.startsWith('data:')) {
      cloneImg.setAttribute('src', dataUrl);
      cloneImg.removeAttribute('srcset');
      cloneImg.removeAttribute('data-src');
      cloneImg.removeAttribute('data-lazy-src');
      cloneImg.removeAttribute('data-original');
      cloneImg.removeAttribute('data-url');
    }
  }

  async function inlineImages(clone, baseUrl, cache) {
    const liveImgs = document.querySelectorAll('img');
    const cloneImgs = clone.querySelectorAll('img');
    for (let i = 0; i < cloneImgs.length; i++) {
      await inlineImagePair(cloneImgs[i], liveImgs[i] || null, baseUrl, cache);
    }
    const livePics = document.querySelectorAll('picture');
    const clonePics = clone.querySelectorAll('picture');
    for (let i = 0; i < clonePics.length; i++) {
      const clonePic = clonePics[i];
      const livePic = livePics[i];
      const cloneImg = clonePic.querySelector('img');
      const liveImg = livePic?.querySelector('img');
      if (cloneImg) await inlineImagePair(cloneImg, liveImg || null, baseUrl, cache);
      clonePic.querySelectorAll('source').forEach((s) => s.remove());
    }
    for (const obj of clone.querySelectorAll('object[type*="svg"], embed[src*=".svg"]')) {
      const src = obj.getAttribute('data') || obj.getAttribute('src');
      if (!src) continue;
      const data = await fetchAsDataUrl(src, baseUrl, cache);
      if (data?.startsWith('data:')) {
        if (obj.tagName === 'OBJECT') obj.setAttribute('data', data);
        else obj.setAttribute('src', data);
      }
    }
  }

  async function inlineBackgroundImages(clone, baseUrl, cache) {
    const pairs = [];
    pairedElementWalk(document.documentElement, clone, (liveEl, cloneEl) => {
      pairs.push([liveEl, cloneEl]);
    });
    for (const [liveEl, cloneEl] of pairs) {
      const bg = getComputedStyle(liveEl).backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('url(')) continue;
      let next = bg;
      for (const [, raw] of bg.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        if (raw.startsWith('data:')) continue;
        const data = await resourceToDataUrl(raw, baseUrl, cache, null);
        if (data) next = next.split(raw).join(data);
      }
      if (next !== bg) cloneEl.style.backgroundImage = next;
    }
  }

  async function inlineUrlsInStyles(clone, baseUrl, cache) {
    for (const style of clone.querySelectorAll('style')) {
      if (!style.textContent?.includes('url(')) continue;
      let css = style.textContent;
      for (const [, raw] of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        if (raw.startsWith('data:')) continue;
        const data = await fetchAsDataUrl(raw, baseUrl, cache);
        if (data) css = css.split(raw).join(data);
      }
      style.textContent = css;
    }
    for (const link of clone.querySelectorAll('link[rel="stylesheet"][href]')) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const cssText = await fetch(link.href, { credentials: 'include' })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '');
      if (!cssText) continue;
      let css = cssText;
      for (const [, raw] of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        if (raw.startsWith('data:')) continue;
        const data = await fetchAsDataUrl(raw, link.href, cache);
        if (data) css = css.split(raw).join(data);
      }
      const style = document.createElement('style');
      style.setAttribute('data-fullpage', 'linked-css');
      style.textContent = css;
      link.replaceWith(style);
    }
  }

  const FA_ICON_FALLBACK_RULES = {
    'fa-check': '"✓"',
    'fa-check-circle': '"✓"',
    'fa-check-square': '"✓"',
    'fa-times': '"✗"',
    'fa-times-circle': '"✗"',
    'fa-circle': '"●"',
    'fa-circle-o': '"○"',
    'fa-dot-circle-o': '"◉"',
    'fa-warning': '"⚠"',
    'fa-exclamation-triangle': '"⚠"',
    'fa-info': '"ℹ"',
    'fa-info-circle': '"ℹ"',
    'fa-arrow-right': '"→"',
    'fa-arrow-left': '"←"',
  };

  function injectIconFontFallbacks(clone) {
    const root = clone.querySelector('html') || clone;
    root.setAttribute('data-fullpage-fa-fallback', '1');
    const rules = Object.entries(FA_ICON_FALLBACK_RULES).map(
      ([cls, content]) =>
        `[class~="${cls}"]::before, .${cls}::before { content: ${content} !important; font-family: system-ui, "Segoe UI Symbol", sans-serif !important; font-weight: normal !important; }`
    );
    const style = document.createElement('style');
    style.setAttribute('data-fullpage', 'fa-fallback');
    style.textContent = `${rules.join('\n')}\n.icon::before { font-family: system-ui, "Segoe UI Symbol", sans-serif !important; }`;
    ensureHead(clone).appendChild(style);
    clone.querySelectorAll('i[class*="fa-"], span[class*="fa-"]').forEach((el) => {
      const faClass = [...el.classList].find((c) => FA_ICON_FALLBACK_RULES[c]);
      if (!faClass) return;
      const glyph = FA_ICON_FALLBACK_RULES[faClass].replace(/^"|"$/g, '');
      if (!el.textContent.trim()) el.textContent = glyph;
      el.style.fontFamily = 'system-ui, "Segoe UI Symbol", sans-serif';
    });
  }

  async function inlineAllAssets(clone, baseUrl) {
    const cache = new Map();
    await inlineImages(clone, baseUrl, cache);
    await inlineBackgroundImages(clone, baseUrl, cache);
    await inlineUrlsInStyles(clone, baseUrl, cache);
    injectIconFontFallbacks(clone);
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

  async function reconstructHtml(options = {}) {
    const baseUrl = location.href;
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, noscript').forEach((n) => n.remove());
    serializeFormState(clone);
    await inlineStyles(clone, baseUrl);
    if (options.inlineImages !== false) await inlineAllAssets(clone, baseUrl);
    const head = ensureHead(clone);
    head.prepend(Object.assign(document.createElement('meta'), { charset: 'utf-8' }));
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function isVisibleTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest('script, style, noscript, svg, [hidden], [aria-hidden="true"]')) return false;
    if (isIgnoredScroller(parent) && parent.closest('[data-region="drawer"]')) return false;
    const style = getComputedStyle(parent);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 0;
  }

  function textForClientRect(node, rect) {
    if (!node?.textContent || typeof document.caretRangeFromPoint !== 'function') {
      return (node?.textContent || '').replace(/\s+/g, ' ').trim();
    }
    const y = rect.top + rect.height / 2;
    const xStart = Math.min(rect.right - 2, rect.left + 2);
    const xEnd = Math.max(rect.left + 2, rect.right - 2);
    const startCaret = document.caretRangeFromPoint(xStart, y);
    const endCaret = document.caretRangeFromPoint(xEnd, y);
    if (!startCaret || !endCaret) {
      return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }
    const slice = document.createRange();
    try {
      slice.setStart(startCaret.startContainer, startCaret.startOffset);
      slice.setEnd(endCaret.endContainer, endCaret.endOffset);
      if (!node.contains(slice.commonAncestorContainer)) {
        return (node.textContent || '').replace(/\s+/g, ' ').trim();
      }
      const piece = slice.toString().replace(/\s+/g, ' ').trim();
      return piece || (node.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }
  }

  function extractTextLayer() {
    window.scrollTo(captureScrollState?.windowX ?? 0, 0);
    const pageWidth = document.documentElement.scrollWidth;
    const pageHeight = documentScrollHeight();
    const items = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node;
    while ((node = walker.nextNode())) {
      if (!isVisibleTextNode(node)) continue;
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (rect.width < 1 || rect.height < 1) continue;
        const left = rect.left + window.scrollX;
        const top = rect.top + window.scrollY;
        if (top > pageHeight + 4) continue;
        const text = textForClientRect(node, rect);
        if (!text) continue;
        const key = `${Math.round(left)}:${Math.round(top)}:${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          text,
          left: Math.round(left * 10) / 10,
          top: Math.round(top * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }
    const plainText = items.map((i) => i.text).join('\n');
    return { pageWidth, pageHeight, items, plainText };
  }

  async function captureTextBundle(options = {}) {
    window.scrollTo(captureScrollState?.windowX ?? 0, 0);
    await sleep(80);
    if (options.inlineImages !== false) await ensureImagesLoaded();
    const textLayer = extractTextLayer();
    const html = await reconstructHtml({ inlineImages: options.inlineImages !== false });
    const htmlText = stripPlainFromHtml(html);
    // Search index: prefer full DOM innerText from snapshot (more complete than rect walk alone).
    const pageText = htmlText.length >= (textLayer.plainText?.length || 0) ? htmlText : textLayer.plainText;
    return { html, textLayer, pageText: pageText || htmlText || textLayer.plainText };
  }

  function stripPlainFromHtml(html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body?.innerText || '';
    } catch {
      return '';
    }
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
    extractTextLayer,
    captureTextBundle,
    findPaginationLinks,
  };
})();
