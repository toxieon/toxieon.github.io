# NeillPlanner (Planner folder)

Drop this `Planner/` folder into the root of your GitHub repo. Once GitHub Pages is enabled, the live URL will be:

```
neilldata.com/Planner/
```

## Folder layout

```
Root/
  Planner/
    index.html       <- entry point (Google API key + OAuth Client ID are baked in here)
    app.js
    styles.css
    assets/
      floorplan.svg
```

Everything is co-located inside `Planner/` — no parent-folder references, no separate `config.js`. You can upload the folder as-is.

## What changed in this build

- Google API key and OAuth Client ID are now inlined directly inside `index.html` (in a `<script>` tag above `app.js`). No more external `config.js`.
- All assets live inside `Planner/` — the previous `<base href="../">` trick is gone.
- The static `Planner.html` and the lowercase `planner/` route have been removed.

## Security notes (important)

- The browser API key is **HTTP-referrer restricted** in Google Cloud — make sure the allowed referrers include `https://neilldata.com/*`, `https://www.neilldata.com/*`, and your local preview origins (`http://127.0.0.1:4173/*`, `http://localhost:4173/*`).
- The OAuth **Client ID** is a public identifier by design. It is safe to include in client-side code.
- The OAuth **Client SECRET** must **never** be placed in this folder. If you ever need server-side OAuth flows, that work happens in a real Next.js backend, not on GitHub Pages.
- GitHub Pages is **public** — anyone who guesses the URL can load the page. The `noindex,nofollow` meta tag helps with search engines but is not access control. Do not upload real client photos or sensitive project data until proper auth is wired in (Cloudflare Access, Vercel auth, Firebase Hosting + Google Auth, etc.).

## Google Drive folder structure (create these manually for now)

```
NeillPlanner/
  Admin Files/
  Projects/
    HQ Fit-out/
    Apartment Builds/
    Service & Maintenance/
    Unfiled Projects/
```

When the real backend is wired, the app will create per-project / per-floor / per-node subfolders automatically using `files.create` with `mimeType: application/vnd.google-apps.folder`.

## What this prototype includes

- Project dashboard with colour-coded project folders (for large builds like apartment blocks).
- Interactive floor plan with zoom, pan, filtering, and tappable status nodes.
- Node create / edit modal and node detail drawer with notes, images, comments, status updates, audit trail, sharing, and QR action.
- Progress dashboard and audit table.
- Google Drive / Sheets / OAuth integration surfaces (UI ready — backend wiring still required).
- Settings screen shows whether `googleApiKey` and `googleClientId` are loaded.

The prototype stores edits in browser local storage. No Firebase or Next.js credentials are required to run it.

## Next step (the actual Drive wiring)

1. Add Google Identity Services sign-in (token model) using the inlined `googleClientId` + `drive.file` scope.
2. On first sign-in, look up or create the `NeillPlanner` root folder, then `Admin Files/`, `Projects/`, and `Unfiled Projects/` under it.
3. When the user uploads a photo to a node, create (or reuse) `Projects/<Project>/<Floor Plan>/<Node Title>/` and `POST` the file via the Drive `multipart` upload endpoint.
4. Save the returned `driveFileId`, `webViewLink`, and `thumbnailLink` against the node in local state (and later, Firestore).
