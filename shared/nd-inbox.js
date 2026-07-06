/* =========================================================================
 *  nd-inbox.js — the unified photo Inbox (v1.0 §3, §5; handoff Slice 2)
 *
 *  ONE ledger for unfiled photos: the Master sheet's `Inbox` tab replaces
 *  Upload Log/Uploads + Photo-Allocation/Allocations for anything not yet
 *  filed to a node. Lifecycle (v1.0 §3.2):
 *
 *    UPLOADED -> UNFILED -> FILED_TO_PROJECT -> FILED_TO_NODE
 *
 *  Single-writer safety (§0.4): every write is an upsert/delete keyed by
 *  Drive File ID via nd-sheets. NOTHING may batchClear this tab, ever.
 *
 *  Depends on nd-match (canonical addressKey) and nd-sheets (writes).
 *  Node tests:  node shared/nd-inbox.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const match = (typeof module !== "undefined" && module.exports)
    ? require("./nd-match.js")
    : root.NDMatch;

  const INBOX_TAB = "Inbox";
  const ID_COLUMN = "Drive File ID";     // v1.0 §3.2: append/update by Drive File ID

  const STATUS = {
    UPLOADED: "UPLOADED",
    UNFILED: "UNFILED",
    FILED_TO_PROJECT: "FILED_TO_PROJECT",
    FILED_TO_NODE: "FILED_TO_NODE"
  };
  const STATUS_ORDER = [STATUS.UPLOADED, STATUS.UNFILED, STATUS.FILED_TO_PROJECT, STATUS.FILED_TO_NODE];

  /* v1.0 §5.1 — columns A..X, exact order. */
  const HEADER = [
    "Photo ID",        // A  uid("inbox")
    "Drive File ID",   // B  in Batch/ while UNFILED
    "Name",            // C
    "Status",          // D
    "Address",         // E  formatted
    "Address Key",     // F  normalize(address) — the group key
    "Address Source",  // G  exif | manual
    "Lat",             // H  rounded 5dp or blank
    "Lng",             // I
    "Type",            // J  device type, blank for plans
    "Room",            // K  drives auto-node
    "Location",        // L
    "Is Floor Plan",   // M  TRUE/blank
    "Project ID",      // N
    "Floor ID",        // O
    "Node ID",         // P
    "Uploader",        // Q
    "Uploaded At",     // R
    "Captured At",     // S  EXIF DateTimeOriginal
    "Mime Type",       // T
    "Web View Link",   // U
    "Thumbnail Link",  // V
    "Content Hash",    // W  SHA-256, dedup across states
    "Notes"            // X
  ];

  /* record field -> column name */
  const FIELDS = {
    photoId: "Photo ID", driveFileId: "Drive File ID", name: "Name", status: "Status",
    address: "Address", addressKey: "Address Key", addressSource: "Address Source",
    lat: "Lat", lng: "Lng", type: "Type", room: "Room", location: "Location",
    isFloorPlan: "Is Floor Plan", projectId: "Project ID", floorId: "Floor ID",
    nodeId: "Node ID", uploader: "Uploader", uploadedAt: "Uploaded At",
    capturedAt: "Captured At", mimeType: "Mime Type", webViewLink: "Web View Link",
    thumbnailLink: "Thumbnail Link", contentHash: "Content Hash", notes: "Notes"
  };

  function round5(n) {
    if (n === "" || n === null || n === undefined || isNaN(Number(n))) return "";
    return Math.round(Number(n) * 1e5) / 1e5;
  }

  let _uidCounter = 0;
  function uid(prefix) {
    _uidCounter++;
    return (prefix || "inbox") + "-" + Date.now().toString(36) + "-" +
      _uidCounter.toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* record (JS) -> sheet row object keyed by header names */
  function rowFromRecord(rec) {
    const row = {};
    Object.keys(FIELDS).forEach(function (f) {
      let v = rec[f];
      if (f === "isFloorPlan") v = rec.isFloorPlan ? "TRUE" : "";
      if (f === "lat" || f === "lng") v = round5(v);
      if (f === "addressKey" && !v) v = match.addressKey(rec.address || "");
      if (f === "photoId" && !v) v = uid("inbox");
      row[FIELDS[f]] = (v === undefined || v === null) ? "" : v;
    });
    return row;
  }

  /* sheet row object -> record */
  function recordFromRow(row) {
    const rec = {};
    Object.keys(FIELDS).forEach(function (f) {
      rec[f] = row[FIELDS[f]] !== undefined ? row[FIELDS[f]] : "";
    });
    rec.isFloorPlan = String(rec.isFloorPlan).toUpperCase() === "TRUE";
    rec.lat = rec.lat === "" ? null : Number(rec.lat);
    rec.lng = rec.lng === "" ? null : Number(rec.lng);
    if (!rec.addressKey && rec.address) rec.addressKey = match.addressKey(rec.address);
    return rec;
  }

  /* v1.0 §5.2 — Drive appProperties (source of truth if a sheet row is lost).
   * Drive limits appProperties values to short strings; keep them compact. */
  const APP_PROP_FIELDS = ["addressKey", "address", "addressSource", "type", "room",
    "location", "isFloorPlan", "projectId", "floorId", "nodeId", "contentHash", "capturedAt"];
  function toAppProperties(rec, source) {
    const props = { source: source || "nd-upload" };
    APP_PROP_FIELDS.forEach(function (f) {
      let v = rec[f];
      if (f === "isFloorPlan") v = rec.isFloorPlan ? "true" : "";
      if (v === undefined || v === null || v === "") return;
      props[f] = String(v).slice(0, 120);
    });
    return props;
  }
  function fromAppProperties(props) {
    props = props || {};
    const rec = {};
    APP_PROP_FIELDS.forEach(function (f) { if (props[f] !== undefined) rec[f] = props[f]; });
    rec.isFloorPlan = props.isFloorPlan === "true";
    return rec;
  }

  function isValidTransition(from, to) {
    if (!from) return true;                              // new row
    const a = STATUS_ORDER.indexOf(from), b = STATUS_ORDER.indexOf(to);
    if (a === -1 || b === -1) return false;
    if (from === STATUS.FILED_TO_PROJECT && to === STATUS.UNFILED) return true;  // dismiss-to-batch (§4.4)
    return b >= a;                                       // forward (or same) only, otherwise
  }

  /* group UNFILED records by addressKey — feeds the §4.3 banner.
   * Unit-block edge (v1.0 §7): if a group's rooms/locations differ, the
   * label carries them: "12 smith st · Apt 4". */
  function groupUnfiled(records) {
    const groups = {};
    records.forEach(function (rec) {
      if (rec.status !== STATUS.UNFILED && rec.status !== STATUS.UPLOADED) return;
      const key = rec.addressKey || match.addressKey(rec.address || "") || "(no address)";
      if (!groups[key]) groups[key] = { addressKey: key, address: rec.address || "", records: [], floorPlan: null, locations: {} };
      const g = groups[key];
      g.records.push(rec);
      if (!g.address && rec.address) g.address = rec.address;
      if (rec.isFloorPlan && !g.floorPlan) g.floorPlan = rec;
      const locLabel = match.clean(rec.location) || match.clean(rec.room);
      if (locLabel) g.locations[locLabel] = true;
    });
    return Object.keys(groups).map(function (k) {
      const g = groups[k];
      const locs = Object.keys(g.locations);
      return {
        addressKey: g.addressKey,
        address: g.address,
        count: g.records.length,
        records: g.records,
        floorPlan: g.floorPlan,
        label: g.address + (locs.length === 1 ? " · " + locs[0] : "")
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  /* dedup across the WHOLE set (v1.0 §7 — not just the Batch folder) */
  function findByContentHash(records, hash) {
    if (!hash) return null;
    return records.find(function (r) { return r.contentHash && r.contentHash === hash; }) || null;
  }

  /* ── sheet-facing API (wraps nd-sheets; all writes queued + keyed) ──── */
  function createInboxApi(opts) {
    const sheets = opts.sheets;               // nd-sheets instance
    const spreadsheetId = opts.spreadsheetId; // Master sheet
    if (!sheets || !spreadsheetId) throw new Error("nd-inbox: {sheets, spreadsheetId} required");

    function list(o) {
      return sheets.readTab(spreadsheetId, INBOX_TAB, o).then(function (t) {
        return t.rows.map(recordFromRow);
      });
    }

    function upsert(rec) {
      if (!rec.driveFileId) return Promise.reject(new Error("nd-inbox: record needs driveFileId"));
      if (rec.status && STATUS_ORDER.indexOf(rec.status) === -1)
        return Promise.reject(new Error("nd-inbox: unknown status " + rec.status));
      return sheets.upsertRowById(spreadsheetId, INBOX_TAB, ID_COLUMN, rowFromRecord(rec));
    }

    function setStatus(rec, status, patch) {
      if (!isValidTransition(rec.status, status))
        return Promise.reject(new Error("nd-inbox: illegal transition " + rec.status + " -> " + status));
      const next = Object.assign({}, rec, patch || {}, { status: status });
      if (status === STATUS.UNFILED) { next.projectId = ""; next.floorId = ""; next.nodeId = ""; }
      return upsert(next).then(function () { return next; });
    }

    function remove(driveFileId) {
      return sheets.deleteRowById(spreadsheetId, INBOX_TAB, ID_COLUMN, driveFileId);
    }

    return { list: list, upsert: upsert, setStatus: setStatus, remove: remove,
             groupUnfiled: groupUnfiled, findByContentHash: findByContentHash };
  }

  /* Ensure the Inbox tab exists with the §5.1 header (idempotent).
   * gateway must provide getValues / appendValues / addSheet.  */
  function ensureInboxTab(gateway, spreadsheetId) {
    return gateway.getValues(spreadsheetId, "'" + INBOX_TAB + "'!1:1")
      .catch(function () { return null; })     // tab missing -> create
      .then(function (values) {
        const header = values && values[0];
        if (header && header.length) {
          if (String(header[0]) !== HEADER[0] || String(header[1]) !== HEADER[1]) {
            throw new Error("nd-inbox: existing Inbox tab has an unexpected header — refusing to touch it (§0.4)");
          }
          return false;                        // present + sane
        }
        const write = function () { return gateway.appendValues(spreadsheetId, "'" + INBOX_TAB + "'", [HEADER.slice()]); };
        if (values === null && gateway.addSheet) {
          return gateway.addSheet(spreadsheetId, INBOX_TAB).catch(function () {}).then(write).then(function () { return true; });
        }
        return write().then(function () { return true; });
      });
  }

  const API = {
    INBOX_TAB, ID_COLUMN, STATUS, STATUS_ORDER, HEADER, FIELDS,
    uid, round5, rowFromRecord, recordFromRow,
    toAppProperties, fromAppProperties,
    isValidTransition, groupUnfiled, findByContentHash,
    createInboxApi, ensureInboxTab
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.inbox = API;
    root.NDInbox = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
