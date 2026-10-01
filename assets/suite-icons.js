/* Neill Data Suite icons — original geometric SVG artwork, October 2026.
 * No dependencies. NDSuiteIcons.list({kind, query}); NDSuiteIcons.svg(id, {size, color, title}).
 * A blank title makes an icon decorative. Every other icon has a readable label.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NDSuiteIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var icons = [];
  function add(kind, name, label, color, body, tags, recommendation) {
    icons.push({ id: (kind === "app" ? "app-" : "ui-") + name, label: label,
      kind: kind, color: color, body: body, tags: tags.split(" "),
      file: "assets/suite-icons/" + (kind === "app" ? "apps/" : "ui/") + name + ".svg",
      recommendation: recommendation });
  }
  function app(name, label, color, body, tags, recommendation) {
    add("app", name, label, color, body, tags, recommendation);
  }
  function ui(name, label, body, tags) {
    add("ui", name, label, "currentColor", body, tags,
      "Use inline at 20–24 px; inherits the surrounding text colour. Pass title:'' beside a visible label.");
  }

  app("hub", "Suite hub", "#35d0ba", '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><path d="M14 17.5h7m-3.5-3.5v7"/>', "home launcher apps", "Candidate for hub favicon and suite launcher; four destinations share one home.");
  app("planner", "Planner", "#ff5252", '<path d="M3 3h18v18H3zM3 11h8v10M11 3v4M15 14h6"/><circle cx="16" cy="8" r="1.8" fill="currentColor" stroke="none"/>', "plan floor nodes blueprint", "Candidate for planner/favicon.svg and Planner PWA icons; floor-plan walls remain distinct at 16 px.");
  app("upload", "Upload", "#a855f7", '<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>', "send photo files", "Candidate for upload/favicon.svg and Upload PWA icons; an upward arrow lands above a file tray.");
  app("search", "Search", "#facc15", '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>', "find files lens", "Candidate for search/favicon.svg and Search PWA icons; a large magnifier reads clearly in a browser tab.");
  app("quote", "Quote", "#94a3b8", '<path d="M3 4h10l8 8-9 9-9-9z"/><circle cx="8" cy="9" r="1.4" fill="currentColor" stroke="none"/>', "price estimate invoice tag", "Candidate for quote/favicon.svg; a price tag identifies quoting without tiny currency text.");
  app("timesheet", "Timesheet", "#3ab87a", '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>', "hours clock work time", "Candidate for Timesheet browser, Apple touch and PWA icons; preserve the existing green app colour.");
  app("swb", "Switchboard", "#f59e0b", '<rect x="3" y="2" width="18" height="20" rx="2"/><path d="m13 5-5 8h4l-1 6 5-8h-4z" fill="currentColor" stroke="none"/>', "power board electrical breaker", "Candidate for swb/favicon.svg and SWB PWA icons; an enclosed bolt identifies the switchboard tool.");
  app("fitoff", "Fit-off", "#3ab87a", '<path d="M5 3h14l2 2v14l-2 2H5l-2-2V5zM7 12l3.5 3.5L17 9"/>', "complete install finish", "Candidate for fitoff/favicon.svg; a bold completion mark distinguishes it from the green Timesheet clock.");
  app("checklist", "Install checklist", "#2ee6a8", '<rect x="3" y="2" width="18" height="20" rx="2"/><path d="m6 7 1.5 1.5L10 6m3 1h5m-12 9 1.5 1.5L10 15m3 1h5"/>', "tasks checks install units", "Candidate for the Checklist browser icon; paired checks distinguish the list from the Fit-off completion mark.");
  app("assets", "Assets library", "#6ddba3", '<path d="m12 2 10 6-10 6L2 8zM2 13l10 6 10-6M2 18l10 6 10-6" transform="translate(1 0) scale(.92)"/>', "library components layers", "Candidate for the Assets showroom favicon; stacked layers represent reusable building blocks.");
  app("company", "Company", "#e07b2a", '<circle cx="12" cy="6" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M4 5a3 3 0 0 0 0 6m16-6a3 3 0 0 1 0 6M2 15v6m20-6v6"/>', "team people members", "Candidate for company/favicon.svg; a team glyph represents membership and workspace access.");
  app("website", "Website", "#2563eb", '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', "site public web globe", "Candidate for the public website favicon; keep rollout separate from internal tools if the public brand changes.");

  ui("markup", "Mark up photo", '<path d="M11 3H3v18h18v-8M10 14l1-5 7-7 4 4-7 7zM16 4l4 4"/>', "annotate edit photo");
  ui("arrow", "Arrow", '<path d="M4 20 20 4M7 4h13v13"/>', "direction annotation point");
  ui("pen", "Pen", '<path d="m4 16 12-12 4 4L8 20l-5 1zM13 7l4 4"/>', "draw pencil freehand");
  ui("rectangle", "Rectangle", '<rect x="3" y="5" width="18" height="14" rx="1"/>', "box shape annotation");
  ui("circle", "Circle", '<circle cx="12" cy="12" r="9"/>', "ellipse shape annotation");
  ui("label", "Text label", '<path d="M4 7V3h16v4M12 3v18m-4 0h8"/>', "type annotation text");
  ui("measure", "Measure", '<path d="m3 15 12-12 6 6L9 21zM12 6l3 3M9 9l2 2M6 12l3 3"/>', "ruler distance dimensions");
  ui("undo", "Undo", '<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14" transform="translate(0 -2)"/>', "back reverse edit");
  ui("redo", "Redo", '<path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14" transform="translate(0 -2)"/>', "forward repeat edit");
  ui("download", "Download", '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>', "save export file");
  ui("photo", "Photo", '<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 5-5 4 4 4-7 5 8"/>', "image evidence gallery");
  ui("node", "Plan node", '<path d="M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14z"/><circle cx="12" cy="8" r="2.5"/>', "marker device location point");
  ui("report", "Report", '<path d="M4 2h11l5 5v15H4zM14 2v6h6M8 12h8m-8 4h8"/>', "handover document summary pdf");
  ui("offline", "Offline", '<path d="M3 9a16 16 0 0 1 5-2m6 0a16 16 0 0 1 7 3M7 14a9 9 0 0 1 5-2m-1 5h2M3 3l18 18"/><circle cx="12" cy="21" r=".8" fill="currentColor" stroke="none"/>', "connection disconnected network");
  ui("cloud", "Cloud storage", '<path d="M7 19H6A5 5 0 0 1 5 9a7 7 0 0 1 13-2 6 6 0 0 1 0 12z"/>', "drive storage remote");
  ui("sync-pending", "Changes pending", '<path d="M7 18H6A5 5 0 0 1 5 8a7 7 0 0 1 13-2 5 5 0 0 1 4 7"/><circle cx="16" cy="17" r="5"/><path d="M16 14v3h2"/>', "queue waiting unsynced");
  ui("sync-active", "Syncing", '<path d="M3 10a9 9 0 0 1 15-5l3 3M21 2v6h-6M21 14a9 9 0 0 1-15 5l-3-3M3 22v-6h6"/>', "refresh syncing progress");
  ui("sync-success", "Synced", '<path d="M8 19H6A5 5 0 0 1 5 9a7 7 0 0 1 13-2 5 5 0 0 1 4 7M11 18l4 4 7-8"/>', "saved success uploaded");
  ui("sync-error", "Sync failed", '<path d="M8 19H6A5 5 0 0 1 5 9a7 7 0 0 1 13-2 5 5 0 0 1 4 7M15 16l6 6m0-6-6 6"/>', "failed error retry");
  ui("qr", "QR code", '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v1m0 7v1m-9 0h1m7 8v2m9-9h1"/>', "scan label code");
  ui("before-after", "Before and after", '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M12 1v22M5 16l3-4 4 5m2-1 3-6 3 5"/>', "compare evidence split photos");
  ui("pin", "Pin", '<path d="m8 2-1 7-4 4v2h8l1 7 1-7h8v-2l-4-4-1-7z"/>', "keep bookmark favourite");
  ui("close", "Close", '<path d="m5 5 14 14M19 5 5 19"/>', "dismiss cancel exit");
  ui("check", "Complete", '<path d="m4 12 5 5L21 5"/>', "done tick success");

  function escapeXML(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");
  }
  function safeColor(value, fallback) {
    if (typeof value !== "string") return fallback;
    value = value.trim();
    return /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgb|hsl)a?\([\d.% ,+\-/]+\))$/i.test(value) ? value : fallback;
  }
  function metadata(icon) {
    return { id: icon.id, label: icon.label, kind: icon.kind, color: icon.color,
      file: icon.file, recommendation: icon.recommendation, tags: icon.tags.slice() };
  }
  function list(options) {
    options = options || {};
    var query = String(options.query || "").trim().toLowerCase();
    return icons.filter(function (icon) {
      return (!options.kind || icon.kind === options.kind) && (!query ||
        (icon.id + " " + icon.label + " " + icon.tags.join(" ")).toLowerCase().indexOf(query) >= 0);
    }).map(metadata);
  }
  function svg(id, options) {
    var icon = icons.find(function (candidate) { return candidate.id === id; });
    if (!icon) throw new RangeError("Unknown suite icon: " + String(id));
    options = options || {};
    var size = Number(options.size);
    size = Number.isFinite(size) && size > 0 ? Math.max(8, Math.min(1024, size)) : 24;
    var title = options.title == null ? icon.label : String(options.title);
    var accessibility = title ? 'role="img" aria-label="' + escapeXML(title) + '">' + '<title>' + escapeXML(title) + '</title>' : 'aria-hidden="true">';
    var color = safeColor(options.color, icon.color);
    var isApp = icon.kind === "app";
    var output = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + (isApp ? "48 48" : "24 24") + '" focusable="false" ' + accessibility;
    if (isApp) output += '<rect width="48" height="48" rx="11" fill="#101922"/><rect x=".75" y=".75" width="46.5" height="46.5" rx="10.25" fill="none" stroke="#2b3947" stroke-width="1.5"/>';
    output += '<g fill="none" stroke="currentColor" color="' + escapeXML(color) + '" stroke-width="' + (isApp ? '2.2' : '1.8') + '" stroke-linecap="round" stroke-linejoin="round"' + (isApp ? ' transform="translate(7.8 7.8) scale(1.35)"' : '') + '>' + icon.body + '</g></svg>';
    return output;
  }
  return Object.freeze({ version: "1.0.0", list: list, svg: svg });
});
