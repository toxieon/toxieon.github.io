const SEGMENT_COUNT = 16;
const statusEl = document.getElementById('status-text');
const detailEl = document.getElementById('detail-text');
const errorEl = document.getElementById('error-text');
const segmentsEl = document.getElementById('segments');

const segments = [];
for (let i = 0; i < SEGMENT_COUNT; i++) {
  const s = document.createElement('span');
  segmentsEl.appendChild(s);
  segments.push(s);
}

function paintSegments(percent) {
  const filled = Math.floor((percent / 100) * SEGMENT_COUNT);
  const partial = percent / 100 * SEGMENT_COUNT - filled;
  segments.forEach((el, i) => {
    el.className = '';
    if (i < filled) el.classList.add('done');
    else if (i === filled && partial > 0.15) el.classList.add('active');
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'FULLPAGE_PROGRESS_BROADCAST') return;
  const p = msg.payload || {};
  statusEl.textContent = p.title || 'Screen capture in progress…';
  detailEl.textContent = p.detail || '';
  paintSegments(p.percent ?? 0);
  if (p.error) {
    errorEl.hidden = false;
    errorEl.textContent = p.detail || 'Capture failed';
    statusEl.textContent = 'Capture failed';
  } else {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
});

// Keep service worker alive for the duration of this window.
const port = chrome.runtime.connect({ name: 'fullpage-progress' });
