/**
 * In-page capture progress UI (original).
 */
(function () {
  if (globalThis.__NeillFullPageProgress) return;

  const ROOT_ID = 'neill-fullpage-progress-root';

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-neill-fullpage', 'progress');
    const shadow = root.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap {
          position: fixed;
          z-index: 2147483646;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          min-width: 280px;
          max-width: min(420px, 92vw);
          background: #1a1d24;
          color: #e8eaed;
          border: 1px solid #3c4048;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,.45);
          font: 13px/1.4 system-ui, sans-serif;
          padding: 12px 14px;
        }
        .title { font-weight: 600; margin: 0 0 8px; }
        .bar {
          height: 8px;
          background: #2a2f3a;
          border-radius: 999px;
          overflow: hidden;
        }
        .fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #3d8fd4, #5b9fd4);
          transition: width 0.15s ease;
        }
        .detail { margin: 8px 0 0; color: #9aa0a6; font-size: 12px; }
        .error { color: #e57373; }
      </style>
      <div class="wrap" part="wrap">
        <p class="title">Capturing page…</p>
        <div class="bar"><div class="fill"></div></div>
        <p class="detail"></p>
      </div>
    `;
    document.documentElement.appendChild(root);
    return root;
  }

  function getParts() {
    const root = ensureRoot();
    const shadow = root.shadowRoot;
    return {
      root,
      fill: shadow.querySelector('.fill'),
      title: shadow.querySelector('.title'),
      detail: shadow.querySelector('.detail'),
    };
  }

  function show(payload) {
    const { fill, title, detail } = getParts();
    const pct = Math.max(0, Math.min(100, payload.percent ?? 0));
    fill.style.width = `${pct}%`;
    title.textContent = payload.title || 'Capturing page…';
    detail.textContent = payload.detail || '';
    detail.classList.toggle('error', Boolean(payload.error));
  }

  function hide() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FULLPAGE_PROGRESS_SHOW') {
      show(msg.payload || {});
    }
    if (msg.type === 'FULLPAGE_PROGRESS_HIDE') {
      hide();
    }
  });

  globalThis.__NeillFullPageProgress = { show, hide };
})();
