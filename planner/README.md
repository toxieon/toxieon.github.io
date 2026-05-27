# NeillPlanner (Planner folder) — v0.2

Drop this `Planner/` folder into the root of your GitHub repo. Live URL once Pages is enabled:

```
neilldata.com/Planner/
```

## Folder layout

```
Root/
  Planner/
    index.html       <- entry point (Google API key + OAuth Client ID baked in here)
    app.js
    styles.css
    assets/
      floorplan.svg  (decorative texture only)
```

Everything is co-located inside `Planner/` — no parent-folder references, no separate `config.js`. Upload the folder as-is.

## What's in v0.2

The big rewrite. No defaults, no examples — just a blank app wired into Google Drive + Sheets.

- **Empty on first run.** No seed projects, no example folders, no example nodes. Click "Create your first project" to start.
- **Google sign-in** via Google Identity Services (token model). One button in the top bar and in Settings.
- **Drive bootstrap on sign-in.** The app creates (or finds) `NeillPlanner/`, `NeillPlanner/Admin Files/`, `NeillPlanner/Projects/`, `NeillPlanner/Unfiled Projects/`, and an audit spreadsheet inside Admin Files.
- **Per-project Drive folders** created automatically when you create a project. Sub-structure: `Projects/<colour folder>/<project name>/<node title>/photo.jpg`. Projects without a colour folder go under `Unfiled Projects/<project name>/`.
- **Photo upload** straight to the right node folder via the Drive multipart upload endpoint. Uses only the narrow `drive.file` scope (the app can only see files it created).
- **Sheets-backed audit log.** Every action (project created, node created, status changed, photo uploaded, comment added, folder renamed, etc.) appends a row to `NeillPlanner-Audit` in Admin Files. Sheet columns: Timestamp, User, Action, Project ID, Project Name, Folder, Node ID, Node Title, Category, Status, Details, Device.
- **On-demand audit fetch.** The audit log does NOT load on every page view. Open the Audit tab and click "Load from Sheet" to pull rows.
- **Filterable audit view.** Filters: date from, date to, user, action, project, node title contains, details contains, free-text anywhere. Plus a "Download CSV" button that exports the currently filtered rows.
- **Per-project floor plans** stored locally as data URLs (kept in browser storage for now — Drive sync for plans is a follow-up).
- **No Firebase.** All FCM / push notifications code is gone.

## Google Cloud requirements

The OAuth client and API key are already baked into `index.html`. In Google Cloud, make sure:

1. **APIs enabled**: Google Drive API, Google Sheets API.
2. **OAuth consent screen** lists these scopes: `openid`, `profile`, `email`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets`.
3. **OAuth client ID — Authorized JavaScript origins** includes `https://neilldata.com`, `https://www.neilldata.com`, and your local dev origins (`http://127.0.0.1:4173`, `http://localhost:4173`).
4. **API key — HTTP referrer restrictions** include `https://neilldata.com/*`, `https://www.neilldata.com/*`, `http://127.0.0.1:4173/*`, `http://localhost:4173/*`.
5. **API key — API restrictions** (if used) allow Drive API and Sheets API.
6. **If OAuth app is in "Testing" mode**, add your email (`toxieon.minecraft@gmail.com`) to the Test Users list. Otherwise sign-in returns `access_denied`.

## How the data flows

**On sign-in (one time):**
- App requests an access token with the d