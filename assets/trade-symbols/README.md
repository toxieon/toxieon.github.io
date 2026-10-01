# Neill project symbols

36 original SVG symbols for Neill Data Suite plans, photo annotations, schedules and reports. They share a 24 × 24 grid, rounded 1.7-unit strokes, and no fonts or third-party dependencies. Black exports remain legible in print; inline symbols inherit `currentColor` for light and dark interfaces.

These are **project identification symbols**, not a claim of compliance with drafting standards or electrical codes. Keep the supplied legend with exported plans. A symbol identifies equipment or a location; it does not specify installation, ratings or wiring requirements.

## Downloads

- `<id>.svg`: one accessible black SVG per item; scales without losing detail.
- `sprite.svg`: all symbols as `nd-trade-<id>` SVG symbols.
- `catalog.json`: metadata, category colours, short codes and paths.
- `legend.svg`: a single black-and-white reference sheet suitable for printing.
- `legend.html`: accessible table legend; open in a browser and print or save as PDF.
- `planner-categories.csv`: all 36 items in the existing Planner category import format.

## Browser API

Load `assets/trade-symbols.js` from the site root. The script has no external dependencies, storage or network calls. It also exports the same API through CommonJS for tests and artifact generation.

```html
<script src="/assets/trade-symbols.js"></script>
```

```js
NDTradeSymbols.version; // "1.0.0"
NDTradeSymbols.categories(); // [{ id, label, color }, ...]

NDTradeSymbols.list({ query: 'fibre', category: 'data' });
// [{ id, label, category, shorthand, description, color, code, file }, ...]

document.querySelector('.symbol').innerHTML = NDTradeSymbols.svg('wireless-ap', {
  size: 32,
  color: 'currentColor',
  title: 'Wireless access point in reception'
});

const chosen = ['wireless-ap', 'data-double', 'rack'];
const printableHtml = NDTradeSymbols.legend(chosen, { title: 'Ground floor — project legend' });
const plannerCsv = NDTradeSymbols.categoryCsv(chosen);
```

`list()` returns fresh metadata objects in catalogue order. Search is case insensitive across the ID, label, category, shorthand and description. Category IDs are `data`, `cctv`, `access`, `security`, `electrical` and `containment`. Omit a category or use `all` to search every category. Unknown categories return no results.

`svg(id, options)` returns markup for a known ID or an empty string for an unknown ID. The default size is 24; finite sizes from 8 to 512 are accepted. Colour accepts a hex colour, an alphabetic CSS colour name or `currentColor`; other values fall back to `currentColor`. Titles are escaped, with the item label used by default. Pass `title: ''` when adjacent text already labels a decorative icon. SVG paths come only from fixed local geometry.

`legend(ids, options)` returns a **complete HTML document** with black symbols, item descriptions, categories, shorthand codes and print styles. Save it as an `.html` file or present it in a dedicated print window/document. The title is escaped. It contains no scripts and does not invoke printing automatically.

`categoryCsv(ids)` returns UTF-8 text with CRLF lines and the header `Item,Code,Description,Color,Shorthand`. Commas, quotes and newlines are CSV-escaped. Codes use the stable `ND-` prefix; shorthand values are unique and at most four characters. Import these rows into the intended Planner category using its existing category CSV editor. This adds catalogue line items; it does not install custom SVG pin rendering in Planner. To create separate category imports, filter first:

```js
NDTradeSymbols.categoryCsv(NDTradeSymbols.list({ category: 'data' }).map(item => item.id));
```

For legend and CSV exports, omit `ids` or pass `null` for all symbols. An array selects those IDs in the requested order; duplicates and unknown IDs are ignored. A single string selects one symbol; an empty array produces an empty legend/header-only CSV. Other input types produce an empty selection. Returned metadata can be changed without modifying the library.

## SVG sprite

```html
<svg viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="Double data outlet">
  <use href="/assets/trade-symbols/sprite.svg#nd-trade-data-double"></use>
</svg>
```

Set CSS `color` on the outer SVG to change the stroke. The sprite uses same-origin references; for offline exported documents use the inline API or individual files so no external reference is required. Give the containing SVG a label or mark it `aria-hidden="true"` when decorative.

## Updating and verification

The canonical metadata and hand-authored geometry live in `assets/trade-symbols.js`. Update that source, then run from the repository root:

```sh
node assets/trade-symbols/build-assets.cjs
node assets/trade-symbols.test.cjs
```

The generator writes only this library's individual SVGs, sprite, catalogue, CSV and legends. Tests cover IDs and shorthand uniqueness, escaped titles, unsafe colour/size handling, exported metadata, filtering, Planner CSV and consistency between source and downloads.

## Provenance and licensing

Created as original SVG artwork for the Neill Data Suite asset library, October 2026. Geometry is authored in this repository; it is not copied from an icon pack, standards publication or manufacturer. No external font, brand mark or image asset is embedded. These files carry the same usage terms as the Neill Data Suite project; this library introduces no separate third-party license or attribution dependency. Include a project legend when sharing drawings to make the intended symbol meanings clear.
