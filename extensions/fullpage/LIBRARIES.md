# Third-party libraries (Neill Full Page Capture)

## In use (vendored)

| Library | Licence | Role | Why |
|---------|---------|------|-----|
| **pdf-lib** 1.17.1 | MIT | `vendor/pdf-lib.esm.min.js` | Searchable PDFs: full-page PNG + invisible positioned text (DOM text layer). |
| **jsPDF** 2.5.1 | MIT | `vendor/jspdf.umd.min.js` | Reconstruct / HTML-only PDFs (flowing text export). |

## Surveyed, not vendored

| Project | Licence | Notes |
|---------|---------|-------|
| **SingleFile** / single-file-core | AGPL-3.0 | Best-in-class saved HTML; our `reconstructHtml` covers internal offline search without AGPL payload. Brandon: OK to adopt later if HTML fidelity must match SingleFile exactly. |
| **html2canvas**, **html-to-image**, **modern-screenshot** | MIT | DOM→canvas rasterization; we use Chrome `captureVisibleTab` for pixel accuracy on complex LMS CSS. |
| **GoFullPage** (closed) | — | Behaviour reference only; no code used. |
| **Nimbus / Fireshot** (closed) | — | Same. |

## Original code

Scroll planning, Moodle drawer exclusion, slice de-duplication, text-layer extraction (DOM `Range` + `getClientRects`), viewer overlay, and stitching are implemented in this extension.

See `vendor/NOTICES.md` for licence file paths.
