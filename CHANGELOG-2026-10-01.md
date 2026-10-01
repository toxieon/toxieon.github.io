# Neill Data Suite — 1 October 2026

Prepared locally from `075737961fd02cdbc862957cb8eef2216df23140`. This is a review build, not a deployment. Planner is now **0.19.1**; the new Asset Studio is **1.0.0**. Quote, Checklist, Timesheet and Fit-off app versions remain unchanged because their application files were not changed.

## Assets and visual library

- New Asset Studio at `/assets/studio/`, linked at the top of the existing Assets showroom.
- Photo Markup Studio: arrows, freehand, boxes, circles, text, entered dimension labels, solid redaction, colour/width, undo/redo, original preview, PNG download/share and host save callbacks. Sources are preserved.
- 36 original trade symbols: networking/data, CCTV, access, security, electrical and containment. Search/filter, individual SVG downloads, selected legends, Planner category CSV, full catalogue and sprite.
- 12 distinctive app favicon identities and 24 interface icons. SVG originals plus 48 app PNGs at 32, 180, 192 and 512 pixels. Light/dark gallery previews and icon replacement recommendations.
- New Assets favicon applied to Studio/showroom. Other app favicons are provided as library candidates with matching PNGs; they have not been rolled out across the apps.
- Downloadable symbol and icon packs, integration guides, focused tests and a handoff for completion checks, client handover packs, before/after comparison, job cards, QR labels and offline readiness.

## Planner: mobile PDF and master reload

- Original PDF uploads publish the master-sheet association before optional render uploads; success messaging distinguishes linked records from pending sheet sync.
- Interrupted originals are retained locally for retry, including replacements that retain an existing Drive file ID. Pending device-only floors and attached room/node data survive cloud hydration.
- Master Reload scans the relevant Drive floor folders for known plan originals/render files, recovers missing associations, downloads fresh bytes and clears stale PDF/display/embedded-image caches after successful preparation.
- Associated rendered previews are a fallback when the PDF fails. Partial failures preserve the current device image and report the problem. Unrelated PDFs are not assumed to be floor plans; ambiguous candidates are not chosen automatically.
- PDF canvas size is bounded and render documents are released after use.

## Planner: room controls and exports

- Individual room title size: **1%–300%**, plus apply-to-floor sizing in the Plan side menu.
- Show/hide room title text while retaining the pin icons and their selection targets.
- Border and fill opacity in each drawn room's title drawer.
- Universal opacity multiplier in the Plan side menu: `effective opacity = room opacity × universal opacity`. Individual settings are retained; zero values are supported.
- Nearby shared-wall snapping with jagged-corner following, live drawing preview, an on/off control and safeguards against unrelated/ambiguous boundaries and self-crossing polygons.
- Export a room from its pin, optionally adding other rooms from the same floor. True to plan preserves relative placement; Side by side creates cropped panels at a common scale. Cutouts follow the room polygons rather than exposing full rectangular background sections.
- Optional room names, node markers, borders and fill in exports. PNG download/share and prepared PDF download/open/share.
- Planner version, visible app version, index query strings and service-worker cache updated together. New room geometry/export scripts are precached.

## Earlier updates already present in today's base

The existing Planner changelog is retained, including 0.18.5's cross-device plan-link fixes, 0.18.4's PapaParse/pica changes, 0.18.3's vendored PDF/export libraries, 0.18.2's licensing/EXIF/date fixes and 0.18.1's OpenSeadragon view. This build extends that updated local copy; it does not reimplement those releases. The separate three-library-upgrade handoff is not part of this request and has not been marked complete.

## Verification and user checks

Static JavaScript checks, diff checks, asset tests, room geometry/layout/opacity tests, plan-recovery regression tests, and the existing Planner photo/shorthand tests pass. The Asset Studio was checked earlier in desktop Chromium and mobile touch emulation, including drawing, redacted PNG export, downloads and gallery selection. Live Drive/multi-device and physical iPhone testing is left to Brandon as requested. Room controls/export UI still need his device acceptance check.

Read `assets/ASSETS-HANDOFF-2026-10-01.md` for the remaining ideas and integration plan, and `planner/RELEASE-CHECK-0.19.1.md` for the short device checklist.

## Added during review (Ned)

- Planner sign-in/reload now pushes unsynced local edits before reloading from the sheet (dirty records only, add-only on a never-synced device, other-account data never pushed, newer cloud edits win, partial failures merged and left pending). See planner/CHANGELOG.md 0.19.1.
- Fixed `pdf.destroy is not a function` in the new first-page PDF render (pdf.js 6), which broke Drive plan downloads.
- Not included from the review bundle: REVIEW-MANIFEST.json and REVIEW-README.txt (packaging notes only).
