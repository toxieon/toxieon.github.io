(function () {
  if (globalThis.__NeillMultipageWidgetMounted) return;
  globalThis.__NeillMultipageWidgetMounted = true;

  const ROOT_ID = 'neill-multipage-root';

  function removeWidget() {
    document.getElementById(ROOT_ID)?.remove();
    globalThis.__NeillMultipageWidgetMounted = false;
  }

  function buildWidget() {
    removeWidget();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-neill-fullpage', 'widget');
    root.innerHTML = `
      <div class="nfp-dock">
        <button type="button" class="nfp-tab" title="Drag to move">Multi</button>
        <div class="nfp-panel">
          <div class="nfp-head">
            <span class="nfp-brand">Multipage</span>
            <div class="nfp-head-actions">
              <button type="button" data-act="min" title="Minimize">−</button>
              <button type="button" data-act="close" title="End session">×</button>
            </div>
          </div>
          <div class="nfp-body">
            <div class="nfp-count" data-count>0 pages</div>
            <div class="nfp-actions">
              <button type="button" data-act="capture" class="nfp-capture" title="Capture this page">📷</button>
              <button type="button" data-act="undo" title="Undo last">Undo</button>
              <button type="button" data-act="finish" class="nfp-primary">Finish</button>
            </div>
            <div class="nfp-status" data-status></div>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(root);

    const tab = root.querySelector('.nfp-tab');
    let drag = null;
    tab.addEventListener('pointerdown', (e) => {
      drag = { y: e.clientY, top: root.offsetTop };
      tab.setPointerCapture(e.pointerId);
    });
    tab.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      root.style.top = `${Math.max(8, Math.min(window.innerHeight - 80, drag.top + dy))}px`;
      root.style.transform = 'none';
    });
    tab.addEventListener('pointerup', () => {
      drag = null;
    });

    root.querySelector('[data-act="min"]').addEventListener('click', () => {
      root.classList.toggle('nfp-minimized');
    });
    root.querySelector('[data-act="close"]').addEventListener('click', async () => {
      if (!confirm('End multipage session on this device? Captured pages stay saved until you finish from the editor.')) return;
      await chrome.runtime.sendMessage({ type: 'MULTIPAGE_END' });
      removeWidget();
    });
    root.querySelector('[data-act="capture"]').addEventListener('click', () => runCapture(root));
    root.querySelector('[data-act="undo"]').addEventListener('click', () => runUndo(root));
    root.querySelector('[data-act="finish"]').addEventListener('click', () => runFinish(root));

    refreshState(root);
    return root;
  }

  function setStatus(root, text, isError) {
    const el = root.querySelector('[data-status]');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', Boolean(isError));
  }

  function setCount(root, n) {
    const el = root.querySelector('[data-count]');
    if (el) el.textContent = `${n} page${n === 1 ? '' : 's'}`;
    const undo = root.querySelector('[data-act="undo"]');
    if (undo) undo.disabled = n < 1;
  }

  async function refreshState(root) {
    const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_GET_STATE' });
    if (!resp?.ok || !resp.active) {
      removeWidget();
      return;
    }
    setCount(root, resp.pageCount ?? 0);
  }

  async function runCapture(root) {
    root.classList.add('nfp-busy');
    setStatus(root, 'Capturing…');
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_CAPTURE' });
      if (!resp?.ok) throw new Error(resp?.error || 'Capture failed');
      setCount(root, resp.pageCount);
      setStatus(root, 'Added to session');
      setTimeout(() => setStatus(root, ''), 2000);
    } catch (err) {
      setStatus(root, err.message || String(err), true);
    } finally {
      root.classList.remove('nfp-busy');
    }
  }

  async function runUndo(root) {
    setStatus(root, '');
    const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_UNDO' });
    if (!resp?.ok) {
      setStatus(root, resp?.error || 'Undo failed', true);
      return;
    }
    setCount(root, resp.pageCount ?? 0);
    setStatus(root, 'Removed last page');
    setTimeout(() => setStatus(root, ''), 1500);
  }

  async function runFinish(root) {
    setStatus(root, 'Opening editor…');
    const resp = await chrome.runtime.sendMessage({ type: 'MULTIPAGE_FINISH' });
    if (!resp?.ok) {
      setStatus(root, resp?.error || 'Finish failed', true);
      return;
    }
    removeWidget();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MULTIPAGE_REMOVE_WIDGET') removeWidget();
    if (msg.type === 'MULTIPAGE_STATE') {
      const root = document.getElementById(ROOT_ID) || buildWidget();
      setCount(root, msg.pageCount ?? 0);
    }
  });

  buildWidget();
})();
