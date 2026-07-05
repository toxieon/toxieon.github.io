/* =========================================================================
 *  nd-pwa.js — Neill Data Suite PWA helper (§1.8)
 *
 *  - Registers the app's ./sw.js (app-shell caching, API network-only —
 *    Timesheet's proven pattern).
 *  - Captures beforeinstallprompt so apps can offer "Add to home screen"
 *    from their own UI:  NDPWA.canInstall() / NDPWA.promptInstall()
 *
 *  Include AFTER the page is interactive-safe (defer is fine):
 *    <script src="../shared/nd-pwa.js" defer></script>
 * ========================================================================= */
(function (root) {
  "use strict";

  let deferredPrompt = null;
  let listeners = [];

  function emit() { listeners.forEach(function (cb) { try { cb(!!deferredPrompt); } catch (e) {} }); }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      emit();
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      emit();
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./sw.js").catch(function (e) {
          console.warn("SW registration failed", e);
        });
      });
    }
  }

  const API = {
    canInstall: function () { return !!deferredPrompt; },
    promptInstall: function () {
      if (!deferredPrompt) return Promise.resolve({ outcome: "unavailable" });
      const p = deferredPrompt;
      deferredPrompt = null;
      emit();
      p.prompt();
      return p.userChoice;
    },
    onInstallable: function (cb) { listeners.push(cb); cb(!!deferredPrompt); return function () { listeners = listeners.filter(function (l) { return l !== cb; }); }; },
    isStandalone: function () {
      return (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches) ||
             (typeof navigator !== "undefined" && navigator.standalone === true);
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else { root.ND = root.ND || {}; root.ND.pwa = API; root.NDPWA = API; }
})(typeof window !== "undefined" ? window : globalThis);
