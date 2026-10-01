/* =========================================================================
 *  nd-pdf.js: suite loader for vendored pdf.js 6.3.289 (legacy build,
 *  Apache-2.0, shared/vendor/pdfjs/). Same-origin module + worker, so no CDN
 *  and no cross-origin worker issues on iOS.
 *
 *    NDPdf.load()            -> Promise<pdfjsLib> (also sets window.pdfjsLib)
 *    NDPdf.docOptions(src)   -> getDocument params with isEvalSupported:false
 *                               (CVE-2024-4367) + wasm/icc URLs for JPX/JBIG2/CMYK
 * ========================================================================= */
(function (root) {
  "use strict";
  var script = document.currentScript;
  var BASE = new URL("vendor/pdfjs/", script && script.src ? script.src : new URL("../shared/", document.baseURI)).href;
  var promise = null;
  function load() {
    if (promise) return promise;
    promise = import(BASE + "pdf.min.mjs").then(function (lib) {
      lib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.mjs";
      root.pdfjsLib = lib;
      return lib;
    }).catch(function (e) { promise = null; throw new Error("pdf.js failed to load: " + (e && e.message || e)); });
    return promise;
  }
  function docOptions(src) {
    var o = { wasmUrl: BASE + "wasm/", iccUrl: BASE + "iccs/" };
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
    o.isEvalSupported = false;
    return o;
  }
  root.NDPdf = { load: load, docOptions: docOptions, base: BASE, version: "6.3.289" };
})(typeof window !== "undefined" ? window : this);
