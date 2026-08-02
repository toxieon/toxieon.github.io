/* =========================================================================
 *  doc-invoice.js — invoice / payslip document generator  (reusable asset)
 *
 *  A payslip and a Quote invoice are the same shape: a business header (+logo),
 *  some meta pairs, emphasised totals, a line-item table, and a memo. This
 *  builds that document from a plain data spec, previews it on screen, and
 *  prints / saves it to PDF (via a hidden iframe, so no popup blocker and only
 *  the document prints — not the whole app).
 *
 *  The document renders LIGHT (black on white) because it's a print document,
 *  regardless of the app's theme.
 *
 *  No dependencies. Pairs with logo.js (pass spec.logo = a data URL).
 *
 *  Spec:
 *    {
 *      logo: dataUrl,
 *      business: { name, abn, address, phone, email },
 *      title: "Pay slip",
 *      meta:       [ { label, value }, ... ],   // 2-col label:value grid
 *      highlights: [ { label, value }, ... ],   // big emphasised (Gross/Net)
 *      table: { columns: [ "Description", { label:"Amount", align:"right" } ],
 *               rows: [ [ "Base hourly", "37.50", "$28.90", "$1,083.75" ], ... ] },
 *      totals: [ { label, value, strong } ],     // optional block under table
 *      memo:  "…",
 *      note:  "Estimate only — not an official payslip",
 *      accent: "#e07b2a"
 *    }
 *
 *  API:
 *    NDDoc.html(spec)               -> document markup string
 *    NDDoc.preview(spec, opts)      -> on-screen modal with Print / Close
 *    NDDoc.print(spec)              -> print / save-as-PDF straight away
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDDoc) return;
  var doc = root.document;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function colLabel(c) { return typeof c === "string" ? c : (c.label || ""); }
  function colAlign(c) { return (typeof c === "object" && c.align) ? c.align : "left"; }

  function html(spec) {
    spec = spec || {};
    var accent = spec.accent || "#e07b2a";
    var b = spec.business || {};
    var logo = spec.logo ? '<img src="' + esc(spec.logo) + '" alt="Logo" style="max-width:200px;max-height:88px;object-fit:contain;display:block;margin-bottom:8px;" />' : "";
    var biz = '<div style="font-size:15px;font-weight:700;color:#111;">' + esc(b.name || "") + "</div>" +
      (b.abn ? '<div style="color:#555;font-size:12px;">ABN ' + esc(b.abn) + "</div>" : "") +
      (b.address ? '<div style="color:#555;font-size:12px;">' + esc(b.address) + "</div>" : "") +
      (b.phone ? '<div style="color:#555;font-size:12px;">' + esc(b.phone) + "</div>" : "") +
      (b.email ? '<div style="color:#555;font-size:12px;">' + esc(b.email) + "</div>" : "");

    var meta = (spec.meta || []).map(function (m) {
      return '<div style="display:flex;justify-content:space-between;gap:14px;padding:3px 0;border-bottom:1px solid #eee;font-size:12.5px;">' +
        '<span style="color:#666;">' + esc(m.label) + "</span><span style=\"color:#111;font-weight:600;text-align:right;\">" + esc(m.value) + "</span></div>";
    }).join("");

    var highlights = (spec.highlights || []).map(function (h) {
      return '<div style="flex:1;min-width:120px;background:#f7f7f7;border:1px solid #eee;border-radius:8px;padding:10px 12px;">' +
        '<div style="color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">' + esc(h.label) + "</div>" +
        '<div style="color:#111;font-size:20px;font-weight:800;margin-top:2px;">' + esc(h.value) + "</div></div>";
    }).join("");

    var table = "";
    if (spec.table && spec.table.columns) {
      var cols = spec.table.columns;
      var thead = "<tr>" + cols.map(function (c) {
        return '<th style="text-align:' + colAlign(c) + ';font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;color:#888;font-weight:700;padding:8px 10px;border-bottom:2px solid ' + accent + ';">' + esc(colLabel(c)) + "</th>";
      }).join("") + "</tr>";
      var tbody = (spec.table.rows || []).map(function (r) {
        return "<tr>" + cols.map(function (c, i) {
          return '<td style="text-align:' + colAlign(c) + ';font-size:12.5px;color:#222;padding:7px 10px;border-bottom:1px solid #eee;">' + esc(r[i] == null ? "" : r[i]) + "</td>";
        }).join("") + "</tr>";
      }).join("");
      table = '<table style="width:100%;border-collapse:collapse;margin-top:6px;"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table>";
    }

    var totals = (spec.totals || []).map(function (t) {
      var strong = t.strong;
      return '<div style="display:flex;justify-content:space-between;gap:14px;padding:' + (strong ? "8px 0 0" : "3px 0") + ';font-size:' + (strong ? "15px" : "13px") + ';' + (strong ? "border-top:2px solid " + accent + ";margin-top:4px;font-weight:800;color:#111;" : "color:#444;") + '">' +
        "<span>" + esc(t.label) + "</span><span>" + esc(t.value) + "</span></div>";
    }).join("");
    var totalsBlock = totals ? '<div style="max-width:280px;margin-left:auto;margin-top:12px;">' + totals + "</div>" : "";

    var memo = spec.memo ? '<div style="margin-top:18px;padding:10px 12px;background:#faf7f2;border:1px solid #efe6d8;border-radius:8px;font-size:12.5px;color:#444;white-space:pre-wrap;">' + esc(spec.memo) + "</div>" : "";
    var note = spec.note ? '<div style="margin-top:14px;color:#999;font-size:11px;">' + esc(spec.note) + "</div>" : "";

    return '<div class="nd-doc" style="background:#fff;color:#111;font-family:Inter,system-ui,-apple-system,\'Segoe UI\',sans-serif;padding:28px 30px;max-width:820px;margin:0 auto;box-sizing:border-box;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid ' + accent + ';padding-bottom:16px;">' +
        "<div>" + logo + biz + "</div>" +
        '<div style="text-align:right;"><div style="font-size:24px;font-weight:800;color:' + accent + ';letter-spacing:-0.02em;">' + esc(spec.title || "Document") + "</div></div>" +
      "</div>" +
      (meta || highlights ?
        '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:16px;">' +
          (meta ? '<div style="flex:1;min-width:240px;">' + meta + "</div>" : "") +
          (highlights ? '<div style="display:flex;gap:10px;flex-wrap:wrap;align-content:flex-start;flex:1;min-width:220px;">' + highlights + "</div>" : "") +
        "</div>" : "") +
      (table ? '<div style="margin-top:20px;">' + table + "</div>" : "") +
      totalsBlock + memo + note +
    "</div>";
  }

  function fullPage(spec) {
    return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + esc(spec.title || "Document") +
      "</title><style>@page{margin:14mm;} body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>" +
      html(spec) + "</body></html>";
  }

  function printViaIframe(spec) {
    if (!doc) return;
    var iframe = doc.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    doc.body.appendChild(iframe);
    var idoc = iframe.contentWindow.document;
    idoc.open(); idoc.write(fullPage(spec)); idoc.close();
    var go = function () {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
      setTimeout(function () { try { doc.body.removeChild(iframe); } catch (e) {} }, 1500);
    };
    if (idoc.readyState === "complete") setTimeout(go, 120); else iframe.onload = function () { setTimeout(go, 120); };
  }

  function preview(spec, opts) {
    opts = opts || {};
    if (!doc) return;
    var back = doc.createElement("div");
    back.style.cssText = "position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;overflow:auto;padding:18px 12px;";
    var bar = '<div style="position:sticky;top:0;display:flex;gap:10px;justify-content:center;margin-bottom:14px;z-index:1;">' +
      '<button data-ndoc-print style="background:' + (spec.accent || "#e07b2a") + ';color:#1a0f04;border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer;">Print / Save PDF</button>' +
      '<button data-ndoc-close style="background:rgba(255,255,255,0.14);color:#fff;border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer;">Close</button></div>';
    var page = '<div style="width:100%;max-width:840px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.5);">' + html(spec) + "</div>";
    back.innerHTML = bar + page;
    doc.body.appendChild(back);
    var close = function () { try { doc.body.removeChild(back); } catch (e) {} if (typeof opts.onClose === "function") opts.onClose(); };
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    back.querySelector("[data-ndoc-close]").addEventListener("click", close);
    back.querySelector("[data-ndoc-print]").addEventListener("click", function () { printViaIframe(spec); });
    return { close: close };
  }

  var API = { html: html, preview: preview, print: printViaIframe, fullPage: fullPage };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDDoc = API;
})(typeof window !== "undefined" ? window : globalThis);
