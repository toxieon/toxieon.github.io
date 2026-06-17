# SWB v2.0 — Build Status

What's in this `swb_v2/` folder, what's done and tested, and what's left. I worked the rework in dependency order and front-loaded the parts I could **prove correct** (the calculation engines) before the UI-heavy parts that need a live browser + Google session to build and verify safely.

> ⚠ SWB stays a **design aid**. Every max-demand, cable-selection and circuit-split output is advisory and must be verified and certified by a licensed electrician against AS/NZS 3000. This applies regardless of the `verified` flags in the sheet.

---

## Files

| File | What it is |
|---|---|
| `swb_engine.js` | The v2.0 calculation engine — AS/NZS 3008 cable engine + AS/NZS 3000 App.C (C1/C2) max-demand engine. Pure, dependency-free, data-driven. Used by both the app and the tests. |
| `swb_engine.test.js` | Node test harness. Feeds the engine the **real** AS/NZS 3008 data and checks it against the Standard's own worked examples. **20/20 pass.** |
| `app.js` | The reworked app (v2.0). Syntax-validated. Integrations described below. |
| `index.html` | Loads `swb_engine.js` before `app.js`; cache-bust bumped to 2.0.0. |
| `styles.css`, `favicon.svg` | Unchanged from v1. |
| `SWB_SheetBuild_Kit.gs` | Paste-&-run Apps Script that creates the `LoadGroups` + `Dev_*` tabs the engine reads. Idempotent; never clobbers existing tabs. |
| `reference_data/*.csv` | The verified AS/NZS 3008 seed (same data that's now live in `ND_SWB_Reference`), used by the tests. |

Run the tests yourself: `cd swb_v2 && node swb_engine.test.js`

---

## Done and tested

**Engine (Sprint 5 cable + Sprint 4 max-demand mechanics).** `swb_engine.js`, 20/20 tests:

- CCC lookups resolve to the exact Table 4/8/10/11 values.
- Derating products match the Standard's appendix worked examples — including **0.80 × 0.82 = 0.656** and the **1.21** ambient factor verbatim.
- `I_Z` = base CCC × derating; coordination `I_B ≤ I_n ≤ I_Z` (AS/NZS 3000 Cl 2.5.3.1); the engine correctly flags a 20 A breaker on a derated 2.5 mm² as a **coordination fail**.
- Voltage drop = mV/A·m × I × L / 1000, vs the 5 % limit; cumulative down the run.
- Multi-segment runs: governing `I_Z` = **minimum** derated I_Z across segments (AS/NZS 3008 §3.4).
- Auto-fix returns the smallest compliant cable size.
- Max-demand rule mechanics: `pct_connected`, `largest_plus_pct`, `per_point`, `wpl_threshold`, consumer-mains rating.

## Done (integrated into app.js, syntax-validated, needs live browser to exercise)

- **Sprint 1 — schema v2.0 + migration.** `withV2Fields` normalises every device to the v2.0 shape (loadGroup, unit, voltage, phase, p.f., defaultValue); `inferLoadGroup` maps category/name → A–G/motor; `snapshotDeviceEntry` freezes defaults onto circuit entries; `migrateProjectTo2` upgrades 1.1 projects, snapshots, bumps schema, writes an audit-log line — hooked into `loadProjectFromSheet`.
- **Sprint 4 — max-demand engine wiring.** `assessBoardMaxDemand(boardId)` groups every connected load on a board by load group, applies the `LoadGroups` rules (read live from the sheet), and returns assessed demand + recommended main switch (per-phase for 3Ø). `loadGroupRulesMap` selects the column.
- **Sprint 5 — cable engine wiring.** `loadReferenceSheet` now reads `CableCCC / VoltageDrop / Derating / LoadGroups` and builds the engine index; `calcLoad` runs the AS/NZS 3008 block alongside the C9 deemed-to-comply check and reports the **worst case** in a `governing` field (breaker / ccc / coordination / voltdrop); `mapCableTypeId` maps the circuit's cable type to a reference id.
- **Sprint 9 — defaults + cleanup.** RCBO is the default breaker (RCD implied TRUE); the **Data point** device + Data/Comms category are removed from the load side; **15 A and 20 A single + double GPOs** added.
- **Sheet Build Kit.** `LoadGroups` + nine `Dev_*` tabs, seeded from the framework's worksheet examples, all numeric params `verified=FALSE` pending confirmation against AS/NZS 3000 C1/C2.

---

## Remaining (UI-heavy — build in the live environment)

These rewrite large `render()/bindEvents()` UI functions; they can't be meaningfully built or verified without a running browser + Google session, so I've left them with precise entry points rather than guess blind. The data + engine layers they depend on are already done.

- **Sprint 2 — input/focus refactor + typeable GPO qty.** Root cause: `render()` does `app.innerHTML = …; bindEvents()` on every state change (`render()` near the "Main Render" section), destroying focus. Fix: delegated `input`/`change` handlers on a stable parent; call `render()` only on structural change; patch the load badge / qty node in place (`updateQtyDisplay`). Replace the `device-qty-val` span with an editable number input flanked by −/+.
- **Sprint 3 — device library from Dev_* tabs.** The reader already stashes tab data; `renderDevicesView` needs a per-category accordion + override-on-select slider+number using the new `min/max/step/defaultValue` fields, writing back via the existing Sheets save path.
- **Sprint 6 — three-phase UI.** The engine and `assessBoardMaxDemand` are already 3Ø-aware (per-phase L1/L2/L3, worst-phase mains sizing). Needs per-phase bars, a balancing helper, and 3Ø device/circuit form fields + export.
- **Sprint 7 — auto-detection.** Variant grouping (same normalised name, different draw) on library load; advisory overloaded-circuit split using the engine's `governing` + `smallestCompliantSize` (already implemented).
- **Sprint 8 — settings import.** Three buttons in `renderSettingsView`: Copy AI prompt, Download example template, Upload template → parse → create project (Google Sheets, not xlsx).

---

## To bring it live

1. Run `SWB_SheetBuild_Kit.gs` from inside `ND_SWB_Reference` (Extensions ▸ Apps Script) to create `LoadGroups` + `Dev_*`.
2. Review the `LoadGroups` params against AS/NZS 3000 Appendix C (Tables C1/C2 + footnotes) and flip `verified=TRUE` per confirmed row — same discipline we used for the AS/NZS 3008 data.
3. Deploy `swb_engine.js` + `app.js` + `index.html` to `neilldata.com/swb` (confirm the redirect URI is registered for OAuth).
4. Tackle the remaining UI sprints in the live env, where each change can be clicked through immediately.
