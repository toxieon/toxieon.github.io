(function () {
  if (globalThis.__NeillRegionSelectActive) return;
  globalThis.__NeillRegionSelectActive = true;

  const shade = document.createElement('div');
  shade.id = 'neill-region-select-root';
  shade.setAttribute('data-neill-fullpage', 'region');
  shade.innerHTML = `
    <style>
      #neill-region-select-root {
        position: fixed; inset: 0; z-index: 2147483645; cursor: crosshair;
        font-family: system-ui, sans-serif;
      }
      #neill-region-select-root .rs-hint {
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        background: #202124; color: #fff; padding: 8px 14px; border-radius: 8px;
        font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.25); max-width: 92vw;
      }
      #neill-region-select-root .rs-box {
        position: absolute; border: 2px solid #1a73e8; background: rgba(26,115,232,.12);
        box-shadow: 0 0 0 9999px rgba(0,0,0,.35);
      }
      #neill-region-select-root .rs-bar {
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 8px; background: #fff; padding: 8px; border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,.2);
      }
      #neill-region-select-root button {
        border: 1px solid #dadce0; background: #fff; border-radius: 8px;
        padding: 8px 12px; cursor: pointer; font: inherit;
      }
      #neill-region-select-root button.primary { background: #1a73e8; color: #fff; border-color: #1a73e8; }
    </style>
    <div class="rs-hint">Drag to select · scroll to see more · tick “Extend while scrolling” to grow downward</div>
    <div class="rs-box" hidden></div>
    <div class="rs-bar">
      <label><input type="checkbox" id="rs-extend" /> Extend while scrolling</label>
      <button type="button" data-cancel>Cancel</button>
      <button type="button" class="primary" data-ok>Capture region</button>
    </div>`;
  document.documentElement.appendChild(shade);

  const box = shade.querySelector('.rs-box');
  let docRect = null;
  let dragging = false;
  let anchor = null;

  function docPoint(ev) {
    return { x: ev.clientX + window.scrollX, y: ev.clientY + window.scrollY };
  }

  function updateBoxView() {
    if (!docRect) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const left = docRect.left - window.scrollX;
    const top = docRect.top - window.scrollY;
    const w = docRect.right - docRect.left;
    const h = docRect.bottom - docRect.top;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
  }

  function normalize(a, b) {
    return {
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x),
      bottom: Math.max(a.y, b.y),
    };
  }

  shade.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.rs-bar')) return;
    dragging = true;
    anchor = docPoint(ev);
    docRect = normalize(anchor, anchor);
    updateBoxView();
    shade.setPointerCapture(ev.pointerId);
  });

  shade.addEventListener('pointermove', (ev) => {
    if (!dragging || !anchor) return;
    docRect = normalize(anchor, docPoint(ev));
    updateBoxView();
  });

  shade.addEventListener('pointerup', () => {
    dragging = false;
  });

  window.addEventListener(
    'scroll',
    () => {
      const extend = shade.querySelector('#rs-extend')?.checked;
      if (extend && docRect) {
        docRect.bottom = Math.max(docRect.bottom, window.scrollY + window.innerHeight);
      }
      updateBoxView();
    },
    { passive: true }
  );

  function teardown() {
    shade.remove();
    globalThis.__NeillRegionSelectActive = false;
  }

  shade.querySelector('[data-cancel]').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REGION_SELECT_CANCEL' });
    teardown();
  });

  shade.querySelector('[data-ok]').addEventListener('click', () => {
    if (!docRect || docRect.right - docRect.left < 8 || docRect.bottom - docRect.top < 8) {
      alert('Draw a larger region first.');
      return;
    }
    const region = {
      x: docRect.left,
      y: docRect.top,
      width: docRect.right - docRect.left,
      height: docRect.bottom - docRect.top,
    };
    chrome.runtime.sendMessage({ type: 'REGION_SELECT_DONE', region });
    teardown();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      chrome.runtime.sendMessage({ type: 'REGION_SELECT_CANCEL' });
      teardown();
    }
  });
})();
