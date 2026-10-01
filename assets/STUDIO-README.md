# Neill Asset Studio 1.0.0

Open `/assets/studio/`, or use **Asset Studio** at the top of the existing `/1234567890/` Assets showroom. The page has three collections: photo markup, trade symbols, and favicons/interface icons. It uses local scripts and styles with no external services or account requirement.

## Photo markup

Choose or drop an image, or try the included original sample illustration. Tools: arrow, freehand, rectangle, ellipse, text, user-entered dimension callout, and solid black redaction. Colour, line width, undo/redo, original preview and guarded clear/close are available. Export creates a flattened PNG copy; the source is unchanged. The Studio's **Save copy** displays an exported preview below the launcher. **Download PNG** saves immediately. **Share PNG** uses native file sharing where available.

The editor does not upload to Drive or store the source image. A working copy is capped at 2560 pixels on its longest side by default. Unsupported HEIC/HEIF files produce an error; choose JPEG/PNG if the browser cannot decode them. The dimension tool labels values you enter; it does not infer scale or calculate a distance.

```html
<script src="../assets/photo-markup.js"></script>
<script>
async function annotate(file) {
  const editor = NDPhotoMarkup.open({
    source: file,
    filename: file.name,
    onSave: async ({ blob, filename, annotations }) => {
      // Save as a NEW attachment using the host app's upload queue.
      // Retain the source file ID and record the relationship in host data.
      // Throw on failure so the editor retains its unsaved state.
    }
  });
  const loaded = await editor.ready; // true on load, false on failure/early close
}
</script>
```

`source` accepts a File/Blob, image data URL, same-origin URL or blob URL. A host should pass authenticated Drive image bytes as a Blob. The controller has `ready`, `exportPNG()`, `getAnnotations()` and `close({force})`. Annotation JSON accompanies exports for host storage; importing/re-editing that JSON is not implemented. Full API and keyboard instructions: [photo-markup/README.md](photo-markup/README.md).

## Trade symbols

36 original project symbols cover data/networking, CCTV, access, security, electrical and containment. Search and filter; select any subset, then print/download an HTML legend or export a Planner category CSV. Selection survives filtering. Individual SVGs are black for print; the runtime renderer inherits text colour.

```html
<script src="../assets/trade-symbols.js"></script>
<script>
const symbols = NDTradeSymbols.list({category: 'data'});
const icon = NDTradeSymbols.svg(symbols[0].id, {size: 24, title: symbols[0].label});
const legendHtml = NDTradeSymbols.legend(symbols.map(item => item.id));
const categoryCsv = NDTradeSymbols.categoryCsv(symbols.map(item => item.id));
</script>
```

The CSV matches Planner's existing `Item,Code,Description,Color,Shorthand` format. It adds reference rows through the current category editor; it does not enable SVG symbols on existing plan markers. Review/merge with existing category rows before saving—the editor replaces a category's contents. These are labelled Neill project symbols, not a certified standards catalogue.

Individual SVGs, sprite, catalogue, printable legends, build script and full documentation live under [trade-symbols/](trade-symbols/README.md). The [download pack](downloads/neill-trade-symbols.zip) includes the runtime and those files.

## Favicons and interface icons

12 app identities preserve the suite's app colours while giving each app a distinct shape. 24 interface icons cover annotation, navigation, photos, reports, QR, comparison and sync states. The gallery shows app previews at 16, 32 and 64 pixels, supports dark/light surfaces, and offers individual SVG and 192px PNG downloads.

The [icon pack](downloads/neill-suite-icons.zip) contains SVG originals and app PNGs at 32, 180, 192 and 512 pixels. The 180px files suit Apple touch icons; 192/512 are regular PWA icons. They are not maskable variants. Replacement recommendations and regeneration commands are in [suite-icons/README.md](suite-icons/README.md).

```html
<link rel="icon" type="image/svg+xml" href="../assets/suite-icons/apps/planner.svg">
<script src="../assets/suite-icons.js"></script>
<script>
const html = NDSuiteIcons.svg('ui-markup', {size: 24, title: 'Annotate photo'});
// Use title:'' for decorative icons beside a visible text label.
</script>
```

The new Assets identity is used by the showroom and Studio. Other app icons are delivered as candidates in the library; their live favicon/PWA references remain at the current release. Apply the matching manifest and service-worker changes together when rolling them out.

## Validation and delivery

Base: local commit `075737961fd02cdbc862957cb8eef2216df23140` (Planner 0.18.5). No additional production library dependencies or backend changes were introduced by Asset Studio. Original SVG geometry is stored as editable source; no third-party icon package was copied.

```powershell
node assets/photo-markup.test.cjs
node assets/trade-symbols.test.cjs
node assets/suite-icons.test.cjs
```

Desktop Chromium and mobile touch/portrait/landscape emulation cover the editor, flattened export, discard guards, galleries and downloads. A physical iPhone Safari/PWA check remains necessary for native Share/Save behaviour. The Studio has no service worker of its own; it makes no offline-installability claim. No existing app precaches the changed showroom or these new assets.

The remainder of the ideas and proposed integration work are in [ASSETS-HANDOFF-2026-10-01.md](ASSETS-HANDOFF-2026-10-01.md).
