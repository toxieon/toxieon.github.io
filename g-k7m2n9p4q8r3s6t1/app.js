/* Gate Codes — proximity for viewers; editor list when signed in + allowlisted. */
(function () {
  "use strict";
  const APP_VERSION = "0.1.1";
  const $ = (id) => document.getElementById(id);

  let editorMode = false;
  let editorCodes = [];
  let watchId = null;
  let lastSiteId = null;

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function refreshEditorFlag() {
    editorMode = false;
    $("editor-panel").hidden = true;
    if (!window.NDAuth || !NDAuth.isSignedIn()) return;
    try {
      const meta = await NDGateCodes.editorsMeta();
      const profile = NDAuth.getProfile();
      editorMode = NDGateCodes.isEditorMeta(meta, profile);
      $("editor-panel").hidden = !editorMode;
      if (editorMode) await loadEditorList();
    } catch (e) {
      editorMode = false;
    }
  }

  function renderProximity(site) {
    const card = $("proximity-card");
    if (!site || !site.code) {
      card.hidden = true;
      lastSiteId = null;
      return;
    }
    if (site.site_id === lastSiteId) {
      $("prox-code").textContent = site.code;
      return;
    }
    lastSiteId = site.site_id;
    card.hidden = false;
    $("prox-title").textContent = site.site_name || "This site";
    $("prox-code").textContent = site.code;
    $("prox-edit").style.display = editorMode ? "inline-flex" : "none";
  }

  async function pollLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const data = await NDGateCodes.nearby(pos.coords.latitude, pos.coords.longitude);
        renderProximity(data.site);
      } catch (e) {
        if (e.message === "pin_required") showPin();
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 });
  }

  function startWatch() {
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        NDGateCodes.nearby(pos.coords.latitude, pos.coords.longitude)
          .then((d) => renderProximity(d.site))
          .catch((e) => { if (e.message === "pin_required") showPin(); });
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 }
    );
  }

  function showPin() {
    $("pin-screen").hidden = false;
    $("app-main").hidden = true;
  }
  function hidePin() {
    $("pin-screen").hidden = true;
    $("app-main").hidden = false;
  }

  async function ensurePinGate() {
    if (!NDGateCodes.backendReady()) {
      $("setup-hint").hidden = false;
      $("setup-hint").textContent = "Backend not connected yet — set shared/nd-backend.js endpoint after deploying GateCodes.gs.";
      return;
    }
    const st = await NDGateCodes.pinStatus();
    if (!st.pinRequired) { hidePin(); return; }
    if (!st.pinConfigured) {
      $("setup-hint").hidden = false;
      $("setup-hint").textContent = "Owner: sign in and set the company view PIN in Settings.";
    }
    if (NDGateCodes.hasViewSession()) { hidePin(); return; }
    showPin();
  }

  async function loadEditorList() {
    const q = ($("editor-search").value || "").trim().toLowerCase();
    try {
      const data = await NDGateCodes.listEditor();
      editorCodes = data.codes || [];
    } catch (e) {
      editorCodes = NDGateCodes.readEditorCache();
      toast("Could not refresh list — " + (e.message || "sign in as editor"));
    }
    const list = $("editor-list");
    list.replaceChildren();
    editorCodes
      .filter((row) => !q || (row.site_name || "").toLowerCase().includes(q) || (row.site_id || "").includes(q))
      .forEach((row) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-row";
        btn.innerHTML = `<strong>${escapeHtml(row.site_name || row.site_id)}</strong><span class="mono">${escapeHtml(row.code || "—")}</span>`;
        btn.addEventListener("click", () => openEditModal(row));
        list.appendChild(btn);
      });
  }

  function openEditModal(row) {
    $("edit-site-id").value = row.site_id || "";
    $("edit-site-name").value = row.site_name || "";
    $("edit-code").value = row.code || "";
    $("edit-modal").hidden = false;
  }

  function openSaveAtLocation() {
    $("edit-site-id").value = "";
    $("edit-site-name").value = "";
    $("edit-code").value = "";
    $("edit-modal").hidden = false;
    navigator.geolocation.getCurrentPosition((pos) => {
      $("edit-lat").value = pos.coords.latitude;
      $("edit-lng").value = pos.coords.longitude;
    }, () => toast("Turn on location to save a code here"));
  }

  async function saveEdit() {
    const code = $("edit-code").value.trim();
    const err = NDGateCodes.validateCode(code);
    if (err) { toast(err); return; }
    const body = {
      site_id: $("edit-site-id").value.trim(),
      site_name: $("edit-site-name").value.trim(),
      code,
      lat: Number($("edit-lat").value) || undefined,
      lng: Number($("edit-lng").value) || undefined
    };
    try {
      await NDGateCodes.upsert(body);
      $("edit-modal").hidden = true;
      toast("Saved");
      if (editorMode) await loadEditorList();
      pollLocation();
    } catch (e) {
      toast(e.message || "Save failed");
    }
  }

  async function bootAuth() {
    const cfg = window.NDConfig && NDConfig.forApp ? NDConfig.forApp("timesheet") : {};
    NDAuth.init({ clientId: cfg.googleClientId, scopes: cfg.scopes });
    NDAuth.onAuthChange(() => refreshEditorFlag());
    try { await NDAuth.ensureToken(); } catch (e) {}
    await refreshEditorFlag();
    const chip = $("auth-chip");
    if (NDAuth.isSignedIn()) {
      const p = NDAuth.getProfile();
      chip.textContent = p && p.email ? p.email.split("@")[0] : "Signed in";
      chip.hidden = false;
    } else chip.hidden = true;
  }

  function bindUi() {
    $("pin-submit").addEventListener("click", async () => {
      const pin = $("pin-input").value.trim();
      try {
        await NDGateCodes.verifyPin(pin);
        hidePin();
        toast("Unlocked");
        pollLocation();
        startWatch();
      } catch (e) {
        $("pin-err").textContent = e.message || "Wrong PIN";
      }
    });
    $("prox-edit").addEventListener("click", () => {
      const site = { site_id: lastSiteId, site_name: $("prox-title").textContent, code: $("prox-code").textContent };
      openEditModal(site);
    });
    $("editor-search").addEventListener("input", () => loadEditorList());
    $("btn-save-here").addEventListener("click", openSaveAtLocation);
    $("edit-save").addEventListener("click", saveEdit);
    $("edit-cancel").addEventListener("click", () => { $("edit-modal").hidden = true; });
    $("btn-signin").addEventListener("click", () => NDAuth.ensureToken({ interactive: true }).then(refreshEditorFlag));
    $("btn-settings").addEventListener("click", () => { $("settings-modal").hidden = false; });
    $("settings-close").addEventListener("click", () => { $("settings-modal").hidden = true; });
    $("pin-set").addEventListener("click", async () => {
      try {
        await NDGateCodes.pinSet({ pin: $("owner-pin").value.trim() });
        toast("PIN updated");
      } catch (e) { toast(e.message); }
    });
    $("ver").textContent = "v" + APP_VERSION;
  }

  async function init() {
    bindUi();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
    await bootAuth();
    await ensurePinGate();
    pollLocation();
    startWatch();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
