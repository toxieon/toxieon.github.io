# Libraries and dependencies

Chrome Web Store build: **permissive licences only** (MIT/BSD/Apache/ISC). No AGPL/GPL.

## Vendored (included in package)

| Library | Version | Licence | File |
|---------|---------|---------|------|
| pdf-lib | 1.17.1 | MIT | `vendor/pdf-lib.esm.min.js` |
| jsPDF | 2.5.1 | MIT | `vendor/jspdf.umd.min.js` |

Legal text: **`THIRD_PARTY_NOTICES.md`** and `vendor/*-LICENSE*`.

## Not used (store policy)

- **SingleFile / single-file-core** (AGPL) — not bundled; HTML reconstruct is original.
- **html2canvas**, **html-to-image**, **modern-screenshot** (MIT) — not needed; capture uses `chrome.tabs.captureVisibleTab`.
- Closed-source extensions — behaviour reference only; no code copied.

## Original implementation

Scroll/stitch, Moodle scroller detection, text-layer extraction, viewer overlay, IndexedDB history, and reconstruct HTML are implemented in this repository.
