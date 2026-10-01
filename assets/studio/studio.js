(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var selected = new Set();
  var resultUrl = null;
  var openEditor = null;
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function fileUrl(path) { return '../../' + path; }
  function download(content, type, filename) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function activateTab(id, updateHash) {
    if (['photo','symbols','icons'].indexOf(id) === -1) id = 'photo';
    document.querySelectorAll('[data-tab]').forEach(function (button) {
      var active = button.dataset.tab === id;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      $('panel-' + button.dataset.tab).hidden = !active;
    });
    if (updateHash) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('[data-tab]').forEach(function (button, index, buttons) {
    button.addEventListener('click', function () { activateTab(button.dataset.tab, true); });
    button.addEventListener('keydown', function (event) {
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault(); buttons[next].focus(); activateTab(buttons[next].dataset.tab, true);
    });
  });
  window.addEventListener('hashchange', function () { activateTab(location.hash.slice(1), false); });
  activateTab(location.hash.slice(1), false);

  async function editPhoto(source, name) {
    if (openEditor) return;
    $('photo-status').textContent = '';
    if (!window.NDPhotoMarkup) { $('photo-status').textContent = 'The photo tools did not load. Reload this page and try again.'; return; }
    try {
      openEditor = NDPhotoMarkup.open({
        source: source,
        filename: name || 'neill-site-markup.png',
        onSave: function (result) {
          if (resultUrl) URL.revokeObjectURL(resultUrl);
          resultUrl = URL.createObjectURL(result.blob);
          $('result-image').src = resultUrl;
          $('result-download').href = resultUrl;
          $('result-download').download = result.filename;
          $('result-info').textContent = result.width + ' × ' + result.height + ' px · PNG · ' + Math.max(1, Math.round(result.blob.size / 1024)) + ' KB';
          $('photo-result').hidden = false;
          $('photo-status').textContent = 'Annotated copy ready. Download it below or keep editing.';
        },
        onClose: function () { openEditor = null; }
      });
      await openEditor.ready;
    } catch (error) {
      $('photo-status').textContent = 'Could not open this image. ' + (error.message || 'Try a JPEG or PNG.');
      if (openEditor) openEditor.close({ force: true });
      openEditor = null;
    }
  }
  $('photo-file').addEventListener('change', function (event) {
    var file = event.target.files[0];
    if (file) editPhoto(file, file.name.replace(/\.[^.]+$/, '') + '-markup.png');
    event.target.value = '';
  });
  $('try-sample').addEventListener('click', function () { editPhoto('sample-site.svg', 'neill-sample-markup.png'); });
  var drop = $('photo-drop');
  ['dragenter','dragover'].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add('drag-over'); }); });
  ['dragleave','drop'].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.remove('drag-over'); }); });
  drop.addEventListener('drop', function (event) {
    var file = event.dataTransfer.files[0];
    if (file) editPhoto(file, file.name.replace(/\.[^.]+$/, '') + '-markup.png');
  });

  function visibleSymbols() { return NDTradeSymbols.list({ query: $('symbol-search').value, category: $('symbol-category').value }); }
  function updateSelection() {
    $('selection-count').textContent = selected.size + ' symbol' + (selected.size === 1 ? '' : 's') + ' selected';
    ['download-legend','print-legend','download-csv','clear-symbols'].forEach(function (id) { $(id).disabled = !selected.size; });
  }
  function renderSymbols() {
    var entries = visibleSymbols();
    $('symbol-count').textContent = entries.length + ' symbols';
    $('select-visible').disabled = !entries.length;
    $('symbol-grid').innerHTML = entries.length ? entries.map(function (item) {
      var active = selected.has(item.id);
      return '<article class="symbol-card' + (active ? ' selected' : '') + '"><button class="symbol-select" data-symbol="' + esc(item.id) + '" aria-pressed="' + active + '" aria-label="Select ' + esc(item.label) + '">' + NDTradeSymbols.svg(item.id, { size: 44, title: '' }) + '<span>' + esc(item.shorthand) + '</span></button><div class="symbol-info"><h3>' + esc(item.label) + '</h3><a href="' + esc(fileUrl(item.file)) + '" download="' + esc(item.id) + '.svg" aria-label="Download ' + esc(item.label) + ' SVG">Download SVG ↓</a></div></article>';
    }).join('') : '<p class="empty">No symbols match. Try another search or trade.</p>';
    updateSelection();
  }
  $('symbol-grid').addEventListener('click', function (event) {
    var button = event.target.closest('[data-symbol]');
    if (!button) return;
    var id = button.dataset.symbol;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    button.setAttribute('aria-pressed', String(selected.has(id)));
    button.closest('.symbol-card').classList.toggle('selected', selected.has(id));
    updateSelection();
  });
  $('symbol-search').addEventListener('input', renderSymbols);
  $('symbol-category').addEventListener('change', renderSymbols);
  $('symbol-light').addEventListener('change', function (event) { $('symbol-grid').classList.toggle('light-preview', event.target.checked); });
  $('select-visible').addEventListener('click', function () { visibleSymbols().forEach(function (item) { selected.add(item.id); }); renderSymbols(); });
  $('clear-symbols').addEventListener('click', function () { selected.clear(); renderSymbols(); });
  $('download-legend').addEventListener('click', function () { download(NDTradeSymbols.legend(Array.from(selected)), 'text/html;charset=utf-8', 'neill-plan-legend.html'); });
  $('download-csv').addEventListener('click', function () { download('\ufeff' + NDTradeSymbols.categoryCsv(Array.from(selected)), 'text/csv;charset=utf-8', 'neill-planner-categories.csv'); });
  $('print-legend').addEventListener('click', function () {
    var oldFrame = document.querySelector('iframe.print-legend');
    if (oldFrame) oldFrame.remove();
    var frame = document.createElement('iframe'); frame.className = 'print-legend'; frame.title = 'Selected plan symbol legend';
    frame.onload = function () { frame.contentWindow.focus(); frame.contentWindow.print(); };
    frame.srcdoc = NDTradeSymbols.legend(Array.from(selected));
    document.body.appendChild(frame);
  });

  function renderIcons() {
    var entries = NDSuiteIcons.list({ kind: $('icon-kind').value, query: $('icon-search').value });
    $('icon-count').textContent = entries.length + ' icons';
    $('icon-grid').innerHTML = entries.length ? entries.map(function (item) {
      var sizes = item.kind === 'app' ? [16,32,64] : [24,40];
      var png = item.kind === 'app' ? '<a href="' + esc(fileUrl(item.file.replace(/\.svg$/, '-192.png'))) + '" download>PNG 192 ↓</a>' : '';
      return '<article class="icon-card"><div class="icon-preview">' + sizes.map(function (size) { return '<span>' + NDSuiteIcons.svg(item.id, { size: size, title: '' }) + '</span>'; }).join('') + '</div><div class="icon-info"><span>' + (item.kind === 'app' ? 'APP IDENTITY' : 'INTERFACE') + '</span><h3>' + esc(item.label) + '</h3><p>' + esc(item.recommendation) + '</p><div class="icon-links"><a href="' + esc(fileUrl(item.file)) + '" download="' + esc(item.id) + '.svg">SVG ↓</a>' + png + '</div></div></article>';
    }).join('') : '<p class="empty">No icons match. Try another search or collection.</p>';
  }
  $('icon-search').addEventListener('input', renderIcons);
  $('icon-kind').addEventListener('change', renderIcons);
  $('icon-light').addEventListener('change', function (event) { $('icon-grid').classList.toggle('light-preview', event.target.checked); });
  if (window.NDTradeSymbols) {
    $('symbol-total').textContent = NDTradeSymbols.list().length;
    NDTradeSymbols.categories().forEach(function (category) {
      var option = document.createElement('option'); option.value = category.id; option.textContent = category.label; $('symbol-category').appendChild(option);
    });
    renderSymbols();
  } else $('symbol-grid').innerHTML = '<p class="empty">The symbol library did not load. Reload this page to try again.</p>';
  if (window.NDSuiteIcons) { $('icon-total').textContent = NDSuiteIcons.list().length; renderIcons(); }
  else $('icon-grid').innerHTML = '<p class="empty">The icon library did not load. Reload this page to try again.</p>';
  window.addEventListener('pagehide', function () { if (resultUrl) URL.revokeObjectURL(resultUrl); });
})();
