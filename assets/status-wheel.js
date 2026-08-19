/* ============================================================
 * status-wheel.js — NDWheel
 * A donut progress ring for the Neill Data suite. One job = one wheel:
 * the ring fills teal→green as units are ticked, an amber arc shows open
 * issues, and the centre reads the percentage (or a custom label).
 *
 * Pairs with the suite's progress rails. Self-contained, no deps, inline
 * SVG so it's crisp at any size and themeable via CSS vars.
 *
 *   <script src="../assets/status-wheel.js"></script>
 *
 * API
 *   NDWheel.svg({ done, total, issues, na, size, stroke, label, sublabel })
 *        -> SVG markup string (pure — safe to drop into innerHTML)
 *   NDWheel.render(el, opts)         — set el.innerHTML to the wheel
 *   NDWheel.update(el, opts)         — animate the ring to a new value
 *   NDWheel.percent({done,total})    — helper, 0..100 integer
 *
 * opts
 *   done, total   units complete / total (drives the fill)
 *   na            optional: units marked N/A (counted as complete)
 *   issues        optional: open issue count (draws an amber arc + dot)
 *   size          px, default 72        stroke  px, default 8
 *   label         centre text override (default "NN%")
 *   sublabel      small text under the centre number (e.g. "12/40")
 *   accent        override the fill colour (default suite teal→green)
 * ============================================================ */
(function (root) {
  "use strict";

  var C = {
    track:  'rgba(255,255,255,.10)',
    done:   '#2ee6a8',
    brand:  '#35d0ba',
    issue:  '#ffb020',
    text:   '#e8f0f9',
    muted:  '#8ba3bf'
  };

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pct(o) {
    var total = +(o && o.total) || 0;
    if (!total) return 0;
    var done = (+(o.done) || 0) + (+(o.na) || 0);
    return clamp(Math.round(done / total * 100), 0, 100);
  }

  function svg(opts) {
    opts = opts || {};
    var size   = +opts.size   || 72;
    var stroke = +opts.stroke || 8;
    var total  = +opts.total  || 0;
    var done   = (+opts.done || 0) + (+opts.na || 0);
    var issues = +opts.issues || 0;
    var p      = pct(opts);
    var complete = total > 0 && done >= total;

    var r = (size - stroke) / 2;
    var cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var fill = clamp(p / 100, 0, 1) * circ;

    // open-issue arc: a short amber tick riding the top of the track
    var issueArc = issues > 0 ? Math.max(circ * 0.06, Math.min(circ * 0.25, circ * (issues / Math.max(total, 8)))) : 0;

    var gid = 'ndw' + Math.round(r * 1000) + '_' + size;
    var ringColor = complete ? C.done : ('url(#' + gid + ')');
    var centre = (opts.label != null) ? opts.label : (p + '%');
    var sub = opts.sublabel != null ? opts.sublabel
            : (total ? (done + '/' + total) : '');

    var parts = [];
    parts.push('<svg class="nd-wheel' + (complete ? ' is-complete' : '') + (issues ? ' has-issues' : '') +
      '" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size +
      '" role="img" aria-label="' + p + ' percent complete' + (issues ? (', ' + issues + ' open issues') : '') + '">');
    parts.push('<defs><linearGradient id="' + gid + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="' + (opts.accent || C.brand) + '"/>' +
      '<stop offset="100%" stop-color="' + (opts.accent || C.done) + '"/></linearGradient></defs>');
    // track
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + C.track + '" stroke-width="' + stroke + '"/>');
    // progress
    parts.push('<circle class="nd-wheel-fill" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + ringColor +
      '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + fill.toFixed(2) + ' ' + (circ - fill).toFixed(2) +
      '" transform="rotate(-90 ' + cx + ' ' + cy + ')" style="transition:stroke-dasharray .5s cubic-bezier(.32,.72,0,1)"/>');
    // issue arc (amber), sitting just inside the ring at the top
    if (issueArc > 0) {
      var ri = r - stroke - 1;
      var ci = 2 * Math.PI * ri;
      parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + ri + '" fill="none" stroke="' + C.issue +
        '" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + issueArc.toFixed(2) + ' ' + (ci - issueArc).toFixed(2) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')" opacity=".95"/>');
    }
    // centre text
    var numSize = Math.max(11, Math.round(size * 0.26));
    var subSize = Math.max(8, Math.round(size * 0.13));
    parts.push('<text x="' + cx + '" y="' + (cy + (sub ? -1 : numSize * 0.34)) + '" text-anchor="middle" ' +
      'font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="700" font-size="' + numSize +
      '" fill="' + (complete ? C.done : C.text) + '">' + centre + '</text>');
    if (sub) {
      parts.push('<text x="' + cx + '" y="' + (cy + subSize + 3) + '" text-anchor="middle" ' +
        'font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="' + subSize + '" fill="' + C.muted + '">' + sub + '</text>');
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function render(el, opts) { if (el) el.innerHTML = svg(opts); return el; }

  function update(el, opts) {
    if (!el) return;
    var cur = el.querySelector('.nd-wheel-fill');
    if (!cur) return render(el, opts);
    var size = +opts.size || 72, stroke = +opts.stroke || 8;
    var r = (size - stroke) / 2, circ = 2 * Math.PI * r;
    var fill = clamp(pct(opts) / 100, 0, 1) * circ;
    cur.setAttribute('stroke-dasharray', fill.toFixed(2) + ' ' + (circ - fill).toFixed(2));
    // simplest correct path for label/issue changes: re-render
    render(el, opts);
  }

  var API = { svg: svg, render: render, update: update, percent: pct, COLORS: C };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.NDWheel = API;
})(typeof window !== 'undefined' ? window : globalThis);
