/* AFL / AFLW guernsey marks for builder tray + review (tipdash). TBAflGuernseys + CommonJS for node --test. */
(function (root) {
  "use strict";

  var GUERNSEY_D =
    "M13 4 L20 8 L27 4 L34 11 L29.5 17 L29.5 34 Q29.5 37 26.5 37 L13.5 37 Q10.5 37 10.5 34 L10.5 17 L6 11 Z";

  /** Canonical club specs — colours + generic pattern only (no logos). */
  var CLUBS = [
    { id: "adelaide", aliases: ["adelaide", "adelaidecrows", "crows"], primary: "#0a2240", secondary: "#c8102e", accent: "#ffd100", pattern: "sash" },
    { id: "brisbane", aliases: ["brisbane", "brisbanelions", "lions"], primary: "#7a002e", secondary: "#ffa300", accent: "#ffffff", pattern: "yoke" },
    { id: "carlton", aliases: ["carlton", "blues"], primary: "#0e1e3d", secondary: "#ffffff", accent: "#0e1e3d", pattern: "monogram" },
    { id: "collingwood", aliases: ["collingwood", "magpies"], primary: "#0b0b0b", secondary: "#ffffff", accent: "#0b0b0b", pattern: "hoops" },
    { id: "essendon", aliases: ["essendon", "bombers"], primary: "#c8102e", secondary: "#0b0b0b", accent: "#c8102e", pattern: "sash-v" },
    { id: "fremantle", aliases: ["fremantle", "dockers"], primary: "#33006f", secondary: "#ffffff", accent: "#33006f", pattern: "solid" },
    { id: "geelong", aliases: ["geelong", "geelongcats", "cats"], primary: "#0a2240", secondary: "#ffffff", accent: "#0a2240", pattern: "hoops" },
    { id: "goldcoast", aliases: ["goldcoast", "goldcoastsuns", "suns"], primary: "#d0112b", secondary: "#ffdd00", accent: "#d0112b", pattern: "split-h" },
    { id: "gws", aliases: ["gws", "gwsgiants", "greaterwesternsydney", "giants"], primary: "#f47a20", secondary: "#4d4d4f", accent: "#ffffff", pattern: "band" },
    { id: "hawthorn", aliases: ["hawthorn", "hawks"], primary: "#4d2004", secondary: "#ffd100", accent: "#4d2004", pattern: "hoops" },
    { id: "melbourne", aliases: ["melbourne", "demons"], primary: "#0b1a4d", secondary: "#cc092f", accent: "#0b1a4d", pattern: "split-v" },
    { id: "northmelbourne", aliases: ["northmelbourne", "kangaroos", "north"], primary: "#013a81", secondary: "#ffffff", accent: "#013a81", pattern: "hoops" },
    { id: "portadelaide", aliases: ["portadelaide", "port", "power"], primary: "#01b3ac", secondary: "#0b0b0b", accent: "#ffffff", pattern: "panel" },
    { id: "richmond", aliases: ["richmond", "tigers"], primary: "#141414", secondary: "#ffd200", accent: "#141414", pattern: "sash" },
    { id: "stkilda", aliases: ["stkilda", "saints"], primary: "#ed1b2e", secondary: "#ffffff", accent: "#ed1b2e", pattern: "hoops" },
    { id: "sydney", aliases: ["sydney", "sydneyswans", "swans"], primary: "#e1231f", secondary: "#ffffff", accent: "#e1231f", pattern: "solid" },
    { id: "westcoast", aliases: ["westcoast", "westcoasteagles", "eagles"], primary: "#062f6c", secondary: "#ffd200", accent: "#062f6c", pattern: "split-v" },
    { id: "westernbulldogs", aliases: ["westernbulldogs", "bulldogs", "footscray"], primary: "#0a37a0", secondary: "#ffffff", accent: "#cc092f", pattern: "chevron" },
    /* AFLW expansion */
    { id: "tasmania", aliases: ["tasmania", "tasmaniandevils", "devils"], primary: "#006747", secondary: "#ffd200", accent: "#006747", pattern: "split-v" },
  ];

  var _uid = 0;

  function normKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function lookupTeam(name) {
    var k = normKey(name);
    if (!k) return null;
    var best = null;
    var bestLen = 0;
    for (var i = 0; i < CLUBS.length; i++) {
      var c = CLUBS[i];
      for (var j = 0; j < c.aliases.length; j++) {
        var a = c.aliases[j];
        if (k === a || k.indexOf(a) >= 0) {
          if (a.length > bestLen) {
            best = c;
            bestLen = a.length;
          }
        }
      }
    }
    return best;
  }

  function fallbackSpec() {
    return { id: "unknown", primary: "#2a3550", secondary: "#8b93a7", accent: "#ffffff", pattern: "solid" };
  }

  function specFor(name) {
    return lookupTeam(name) || fallbackSpec();
  }

  function textOn(hex) {
    var c = String(hex || "").replace("#", "");
    if (c.length < 6) return "#fff";
    var r = parseInt(c.substr(0, 2), 16);
    var g = parseInt(c.substr(2, 2), 16);
    var b = parseInt(c.substr(4, 2), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#111318" : "#ffffff";
  }

  /** White-heavy patterns need a primary plate so jumper numbers stay readable. */
  function needsNumberPlate(spec) {
    if (!spec || !spec.secondary) return false;
    var sec = String(spec.secondary).replace(/\s/g, "").toLowerCase();
    if (sec !== "#ffffff" && sec !== "#fff") return false;
    var p = spec.pattern;
    return p === "hoops" || p === "monogram" || p === "chevron";
  }

  function numberLayer(spec, n, fs, ny, w) {
    if (!n) return "";
    if (needsNumberPlate(spec)) {
      var cy = w <= 22 ? 17 : 26;
      var rx = w <= 22 ? 5.5 : 7.5;
      var ry = w <= 22 ? 4.5 : 6;
      var fill = textOn(spec.primary);
      return (
        '<ellipse cx="20" cy="' +
        (cy - 1) +
        '" rx="' +
        rx +
        '" ry="' +
        ry +
        '" fill="' +
        spec.primary +
        '" opacity=".93"/>' +
        '<text x="20" y="' +
        ny +
        '" text-anchor="middle" font-family="inherit" font-size="' +
        fs +
        '" font-weight="800" fill="' +
        fill +
        '">' +
        n +
        "</text>"
      );
    }
    var tc = textOn(spec.primary);
    return (
      '<text x="20" y="' +
      ny +
      '" text-anchor="middle" font-family="inherit" font-size="' +
      fs +
      '" font-weight="800" fill="' +
      tc +
      '">' +
      n +
      "</text>"
    );
  }

  function displayNumber(num) {
    if (num == null || num === "") return "";
    var n = parseInt(num, 10);
    if (!isFinite(n) || n < 0) return String(num).trim();
    return String(n);
  }

  function patternLayer(spec, clipId) {
    var p = spec.primary;
    var s = spec.secondary;
    var a = spec.accent || s;
    switch (spec.pattern) {
      case "hoops":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<rect x="4" y="8" width="32" height="4" fill="' +
          s +
          '"/>' +
          '<rect x="4" y="16" width="32" height="4" fill="' +
          s +
          '"/>' +
          '<rect x="4" y="24" width="32" height="4" fill="' +
          s +
          '"/>' +
          '<rect x="4" y="32" width="32" height="4" fill="' +
          s +
          '"/>'
        );
      case "sash":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<polygon points="8,6 32,30 28,34 4,10" fill="' +
          s +
          '"/>'
        );
      case "sash-v":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<rect x="17" y="3" width="6" height="37" fill="' +
          s +
          '"/>'
        );
      case "split-v":
        return (
          '<rect x="4" y="3" width="16" height="37" fill="' +
          p +
          '"/>' +
          '<rect x="20" y="3" width="16" height="37" fill="' +
          s +
          '"/>'
        );
      case "split-h":
        return (
          '<rect x="4" y="3" width="32" height="18" fill="' +
          p +
          '"/>' +
          '<rect x="4" y="21" width="32" height="19" fill="' +
          s +
          '"/>'
        );
      case "yoke":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<path d="M10 10 L20 18 L30 10 L30 16 L20 24 L10 16 Z" fill="' +
          s +
          '"/>'
        );
      case "band":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<rect x="4" y="14" width="32" height="10" fill="' +
          s +
          '"/>'
        );
      case "panel":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<rect x="4" y="3" width="7" height="37" fill="' +
          s +
          '"/>' +
          '<rect x="29" y="3" width="7" height="37" fill="' +
          s +
          '"/>'
        );
      case "chevron":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<polygon points="20,12 28,22 24,22 20,18 16,22 12,22" fill="' +
          a +
          '"/>' +
          '<rect x="14" y="22" width="12" height="14" fill="' +
          s +
          '"/>'
        );
      case "monogram":
        return (
          '<rect x="4" y="3" width="32" height="37" fill="' +
          p +
          '"/>' +
          '<ellipse cx="20" cy="21" rx="7" ry="8" fill="' +
          s +
          '" opacity=".92"/>'
        );
      default:
        return '<rect x="4" y="3" width="32" height="37" fill="' + p + '"/>';
    }
  }

  function guernseySvg(teamName, num, size) {
    var spec = specFor(teamName);
    var clipId = "agc" + ++_uid;
    var n = displayNumber(num);
    var w = size || 34;
    var h = size || 34;
    var fs = w <= 22 ? 7 : 11;
    var ny = w <= 22 ? 17 : 26;
    return (
      '<svg class="guernsey-svg" width="' +
      w +
      '" height="' +
      h +
      '" viewBox="0 0 40 40" aria-hidden="true">' +
      '<defs><clipPath id="' +
      clipId +
      '"><path d="' +
      GUERNSEY_D +
      '"/></clipPath></defs>' +
      '<g clip-path="url(#' +
      clipId +
      ')">' +
      patternLayer(spec, clipId) +
      "</g>" +
      '<path d="' +
      GUERNSEY_D +
      '" fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".9"/>' +
      numberLayer(spec, n, fs, ny, w) +
      "</svg>"
    );
  }

  function isAflPlayerLeg(leg) {
    if (!leg || leg.kind === "racing") return false;
    if (!leg.player) return false;
    if (leg.custom && !leg.team) return false;
    return !!(leg.team && (leg.stat || leg.market));
  }

  function legLabel(leg) {
    if (!leg || !leg.player) return "";
    var side = leg.side === "Under" ? "under " + leg.line + " " : leg.line + "+ ";
    var stat = leg.stat || leg.market || "";
    return leg.player + " " + side + stat;
  }

  function miniGuernseyHtml(teamName, num, animate) {
    var svg = guernseySvg(teamName, num, 20);
    return (
      '<span class="tray-guernsey' +
      (animate ? " tray-guernsey-pop" : "") +
      '"' +
      (animate ? "" : ' data-reduced="1"') +
      ">" +
      svg +
      "</span>"
    );
  }

  function legChipHtml(leg, animate) {
    if (!isAflPlayerLeg(leg)) return "";
    return miniGuernseyHtml(leg.team, leg.number, animate) + '<span class="tray-leg-txt">' + legLabel(leg) + "</span>";
  }

  function playerMarkHtml(num, teamName, staggerIndex) {
    var gi = staggerIndex == null ? 0 : staggerIndex;
    return (
      '<span class="guernsey-mark" style="--gi:' +
      gi +
      '">' +
      guernseySvg(teamName, num, 34) +
      "</span>"
    );
  }

  var API = {
    CLUBS: CLUBS,
    normKey: normKey,
    lookupTeam: lookupTeam,
    fallbackSpec: fallbackSpec,
    specFor: specFor,
    textOn: textOn,
    needsNumberPlate: needsNumberPlate,
    guernseySvg: guernseySvg,
    isAflPlayerLeg: isAflPlayerLeg,
    legLabel: legLabel,
    legChipHtml: legChipHtml,
    playerMarkHtml: playerMarkHtml,
    miniGuernseyHtml: miniGuernseyHtml,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.TBAflGuernseys = API;
})(typeof window !== "undefined" ? window : globalThis);
