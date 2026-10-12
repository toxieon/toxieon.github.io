# Reliability report (Brandon) — permissive-only vs SingleFile

**Version:** 0.3.1  
**Priority:** It must **work** on real sites (e.g. Moodle quiz review on energyspace).  
**This release:** permissive licences only (MIT pdf-lib + jsPDF). **No SingleFile (AGPL).**

---

## Short answer

**Stay on permissive-only for this version.** Searchable capture does **not** require SingleFile for Brandon’s main use case (find text like “Tuesday” on a quiz review, offline reference, PDF with selectable text).

**Is searchable reconstruct reliable without SingleFile?** **Yes, for search and reading text** — we index `pageText` from the reconstructed DOM snapshot (not from OCR), and the viewer search + PDF text layer use that. SingleFile does **not** materially improve whether “Tuesday” is findable; it improves **how the offline HTML page looks**, not the text index. If production Moodle ever shows **empty search** after a good stitch, that is a **capture/index bug** to fix in our code, not a signal to add AGPL SingleFile.

**Consider SingleFile (private extension only, not Chrome Web Store)** only if you need the **saved HTML to look identical** to the live LMS page (all theme CSS, icons, fonts, and assets) when opened months later without the original site. Brandon: switching to SingleFile + keeping the extension **private** (not on the store) is the right path for that goal only.

---

## What works today (no SingleFile)

| Goal | How | Moodle quiz review |
|------|-----|-------------------|
| **Full-page picture** | Scroll + `captureVisibleTab` + stitch | 0.2.5: slice 1 keeps Moodle chrome; later slices hide fixed/sticky/pinned drawers & quiz nav (GoFullPage-style) |
| **Search “Tuesday” etc.** | Every image capture also stores `html` + `pageText` + positioned `textLayer` | **Search box** uses `pageText` (from reconstructed DOM text). **Ctrl+F** works on the transparent text overlay on the PNG. |
| **Offline HTML** | `reconstructHtml` — clone DOM, inline CSS/fonts/images (cookie `fetch` + canvas fallback), FA unicode fallbacks | Question images from `pluginfile.php` should embed as **data:** URIs at capture time |
| **Searchable PDF** | pdf-lib (MIT): PNG + low-opacity positioned text from `textLayer` | Text is **selectable** in PDF readers; position match to pixels is **approximate** |
| **Multi-page quiz** | Full scan + optional host permission | Heuristic pagination; set a page limit |

Automated check: `node extensions/fullpage/scripts/extension-e2e.mjs` (Moodle Boost fixture — distinct scroll slices, `pageText` contains “Question”, search highlights).

---

## Where permissive-only is weaker (honest limits)

1. **Reconstruct HTML appearance** — Not a SingleFile-grade archive. Cross-origin stylesheets may stay as `<link>` (dead offline). Some images won’t inline without CORS. Moodle may look “plain” offline but **text content is still real** in the snapshot.
2. **Text overlay vs PNG** — Rect positions come from the live DOM at capture time. If stitch scroll logic regresses on a specific LMS skin, highlights might not line up pixel-perfect with the image; **search still finds strings in `pageText`**.
3. **PDF text layer** — Searchable, not OCR; glyphs/layout won’t match the screenshot perfectly on complex fonts.
4. **Full scan** — Pagination heuristics, not Moodle-aware; fine for “next page” links with limits.

None of these are fixed by SingleFile alone for **PNG stitch**; SingleFile mainly improves **HTML snapshot fidelity**.

---

## When Brandon should switch to SingleFile (private)

Use **SingleFile / single-file-core (AGPL-3.0)** only if:

- Offline HTML must **look like** the live quiz page (branding, colours, layout), not just read correctly.
- You accept **private/internal distribution only** (not Chrome Web Store) and AGPL compliance (source offer, no proprietary mixing without legal review).

**Not needed** if the workflow is: capture → **search/read text** → optional PNG/PDF proof → occasional HTML export where “good enough” formatting is OK.

---

## Recommended workflow on energyspace (this build)

1. Reload extension **0.3.0** on Windows Chrome.
2. On quiz review tab, **click toolbar icon** (allow optional site access if prompted for some flows).
3. Wait for progress popup → viewer opens.
4. **Search** box: type `tuesday` (case-insensitive) — should match status lines in `pageText`.
5. **Ctrl+F** in viewer over the capture for the same string on the text layer.
6. **Download PDF** — try selecting “Tuesday” in Acrobat/Chrome PDF viewer.
7. If layout is wrong but text matters: **Download HTML** and open locally; use browser Find there.

If stitch still repeats headers on production Moodle after 0.2.5, report URL + “one page at a time” setting — that’s a **scroll target** bug, not a licence issue.

**Viewer (0.2.5+):** opens the **HTML page snapshot** by default (native Ctrl+F). Use **Screenshot** in the toolbar for the stitched PNG + invisible text overlay (export/annotate).

**Multipage (0.3.0):** Right-click extension icon → **Start multipage mode** → capture many quiz pages while browsing → **Finish** → reorder/hide/rename → export `.nfp` or combined HTML/PDF/PNG. Good for Topic 6-style quizzes without re-running full scan each time.

---

## Libraries (permissive)

| Library | Licence | Role |
|---------|---------|------|
| pdf-lib | MIT | Image PDF + text |
| jsPDF | MIT | HTML/reconstruct flowing PDF |

See `THIRD_PARTY_NOTICES.md`. **No AGPL in this build.**
