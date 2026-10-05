## 0.20.2 · 2026-10-06 · stable-login-ready · Google sign-in is ready for the stable login (one sign-in, then silent server-side refresh via the Neill Data Backend, for the iPhone home-screen app): nd-auth picks it from shared/nd-backend.js (plannerOAuth + endpoint), falls back to the normal sign-in if the backend isn't set up, and sign-out is immediate on the device. Switched OFF (plannerOAuth:false), so sign-in is unchanged today
## 0.20.1 · 2026-10-06 · report-cover · Polish the report cover: big Neill Data logo, Neill Planner title and job name with address/generated date set small at the foot; single swappable cover-logo slot

- Cover design by Cinna. The existing `/logo.png` sits large and centred slightly above the optical middle (440 px in the 794 px A4 sheet), followed by **Neill Planner** (40/700) and the job name (26/500, balanced wrap, capped at 560 px). The address and "Generated …" stamp sit small and grey at the foot. No new assets, fields or fonts.
- One swap point for the cover logo: `REPORT_COVER_LOGO_SRC` in app.js plus the `--cover-logo-w` / `--cover-logo-gap` vars on `.print-cover` (keep any new file in sw.js PRECACHE).
- The cover stays on one sheet: PDF render min-height 1040 px (of 1059 px usable), print min-height 255 mm (of 277 mm usable), with `break-after`/`page-break-after` kept and `@page` unchanged.
- The Lean Drive PDF notice now sits with the cover's foot details instead of floating in the flex column.
- The cover's "Generated" time is now Sydney time with a short zone label, e.g. "6 Oct 2026, 10:34 am AEDT" (AEST in winter), via `sydneyStamp()` (`Intl.DateTimeFormat`, `timeZone: "Australia/Sydney"`). It was UTC before. `nowStamp()` and stored timestamps stay UTC.

## 0.19.1 · 2026-10-01 · room-tools-drive-recovery · Recover floor plans from Drive; add room sizing, appearance, shared-wall snapping and room cutout exports

- Master Reload now reloads the master records, looks for associated plan originals/rendered previews in each floor's Drive folder, and fetches fresh bytes even when the Drive file ID has not changed. It falls back to the rendered plan if the PDF cannot download/render, reports partial failures and retains working copies on failure.
- Preserve pending originals, replacements and device-only floors/rooms/nodes through cloud hydration. Store an interrupted upload's original locally for retry. Publish the original's master-sheet link before the optional rendered preview and only report cross-device readiness once the link is written.
- Invalidate the old PDF, embedded-image and display caches when accepting a refreshed plan. Keep explicitly removed local plans unlinked during recovery. Serialise plan operations during Master Reload. Cap PDF render dimensions and release the PDF document after rendering.
- Room title pins now have their own 1%–300% size slider. Plan side-menu controls can apply a size to every title on the floor and hide title text while retaining selectable pin icons. Small visual pins retain a usable selection target.
- Each drawn room has separate border/fill opacity controls in its title-pin drawer. An All room opacity slider in the Plan side menu multiplies those settings without replacing them: a room at 50% with a global 50% is displayed at 25%. Per-room appearance is stored with room geometry in the existing Rooms sheet column; the universal multiplier/title visibility are device view preferences.
- Optional wall snapping follows nearby existing room boundaries, including intermediate jagged corners. The drawing preview shows the result before Done. Snap works while drawing/editing; ambiguous walls, deep detours and invalid polygons are rejected. Toggle it in the drawing bar or Plan menu. Other rooms are never moved automatically.
- Room-title drawers now offer Export rooms. Select one or more drawn rooms on the same floor, choose True to plan (original relative positions) or Side by side (cropped panels), and optionally include names, node markers, borders and fill. Export polygon-clipped PNGs or prepare a PDF with download/open/native-share options.
- Add local geometry/export-layout and plan-recovery regression checks. Bump app/style references, version and PWA cache; precache both new room modules.
- Push before reload (added in review): sign-in, Re-sync, Refresh and Reload from cloud now PUSH this device's unsynced edits (projects, floors and plan file ids, nodes, title pins, rooms and room shapes, photo metadata, folders, local deletes) to the master sheet BEFORE reloading it. Only dirty records are sent (row differs from the last-synced snapshot). A device with no snapshot for this sheet only adds records the sheet lacks and never overwrites or deletes cloud rows. Data from another account's sheet is never pushed (a local backup is kept). A row whose Updated At in the sheet is newer than this device's copy is not pushed. If a push partly fails, the unsent local records are merged back over the reload and stay pending. Reconnecting (online event) or a silent token renewal pushes pending edits. The snapshot is refreshed from each reload, so later flushes don't resend rows another device changed. Nothing clears localStorage, IndexedDB or the queue.
- Fix (review): first-page PDF render released the document with `pdf.destroy()`, which pdf.js 6 doesn't have, so every Drive plan download failed with "pdf.destroy is not a function". It now destroys the loading task.
- Asset Studio was added separately at `/assets/studio/`; see `assets/CHANGELOG.md` and the suite's `CHANGELOG-2026-10-01.md` for the photo markup, symbols and icon libraries.

## 0.18.5 · 2026-10-01 · desktop-plans · Plans uploaded on one device now reach the others: sign-in cloud reload keeps plan links not yet pushed (was wiping them before the flush), every device-only PDF plan is linked to Drive on sign-in (not just the open floor), uploads write the live floor; desktop shows why a plan can't load (PNG fallback, retry) instead of a blank; sync chip shows pending while signed out

## 0.18.4 · 2026-10-01 · csv-resize-libs · Category CSV import via vendored PapaParse 5.7.0 (quoted line breaks now work); photo downscale via vendored pica 10.0.3 (same 2560px cap / JPEG 0.88); precache both

## 0.18.3 · 2026-10-01 · vendor-libs · Vendor pdf.js 6.3.289 (legacy build, shared/nd-pdf.js loader, wasm JPX/JBIG2 decoders), html2canvas-pro 2.5.0 and jsPDF 2.5.1 under shared/vendor with LICENSE files; drop all cdnjs loads; precache in sw

## 0.18.2 · 2026-10-01 · licence-pdfjs-dates · Read photo EXIF date with vendored exifr (MIT) instead of ExifReader (MPL); drop heic2any (LGPL libheif) with a clear HEIC message; pdf.js isEvalSupported:false; local-date fix for Hours week/4-week ranges and audit CSV filename

## 0.18.1 · 2026-10-01 · osd-plan-view · Show raster PDF plans in OpenSeadragon (vendored 4.1.1) at full resolution with the node/room overlay synced on top; retire custom tiles; fix plan Drive auto-link

## 0.17.2 · 2026-10-01 · raster-pdf-plans · Extract single-image PDF plans at full resolution as tiles, stop pdf.js downscaling embedded images, link unsynced plan originals to Drive

## 0.17.1 · 2026-10-01 · draw-room · Draw and edit a room polygon from a title pin, auto-assign nodes inside, rename and delete with the pin

## 0.16.1 · 2026-10-01 · room-title-pins · Add room title pins: place, rename, move and delete labelled map pins on the plan

## 0.15.3 · 2026-10-01 · pdf-zoom-fix · Stop restarting slow sharp re-renders, fetch Drive PDFs as raw bytes, add plan debug line and flat-plan re-upload notice

## 0.15.2 · 2026-10-01 · pdf-zoom · Re-render PDF plans sharply at zoom, load originals for reports and raise max zoom to 800%

## 0.15.1 · 2026-09-29 · pdf-export · Add direct device PDF saving, iOS sharing and printable report isolation

## 0.14.1 · 2026-09-29 · report-viewing · Preserve compact cards, expose full-size photos and add full-screen browsing

## 0.13.1 · 2026-09-29 · report-layout · Add cover, bare and annotated floor pages, and individual node thumbnails

## 0.12.2 · 2026-09-29 · report-shorthand · Normalize category/item matching and publish editor changes immediately

## 0.12.1 · 2026-09-29 · node-sizing · Add bulk and mass-placement sizing down to 5 percent

## 0.11.1 · 2026-09-29 · node-photos · Add watermarked photo queue, camera capture, retries and reliable uploads

## 0.10.1 · 2026-09-29 · stable-login · Add optional server-held Google refresh tokens and device sessions

## 0.9.4 · 2026-09-29 · baseline · Record the existing Planner version
