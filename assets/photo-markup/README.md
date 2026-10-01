# Photo Markup Studio

A dependency-free, reusable photo editor for Neill Data Suite. It opens its own full-screen accessible dialog and keeps edits local until the user saves, downloads or shares a copy. It never changes the supplied image, uploads a file, adds a watermark or needs a third-party service.

Load `/assets/photo-markup.js`, then call:

```js
const studio = NDPhotoMarkup.open({
  source: photoFile, // File, Blob, image data URL, same-origin URL or blob URL
  filename: photoFile.name,
  maxDim: 2560, // Optional long-edge cap; clamped to 320–4096, never upscales.
  onSave: async result => {
    // Integrators choose where a new copy belongs. The studio does not upload.
    const annotatedFile = new File([result.blob], result.filename, {
      type: 'image/png'
    });
    await attachNewPhotoCopy(annotatedFile, result.annotations);
  },
  onClose: () => photoButton.focus()
});

if (await studio.ready) {
  // Image has loaded and the canvas is ready. No extra action is required.
}
```

`open` returns immediately. `ready` resolves to `true` after loading or `false` after failure or closing during loading. Image errors are shown inside the editor. A second concurrent studio is rejected; reuse or close the current one first. `onSave` is optional. When present, a **Save copy** button awaits the callback and preserves the edits if the callback rejects. Successful saving keeps the editor open. **Download PNG** is always available; **Share PNG** appears when the browser supports sharing files. PNG preparation happens before the share click to preserve mobile user activation.

The callback receives:

```js
{
  blob: Blob, // Flattened image/png containing the photo and all saved marks.
  filename: 'photo-annotated.png',
  width: 2560,
  height: 1707,
  annotations: {
    schemaVersion: 1,
    width: 2560,
    height: 1707,
    items: [{
      type: 'arrow', // arrow | freehand | rectangle | circle | text | measure | redact
      color: '#ffde59',
      width: 19.2,
      fontSize: 80,
      points: [{ x: 200, y: 300 }, { x: 600, y: 700 }]
      // text: '2.4 m' is included for text and measurement labels.
    }]
  }
}
```

All coordinates, widths and font sizes use the working/exported image's pixel dimensions. Rectangle, circle and redaction points are opposite corners; circles can be elliptical. Freehand uses a sequence of points. Measurement values are supplied labels, not calibrated distances. Labels are plain text, limited to 160 characters, and drawn onto the image. Long labels fit the image bounds.

## Controller methods

- `await studio.exportPNG()` returns the same result shape without triggering the callback, download, share, or marking the editing session as saved. It exports committed annotations even while viewing the original. It rejects before loading or after closing. Finish a draft before calling this method if that draft should be included.
- `studio.getAnnotations()` returns independent, serializable metadata for committed annotations. Call after `ready` succeeds for valid image dimensions. Importing this metadata into a future session is not currently supported.
- `studio.close()` closes if there are no unsaved changes, otherwise displays an inline discard confirmation. It returns whether closing happened immediately.
- `studio.close({ force: true })` discards unsaved changes without prompting. Use only after an explicit discard or completed integration flow. Closing is blocked while a save/share is in progress, even with `force`; call again after completion.
- `NDPhotoMarkup.isSupported()` checks basic browser canvas support.

## Interaction and constraints

Arrow, freehand, rectangle, circle, text, measurement callout and solid-black redaction tools support pointer, pen and touch input. Keyboard users can focus the canvas, move a cursor with arrow keys (Shift moves faster), and press Enter or Space to start and finish a shape. For freehand, each arrow-key move extends the path. Text opens an inline form. Ctrl/Command Z undoes; Shift Ctrl/Command Z redoes. Escape cancels the active draft/form, then asks before discarding unsaved edits. Focus stays within the dialog and returns to the invoking control on closing.

Undo and redo store up to 100 changes. Clearing requires confirmation and is undoable. **Original** temporarily shows the resized source without marks; exports still contain committed markup. Redaction paints opaque black pixels into the exported PNG; the source file itself still contains the original information. Keep the original and the exported copy clearly distinguished when integrating with job records.

Files are limited to 30 MB and decoded images to 100 megapixels. The working copy defaults to a 2560-pixel long edge; the maximum configurable cap is 4096. Browser-supported formats include common JPEG, PNG and WebP photos; HEIC support depends on the browser and unsupported files show a conversion suggestion. Same-origin URLs are accepted; cross-origin URLs and non-image data URLs are rejected. Tainted-canvas failures receive a local-file suggestion. The editor does not load additional services or external dependencies.

Suggested integration: provide an **Annotate copy** action beside a Planner or Upload photo, pass a locally available Blob, and attach the callback's image as a new record with its original photo ID. Apply any existing watermark policy in the host's normal save pipeline, preserving the source and its watermark. Do not silently replace the original Drive file.

## Verification

Run `node --test assets/photo-markup.test.cjs` for resolution limits, geometry, history, immutable export metadata, label serialization and safe download names. Browser verification should include a mobile-sized viewport, drawing all seven tools, undo/redo and clear, PNG export, callback failure, original viewing, keyboard placement, focus trapping, and close confirmation. File sharing also needs a supporting device/browser.
