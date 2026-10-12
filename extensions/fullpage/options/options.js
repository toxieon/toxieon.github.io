import { getSettings, setSettings } from '../lib/settings.js';

const form = document.getElementById('settings-form');
const savedEl = document.getElementById('saved');

async function load() {
  const s = await getSettings();
  for (const [key, value] of Object.entries(s)) {
    const el = form.elements.namedItem(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
  }
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const data = new FormData(form);
  const patch = {
    toolbarCaptureMode: data.get('toolbarCaptureMode'),
    openViewerAfterCapture: form.elements.openViewerAfterCapture.checked,
    showProgressOverlay: form.elements.showProgressOverlay.checked,
    overlapPx: Number(data.get('overlapPx')) || 80,
    fullScanPageLimit: Number(data.get('fullScanPageLimit')) || 25,
    followPagination: form.elements.followPagination.checked,
    historyLimit: Number(data.get('historyLimit')) || 40,
  };
  await setSettings(patch);
  savedEl.hidden = false;
  setTimeout(() => {
    savedEl.hidden = true;
  }, 2000);
});

load();
