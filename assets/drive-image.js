/* =========================================================================
 *  drive-image.js — authenticated Google Drive image loader  (reusable asset)
 *
 *  Origin: the same 3-copy pattern that shipped in fit-off, planner and
 *  search — Drive's thumbnail URLs (drive.google.com/thumbnail,
 *  lh3.googleusercontent.com) need Google session cookies the suite apps
 *  don't have, so photo tiles 403 and never load. The fix is to fetch the
 *  file bytes with the signed-in OAuth token and swap them in as an object
 *  URL. This module centralises that, with a per-fileId cache so repeated
 *  renders never refetch.
 *
 *  No external dependencies. Exposes a global `NDDriveImage`:
 *
 *    NDDriveImage.url(fileId, token) -> Promise<objectURL>
 *        Fetch (or return cached) an object URL for a Drive file's bytes.
 *
 *    NDDriveImage.hydrate({ getToken, root }) -> Promise<void>
 *        Scan `root` (default document) for `img[data-fileid]` not yet
 *        hydrated, fetch each with the token from getToken(), and set src.
 *        Failed loads get the class `img-failed`. Marks each img with
 *        data-hydrated="1" so it's processed once.
 *
 *    NDDriveImage.clearCache()
 *        Revoke and drop all cached object URLs (e.g. on sign-out).
 * ========================================================================= */
(function (root) {
  "use strict";

  var cache = new Map();   // fileId -> objectURL

  function url(fileId, token) {
    if (!fileId) return Promise.reject(new Error("no fileId"));
    if (cache.has(fileId)) return Promise.resolve(cache.get(fileId));
    return fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media", {
      headers: { Authorization: "Bearer " + token }
    }).then(function (r) {
      if (!r.ok) throw new Error("drive media " + r.status);
      return r.blob();
    }).then(function (blob) {
      var u = URL.createObjectURL(blob);
      cache.set(fileId, u);
      return u;
    });
  }

  function hydrate(opts) {
    opts = opts || {};
    var getToken = opts.getToken;
    var scope = opts.root || document;
    var token = getToken ? getToken() : null;
    if (!token) return Promise.resolve();
    var imgs = scope.querySelectorAll("img[data-fileid]:not([data-hydrated])");
    var chain = Promise.resolve();
    imgs.forEach(function (img) {
      var id = img.getAttribute("data-fileid");
      img.dataset.hydrated = "1";
      if (!id) return;
      chain = chain.then(function () {
        return url(id, token).then(function (u) {
          if (img.isConnected) img.src = u;
        }).catch(function () { img.classList.add("img-failed"); });
      });
    });
    return chain;
  }

  function clearCache() {
    cache.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    cache.clear();
  }

  var API = { url: url, hydrate: hydrate, clearCache: clearCache };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDDriveImage = API;
})(typeof window !== "undefined" ? window : globalThis);
