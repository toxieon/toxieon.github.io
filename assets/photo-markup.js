/* Photo Markup Studio — Neill Data Suite. Dependency-free, original asset.
 * NDPhotoMarkup.open({source, filename?, onSave?: async(result), onClose?})
 * -> {ready: Promise<boolean>, exportPNG(), getAnnotations(), close({force?})}.
 * Coordinates, widths and label sizes use the exported image's pixel space.
 * Source images are never changed. See assets/photo-markup/README.md.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NDPhotoMarkup = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TOOLS = ['arrow', 'freehand', 'rectangle', 'circle', 'text', 'measure', 'redact'];
  var active = null;
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fitSize(width, height, maxDim) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid image dimensions.');
    var cap = clamp(Number(maxDim) || 2560, 320, 4096);
    var scale = Math.min(1, cap / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  function point(x, y, width, height) { return { x: clamp(x, 0, width), y: clamp(y, 0, height) }; }
  function bounds(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }; }
  function createHistory() {
    var items = [], past = [], future = [];
    function commit(next) { past.push(clone(items)); if (past.length > 100) past.shift(); items = clone(next); future = []; }
    return {
      items: function () { return clone(items); },
      add: function (item) { if (!item || TOOLS.indexOf(item.type) < 0) throw new Error('Unknown annotation type.'); commit(items.concat([item])); },
      clear: function () { if (items.length) commit([]); },
      undo: function () { if (!past.length) return false; future.push(items); items = past.pop(); return true; },
      redo: function () { if (!future.length) return false; past.push(items); items = future.pop(); return true; },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; }
    };
  }
  function documentData(width, height, items) { return { schemaVersion: 1, width: width, height: height, items: clone(items) }; }
  function filename(value) {
    var stem = String(value || 'site-photo').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[<>:"|?*\x00-\x1f]/g, '-').trim().slice(0, 100);
    return (stem || 'site-photo') + '-annotated.png';
  }
  function injectStyles() {
    if (document.getElementById('ndpm-styles')) return;
    var style = document.createElement('style'); style.id = 'ndpm-styles';
    style.textContent =
      '.ndpm{position:fixed;inset:0;z-index:10000;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px;padding-top:max(14px,env(safe-area-inset-top));padding-bottom:max(14px,env(safe-area-inset-bottom));background:#0b1220;color:#edf4ff;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate}' +
      '.ndpm *{box-sizing:border-box}.ndpm [hidden]{display:none!important}.ndpm button,.ndpm input,.ndpm select{font:inherit}.ndpm button{min-height:44px;padding:9px 13px;border:1px solid #40516b;border-radius:9px;background:#182438;color:#edf4ff;cursor:pointer;white-space:nowrap}.ndpm button:hover:not(:disabled){background:#243b57}.ndpm button[aria-pressed=true]{background:#124d57;border-color:#3ddcc4;color:#d5fff8}.ndpm button:disabled{opacity:.42;cursor:default}.ndpm button:focus-visible,.ndpm input:focus-visible,.ndpm select:focus-visible,.ndpm canvas:focus-visible{outline:3px solid #73e9d4;outline-offset:3px}.ndpm .ndpm-primary{background:#55ddc3;color:#082623;border-color:#55ddc3;font-weight:700}.ndpm .ndpm-danger{background:#762e3b;border-color:#e58996}.ndpm h2{font:700 19px/1.2 system-ui;margin:0}.ndpm-header,.ndpm-tools,.ndpm-settings,.ndpm-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ndpm-header{justify-content:space-between}.ndpm-heading p{margin:4px 0 0;color:#aabbd0;font-size:12px}.ndpm-tools{gap:6px}.ndpm-tools button{flex:1;min-width:78px}.ndpm-settings{color:#b9c8d9}.ndpm-settings label{display:flex;gap:7px;align-items:center}.ndpm select,.ndpm input[type=text]{min-height:44px;color:#edf4ff;background:#172336;border:1px solid #40516b;border-radius:8px;padding:8px 10px}.ndpm input[type=color]{width:46px;height:44px;padding:5px;background:#182438;border:1px solid #40516b;border-radius:8px}.ndpm-stage{position:relative;flex:1;min-height:70px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #293c53;border-radius:12px;background-color:#050a12;background-image:linear-gradient(45deg,#101926 25%,transparent 25%),linear-gradient(-45deg,#101926 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#101926 75%),linear-gradient(-45deg,transparent 75%,#101926 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.ndpm canvas{display:block;touch-action:none;cursor:crosshair;max-width:100%;max-height:100%}.ndpm-status{margin:0;min-height:20px;color:#b9c8d9;font-size:12px}.ndpm-panel{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,9,18,.84)}.ndpm-panel>div,.ndpm-panel>form{width:min(440px,100%);padding:20px;border:1px solid #40516b;background:#162236;border-radius:12px;box-shadow:0 15px 70px #000}.ndpm-panel h3{margin:0 0 12px;font-size:18px}.ndpm-panel p{margin:0 0 15px;color:#c4d0e0}.ndpm-panel label{display:block;margin-bottom:7px}.ndpm-panel input{width:100%;margin-bottom:14px}.ndpm-panel .ndpm-actions{justify-content:flex-end}.ndpm-hint{margin-left:auto;font-size:12px}.ndpm-original-badge{position:absolute;top:10px;left:10px;padding:6px 10px;border-radius:6px;background:#142035;color:#fff;pointer-events:none}.ndpm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}' +
      '@media(max-width:640px){.ndpm{padding:9px;gap:7px;padding-top:max(9px,env(safe-area-inset-top));padding-bottom:max(9px,env(safe-area-inset-bottom))}.ndpm-header{gap:6px}.ndpm h2{font-size:16px}.ndpm-heading p{display:none}.ndpm-header .ndpm-actions{gap:5px}.ndpm-header button{padding:8px 10px}.ndpm-tools button{min-width:70px;padding:8px 6px;font-size:12px}.ndpm-hint{display:none}.ndpm-settings{gap:5px;font-size:12px}.ndpm-settings button{padding:8px 10px}.ndpm-status{font-size:11px}}' +
      '@media(max-height:500px){.ndpm{gap:5px;padding:7px}.ndpm-heading p,.ndpm-hint{display:none}.ndpm-tools,.ndpm-settings{flex-wrap:nowrap;overflow-x:auto;flex-shrink:0}.ndpm-tools button{min-width:75px}.ndpm-settings>*{flex-shrink:0}.ndpm-status{font-size:11px}}';
    document.head.appendChild(style);
  }
  function drawArrow(ctx, a, b, width, both) {
    var angle = Math.atan2(b.y - a.y, b.x - a.x), head = Math.max(width * 4, 10);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    function tip(p, theta) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - head * Math.cos(theta - Math.PI / 6), p.y - head * Math.sin(theta - Math.PI / 6)); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - head * Math.cos(theta + Math.PI / 6), p.y - head * Math.sin(theta + Math.PI / 6)); ctx.stroke(); }
    tip(b, angle); if (both) tip(a, angle + Math.PI);
  }
  function drawLabel(ctx, text, anchor, item, imageWidth, imageHeight) {
    ctx.font = '700 ' + item.fontSize + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
    var pad = item.fontSize * .3, maxWidth = Math.max(1, imageWidth - pad * 2);
    var textWidth = Math.min(ctx.measureText(text).width, maxWidth - pad * 2), boxWidth = Math.max(1, textWidth + pad * 2), boxHeight = item.fontSize * 1.35 + pad * 2;
    var x = clamp(anchor.x, 0, Math.max(0, imageWidth - boxWidth)), y = clamp(anchor.y, 0, Math.max(0, imageHeight - boxHeight));
    ctx.fillStyle = '#101827'; ctx.fillRect(x, y, boxWidth, boxHeight); ctx.fillStyle = item.color;
    ctx.fillText(text, x + pad, y + pad, Math.max(1, textWidth));
  }
  function drawItem(ctx, item, width, height) {
    ctx.save(); ctx.strokeStyle = item.color; ctx.fillStyle = item.color; ctx.lineWidth = item.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var a = item.points[0], b = item.points[item.points.length - 1], rect = bounds(a, b);
    if (item.type === 'freehand') { ctx.beginPath(); ctx.moveTo(a.x, a.y); item.points.slice(1).forEach(function (p) { ctx.lineTo(p.x, p.y); }); if (item.points.length === 1) { ctx.lineTo(a.x + .01, a.y); } ctx.stroke(); }
    if (item.type === 'arrow' || item.type === 'measure') { drawArrow(ctx, a, b, item.width, item.type === 'measure'); }
    if (item.type === 'rectangle') ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    if (item.type === 'redact') { ctx.fillStyle = '#000000'; ctx.fillRect(Math.floor(rect.x), Math.floor(rect.y), Math.ceil(rect.width) + 1, Math.ceil(rect.height) + 1); }
    if (item.type === 'circle') { ctx.beginPath(); ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (item.type === 'text' && item.text) drawLabel(ctx, item.text, a, item, width, height);
    if (item.type === 'measure' && item.text) drawLabel(ctx, item.text, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, item, width, height);
    ctx.restore();
  }
  function open(options) {
    if (typeof document === 'undefined') throw new Error('Photo Markup Studio requires a browser.');
    if (active) throw new Error('Close the current Photo Markup Studio before opening another.');
    var opts = options || {}, history = createHistory(), loaded = false, closed = false, busy = false, original = false;
    var image = null, sourceObjectURL = null, cancelLoad = null, pointer = null, draft = null, pending = null, tool = 'arrow', saved = '[]', raf = 0;
    var keyboard = { x: 0, y: 0, visible: false }, exportGeneration = 0, shareResult = null, panel = null, confirmAction = null;
    var previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    injectStyles();
    var modal = document.createElement('div'); modal.className = 'ndpm'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Photo Markup Studio'); modal.tabIndex = -1;
    modal.innerHTML = '<header class="ndpm-header"><div class="ndpm-heading"><h2>Photo Markup Studio</h2><p>Make a clear copy. Your original stays intact.</p></div><div class="ndpm-actions"><button type="button" data-action="download">Download PNG</button><button type="button" data-action="share" hidden>Share PNG</button><button type="button" class="ndpm-primary" data-action="save" hidden>Save copy</button><button type="button" data-action="close" aria-label="Close Photo Markup Studio">Close</button></div></header>' +
      '<div class="ndpm-tools" role="group" aria-label="Annotation tools"></div>' +
      '<div class="ndpm-settings"><label>Colour <input type="color" value="#ffde59" aria-label="Annotation colour"></label><label>Width <select aria-label="Stroke width"><option value="3">Fine</option><option value="6" selected>Medium</option><option value="10">Bold</option></select></label><button type="button" data-action="undo" aria-label="Undo last annotation">Undo</button><button type="button" data-action="redo" aria-label="Redo annotation">Redo</button><button type="button" data-action="clear">Clear</button><button type="button" data-action="original" aria-pressed="false">Original</button><span class="ndpm-hint">Measurements are labels you supply.</span></div>' +
      '<div class="ndpm-stage"><canvas tabindex="0" aria-label="Photo annotation canvas" aria-describedby="ndpm-instructions"></canvas><span class="ndpm-original-badge" hidden>Original photo</span></div>' +
      '<p class="ndpm-status" role="status" aria-live="polite">Opening photo…</p><span class="ndpm-sr" id="ndpm-instructions">Drag to draw. For keyboard placement, use arrow keys, hold Shift for larger steps, and Enter to start and finish a shape. Text opens a label form. Escape cancels the current shape or closes the studio. Ctrl or Command Z undoes.</span>' +
      '<div class="ndpm-panel" data-panel="label" hidden><form><h3>Add a label</h3><label for="ndpm-label">Label text</label><input id="ndpm-label" type="text" maxlength="160" autocomplete="off" required><p data-label-hint></p><div class="ndpm-actions"><button type="button" data-action="cancel-label">Cancel</button><button type="submit" class="ndpm-primary">Add label</button></div></form></div>' +
      '<div class="ndpm-panel" data-panel="confirm" hidden><div><h3 data-confirm-title></h3><p data-confirm-message></p><div class="ndpm-actions"><button type="button" data-action="cancel-confirm">Keep editing</button><button type="button" class="ndpm-danger" data-action="confirm">Discard changes</button></div></div></div>';
    document.body.appendChild(modal); document.body.style.overflow = 'hidden';
    var canvas = modal.querySelector('canvas'), context = canvas.getContext('2d'), stage = modal.querySelector('.ndpm-stage'), status = modal.querySelector('.ndpm-status');
    var color = modal.querySelector('input[type=color]'), stroke = modal.querySelector('select'), labelPanel = modal.querySelector('[data-panel=label]'), labelInput = modal.querySelector('#ndpm-label'), confirmPanel = modal.querySelector('[data-panel=confirm]');
    var buttons = {}; modal.querySelectorAll('[data-action]').forEach(function (el) { buttons[el.dataset.action] = el; });
    var toolNames = { arrow: '↗ Arrow', freehand: '✎ Draw', rectangle: '□ Box', circle: '○ Circle', text: 'T Text', measure: '↔ Measure', redact: '■ Redact' };
    var toolbar = modal.querySelector('.ndpm-tools');
    TOOLS.forEach(function (name) { var button = document.createElement('button'); button.type = 'button'; button.dataset.tool = name; button.textContent = toolNames[name]; button.setAttribute('aria-pressed', String(name === tool)); button.setAttribute('aria-label', name === 'measure' ? 'Measurement callout (enter your own measurement)' : (name === 'redact' ? 'Solid black redaction rectangle' : name + ' tool')); toolbar.appendChild(button); });
    buttons.save.hidden = typeof opts.onSave !== 'function';
    var shareAvailable = !!(navigator.share && navigator.canShare && typeof File !== 'undefined'); buttons.share.hidden = !shareAvailable;
    function tell(message) { if (!closed) status.textContent = message; }
    function help() { return tool === 'text' ? 'Tap a position to add a label. Arrow keys + Enter also work.' : tool === 'measure' ? 'Drag between two points, then type a known measurement. No scale is calculated.' : tool === 'redact' ? 'Drag a solid black box over sensitive details. Only the exported copy is redacted.' : 'Drag to draw ' + (tool === 'freehand' ? 'a line' : 'an ' + tool) + '. Undo removes the last annotation.'; }
    function isDirty() { return JSON.stringify(history.items()) !== saved || !!draft || !!pending; }
    function update() {
      var locked = !loaded || busy || !!panel;
      toolbar.querySelectorAll('button').forEach(function (button) { button.disabled = locked; button.setAttribute('aria-pressed', String(button.dataset.tool === tool)); });
      color.disabled = locked || tool === 'redact'; stroke.disabled = locked;
      buttons.undo.disabled = locked || !history.canUndo(); buttons.redo.disabled = locked || !history.canRedo(); buttons.clear.disabled = locked || !history.items().length;
      buttons.original.disabled = locked; buttons.original.setAttribute('aria-pressed', String(original));
      buttons.save.disabled = locked || !!draft; buttons.download.disabled = locked || !!draft; buttons.share.disabled = locked || !!draft || !shareResult;
      buttons.close.disabled = busy; canvas.setAttribute('aria-disabled', String(locked || original));
      modal.querySelector('.ndpm-original-badge').hidden = !original;
    }
    function renderTo(target, items, withOriginal) { target.clearRect(0, 0, canvas.width, canvas.height); target.drawImage(image, 0, 0, canvas.width, canvas.height); if (!withOriginal) items.forEach(function (item) { drawItem(target, item, canvas.width, canvas.height); }); }
    function render() {
      raf = 0; if (!loaded || closed) return;
      renderTo(context, history.items(), original); if (draft && !original) drawItem(context, draft, canvas.width, canvas.height);
      if (keyboard.visible && !original) { var size = Math.max(canvas.width, canvas.height) / 60; context.save(); context.strokeStyle = '#ffffff'; context.lineWidth = Math.max(1, size / 12); context.setLineDash([size / 3, size / 5]); context.beginPath(); context.moveTo(keyboard.x - size, keyboard.y); context.lineTo(keyboard.x + size, keyboard.y); context.moveTo(keyboard.x, keyboard.y - size); context.lineTo(keyboard.x, keyboard.y + size); context.stroke(); context.restore(); }
    }
    function scheduleRender() { if (!raf) raf = requestAnimationFrame(render); }
    function resize() { if (!loaded || closed) return; var s = Math.min((stage.clientWidth - 6) / canvas.width, (stage.clientHeight - 6) / canvas.height); canvas.style.width = Math.max(1, canvas.width * s) + 'px'; canvas.style.height = Math.max(1, canvas.height * s) + 'px'; }
    function getAnnotations() { return documentData(canvas.width, canvas.height, history.items()); }
    async function exportPNG() {
      if (!loaded || closed) throw new Error('The photo is not ready.');
      var metadata = getAnnotations(), out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
      var ctx = out.getContext('2d'); if (!ctx) throw new Error('Your browser could not create the exported image.');
      renderTo(ctx, metadata.items, false);
      var blob = await new Promise(function (resolve, reject) { try { out.toBlob(function (result) { if (result) resolve(result); else reject(new Error('PNG export failed. Try a smaller photo.')); }, 'image/png'); } catch (error) { reject(new Error('This image cannot be exported because its source blocks canvas access. Choose a local photo.')); } });
      return { blob: blob, filename: filename(opts.filename || (opts.source && opts.source.name)), width: metadata.width, height: metadata.height, annotations: metadata };
    }
    function prepareShare() {
      if (!shareAvailable || !loaded || closed) return; var generation = ++exportGeneration; shareResult = null; update();
      exportPNG().then(function (result) { if (closed || generation !== exportGeneration) return; var file = new File([result.blob], result.filename, { type: 'image/png' }); if (navigator.canShare({ files: [file] })) { shareResult = { result: result, file: file }; } else { buttons.share.hidden = true; } update(); }).catch(function () { if (generation === exportGeneration) { shareResult = null; update(); } });
    }
    function changed() { original = false; update(); scheduleRender(); prepareShare(); }
    function hidePanel() { labelPanel.hidden = true; confirmPanel.hidden = true; panel = null; pending = null; confirmAction = null; update(); canvas.focus(); scheduleRender(); }
    function confirm(title, message, label, action) { panel = 'confirm'; confirmAction = action; confirmPanel.querySelector('[data-confirm-title]').textContent = title; confirmPanel.querySelector('[data-confirm-message]').textContent = message; buttons.confirm.textContent = label; confirmPanel.hidden = false; update(); buttons['cancel-confirm'].focus(); }
    function close(closeOptions) {
      if (closed || busy) return false;
      if (!(closeOptions && closeOptions.force) && isDirty()) { confirm('Discard unsaved markup?', 'Download or save a copy before closing to keep your annotations.', 'Discard and close', function () { finishClose(); }); return false; }
      finishClose(); return true;
    }
    function finishClose() {
      if (closed) return; closed = true; exportGeneration++; if (raf) cancelAnimationFrame(raf); if (observer) observer.disconnect();
      window.removeEventListener('resize', resize); document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', containFocus, true);
      if (sourceObjectURL) URL.revokeObjectURL(sourceObjectURL); if (cancelLoad) cancelLoad(); if (image && !loaded) image.src = ''; modal.remove(); document.body.style.overflow = previousOverflow; active = null;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
      if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (error) { console.error('Photo Markup onClose failed:', error); } }
    }
    function showLabel(item) {
      pending = item; panel = 'label'; labelInput.value = ''; labelPanel.querySelector('h3').textContent = item.type === 'measure' ? 'Add your measurement' : 'Add a label';
      labelPanel.querySelector('[data-label-hint]').textContent = item.type === 'measure' ? 'Enter a known value and unit, such as “2.4 m”. This photo does not calculate distances.' : 'Keep the label brief so it stays legible on the photo.';
      labelPanel.hidden = false; update(); labelInput.focus();
    }
    labelPanel.querySelector('form').addEventListener('submit', function (event) { event.preventDefault(); var text = labelInput.value.trim(); if (!text) { labelInput.focus(); return; } var item = pending; item.text = text; hidePanel(); history.add(item); changed(); tell('Label added. ' + help()); });
    function annotation(p) { var scale = Math.max(canvas.width, canvas.height) / 800; return { type: tool, color: tool === 'redact' ? '#000000' : color.value, width: Number(stroke.value) * scale, fontSize: Math.max(16, Math.max(canvas.width, canvas.height) / 32), points: [p] }; }
    function start(p) { if (!loaded || busy || panel || original) return; if (tool === 'text') { showLabel(annotation(p)); return; } draft = annotation(p); draft.points.push(p); update(); scheduleRender(); }
    function move(p) { if (!draft) return; if (draft.type === 'freehand') { var last = draft.points[draft.points.length - 1]; if (Math.hypot(p.x - last.x, p.y - last.y) >= Math.max(.5, draft.width / 6)) draft.points.push(p); } else draft.points[1] = p; scheduleRender(); }
    function finish() {
      if (!draft) return; var item = draft; draft = null; var first = item.points[0], last = item.points[item.points.length - 1];
      if (item.type !== 'freehand' && Math.hypot(first.x - last.x, first.y - last.y) < 2) { update(); scheduleRender(); return; }
      if (item.type === 'measure') showLabel(item); else { history.add(item); changed(); tell('Annotation added. ' + help()); } scheduleRender();
    }
    function localPoint(event) { var rect = canvas.getBoundingClientRect(); return point((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height, canvas.width, canvas.height); }
    canvas.addEventListener('pointerdown', function (event) { if (pointer !== null || event.button !== 0 || !loaded || busy || panel || original) return; event.preventDefault(); keyboard.visible = false; canvas.focus(); pointer = event.pointerId; canvas.setPointerCapture(pointer); start(localPoint(event)); });
    canvas.addEventListener('pointermove', function (event) { if (event.pointerId === pointer) { event.preventDefault(); move(localPoint(event)); } });
    canvas.addEventListener('pointerup', function (event) { if (event.pointerId !== pointer) return; move(localPoint(event)); pointer = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); finish(); });
    canvas.addEventListener('pointercancel', function (event) { if (event.pointerId !== pointer) return; pointer = null; draft = null; update(); scheduleRender(); tell('Drawing cancelled. ' + help()); });
    canvas.addEventListener('blur', function () { keyboard.visible = false; scheduleRender(); });
    toolbar.addEventListener('click', function (event) { var button = event.target.closest('[data-tool]'); if (!button || button.disabled) return; tool = button.dataset.tool; draft = null; original = false; update(); scheduleRender(); tell(help()); });
    function completed(result) { saved = JSON.stringify(result.annotations.items); tell('Annotated copy ready. Your original is unchanged.'); }
    async function performExport(action) {
      if (busy || !loaded || panel || draft) return; busy = true; update(); tell(action === 'save' ? 'Saving annotated copy…' : 'Preparing PNG…');
      try {
        var result = await exportPNG();
        if (action === 'save') await opts.onSave(result);
        else { var url = URL.createObjectURL(result.blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); }
        completed(result);
      } catch (error) { tell('Could not ' + (action === 'save' ? 'save' : 'export') + ': ' + (error.message || 'Please try again.')); }
      finally { busy = false; update(); }
    }
    modal.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]'); if (!button || button.disabled) return; var action = button.dataset.action;
      if (action === 'close') close();
      if (action === 'undo' || action === 'redo') { draft = null; history[action](); changed(); tell(help()); }
      if (action === 'original') { original = !original; draft = null; update(); scheduleRender(); tell(original ? 'Viewing the unmodified original. Select Original again to continue drawing. Exports include your markup.' : help()); }
      if (action === 'clear') confirm('Clear all annotations?', 'The original photo stays intact. You can undo this after clearing.', 'Clear annotations', function () { history.clear(); hidePanel(); changed(); tell('Annotations cleared. Undo restores them.'); });
      if (action === 'cancel-label' || action === 'cancel-confirm') hidePanel();
      if (action === 'confirm' && confirmAction) confirmAction();
      if (action === 'download' || action === 'save') performExport(action);
      if (action === 'share' && shareResult) {
        var cached = shareResult; busy = true; update();
        navigator.share({ files: [cached.file], title: 'Annotated site photo' }).then(function () { completed(cached.result); }).catch(function (error) { tell(error.name === 'AbortError' ? 'Share cancelled. Your markup is still here.' : 'Sharing is unavailable here. Use Download PNG to save your copy.'); }).finally(function () { busy = false; update(); });
      }
    });
    function focusables() { var scope = panel === 'label' ? labelPanel : panel === 'confirm' ? confirmPanel : modal; return Array.from(scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),canvas[tabindex="0"]')).filter(function (el) { return !el.hidden && el.getClientRects().length; }); }
    function containFocus(event) { if (closed) return; var scope = panel === 'label' ? labelPanel : panel === 'confirm' ? confirmPanel : modal; if (!scope.contains(event.target)) { var targets = focusables(); (targets[0] || modal).focus(); } }
    function keydown(event) {
      if (closed) return;
      if (event.key === 'Tab') { var targets = focusables(), first = targets[0], last = targets[targets.length - 1]; if (!first) { event.preventDefault(); modal.focus(); } else if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement))) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && (document.activeElement === last || !targets.includes(document.activeElement))) { event.preventDefault(); first.focus(); } return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (busy) return; if (panel) { hidePanel(); return; } if (draft) { draft = null; pointer = null; update(); scheduleRender(); return; } close(); return; }
      if (busy || panel || !loaded || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); draft = null; history[event.shiftKey ? 'redo' : 'undo'](); changed(); return; }
      if (event.target !== canvas || original) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) >= 0) { event.preventDefault(); keyboard.visible = true; var step = Math.max(canvas.width, canvas.height) * (event.shiftKey ? .1 : .01); if (event.key === 'ArrowLeft') keyboard.x -= step; if (event.key === 'ArrowRight') keyboard.x += step; if (event.key === 'ArrowUp') keyboard.y -= step; if (event.key === 'ArrowDown') keyboard.y += step; var p = point(keyboard.x, keyboard.y, canvas.width, canvas.height); keyboard.x = p.x; keyboard.y = p.y; if (draft) move(p); scheduleRender(); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); keyboard.visible = true; if (draft) finish(); else start({ x: keyboard.x, y: keyboard.y }); }
    }
    document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', containFocus, true); window.addEventListener('resize', resize);
    var observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; if (observer) observer.observe(stage);
    var controller = { ready: null, exportPNG: exportPNG, getAnnotations: getAnnotations, close: close }; active = controller;
    update(); buttons.close.focus();
    controller.ready = (async function () {
      try {
        if (!context) throw new Error('This browser does not support canvas editing.');
        var source = opts.source, src;
        if (typeof Blob !== 'undefined' && source instanceof Blob) { if (source.size > 30 * 1024 * 1024) throw new Error('Choose a photo under 30 MB.'); if (source.type && !source.type.startsWith('image/')) throw new Error('Choose an image file such as JPEG, PNG or WebP.'); sourceObjectURL = URL.createObjectURL(source); src = sourceObjectURL; }
        else if (typeof source === 'string' && source) {
          if (source.length > 42 * 1024 * 1024) throw new Error('Choose a photo under 30 MB.');
          var parsed = new URL(source, window.location.href);
          if (parsed.protocol === 'data:' && !/^data:image\//i.test(source)) throw new Error('Choose an image data URL.');
          if (!['http:', 'https:', 'blob:', 'data:'].includes(parsed.protocol)) throw new Error('Use a local image file or a same-origin image URL.');
          if (['http:', 'https:', 'blob:'].includes(parsed.protocol) && parsed.origin !== window.location.origin) throw new Error('Choose a local photo or a same-origin image URL. Remote images are not loaded.');
          src = parsed.href;
        } else throw new Error('Choose a photo to open the studio.');
        image = new Image(); image.decoding = 'async';
        await new Promise(function (resolve, reject) { cancelLoad = resolve; image.onload = function () { cancelLoad = null; resolve(); }; image.onerror = function () { cancelLoad = null; reject(new Error('This image could not be opened. Try JPEG, PNG or WebP; convert HEIC first if your browser cannot read it.')); }; image.src = src; });
        if (closed) return false;
        if (image.naturalWidth * image.naturalHeight > 100000000) throw new Error('This photo is too large. Choose a version below 100 megapixels.');
        var dimensions = fitSize(image.naturalWidth, image.naturalHeight, opts.maxDim); canvas.width = dimensions.width; canvas.height = dimensions.height;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        try { context.getImageData(0, 0, 1, 1); } catch (error) { throw new Error('This image blocks canvas access. Download it and choose the local file instead.'); }
        if (sourceObjectURL) { URL.revokeObjectURL(sourceObjectURL); sourceObjectURL = null; }
        loaded = true; keyboard.x = canvas.width / 2; keyboard.y = canvas.height / 2; resize(); render(); update(); prepareShare();
        tell(canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight ? 'Working copy resized to ' + canvas.width + ' × ' + canvas.height + ' pixels. ' + help() : help());
        return true;
      } catch (error) { if (!closed) { tell(error.message || 'Could not open this photo.'); if (sourceObjectURL) { URL.revokeObjectURL(sourceObjectURL); sourceObjectURL = null; } update(); } return false; }
    }());
    return controller;
  }
  return { open: open, isSupported: function () { return typeof document !== 'undefined' && !!document.createElement('canvas').getContext; }, model: { fitSize: fitSize, point: point, bounds: bounds, createHistory: createHistory, documentData: documentData, filename: filename } };
}));
