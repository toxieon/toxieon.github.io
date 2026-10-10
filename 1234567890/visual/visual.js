(function () {
  "use strict";

  var gallery = document.getElementById("gallery");
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
