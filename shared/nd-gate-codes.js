/* Gate Codes client — proximity for viewers; full list only when the backend accepts the editor token. */
(function (root) {
  "use strict";

  var VIEW_KEY = "gc_view_session_v1";
  // Older builds persisted the editor list; remove any copy left on the device.
  try { if (typeof localStorage !== "undefined") localStorage.removeItem("gc_editor_list_v1"); } catch (e) {}

  function endpoint() {
    return (root.ND_BACKEND && root.ND_BACKEND.endpoint) || "";
  }

  function backendReady() {
    return !!endpoint();
  }

  function viewSession() {
    try {
      var raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.token || !o.exp || Date.now() > o.exp) return null;
      return o.token;
    } catch (e) { return null; }
  }
  function setViewSession(token, ttlMs) {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ token: token, exp: Date.now() + (ttlMs || 7 * 24 * 3600 * 1000) }));
  }
  function clearViewSession() {
    localStorage.removeItem(VIEW_KEY);
  }

  async function call(action, body, opts) {
    opts = opts || {};
    var url = endpoint();
    if (!url) return { ok: false, error: "not_configured" };
    var payload = Object.assign({}, body || {}, { action: action });
    if (!opts.skipViewSession) {
      var vs = viewSession();
      if (vs) payload.viewSession = vs;
    }
    var r = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      redirect: "follow"
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    var data = await r.json();
    if (data && data.error) {
      var err = new Error(data.error);
      err.data = data;
      throw err;
    }
    return data;
  }

  function authFields() {
    var tok = root.NDAuth && root.NDAuth.getToken && root.NDAuth.getToken();
    if (!tok) return {};
    return { accessToken: tok };
  }

  function validateCode(code) {
    var s = String(code == null ? "" : code).trim();
    if (!/^\d{4}$/.test(s)) return "Gate code must be exactly 4 digits";
    return "";
  }

  function timesheetJobHints() {
    try {
      var raw = localStorage.getItem("ts_state_v1");
      if (!raw) return [];
      var st = JSON.parse(raw);
      return (st.jobs || []).filter(function (j) { return j && j.lat != null && j.lng != null; }).map(function (j) {
        return { job_id: j.job_id, job_name: j.job_name, lat: j.lat, lng: j.lng };
      });
    } catch (e) { return []; }
  }

  var API = {
    backendReady: backendReady,
    validateCode: validateCode,
    clearViewSession: clearViewSession,
    hasViewSession: function () { return !!viewSession(); },
    async pinStatus() {
      if (!backendReady()) return { ok: true, configured: false, pinRequired: true, pinConfigured: false };
      return call("gc_pin_status", {}, { skipViewSession: true });
    },
    async verifyPin(pin) {
      var data = await call("gc_pin_verify", { pin: String(pin) }, { skipViewSession: true });
      if (data && data.ok && data.viewSession) setViewSession(data.viewSession, data.ttlMs);
      return data;
    },
    /** Viewers: at most one site within ~150 m. Never a list. */
    async nearby(lat, lng) {
      if (!backendReady()) return { ok: true, offline: true, site: null };
      return call("gc_nearby", { lat: lat, lng: lng });
    },
    /** Editors only — invalid/expired token → forbidden (treat as anonymous). */
    async listEditor() {
      if (!backendReady()) return { ok: false, error: "not_configured" };
      // The full list is held in memory only; nothing with codes is written to storage.
      return call("gc_list", authFields(), { skipViewSession: true });
    },
    /** Kept for callers; the list is never persisted, so this is always empty. */
    readEditorCache() { return []; },
    async upsert(row) {
      var err = validateCode(row && row.code);
      if (err) throw new Error(err);
      var body = Object.assign({
        site_id: row.site_id || "",
        site_name: row.site_name || "",
        lat: row.lat,
        lng: row.lng,
        code: String(row.code).trim(),
        jobHints: row.jobHints || timesheetJobHints()
      }, authFields());
      if (!backendReady()) return { ok: false, error: "not_configured" };
      return call("gc_upsert", body, { skipViewSession: true });
    },
    async editorsMeta() {
      return call("gc_editors_list", authFields(), { skipViewSession: true });
    },
    async editorsAdd(email) {
      return call("gc_editors_add", Object.assign({ email: email }, authFields()), { skipViewSession: true });
    },
    async editorsRemove(email) {
      return call("gc_editors_remove", Object.assign({ email: email }, authFields()), { skipViewSession: true });
    },
    async pinSet(opts) {
      return call("gc_pin_set", Object.assign({}, opts || {}, authFields()), { skipViewSession: true });
    },
    async ownerAppLink() {
      if (!backendReady()) return { ok: false, error: "not_configured" };
      return call("gc_owner_app_link", authFields(), { skipViewSession: true });
    },
    /** The server decides; profile is ignored (kept for signature compatibility). */
    isEditorMeta(meta) { return !!(meta && meta.ok && meta.isEditor); },
    isOwnerMeta(meta) { return !!(meta && meta.ok && meta.isOwner); }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDGateCodes = API;
})(typeof window !== "undefined" ? window : globalThis);
