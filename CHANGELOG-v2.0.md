# Neill Data Suite v2.0 — Changelog & Field Checklist
**Slices 0–5 complete.** Work by Cowork sessions against the two spec docs (Suite Rework v2 Handoff + NeillPlanner Structure v1.0). 175+ unit tests green across the shared layer.

---

## PART 1 — WHAT CHANGED

### The shared layer (`/shared/` — new)
| Module | What it does |
|---|---|
| `nd-config.js` | Every API key, client ID, sheet ID, folder/tab name in ONE place. Your new restricted keys are a 2-line swap in the `keys` block. |
| `nd-auth.js` | Sign in once, suite-wide. Shared token in localStorage, silent renewal ~5 min before expiry, re-check when you return to a backgrounded app, cross-tab pickup. |
| `nd-cache.js` | IndexedDB stale-while-revalidate cache (floor plans, Search index, Quote price CSVs). |
| `nd-queue.js` | Timesheet's proven offline queue, generalised: per-app, 1s debounce, 30s retry, flush on reconnect. |
| `nd-sheets.js` | Sheet writes are upsert/delete **by row ID only**. No clearTab exists. Writes route through the queue. |
| `nd-ui.js` + `nd-core.css` | Shared skeletons (Quote's, pixel-identical), action toasts (Undo), type-to-confirm dialogs, lightbox (high-res regex FIXED), sync chip, settings accordion, batch-fill, recents feed. |
| `nd-match.js` | Search's fuzzy engine extracted verbatim (weights frozen by test). `normalize()` is the one canonical address key everywhere. |
| `nd-inbox.js` | The unified Inbox: 24-column schema, lifecycle UPLOADED→UNFILED→FILED_TO_PROJECT→FILED_TO_NODE, all writes keyed by Drive File ID. |
| `nd-pwa.js` + per-app sw/manifest/icons | Every app installable, shell works offline. v2 SW strategy: deploys land on next load (the frozen-cache bug is fixed). |
| `vendor/exifr.umd.js` | EXIF/GPS/HEIC parsing (MIT, 75KB, vendored so it works offline). |

### Upload
- **Sticky batch header** — Address/Type/Room/Location typed once; per-field All/Each toggles; rows grey out when inherited; copy-to-all kept.
- **EXIF auto-location** — GPS read on selection, ONE geocode call per site, header auto-fills when all photos agree ("📍 Detected" chip). Never blocks.
- **HEIC end-to-end** — previews from embedded thumbnails, typed placeholder if undecodable, GPS still read.
- **Floor-plan toggle** — one per address group (auto-clears the previous + toast), plans skip Type validation, named `FloorPlan - <address>`.
- Uploads write **Inbox rows (UNFILED)** + full appProperties; dedup checks the whole ledger, not just the Batch folder.
- VIC lock now asks **"Save anyway / Fix"** instead of silently failing.

### Planner
- **Delta sync replaces the clobber.** One node edit = a couple of keyed writes ~1.5s later, not a six-tab rewrite. First run seeds from the sheet (no mass rewrite on upgrade). Full rewrite survives only as danger-zone "Rebuild master sheet" (type REBUILD).
- **Sync chip** in the top bar (green/amber/red, tap = sync now).
- **Photo import**: 3-minute poll gone → imports on focus/return (15s throttle) + after own uploads + manual button.
- **Create job from upload banner** — unfiled address groups offer Create job / Not now / Never. Create pre-seeds project + Ground floor, puts the tagged plan straight on the floor, moves photos in, opens the tray.
- **To be sorted tray** — sort to node, dismiss to batch, **auto-create node from room label** (tidy stack above the plan), auto-create-all. "To sort (n)" chip in the header.
- **Undo** on node/room/floor delete (Drive trash deferred until the toast expires).
- All 11 blocking confirms → non-blocking dialogs; Format/Wipe need typed FORMAT/WIPE.
- Settings: nine-button row → labelled rows + red **Danger zone**.
- **Projects fuzzy search** (name/address/node/room) + Recent project chips.
- **Node markers scale with the plan** on mobile (34px override deleted; ~2% of plan width, resize multiplier untouched).
- **Floor plans moved to IndexedDB** (≤2000px working copy, auto-migrated out of localStorage).
- Planner's own uploader feeds the unified pipeline; old Bulk Photos migrate to the Inbox once, legacy structures now read-only.

### Search
- Reads the **Inbox tab** (not Batch scrape + Upload Log). Sees FILED_TO_PROJECT files too.
- **Cached warm boot** — real data instantly on second open, silent refresh after.
- Moves graduate the Inbox row to FILED_TO_NODE; deletes clean it up.
- **Lightbox high-res finally works** (shared viewer, the `/=s\d+$/` fix).
- Match engine now the shared copy — behaviour identical, weights test-frozen.

### Timesheet
- **"+ Add shift"** — on every day card + floating +. Fix a missed day in under 20 seconds. Flagged `entry_method: manual`.
- AI-prompt copier removed. CSV import kept.
- **3 tabs** (Clock · History · Settings) — export is a collapsible panel at the bottom of History.
- **Send without leaving the app** — one tap → backend → "Sent ✓". Mail-app fallback kept. **Send-day nudge** card on the clock screen.
- Today chip, fortnight/period totals + last-4-weeks strip, **break minutes** (0/30/60 chips + settings default; old sessions still read as 30).
- Settings → collapsed accordions that remember what you leave open; danger items separated.
- Now on shared suite auth + the self-updating service worker.

### Quote (§0.3 respected — nothing visible changed outside Settings)
- **Stays unlocked all day** (14h session, silent background re-verify; locked accounts still kicked).
- Writes (save/status/delete/favourites) **queue when offline** and replay on reconnect.
- Price syncs fall back to the last good copy in a signal black spot.
- Skeleton now consumed from the shared library (pixel-identical).
- **Settings tab**: collapsed by default, remembers open sections, 44px full-width inputs, no side-by-side cramp on phones, keyboard-aware, danger cards tinted.

### SWB
- Shared suite auth (sign in anywhere, SWB follows).
- **Batch fill: copy devices from another circuit** in the circuit modal.
- Engine + tests untouched (still the model).

### Hub
- **Registry, not crawler** — `apps.json`, no GitHub API, no rate limits, no junk. Fuzzy filter.
- **"Continue where you left off"** — recent Planner projects (deep-linked), shifts, uploads.

### Site
- `404.html` (ND-styled, home + phone). Junk files deleted. Old skeleton/lightbox/queue copies consolidated.

---

## PART 2 — CHECKLIST BEFORE MOVING ON

### Deploy
- [ ] Deploy the slice5 zip to GitHub Pages
- [ ] Open **each app once** so the new service workers take over (planner, upload, search, quote, timesheet, swb, hub)
- [ ] If any app looks stale: DevTools → Application → clear site data for that path, reload

### Suite-wide (§11 acceptance)
- [ ] Sign in once (any app) → open Planner, Upload, Search, SWB, Timesheet — **zero further prompts**
- [ ] Refresh a tab mid-session → still signed in; still signed in 2+ hours later
- [ ] Install one app to your phone home screen → opens full-screen, shell loads in airplane mode

### The big field test (the round-trip killer)
- [ ] On site, location ON: take photos incl. one of the floor plan
- [ ] Upload: address auto-fills from GPS ("Detected" chip), HEIC previews show, flag the plan, upload
- [ ] Master sheet: **Inbox tab** exists with UNFILED rows
- [ ] Open Planner: banner offers the job → Create job
- [ ] Plan is already on the Ground floor; tray opens with the photos
- [ ] Photo tagged "Bedroom 2" → Auto-create node → node appears above the plan, photo attached
- [ ] Airplane mode: take/upload flow queues gracefully, Quote still opens and saves

### Planner
- [ ] Edit ONE node → master sheet row updates in ~5s; DevTools network shows a handful of calls, not dozens; chip goes amber→green
- [ ] Markers on your phone at 375px: same proportion as desktop; pinch-resize still works
- [ ] Delete a node → tap Undo → it's back (sheet too)
- [ ] Settings → Danger zone: Rebuild needs typed REBUILD; Format needs typed FORMAT
- [ ] Search field on Projects finds by address/node/room; Recent chips appear after opening projects
- [ ] localStorage is small now (plans in IndexedDB) — a "migrated floor plans" toast may appear once

### Search
- [ ] Second open shows data instantly, then refreshes
- [ ] Lightbox opens **sharp** (high-res), not the blurry thumb
- [ ] Move a file to a node → its Inbox row flips to FILED_TO_NODE

### Timesheet
- [ ] Add a manual shift for last Tuesday → done in <20s → totals/OT correct
- [ ] Check the sessions tab in Timesheet-Data: `break_minutes` + `entry_method` columns populate (if the sheet pre-dates this update, add those two headers to the sessions tab once) — same for `last_visit` on jobs
- [ ] Send Timesheet → "Sent ✓" **(requires #36 below first)**
- [ ] On your send day with unsent hours: nudge card appears on the clock screen

### Quote
- [ ] Unlock once → close → reopen later same day → **no passcode prompt**
- [ ] Settings on your phone: accordions, no cramped fields
- [ ] Everything else pixel-identical to before

### Hub
- [ ] Loads instantly, six apps, no "discovering" spinner
- [ ] After opening a Planner project: it appears under "Continue where you left off" and deep-links back

### Your three admin tasks
- [ ] **#36** Apps Script: paste `timesheet/apps-script-sendTimesheet.gs` into the Quote backend project, merge the doPost branch, deploy new version (I can walk you through it in Chrome)
- [ ] **#35** New referrer-restricted API keys → swap in `shared/nd-config.js` `keys` block → deploy → delete old keys
- [ ] Tell me the destination repo for `battleship/` and I'll cut it over

### Deliberately NOT done yet
- **#34** Hard-delete of Photo-Allocation + Bulk Photos — parked until the migration has survived one release in the field (your call when).
