/* =========================================================================
 *  logo.js — business logo upload / store / render  (reusable asset)
 *
 *  A drop-in for letting the user add a business logo to documents (timesheet
 *  payslip now; Quote invoices next). Reads a picked image, downscales it so
 *  it's small enough to keep in localStorage, stores it, and hands back a data
 *  URL you can drop straight into an <img>.
 *
 *  No dependencies. Exposes a global `NDLogo`:
 *
 *    NDLogo.fromFile(file, opts) -> Promise<dataUrl>
 *        Read + downscale an image File/Blob (opts.maxDim default 480,
 *        opts.type 'image/png'|'image/jpeg', opts.quality). Does NOT store.
 *
 *    NDLogo.attachInput(inputEl, { key, maxDim, onChange })
 *        Wire a <input type="file">: on pick it downscales, stores under key,
 *        and calls onChange(dataUrl). Returns an unbind function.
 *
 *    NDLogo.get(key) -> dataUrl | null
 *    NDLogo.set(key, dataUrl)
 *    NDLogo.clear(key)
 *    NDLogo.imgTag(dataUrlOrKey, opts) -> HTML string  (opts.maxW, maxH, alt,
 *        style)  — resolves a bare key via get().
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDLogo) return;

  var PREFIX = "nd.logo.";
  var CURRENT_KEY = "current";              // the one business logo, shared suite-wide
  var DEFAULT_FOLDER = "Logos";
  function ownerDefault() { try { return (root.ND && root.ND.config && root.ND.config.owner && root.ND.config.owner.primaryOwnerEmail) || null; } catch (e) { return null; } }
  function store() { try { return root.localStorage; } catch (e) { return null; } }
  function get(key) { var s = store(); if (!s) return null; try { return s.getItem(PREFIX + key) || null; } catch (e) { return null; } }
  function set(key, dataUrl) { var s = store(); if (!s) return false; try { s.setItem(PREFIX + key, dataUrl); return true; } catch (e) { return false; } }
  function clear(key) { var s = store(); if (s) { try { s.removeItem(PREFIX + key); } catch (e) {} } }

  function fromFile(file, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 480;
    var type = opts.type || "image/png";
    var quality = opts.quality != null ? opts.quality : 0.92;
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("no file"));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("not an image")); };
        img.onload = function () {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (!w || !h) return reject(new Error("empty image"));
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext("2d");
          if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); }
          ctx.drawImage(img, 0, 0, cw, ch);
          try { resolve(canvas.toDataURL(type, quality)); }
          catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function attachInput(inputEl, opts) {
    opts = opts || {};
    if (!inputEl) return function () {};
    var handler = function () {
      var file = inputEl.files && inputEl.files[0];
      if (!file) return;
      fromFile(file, opts).then(function (dataUrl) {
        if (opts.key) set(opts.key, dataUrl);
        set(CURRENT_KEY, dataUrl);              // a logo picked anywhere becomes THE current logo
        if (typeof opts.onChange === "function") opts.onChange(dataUrl);
        if (opts.token) pushToDrive(dataUrl, opts).catch(function (e) { console.warn("NDLogo drive push: " + (e && e.message || e)); });
      }).catch(function (e) {
        if (typeof opts.onError === "function") opts.onError(e);
        else console.warn("NDLogo: " + (e && e.message || e));
      });
    };
    inputEl.addEventListener("change", handler);
    return function () { inputEl.removeEventListener("change", handler); };
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function imgTag(src, opts) {
    opts = opts || {};
    var url = (src && src.indexOf("data:") === 0) ? src : get(src);
    if (!url) return "";
    var style = "max-width:" + (opts.maxW || 180) + "px;max-height:" + (opts.maxH || 90) + "px;object-fit:contain;" + (opts.style || "");
    return '<img src="' + esc(url) + '" alt="' + esc(opts.alt || "Logo") + '" style="' + style + '" />';
  }

  /* ── Drive-backed shared store ─────────────────────────────────────────
   * One business logo for the whole suite: uploading anywhere pushes to a
   * "Logos" folder in Drive; anywhere that shows a logo reads the newest one.
   * localStorage is same-origin across every app, so the cached "current" logo
   * is already shared instantly — Drive is the durable, cross-device backing.
   * These need a Google access token (pass opts.token, e.g. NDAuth.getToken()).
   * ------------------------------------------------------------------- */
  function escQ(v) { return String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
  function blobToDataUrl(blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }
  function driveJson(url, token, init) {
    init = init || {}; init.headers = Object.assign({ Authorization: "Bearer " + token }, init.headers || {});
    return fetch(url, init).then(function (r) { if (!r.ok) throw new Error("drive " + r.status); return r.json(); });
  }
  function findLogosFolder(token, opts, create) {
    var owner = opts.ownerEmail || ownerDefault();
    var name = opts.folderName || DEFAULT_FOLDER;
    var ownerClause = owner ? ("'" + escQ(owner) + "' in owners") : "'me' in owners";
    var q = "name='" + escQ(name) + "' and mimeType='application/vnd.google-apps.folder' and " + ownerClause + " and trashed=false";
    return driveJson("https://www.googleapis.com/drive/v3/files?fields=files(id)&pageSize=1&q=" + encodeURIComponent(q), token).then(function (r) {
      if (r.files && r.files.length) return r.files[0].id;
      if (!create) return null;
      return driveJson("https://www.googleapis.com/drive/v3/files?fields=id", token, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, mimeType: "application/vnd.google-apps.folder" })
      }).then(function (c) { return c.id; });
    });
  }
  function pushToDrive(dataUrl, opts) {
    opts = opts || {};
    var token = opts.token;
    if (!token || !dataUrl) return Promise.reject(new Error("token + dataUrl required"));
    set(CURRENT_KEY, dataUrl);                          // update shared cache immediately
    return findLogosFolder(token, opts, true).then(function (folderId) {
      var b64 = String(dataUrl).split(",")[1] || "";
      var mime = (String(dataUrl).match(/^data:([^;]+)/) || [])[1] || "image/png";
      var boundary = "ndlogo" + Math.random().toString(36).slice(2);
      var meta = { name: "logo-" + Date.now() + ".png", parents: folderId ? [folderId] : undefined };
      var body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
        "\r\n--" + boundary + "\r\nContent-Type: " + mime + "\r\nContent-Transfer-Encoding: base64\r\n\r\n" + b64 + "\r\n--" + boundary + "--";
      return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary }, body: body
      }).then(function (r) { if (!r.ok) throw new Error("upload " + r.status); return r.json(); });
    });
  }
  function pullLatest(opts) {
    opts = opts || {};
    var token = opts.token;
    if (!token) return Promise.resolve(get(CURRENT_KEY));
    return findLogosFolder(token, opts, false).then(function (folderId) {
      if (!folderId) return get(CURRENT_KEY);
      var q = "'" + folderId + "' in parents and trashed=false and mimeType contains 'image/'";
      return driveJson("https://www.googleapis.com/drive/v3/files?orderBy=createdTime desc&pageSize=1&fields=files(id)&q=" + encodeURIComponent(q), token).then(function (r) {
        var f = (r.files || [])[0];
        if (!f) return get(CURRENT_KEY);
        return fetch("https://www.googleapis.com/drive/v3/files/" + f.id + "?alt=media", { headers: { Authorization: "Bearer " + token } })
          .then(function (mr) { if (!mr.ok) throw new Error("media " + mr.status); return mr.blob(); })
          .then(blobToDataUrl).then(function (dataUrl) { set(CURRENT_KEY, dataUrl); return dataUrl; });
      });
    }).catch(function () { return get(CURRENT_KEY); });
  }
  // Return the cached current logo now, and refresh from Drive in the
  // background — calling opts.onUpdate(dataUrl) if a newer one comes back.
  function current(opts) {
    opts = opts || {};
    var cached = get(CURRENT_KEY);
    if (opts.token) pullLatest(opts).then(function (d) { if (d && d !== cached && typeof opts.onUpdate === "function") opts.onUpdate(d); }).catch(function () {});
    return cached;
  }

  var API = {
    fromFile: fromFile, attachInput: attachInput, get: get, set: set, clear: clear, imgTag: imgTag,
    CURRENT_KEY: CURRENT_KEY, pushToDrive: pushToDrive, pullLatest: pullLatest, current: current
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDLogo = API;
})(typeof window !== "undefined" ? window : globalThis);
