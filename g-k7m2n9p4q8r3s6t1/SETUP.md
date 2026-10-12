# Gate Codes setup (Brandon)

The live app folder is **`g-k7m2n9p4q8r3s6t1`** (unguessable URL). Do not link it from the public site, sitemap, or hub registry.

## 1. Apps Script

1. Open the **Neill Data Backend** project in [script.google.com](https://script.google.com).
2. Add a script file named **`GateCodes`** and paste `apps-script/neill-data-backend/GateCodes.gs` from this repo.
3. **Deploy → Manage deployments → Edit → New version → Deploy** (Execute as **Me**, access **Anyone**).
4. Run **`setup()`** once (or re-run) so `gate_codes` and `gate_editors` tabs exist on the private spreadsheet.
5. In **Project Settings → Script properties**, set:
   - **`GC_APP_SLUG`** = `g-k7m2n9p4q8r3s6t1` (must match the folder name in the repo).
6. Copy the web app **`/exec`** URL into `shared/nd-backend.js` → `endpoint` (if not already set for the suite).

## 2. First-time PIN

1. Open the secret URL on your phone (bookmark it; it is not in the hub list).
2. Sign in with Google as **brandon.j.neill@gmail.com**.
3. Open **Settings** → set the **company view PIN** (4–12 digits). View PIN stays **on** by default for everyone else.

## 3. Editors

- Owner is seeded as **brandon.j.neill@gmail.com** on `gate_editors`.
- In the app: **Settings → Manage editors** (owner only) to add/remove editor emails.

## 4. Publish site

Push the repo to GitHub Pages so `/g-k7m2n9p4q8r3s6t1/` is live. Confirm `hub/discover.json` excludes this folder (no hub tile in `apps.json`).

## 5. Hub shortcut (optional)

When signed into the hub as Brandon, a **Gate Codes** tile is injected after the backend returns `gc_owner_app_link` — the path is not stored in any static hub file.
