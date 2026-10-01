/* =========================================================================
 *  nd-csv.js: suite CSV parsing on vendored PapaParse 5.7.0 (MIT,
 *  shared/vendor/papaparse/). Replaces the per-app hand-rolled parsers.
 *  Handles quoted commas, quoted line breaks, "" escapes, CRLF/CR/LF and a BOM.
 *
 *    NDCSV.rows(text)  -> string[][]  (raw cells, comma delimiter, blank lines kept
 *                                     as [""] so callers keep their own filters)
 *  Needs window.Papa (load vendor/papaparse/papaparse.min.js first).
 * ========================================================================= */
(function (root) {
  "use strict";
  function rows(text) {
    var s = String(text == null ? "" : text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    if (!s) return [];
    if (!root.Papa) throw new Error("CSV parser (PapaParse) not loaded");
    return root.Papa.parse(s, { delimiter: ",", skipEmptyLines: false, header: false }).data;
  }
  root.NDCSV = { rows: rows };
})(typeof window !== "undefined" ? window : globalThis);
