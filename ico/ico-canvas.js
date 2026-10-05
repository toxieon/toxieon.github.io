/* Neill Data ICO generator: browser side (Canvas draw + tiny ICO packer).
 * Mirrors ico/generate.py (same defaults, fonts and layout rules) so the static
 * page at /ico/ works on GitHub Pages without a server. No third-party code:
 * an .ico with PNG frames is a 6-byte header + one 16-byte entry per frame + the PNGs.
 * The Python API/CLI (ico/server.py, ico/cli.py) is the canonical path for scripts.
 * Image path: imageToIco(file) fits a PNG/JPEG/WebP/ICO into a square (transparent padding,
 * no painted background), keeps alpha and resizes each size with high-quality smoothing
 * (stepwise halving). The Python API uses Pillow LANCZOS for the same job. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NDIco = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const DEFAULT_BG = "#0B1F3A"; // Neill navy
  const DEFAULT_FG = "#FFFFFF";
  const DEFAULT_SIZES = [16, 32, 48, 256];
  const MAX_NAME = 40, MAX_VERSION = 24, MAX_SHORT = 4;
  const VERSION_DIM = 0.8;
  const VERSION_ALPHA = 0.88, OUTLINE_ALPHA = 0.75; // transparent background only
  const TRANSPARENT_WORDS = ["", "transparent", "none"];
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024, MAX_IMAGE_PIXELS = 40000000; // same limits as generate.py
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
  const FONT_FAMILY = '"ND Ico Sans", "DejaVu Sans", Verdana, sans-serif';

  function clean(value, field, max, required) {
    const v = String(value == null ? "" : value).replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (required && !v) throw new Error(field + " is required");
    if (v.length > max) throw new Error(field + " must be at most " + max + " characters");
    return v;
  }

  function parseHex(value, fallback) {
    let v = String(value || "").trim() || fallback;
    const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
    if (!m) throw new Error("colour must be hex like #0B1F3A, got " + JSON.stringify(v));
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  /** null/undefined (omitted) -> navy; "", "transparent", "none" (any case) -> null = transparent */
  function parseBg(value) {
    if (value === undefined || value === null) return parseHex(DEFAULT_BG, DEFAULT_BG);
    if (TRANSPARENT_WORDS.includes(String(value).trim().toLowerCase())) return null;
    return parseHex(value, DEFAULT_BG);
  }

  const outlineWidth = (size) => Math.max(1, Math.round(size * 0.02));
  const outlineColour = (fg) => (0.2126 * fg[0] + 0.7152 * fg[1] + 0.0722 * fg[2] >= 128 ? [0, 0, 0] : [255, 255, 255]);

  function initials(name) {
    const words = name.split(/[\s_\-.]+/).filter(Boolean);
    if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
    const word = words[0] || name;
    const caps = word.slice(1).match(/[A-Z0-9]/g);
    if (caps) return (word[0].toUpperCase() + caps.join("")).slice(0, 3);
    return word.slice(0, 1).toUpperCase() + word.slice(1, 2).toLowerCase();
  }

  function safeFilename(name, version) {
    let stem = version ? name + "-" + version : name;
    stem = stem.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "").replace(/-{2,}/g, "-").replace(/^[.-]+|[.-]+$/g, "") || "icon";
    return stem.slice(0, 80) + ".ico";
  }

  /** "My Logo.png" -> "My-Logo.ico" (mirrors generate.image_filename) */
  function imageFilename(uploadName) {
    let stem = String(uploadName || "").split(/[\\/]/).pop();
    if (stem.includes(".")) stem = stem.slice(0, stem.lastIndexOf("."));
    return safeFilename(stem || "icon", "");
  }

  /** Where a w x h picture lands inside a size x size square (contain, centred). */
  function fitRect(w, h, size) {
    const k = size / Math.max(w, h);
    const dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
    return { x: Math.floor((size - dw) / 2), y: Math.floor((size - dh) / 2), w: dw, h: dh };
  }

  function makeSpec(opts) {
    const name = clean(opts.name, "name", MAX_NAME, true);
    const version = clean(opts.version, "version", MAX_VERSION, true);
    const short = clean(opts.short, "short", MAX_SHORT, false);
    return {
      name, version,
      short: short || initials(name),
      tiny: short || initials(name).slice(0, 2),
      bg: parseBg(opts.bg), // null = transparent
      fg: parseHex(opts.fg, DEFAULT_FG),
      sizes: (opts.sizes || DEFAULT_SIZES).slice().sort((a, b) => a - b),
    };
  }

  const rgb = (c) => "rgb(" + c.join(",") + ")";
  const mix = (a, b, k) => a.map((x, i) => Math.round(x * k + b[i] * (1 - k)));

  function measure(ctx, text, weight, px) {
    ctx.font = weight + " " + px + "px " + FONT_FAMILY;
    const m = ctx.measureText(text);
    const l = m.actualBoundingBoxLeft || 0, r = m.actualBoundingBoxRight || m.width;
    const a = m.actualBoundingBoxAscent || px * 0.76, d = m.actualBoundingBoxDescent || 0;
    return { px, weight, w: l + r, h: a + d, l, a };
  }

  function fit(ctx, text, weight, start, minimum, maxW, maxH) {
    for (let px = Math.max(start, minimum); px >= minimum; px--) {
      const m = measure(ctx, text, weight, px);
      if (m.w <= maxW && m.h <= maxH) return m;
    }
    return null;
  }

  // outline = null (solid bg) or { width, colour } (transparent bg)
  function put(ctx, text, m, x, y, colour, outline, alpha) {
    ctx.font = m.weight + " " + m.px + "px " + FONT_FAMILY;
    ctx.textBaseline = "alphabetic";
    if (outline) {
      ctx.lineJoin = "round";
      ctx.lineWidth = outline.width * 2;
      ctx.strokeStyle = "rgba(" + outline.colour.join(",") + "," + OUTLINE_ALPHA + ")";
      ctx.strokeText(text, x + m.l, y + m.a);
    }
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = colour;
    ctx.fillText(text, x + m.l, y + m.a);
    ctx.globalAlpha = 1;
  }

  /** Draw one frame onto a size x size canvas (same rules as generate.render_size). */
  function drawFrame(canvas, spec, size) {
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const transparent = spec.bg === null;
    const sw = transparent ? outlineWidth(size) : 0;
    const outline = transparent ? { width: sw, colour: outlineColour(spec.fg) } : null;
    ctx.clearRect(0, 0, size, size);
    if (!transparent) { ctx.fillStyle = rgb(spec.bg); ctx.fillRect(0, 0, size, size); }
    const pad = Math.max(1, Math.round(size * 0.06)) + sw; // leave room for the outline
    const avail = size - 2 * pad;
    if (size < 32) {
      const m = fit(ctx, spec.tiny, 700, Math.round(size * 0.62), 4, avail, avail);
      if (m) put(ctx, spec.tiny, m, (size - m.w) / 2, (size - m.h) / 2, rgb(spec.fg), outline);
      return canvas;
    }
    const gap = Math.max(1, Math.round(size * 0.06)) + sw;
    const nameMaxH = Math.round(avail * 0.55);
    const minName = Math.max(8, Math.round(size * 0.05));
    let line1 = spec.name;
    let n = fit(ctx, line1, 700, Math.round(size * 0.36), minName, avail, nameMaxH);
    if (!n) { line1 = spec.short; n = fit(ctx, line1, 700, Math.round(size * 0.36), 4, avail, nameMaxH) || measure(ctx, line1, 700, 4); }
    const verStart = Math.min(Math.round(size * 0.26), Math.round(n.px * 0.82));
    const v = fit(ctx, spec.version, 400, verStart, 4, avail, Math.max(avail - n.h - gap, 4)) || measure(ctx, spec.version, 400, 4);
    const top = (size - (n.h + gap + v.h)) / 2;
    put(ctx, line1, n, (size - n.w) / 2, top, rgb(spec.fg), outline);
    if (transparent) put(ctx, spec.version, v, (size - v.w) / 2, top + n.h + gap, rgb(spec.fg), outline, VERSION_ALPHA);
    else put(ctx, spec.version, v, (size - v.w) / 2, top + n.h + gap, rgb(mix(spec.fg, spec.bg, VERSION_DIM)));
    return canvas;
  }

  /** Pack PNG frames into an .ico. frames: [{size, png: Uint8Array}] -> Uint8Array */
  function packIco(frames) {
    frames = frames.slice().sort((a, b) => a.size - b.size);
    const headLen = 6 + 16 * frames.length;
    const total = headLen + frames.reduce((s, f) => s + f.png.length, 0);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, frames.length, true);
    let offset = headLen;
    frames.forEach((f, i) => {
      if (!(f.size >= 1 && f.size <= 256)) throw new Error("ICO frame sizes must be 1..256");
      const e = 6 + 16 * i;
      out[e] = f.size >= 256 ? 0 : f.size;     // width (0 = 256)
      out[e + 1] = f.size >= 256 ? 0 : f.size; // height
      out[e + 2] = 0; out[e + 3] = 0;          // colour count, reserved
      dv.setUint16(e + 4, 1, true);            // planes
      dv.setUint16(e + 6, 32, true);           // bits per pixel
      dv.setUint32(e + 8, f.png.length, true);
      dv.setUint32(e + 12, offset, true);
      out.set(f.png, offset);
      offset += f.png.length;
    });
    return out;
  }

  function canvasPng(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => {
      if (!b) return reject(new Error("canvas.toBlob failed"));
      b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, "image/png"));
  }

  /** Draw a decoded picture (ImageBitmap / img / canvas) into a transparent size x size canvas. */
  function drawImageFrame(canvas, source, size) {
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size); // never paint a background behind the picture
    const sw = source.width, sh = source.height;
    const r = fitRect(sw, sh, size);
    // Stepwise halving keeps big downscales sharp and alias-free (browser has no LANCZOS)
    let src = source, cw = sw, ch = sh;
    while (cw / 2 >= r.w && ch / 2 >= r.h) {
      const tmp = document.createElement("canvas");
      tmp.width = Math.max(1, Math.round(cw / 2)); tmp.height = Math.max(1, Math.round(ch / 2));
      const t = tmp.getContext("2d");
      t.imageSmoothingEnabled = true; t.imageSmoothingQuality = "high";
      t.drawImage(src, 0, 0, cw, ch, 0, 0, tmp.width, tmp.height);
      src = tmp; cw = tmp.width; ch = tmp.height;
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cw, ch, r.x, r.y, r.w, r.h);
    return canvas;
  }

  function checkImageFile(file) {
    if (!file) throw new Error("choose a picture first");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("picture is larger than 10 MB");
    const ok = IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp|ico)$/i.test(file.name || "");
    if (!ok) throw new Error("use a PNG, JPEG, WebP or ICO picture");
  }

  /** Decode a File/Blob; EXIF rotation is applied by the browser. */
  async function decodeImage(file) {
    checkImageFile(file);
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) {
      bmp = await new Promise((resolve, reject) => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("this picture could not be read by the browser")); };
        img.src = url;
      });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    if (!w || !h) throw new Error("this picture could not be read by the browser");
    if (w * h > MAX_IMAGE_PIXELS) throw new Error("picture is " + w + "x" + h + "; the limit is 40 million pixels");
    return bmp;
  }

  /** Browser: picture File -> { blob, filename, frames } (.ico with RGBA PNG frames). */
  async function imageToIco(file, sizes) {
    const source = await decodeImage(file);
    const list = (sizes || DEFAULT_SIZES).slice().sort((a, b) => a - b);
    const frames = [];
    for (const size of list) {
      const c = drawImageFrame(document.createElement("canvas"), source, size);
      frames.push({ size, canvas: c, png: await canvasPng(c) });
    }
    return { blob: new Blob([packIco(frames)], { type: "image/x-icon" }), filename: imageFilename(file.name), frames };
  }

  /** Browser: build the .ico Blob. Waits for the bundled fonts first. */
  async function generateIco(opts) {
    const spec = makeSpec(opts);
    if (typeof document !== "undefined" && document.fonts) {
      await Promise.all([document.fonts.load('700 20px "ND Ico Sans"'), document.fonts.load('400 20px "ND Ico Sans"')]);
    }
    const frames = [];
    for (const size of spec.sizes) {
      const c = drawFrame(document.createElement("canvas"), spec, size);
      frames.push({ size, png: await canvasPng(c) });
    }
    return { blob: new Blob([packIco(frames)], { type: "image/x-icon" }), filename: safeFilename(spec.name, spec.version), spec };
  }

  return { DEFAULT_BG, DEFAULT_FG, DEFAULT_SIZES, MAX_NAME, MAX_VERSION, MAX_SHORT,
    MAX_UPLOAD_BYTES, MAX_IMAGE_PIXELS,
    initials, safeFilename, imageFilename, fitRect, parseHex, parseBg, makeSpec, drawFrame, packIco, generateIco,
    checkImageFile, decodeImage, drawImageFrame, imageToIco };
});
