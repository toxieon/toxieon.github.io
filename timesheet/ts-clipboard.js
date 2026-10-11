/* ts-clipboard.js — Timesheet clipboard helpers (0.4.2). Pure, no DOM except
 * optional execCommand fallback; window.TsClipboard in the app, CommonJS in tests.
 *
 * Copy timesheet must put text/plain on the clipboard inside the user-gesture
 * turn (no await before the write). Map PNG uses Copy map / a separate write.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TsClipboard = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** @typedef {{ navigator?: { clipboard?: { writeText?: (t: string) => Promise<void>, write?: (items: unknown[]) => Promise<void> } }, ClipboardItem?: typeof ClipboardItem, document?: { body?: { appendChild: (n: unknown) => void, removeChild: (n: unknown) => void }, createElement: (tag: string) => unknown, execCommand?: (cmd: string) => boolean } }} ClipboardEnv */

  /**
   * Write plain text during a user gesture. Returns immediately; use result.promise
   * for completion. Never writes image/png.
   * @param {ClipboardEnv} env
   * @param {string} text
   */
  function writeTimesheetText(env, text) {
    env = env || {};
    var nav = env.navigator || {};
    var clipboard = nav.clipboard;
    var doc = env.document;
    var writes = { writeText: 0, write: 0, imageOnlyWrite: 0 };

    if (clipboard && typeof clipboard.writeText === "function") {
      writes.writeText = 1;
      var p;
      try { p = clipboard.writeText(text); } catch (e) { p = Promise.reject(e); }
      // If the async clipboard refuses (permissions, older WebKit), try the
      // execCommand fallback once. Still text only, never an image.
      return { writes: writes, promise: Promise.resolve(p).then(function () { return true; }, function () { return execCopy(doc, text); }) };
    }

    var Item = env.ClipboardItem;
    if (clipboard && typeof clipboard.write === "function" && Item) {
      writes.write = 1;
      var item = new Item({
        "text/plain": Promise.resolve(new Blob([text], { type: "text/plain" }))
      });
      return { writes: writes, promise: clipboard.write([item]) };
    }

    return { writes: writes, promise: Promise.resolve(execCopy(doc, text)) };
  }

  function execCopy(doc, text) {
    if (!(doc && typeof doc.createElement === "function" && typeof doc.execCommand === "function")) return false;
    try {
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      doc.body.appendChild(ta);
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);
      var ok = doc.execCommand("copy");
      doc.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Copy a map PNG during a user gesture (image/png only). Falls back via onFail.
   * @param {ClipboardEnv} env
   * @param {Promise<Blob|null|undefined>} blobP
   * @param {{ onFail?: () => void }} opts
   */
  function writeMapImage(env, blobP, opts) {
    env = env || {};
    opts = opts || {};
    var nav = env.navigator || {};
    var clipboard = nav.clipboard;
    var Item = env.ClipboardItem;
    var writes = { writeText: 0, write: 0, imageOnlyWrite: 0 };

    if (!(clipboard && typeof clipboard.write === "function" && Item)) {
      return { writes: writes, promise: Promise.resolve(false) };
    }

    writes.write = 1;
    writes.imageOnlyWrite = 1;
    var item = new Item({
      "image/png": blobP.then(function (blob) {
        if (!blob) throw new Error("no map");
        return blob;
      })
    });
    var promise = clipboard.write([item]).catch(function () {
      if (opts.onFail) opts.onFail();
      return false;
    });
    return { writes: writes, promise: promise };
  }

  return {
    writeTimesheetText: writeTimesheetText,
    writeMapImage: writeMapImage
  };
});
