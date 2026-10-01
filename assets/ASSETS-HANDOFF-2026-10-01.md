# Neill Data Suite — assets handoff and remaining ideas

Date: 2026-10-01. Local base: `075737961fd02cdbc862957cb8eef2216df23140`, including Planner 0.18.5's cross-device floor-plan changes. Work locally; Ray handles upload/review/deployment. No GitHub access or production data writes were used for this work.

## Delivered in this update

- `/assets/studio/`: working photo editor launcher, symbol gallery/legend builder, and icon gallery. Linked prominently from the existing Assets showroom.
- `photo-markup.js`: original-preserving image annotation, seven tools, undo/redo, keyboard and touch input, original preview, flattened PNG download/native share, async save callback and annotation metadata.
- `trade-symbols.js` plus `trade-symbols/`: 36 original symbols across six trades; individual SVGs, sprite, catalogue, printable HTML/SVG legends and Planner-compatible CSV.
- `suite-icons.js` plus `suite-icons/`: 12 distinctive app identities and 24 matching interface icons, individual SVGs and 48 app PNGs. The Assets showroom/Studio use the new Assets favicon; other app replacements are candidates for a later app release.
- `downloads/`: ready-to-use symbol and icon ZIP packs.
- Usage guide: `assets/STUDIO-README.md`. Individual modules include focused tests and further API documentation.

These are reusable, functioning Assets tools. Adding markup buttons to Planner/Upload/Quote and rendering symbol artwork on plan nodes are separate integration changes; neither data schema nor existing customer photos were changed for the library release.

The additional mobile PDF/Drive recovery request is tracked in Planner's changelog and the delivery report at the workspace root. Keep that fix when integrating these assets.

## Next integration work

1. **Photo markup in Planner first.** Add an Annotate action on a selected photo; fetch through the existing authenticated Drive image path and pass a Blob to the editor. Save the result through the existing reliable photo queue as a new attachment, retaining original file ID, capture metadata and an `annotatedFrom` relationship. Never overwrite the source or classify an annotated file as a newly taken on-site photo. Apply watermark policy once, after drawing, without duplicating an existing strip. Acceptance: original survives, output appears as a second attachment, failed saves remain editable/retryable, retries do not duplicate attachments, iPhone Share works. Then adapt Upload and Quote.
2. **Symbol choices in Planner.** Add an optional stable `symbolId` to a future versioned node/category schema, preserve old shorthand/category behaviour, and render the same symbol in normal/zoomed/printed views. Do not silently reinterpret existing item names. Acceptance: imported old jobs look unchanged; selected symbols stay legible at each node size and appear correctly in exported legends. Category CSV currently supplies names/codes/colours/shorthands only.
3. **Favicon rollout.** Prioritise Planner, Quote, Timesheet, Fit-off, Upload and Search: functional shapes distinguish tabs and home screens better than repeated ND letters. Replace browser SVG, Apple touch PNG and manifest PNGs in one change per app; bump app version and precache version/references. Verify 16/32px contrast and installed iPhone PWA refresh. The library's normal PNGs must not be advertised as `purpose: maskable` without dedicated safe-zone variants.

## Remaining ideas to build

### 1. Completion / evidence checker — highest practical priority

**Purpose:** Show exactly what still prevents a job handover, with tappable items such as missing photos, unfinished locations and missing descriptions.

**Reuse:** Planner's current missing-photo indicator and node statuses, `status-wheel.js`, category data. Introduce a pure rules module plus a UI card; evaluate local data without changing records. Make rules configurable by job/category so a photo is not assumed mandatory everywhere.

**Acceptance:** Counts are correct for completed, incomplete, N/A and deleted items; each warning opens its target; pending/offline data is labelled; dismissing the card cannot mark work complete. Checklist data is currently device-local—do not claim suite-wide evidence until an explicit data bridge is built.

### 2. Client handover pack

**Purpose:** Produce a branded client document containing site details, bare/annotated floor plans, symbol legend, installed equipment, selected photos and outstanding work.

**Reuse:** Planner's existing report/PDF path, logo asset, new symbol legend and image exports. `doc-invoice.js` covers invoice/payslip shapes; it is not a full site-report engine. Start with a Planner-only pack, then integrate other apps through defined job IDs and adapters.

**Acceptance:** Preview and export match; long lists repeat table headings and paginate; the source/capture date and annotated-copy status remain clear; missing images have visible explanations; each floor appears once; open items cannot disappear silently; direct download/Drive save/iPhone Share all work. A sign-off field must only reflect actual recorded approval.

### 3. Before-and-after viewer

**Purpose:** Pair two photographs of the same location with a draggable divider, dates, labels and a report-friendly side-by-side export.

**Design:** Store an explicit relationship between file IDs; do not infer a pair solely from time/name. Support touch and keyboard divider controls, different image proportions and fallback when one image is offline/unavailable. The photo editor's Original toggle is only for an editing session and does not implement this asset.

**Acceptance:** Pair/reverse/unpair leaves source images intact; keyboard and touch comparison work; no forced crop hides relevant evidence; printable view identifies both images and dates.

### 4. Universal job card

**Purpose:** Carry site context between Planner, photos, quotes and time records, showing progress and outstanding work.

**Prerequisite:** Audit IDs and ownership across apps; define a stable job link/resolver and app adapters. Address matching is a suggestion, not authority to merge two jobs. Reuse Hub recents, `nd-match` and `job-locator` where appropriate.

**Acceptance:** Links open the intended job; two jobs at the same address stay distinct; missing/unavailable apps are handled; signed-out or unauthorised users do not see protected data; recently cached values show their age. Never add OAuth tokens or session credentials to URLs.

### 5. QR field labels

**Purpose:** Print labels for rooms, boards and device locations that open the related job/record on a phone.

**Prerequisite:** Stable authenticated routes. Planner already has project links; node-level routing/resolution needs explicit support. QR contents should contain an opaque record URL, with authentication/access checks at the destination.

**Acceptance:** Scans work from the printed small label; sufficient quiet zone/contrast; label text identifies the device without the scan; deleted/moved records fail clearly; shared photos remain protected. Print preview and a paper scan check are required.

### 6. Offline readiness panel

**Purpose:** Explain which plans/photos/records are available on this device, which files are waiting to upload, and which operations need connectivity.

**Reuse:** Queue events, `nd-cache`, existing sync fill/tube, Drive plan/photo caches and new offline/sync icons. Report actual cache and queue state, not just `navigator.onLine`.

**Acceptance:** A network connection with failed API calls is not displayed as synced; expired auth is distinguished from offline; pending uploads survive reload; a plan link without downloaded bytes is not “ready”; cache eviction and quota errors update readiness. “Prepare this job” should be explicit and show download size/progress, with cancellation and no remote writes.

## Optional supporting content

- A synthetic sample job pack: two floors, example categories/photos/checklist rows and a sample quote, clearly marked fictional. Useful for onboarding and repeated regression testing.
- Short worker onboarding cards: install the PWA, add a photo, mark it up, find a job, verify sync and export a report. Capture screens from the actual release.
- A photo capture guide covering wide/context/detail shots and readable equipment labels. It can be presented beside the camera tool without changing upload behaviour.

## Release and verification notes

All source is local and ready for Ray's review; publication is not part of this delivery. No new production dependencies or vendor licence changes are required by the new assets. New production files must be added to app service-worker shells when an app starts using them. Respect each app's versioning rule: feature bumps the middle digit and resets the last digit to 1; fix bumps the last digit. Check the current version again at merge.

Before deployment, verify on a real iPhone: photo selection/orientation, controls with keyboard open and landscape rotation, PNG save/share, selected symbol legend printing, and home-screen favicon updates after rollout. Desktop Chromium/mobile emulation was used locally; no live account/Drive integration or physical iPhone was available in this session.
