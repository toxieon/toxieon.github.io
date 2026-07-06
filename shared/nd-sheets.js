/* =========================================================================
 *  nd-sheets.js — Neill Data Suite sheet read/write helpers (§1.4)
 *
 *  SINGLE-WRITER SAFETY IS LAW (§0.4): there is deliberately NO clearTab
 *  and NO wholesale-rewrite helper in this module. Every write is
 *  append-or-update keyed by a row ID column:
 *
 *    upsertRowById(spreadsheetId, tab, idColumn, rowObject)
 *    appendRows(spreadsheetId, tab, rowObjects[])
 *    deleteRowById(spreadsheetId, tab, idColumn, idValue)
 *
 *  Writes route through nd-queue when a queue is attached, so offline
 *  safety is automatic (§1.3). Reads integrate with nd-cache when a cache
 *  is passed: readTab(..., {cache, maxAge}) is stale-while-revalidate.
 *
 *  Row objects are keyed by header names (row 1 of the tab). Unknown
 *  headers are ignored; missing fields write "".
 *
 *  Browser: NDSheets.create({ gateway: NDSheets.gapiGateway(), queue, cache })
 *  Node tests inject a fake gateway.  Run:  node shared/nd-sheets.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const QUEUE_KIND = "nd-sheets";

  /* column index (0-based) -> A1 letter(s) */
  function colLetter(i) {
    let s = "";
    i = i + 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function rowToValues(header, rowObj) {
    return header.map(function (h) {
      const v = rowObj[h];
      return (v === undefined || v === null) ? "" : v;
    });
  }

  function valuesToObjects(values) {
    if (!values || !values.length) return { header: [], rows: [] };
    const header = values[0].map(String);
    const rows = values.slice(1).map(function (r, i) {
      const o = { _rowNumber: i + 2 };   // 1-based sheet row (header is row 1)
      header.forEach(function (h, ci) { o[h] = (r[ci] === undefined) ? "" : r[ci]; });
      return o;
    });
    return { header: header, rows: rows };
  }

  /* ── core factory ─────────────────────────────────────────────────────
   * gateway: {
   *   getValues(spreadsheetId, range) -> Promise<values[][]>,
   *   updateValues(spreadsheetId, range, values[][]) -> Promise,
   *   appendValues(spreadsheetId, range, values[][]) -> Promise,
   *   deleteRow(spreadsheetId, tab, rowNumber) -> Promise   (1-based)
   * }
   */
  function create(opts) {
    opts = opts || {};
    const gateway = opts.gateway;
    if (!gateway) throw new Error("nd-sheets: create({gateway}) is required");
    const queue = opts.queue || null;
    const cache = opts.cache || null;

    /* ---- reads ---------------------------------------------------------- */
    function fetchTab(spreadsheetId, tab) {
      return gateway.getValues(spreadsheetId, "'" + tab + "'").then(valuesToObjects);
    }

    function readTab(spreadsheetId, tab, o) {
      o = o || {};
      const c = o.cache || cache;
      if (!c) return fetchTab(spreadsheetId, tab);
      return c.swr("nd-sheets:" + spreadsheetId + ":" + tab,
        function () { return fetchTab(spreadsheetId, tab); },
        { maxAge: o.maxAge });
    }

    /* ---- write executors (the only code that touches the API) ---------- */
    function findRowNumberById(spreadsheetId, tab, idColumn, idValue) {
      return gateway.getValues(spreadsheetId, "'" + tab + "'").then(function (values) {
        if (!values || !values.length) throw new Error("nd-sheets: tab '" + tab + "' is empty (no header row)");
        const header = values[0].map(String);
        const ci = header.indexOf(idColumn);
        if (ci === -1) throw new Error("nd-sheets: id column '" + idColumn + "' not found in '" + tab + "'");
        for (let r = 1; r < values.length; r++) {
          if (String(values[r][ci]) === String(idValue)) return { rowNumber: r + 1, header: header };
        }
        return { rowNumber: null, header: header };
      });
    }

    function execUpsert(p) {
      return findRowNumberById(p.spreadsheetId, p.tab, p.idColumn, p.row[p.idColumn]).then(function (found) {
        const vals = [rowToValues(found.header, p.row)];
        if (found.rowNumber) {
          const range = "'" + p.tab + "'!A" + found.rowNumber + ":" + colLetter(found.header.length - 1) + found.rowNumber;
          return gateway.updateValues(p.spreadsheetId, range, vals);
        }
        return gateway.appendValues(p.spreadsheetId, "'" + p.tab + "'", vals);
      });
    }

    function execAppend(p) {
      return gateway.getValues(p.spreadsheetId, "'" + p.tab + "'!1:1").then(function (values) {
        const header = (values && values[0]) ? values[0].map(String) : null;
        if (!header) throw new Error("nd-sheets: tab '" + p.tab + "' has no header row");
        return gateway.appendValues(p.spreadsheetId, "'" + p.tab + "'",
          p.rows.map(function (r) { return rowToValues(header, r); }));
      });
    }

    function execDelete(p) {
      return findRowNumberById(p.spreadsheetId, p.tab, p.idColumn, p.idValue).then(function (found) {
        if (!found.rowNumber) return null;   // already gone — idempotent
        return gateway.deleteRow(p.spreadsheetId, p.tab, found.rowNumber);
      });
    }

    function execute(p) {
      if (p.op === "upsert") return execUpsert(p);
      if (p.op === "append") return execAppend(p);
      if (p.op === "delete") return execDelete(p);
      return Promise.reject(new Error("nd-sheets: unknown op " + p.op));
    }

    if (queue) queue.handler(QUEUE_KIND, function (payload) { return execute(payload); });

    /* ---- public writes (queued when a queue is attached) ---------------- */
    function dispatch(payload, key, supersede) {
      if (queue) { queue.enqueue(QUEUE_KIND, payload, { key: key, supersede: supersede }); return Promise.resolve({ queued: true }); }
      return execute(payload);
    }

    function writeKey(spreadsheetId, tab, idValue) {
      return spreadsheetId + "/" + tab + "/" + idValue;
    }

    const api = {
      readTab: readTab,
      fetchTab: fetchTab,
      upsertRowById: function (spreadsheetId, tab, idColumn, row) {
        if (row[idColumn] === undefined || row[idColumn] === null || row[idColumn] === "")
          return Promise.reject(new Error("nd-sheets: upsert row is missing its id ('" + idColumn + "')"));
        return dispatch({ op: "upsert", spreadsheetId: spreadsheetId, tab: tab, idColumn: idColumn, row: row },
          writeKey(spreadsheetId, tab, row[idColumn]), false);
      },
      appendRows: function (spreadsheetId, tab, rows) {
        if (!Array.isArray(rows) || !rows.length) return Promise.resolve(null);
        return dispatch({ op: "append", spreadsheetId: spreadsheetId, tab: tab, rows: rows }, undefined, false);
      },
      deleteRowById: function (spreadsheetId, tab, idColumn, idValue) {
        // supersede: a queued upsert/append for this record must not resurrect it
        return dispatch({ op: "delete", spreadsheetId: spreadsheetId, tab: tab, idColumn: idColumn, idValue: idValue },
          writeKey(spreadsheetId, tab, idValue), true);
      },
      _execute: execute   // exposed for tests / direct (non-queued) use
    };
    return api;
  }

  /* ── gapi gateway (browser) ───────────────────────────────────────── */
  function gapiGateway() {
    function ensure() {
      if (!(root.gapi && root.gapi.client && root.gapi.client.sheets))
        throw new Error("nd-sheets: gapi sheets client not loaded");
    }
    return {
      getValues: function (spreadsheetId, range) {
        ensure();
        return gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: range })
          .then(function (r) { return (r.result && r.result.values) || []; });
      },
      updateValues: function (spreadsheetId, range, values) {
        ensure();
        return gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId, range: range, valueInputOption: "RAW"
        }, { values: values });
      },
      appendValues: function (spreadsheetId, range, values) {
        ensure();
        return gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId, range: range, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS"
        }, { values: values });
      },
      addSheet: function (spreadsheetId, title) {
        ensure();
        return gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: spreadsheetId }, {
          requests: [{ addSheet: { properties: { title: title } } }]
        });
      },
      deleteRow: function (spreadsheetId, tab, rowNumber) {
        ensure();
        return gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId, fields: "sheets.properties" })
          .then(function (r) {
            const sheet = (r.result.sheets || []).find(function (s) { return s.properties.title === tab; });
            if (!sheet) throw new Error("nd-sheets: tab '" + tab + "' not found");
            return gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: spreadsheetId }, {
              requests: [{ deleteDimension: { range: {
                sheetId: sheet.properties.sheetId, dimension: "ROWS",
                startIndex: rowNumber - 1, endIndex: rowNumber
              } } }]
            });
          });
      }
    };
  }

  const API = { QUEUE_KIND, colLetter, valuesToObjects, rowToValues, create, gapiGateway };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.sheetsKit = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
