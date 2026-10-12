# Neill Full Page Capture (Chrome MV3)

Version **0.3.0** — self-contained Chrome extension for scroll-and-stitch screenshots, offline-searchable HTML snapshots, **multipage sessions**, and multi-page scans. **No data leaves your browser** (IndexedDB + `chrome.storage` only). **No ads.**

## UX (GoFullPage-style core + our extras)

- **One-click toolbar** — click the extension icon to start capture (default: full-page image). GoFullPage-style **progress popup** with segmented bar.
- **Result tab** — preview on a gray stage with toolbar: **Edit**, **Download PNG**, **PDF**, **Search**, **Reconstruct**, **History**, **Settings**.
- **Keyboard shortcuts** and **capture menu** (`popup/popup.html` — pin via options) for Reconstruct and Full scan.
- **Extras** — searchable text on every image capture (HTML + text overlay + selectable PDF).

## Permissions (Chrome Web Store–friendly)

| Permission | Why |
|------------|-----|
| `activeTab` | Capture the page you are viewing when you click the icon or use a shortcut. |
| `scripting` | Inject capture helpers into that tab. |
| `storage` | Settings and local capture history (IndexedDB). |
| `tabs` | Open the result viewer tab and read the active tab id. |
| `offscreen` | Stitch screenshots and build PDFs locally. |
| **Optional** `<all_urls>` | Requested when needed for multi-page full scan or reliable injection; not required at install time. |

No `unlimitedStorage`, no broad host access at install, no context menus, no network calls, no ads.

## Third-party licences

Permissive only (MIT): **pdf-lib**, **jsPDF**. See **`THIRD_PARTY_NOTICES.md`**. No AGPL/GPL (e.g. SingleFile is not used).

**Reliability vs SingleFile:** see **`REPORT-BRANDON.md`** (permissive-only is enough for search; SingleFile only if offline HTML must look pixel-perfect — private AGPL OK).

This folder is **not** linked from the public site or hub.

## Features

| Mode | Output |
|------|--------|
| **Capture image** | Full-page PNG + **searchable text layer** (HTML snapshot + positioned overlay) + PDF with selectable text |
| **Reconstruct** | Self-contained HTML (inlined CSS where allowed, images as data URIs, scripts removed, form state preserved) + searchable text PDF |
| **Full scan** | Current tab plus optional tab queue and pagination following; combined HTML with table of contents + PDF |

Keyboard shortcuts (configurable under `chrome://extensions/shortcuts`):

- `Alt+Shift+P` — image capture  
- `Alt+Shift+R` — reconstruct  
- `Alt+Shift+F` — full scan  

## Install on Windows (Chrome, unpacked)

1. Open **Chrome** and go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder: `extensions/fullpage` (the directory that contains `manifest.json`).
5. Pin the extension from the toolbar puzzle icon if you like.

To try local test pages, also allow file URLs: on the extension card → **Details** → enable **Allow access to file URLs** (optional).

## Build a zip

From the repository root (Git Bash or WSL on Windows):

```bash
bash extensions/fullpage/scripts/build-zip.sh
```

The archive is written to `extensions/fullpage/dist/fullpage-capture-0.3.0.zip`.

Library choices: `LIBRARIES.md` · legal: `THIRD_PARTY_NOTICES.md`.

## Manual test pages

Open these in Chrome (via a local server or `file://` if file access is enabled):

- `extensions/fullpage/test/long-page.html` — lazy sections + sticky header
- `extensions/fullpage/test/inner-scroll.html` — inner scroll container
- `extensions/fullpage/test/pagination.html` — numbered “next” links for full scan

Example local server from repo root:

```bash
npx --yes serve extensions/fullpage/test -p 4173
```

Then visit `http://localhost:4173/long-page.html` and run captures from the popup.

## Architecture (brief)

- `background/service-worker.js` — orchestration
- `content/page-tools.js` — injected DOM helpers (metrics, scroll plan, reconstruct, pagination heuristics)
- `offscreen/` — canvas stitch + PDF generation (jsPDF, MIT)
- `viewer/` — preview, search, downloads, local history

Optional extension E2E (Puppeteer + unpacked extension):

```bash
npx puppeteer@23 browsers install chrome
node extensions/fullpage/scripts/extension-e2e.mjs
```

## Multipage mode (0.3.0)

Right-click the toolbar icon → **Start multipage mode**. A floating edge widget stays available while you browse; **camera** captures each page (image + inlined HTML), **Undo** removes the last scan, **Finish** opens the project editor. Export/import **`.nfp`** project files, download combined HTML (TOC), PDF, or PNG. Sessions persist in IndexedDB.

```bash
node extensions/fullpage/scripts/extension-e2e-multipage.mjs
```

## Known limitations (0.3.0)

- Cross-origin stylesheets blocked by the page may not fully inline; a `<link>` fallback is kept when rules are unreadable.
- Cross-origin images without CORS may remain external URLs in reconstruct mode.
- Image PDFs are visual only; reconstruct / full-scan PDFs use extracted text (not a perfect layout clone).
- Very tall pages produce large PNGs; stitching may be slow or hit memory limits on huge sites.
- Pagination detection is heuristic; review LMS quiz flows manually with **Full scan** + page limit.
- `captureVisibleTab` cannot run on restricted `chrome://` pages.

## License

Extension source: project repository license. jsPDF: MIT (see `vendor/JSPDF-LICENSE.txt`).
