# Neill Full Page Capture (Chrome MV3)

Version **0.1.0** — self-contained Chrome extension for scroll-and-stitch screenshots, offline-searchable HTML snapshots, and multi-page scans. **No data leaves your browser** (IndexedDB + `chrome.storage` only).

This folder is **not** linked from the public site or hub.

## Features

| Mode | Output |
|------|--------|
| **Capture image** | Full-page PNG (scroll + stitch), optional single-page PDF |
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

The archive is written to `extensions/fullpage/dist/fullpage-capture-0.1.0.zip`.

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

## Known limitations (0.1.0)

- Cross-origin stylesheets blocked by the page may not fully inline; a `<link>` fallback is kept when rules are unreadable.
- Cross-origin images without CORS may remain external URLs in reconstruct mode.
- Image PDFs are visual only; reconstruct / full-scan PDFs use extracted text (not a perfect layout clone).
- Very tall pages produce large PNGs; stitching may be slow or hit memory limits on huge sites.
- Pagination detection is heuristic; review LMS quiz flows manually with **Full scan** + page limit.
- `captureVisibleTab` cannot run on restricted `chrome://` pages.

## License

Extension source: project repository license. jsPDF: MIT (see `vendor/JSPDF-LICENSE.txt`).
