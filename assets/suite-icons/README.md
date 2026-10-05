# Neill Data Suite icon library

37 original geometric SVGs: 13 app identities and 24 interface symbols. These are proposed assets; this library does not replace any live favicon, manifest or app icon automatically.

App tiles share a dark rounded surface and a large functional glyph, using the existing `hub/apps.json` colours. Hub uses the suite teal and Checklist uses its completion green. The glyphs are designed to remain recognisable at 16–32 px. Review `preview.png` or `preview.svg` for the family at 16, 32 and 64 px.

## Use in an app

```html
<script src="../assets/suite-icons.js"></script>
```

```js
NDSuiteIcons.list();                       // fresh metadata objects for all 37 icons
NDSuiteIcons.list({ kind: 'app' });         // 13 app identities
NDSuiteIcons.list({ kind: 'ui', query: 'sync' });
NDSuiteIcons.svg('app-planner', { size: 48 });
NDSuiteIcons.svg('ui-download', { size: 20, title: 'Download SVG' });
NDSuiteIcons.svg('ui-check', { title: '' }); // decorative beside visible text
```

`svg(id, {size, color, title})` returns inline SVG markup. Unknown IDs throw `RangeError`. The default size is 24 px; numeric sizes are constrained to 8–1024 px. A provided `color` overrides the glyph only, preserving an app tile's dark background. Hex, simple named and numeric RGB/HSL colours are accepted; CSS URLs, variables and markup are rejected. Use `currentColor` to inherit text colour. The default accessible title is the icon label. Titles are escaped and a blank title produces `aria-hidden="true"`. SVGs have no external resource, script or font dependency.

Metadata contains `id`, `label`, `kind` (`app` or `ui`), `color`, `file`, `recommendation` and `tags`. `file` is a repository-root-relative path. Use `'/' + icon.file` when constructing a URL inside a nested app. `catalog.json` also works without JavaScript.

## Downloads and recommended rollout

- `apps/{name}.svg`: scalable app tile suitable for a favicon and image element.
- `apps/{name}-32.png`: fallback small browser icon.
- `apps/{name}-180.png`: Apple touch icon.
- `apps/{name}-192.png` and `apps/{name}-512.png`: ordinary PWA icons. **These are not maskable icons:** the glyph layout has not been designed for the smaller maskable safe area.
- `ui/{name}.svg`: 24 px utility icon. Inline SVG inherits `currentColor`; an external `<img>` does not inherit a parent's text colour. Use `svg()` when colour should follow the interface theme.

| App | Glyph | Existing destination to review |
| --- | --- | --- |
| Hub | Four destinations | Hub browser icon and launcher |
| Planner | L-shaped floor plan, entrance gap, three placed nodes | Hub tile (**in use**, 1.2.0); `planner/favicon.svg` and PWA icons |
| Upload | Site photo dropping into a job folder | Hub tile (**in use**, 1.2.0); `upload/favicon.svg` and PWA icons |
| Search | Lens framing a house (find a job by name or address) | Hub tile (**in use**, 1.2.0); `search/favicon.svg` and PWA icons |
| Quote | Torn-off quote docket with a price mark (Quote brand cyan `#31d0ff`) | Hub tile (**in use**, 1.2.0); `quote/favicon.svg` |
| Timesheet | Clock | Browser, Apple touch and PWA icons |
| SWB | Enclosed bolt | Hub tile (**in use**, 1.2.0); `swb/favicon.svg` and PWA icons |
| Fit-off | Completion mark | Hub tile (**in use**, 1.2.0); `fitoff/favicon.svg` |
| Checklist | Paired checks | Checklist browser icon |
| Assets | Stacked layers | Hub tile (**in use**, 1.2.0); Assets showroom browser icon |
| Company | Team | Hub tile (**in use**, 1.2.0); `company/favicon.svg` |
| Website | Globe | Root public-site favicon |
| ICO Generator | Stacked navy icon tile with name/version lines | `ico/favicon.svg` and hub tile (**in use**, 1.1.0) |

Hub tiles for Planner, Upload, Search, Quote, SWB, Fit-off, Assets and Company point at `/assets/suite-icons/apps/<name>.svg?v=<library version>` through `hub/discover.json` "overrides" (an override `icon` beats the page favicon, so without it the hub shows each app's own `favicon.svg`). Timesheet keeps its own icon; ICO's favicon already is its suite icon. Bump the `?v=` there when the art changes. The apps' own favicons and PWA icons are unchanged.

Update each app's actual link/manifest references deliberately and update `hub/apps.json` in the same rollout. Check pinned/install icons on a real device because browser and operating-system caches may retain previous artwork. Utility `qr` is a decorative QR symbol, not a scannable code generator. `measure` is an interface symbol, not a calibrated measurement tool.

## Rebuild and verify

```sh
node assets/suite-icons/build-assets.cjs
node --test assets/suite-icons.test.cjs
```

SVG/catalog generation uses only Node built-ins. PNG generation uses an existing `sharp` installation; optionally set `ND_SHARP_PATH` to its absolute module path. No dependencies are added to this repository. All exported art is defined in `assets/suite-icons.js`; regenerate exports after changes.

Provenance: original artwork created for Neill Data Suite, October 2026 (ICO Generator icon added 2026-10-06, library 1.1.0; Planner, Upload, Search and Quote redrawn 2026-10-06, library 1.2.0). No third-party icon collection, font or copied artwork is included.
