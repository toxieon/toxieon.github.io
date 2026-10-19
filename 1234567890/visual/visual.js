(function () {
  "use strict";

  var gallery = document.getElementById("gallery");
  var venues3dEl = document.getElementById("venues-3d");
  var countEl = document.getElementById("count");
  var qEl = document.getElementById("q");
  var catEl = document.getElementById("cat-filter");
  var items = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function previewHtml(item) {
    var href = item.preview || item.href;
    if (/\.woff2$/i.test(href)) {
      return '<div class="preview font-preview" aria-hidden="true">Aa</div>';
    }
    if (/\.svg$/i.test(href) || /\.(png|jpe?g|gif|webp|ico)$/i.test(href)) {
      return '<div class="preview"><img src="' + esc(href) + '" alt="" loading="lazy" decoding="async" /></div>';
    }
    return '<div class="preview"><span class="meta">—</span></div>';
  }

  function groupKey(item) {
    return item.category + "\0" + (item.subcategory || "");
  }

  function render() {
    var q = (qEl.value || "").trim().toLowerCase();
    var cat = catEl.value || "";
    var filtered = items.filter(function (it) {
      if (cat && it.category !== cat) return false;
      if (!q) return true;
      var hay = (it.name + " " + it.id + " " + it.source).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    countEl.textContent = filtered.length + " / " + items.length + " assets";

    var groups = {};
    filtered.forEach(function (it) {
      var k = groupKey(it);
      if (!groups[k]) groups[k] = { category: it.category, sub: it.subcategory, list: [] };
      groups[k].list.push(it);
    });

    var keys = Object.keys(groups).sort(function (a, b) {
      var ga = groups[a], gb = groups[b];
      if (ga.category !== gb.category) return ga.category.localeCompare(gb.category);
      return (ga.sub || "").localeCompare(gb.sub || "");
    });

    if (!keys.length) {
      gallery.innerHTML = '<p class="empty">No assets match this filter.</p>';
      return;
    }

    var html = "";
    keys.forEach(function (k) {
      var g = groups[k];
      html += '<section class="cat-block"><h2 class="cat-title">' + esc(g.category) + "</h2>";
      if (g.sub) html += '<p class="cat-sub">' + esc(g.sub) + "</p>";
      html += '<div class="grid">';
      g.list.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (it) {
        html +=
          '<article class="card">' +
          previewHtml(it) +
          '<div class="name">' + esc(it.name) + "</div>" +
          '<div class="meta"><span class="src">' + esc(it.source) + "</span><br>" + esc(it.id) + "</div>" +
          '<a class="dl" href="' + esc(it.href) + '" download>Download</a>' +
          "</article>";
      });
      html += "</div></section>";
    });
    gallery.innerHTML = html;
  }

  function venueCard(item) {
    var preview = item.preview ? '<div class="preview venue-preview"><img src="' + esc(item.preview) + '" alt="" loading="lazy" decoding="async" /></div>' : '<div class="preview venue-preview"><span class="meta">—</span></div>';
    var actions = "";
    if (item.demo) {
      actions += '<a class="dl" href="' + esc(item.demo) + '" target="_blank" rel="noopener">Open live demo</a>';
    }
    if (item.glb) {
      actions += '<a class="dl secondary" href="' + esc(item.glb) + '" download>Download GLB (web)</a>';
      if (item.glbFull) {
        actions += '<a class="dl secondary" href="' + esc(item.glbFull) + '" download>Download GLB (full)</a>';
      }
    }
    return (
      '<article class="card venue-card">' +
      preview +
      '<div class="name">' + esc(item.name) + "</div>" +
      '<div class="meta">' + esc(item.id) + "</div>" +
      '<div class="venue-actions">' + actions + "</div>" +
      "</article>"
    );
  }

  function renderVenues3d(data) {
    if (!venues3dEl || !data) return;
    var cards = [];
    (data.venues || []).forEach(function (v) { cards.push(venueCard(v)); });
    (data.models || []).forEach(function (m) { cards.push(venueCard(m)); });
    if (!cards.length) {
      venues3dEl.innerHTML = "";
      return;
    }
    venues3dEl.innerHTML =
      '<section class="cat-block venues-block" id="venues-3d-section">' +
      '<h2 class="cat-title">3D Venues</h2>' +
      '<p class="cat-sub">Procedural stadium scenes (three.js, MIT) and downloadable GLB models. Demos open in a new tab.</p>' +
      '<div class="grid venue-grid">' + cards.join("") + "</div></section>";
  }

  function fillCategories(list) {
    var cats = {};
    list.forEach(function (it) { cats[it.category] = true; });
    Object.keys(cats).sort().forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catEl.appendChild(opt);
    });
  }

  fetch("3d-venues/manifest.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(renderVenues3d)
    .catch(function () { renderVenues3d(null); });

  fetch("../visual-catalog.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      items = data.categories || [];
      fillCategories(items);
      qEl.addEventListener("input", render);
      catEl.addEventListener("change", render);
      render();
    })
    .catch(function () {
      gallery.innerHTML = '<p class="empty">Could not load visual-catalog.json.</p>';
    });
})();
