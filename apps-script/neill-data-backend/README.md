# Neill Data Backend (one Apps Script project)

One web app, deployed once by Brandon, serves:

| Client | Actions |
| --- | --- |
| `quote/` | `login`, `whoami`, `logout`, `get_quotes`, `save_quote`, `delete_quote`, `set_status`, `set_favourites`, `get_users`, `update_user`, `create_user`, `delete_user`, `get_activity`, `clear_activity`, `save_photo`, `get_photos_meta`, `get_photo_data`, `set_photo_tags`, `delete_photo`, `list_tags`, `create_tag`, `delete_tag`, `get_config` |
| legacy extras (kept for parity) | `get_invoices`, `complete_quote`, `uncomplete_quote`, `lock_user` |
| `timesheet/` (Quote bridge) | `login`, `get_quotes`, `set_status` (`change_status` alias) |
| `checklist/` | `login`, `logout` |
| `timesheetlive/` | `tsl_login`, `tsl_get`, `tsl_logout` |

All pages find it through **one** setting: `shared/nd-backend.js` → `endpoint`.
While that is empty, Quote / Timesheet / Checklist keep using the legacy Quote
backend unchanged and Timesheet Live shows "not connected yet".

## How it works

- **Logins** send the passcode itself over HTTPS. The script hashes it
  (`HMAC-SHA256(pepper, sha256(code))`, pepper in Script Properties) and compares
  server-side. A good login returns a session token; every other call sends the
  token. Nothing stored in a sheet works as a login.
- **Existing Quote codes keep working.** Rows still holding the old plain SHA-256
  are accepted once and re-written in the peppered form on that user's first
  login through this backend. `migrateAllUsers()` converts the rest in bulk.
- **Rate limits** are server-side: a global limit per app (15-minute window and a
  24-hour cap) plus a per-user limit when a login names the user (Script
  Property `REQUIRE_USERNAME` = `true` makes Quote ask for a name as well).
- **Sessions** end when a user is locked, deleted, or their passcode changes.
- **Prices** are read by Quote from a separate, link-viewable *price sheet*
  (`setup()` creates it and copies the price tabs). The Quote spreadsheet itself
  (Users, Quotes, Invoices, Activity, Photos, Tags) is only reached by this script
  and can be Restricted.
- **Timesheet Live** codes + log live in a private spreadsheet `setup()` creates.

Script Properties (created by `setup()`, never in the repo): `ND_PEPPER`,
`PRICE_SHEET_ID`, `PRIVATE_SHEET_ID`, optional `REQUIRE_USERNAME`.
**Never delete `ND_PEPPER`** — every stored code depends on it.

## Deploy (Brandon, signed in as brandon.j.neill@gmail.com)

1. https://script.google.com → **New project** → name it **Neill Data Backend**.
2. Project Settings (gear) → tick **Show "appsscript.json" manifest file**. Replace
   its contents with `appsscript.json` from this folder.
3. Create script files named exactly like the `.gs` files here (`Config`, `Main`,
   `Auth`, `Quote`, `TimesheetLive`, `Admin`) and paste each one in (delete the
   default `Code.gs`). **Save**.
4. In `Config.gs`, in the editor only, fill `SEED_TSL_CODES` with the Timesheet
   Live viewers: `[['Label', 'code'], ['Label', 'code']]`.
5. Choose **setup** → **Run** → approve the permissions (Advanced → Go to Neill
   Data Backend → Allow). The execution log lists the price sheet and private sheet.
6. Empty `SEED_TSL_CODES` again (`[]`) and **Save**.
7. Open the price sheet link from the log → **Share** → General access →
   **Anyone with the link** → **Viewer**. (Leave the private sheet Restricted.)
8. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has
   access **Anyone** → **Deploy** → copy the Web app URL (ends in `/exec`).
9. That URL goes into `shared/nd-backend.js` → `endpoint` (one commit switches
   every app).

Updating the code later: **Deploy → Manage deployments → Edit → Version: New
version → Deploy** (keeps the same `/exec` URL).

## Editor functions (Run ▸ pick the function)

| Function | What it does |
| --- | --- |
| `setup()` | Safe to re-run. Pepper, private sheet, price sheet (first run only), TSL seeds. Never changes Quote logins. |
| `applyCodeChanges()` | Applies `CODE_CHANGES` in `Config.gs` (fill in the editor, run, then empty it and save): Quote `[['Username','newcode']]`, Timesheet Live `[['Label','newcode']]`. |
| `setCode(username, code)` / `setTimesheetLiveCode(label, code)` | The same, one at a time (call from a scratch function). |
| `revokeTimesheetLiveCode(label)` | Turns a Timesheet Live viewer off. |
| `migrateAllUsers()` | Upgrades every remaining old-format Quote login. Run only after the new URL is live. |
| `syncPriceSheet()` | Re-copies price tabs from the Quote spreadsheet to the price sheet (**overwrites** the price sheet). |
| `installHourlyPriceSync()` / `removeHourlyPriceSync()` | Optional: keep editing prices in the Quote spreadsheet and mirror them hourly. |
| `resetLoginLimits()` / `signOutEveryone()` / `status()` | Housekeeping. |

Quote passcodes can also be changed in Quote itself: **Staff** tab → open the
user → **New passcode** (master only).

Where to edit prices after the switch: the **price sheet** (Quote reads prices
only from there), unless you install the hourly sync — then keep editing the
Quote spreadsheet and don't edit the price sheet.


## Planner long-lived Google login (deployment required)

The optional Planner flow uses an Apps Script OAuth callback and a separate,
browser-generated claim secret. Refresh tokens live only in Script Properties;
28-day sliding device sessions retrieve short-lived access tokens. Logout deletes
only that device session, without revoking Google's grant for other devices.
Existing suite login paths are unchanged. No Sheet/Drive migration is needed.

1. Google Cloud console: create/edit the OAuth **Web** client, add the authorized redirect URI(s) your flow uses, and confirm the Drive + Sheets scopes on the consent screen. Publish the consent screen to "In production" so refresh tokens don't expire after 7 days (Testing mode).
   The redirect URI is exactly your deployed backend URL, https://script.google.com/macros/s/DEPLOYMENT_ID/exec. Use the same Google Cloud project as your existing OAuth client. Scopes: openid, email, profile, https://www.googleapis.com/auth/drive and https://www.googleapis.com/auth/spreadsheets. Google may require verification for these scopes.
2. Put the client ID/secret into Script Properties (names you choose, documented in the backend README).
   Names: PLANNER_OAUTH_CLIENT_ID, PLANNER_OAUTH_CLIENT_SECRET, PLANNER_OAUTH_REDIRECT_URI. The redirect property must equal the authorized URI. Do not put the secret in frontend config or Git.
3. Apps Script: paste the updated .gs files, run any setup function, and **redeploy the web app as a new version**; update shared/nd-backend.js endpoint if the URL changes.
   Include PlannerOAuth.gs, updated Main.gs and appsscript.json (external_request scope). Retain all other .gs files. No new setup/migration is required; existing backend setup applies. Redeploy executing as the owner, accessible to Anyone. Set endpoint to the /exec URL and plannerOAuth: true only when ready. This shared endpoint also affects existing suite consumers: retain the existing backend's configuration and test those apps.

First sign-in opens Google. After consent, return to the original Planner window;
the app claims the session automatically. If iOS opens Safari from the PWA,
return to the PWA; its pending login secret is saved for ten minutes. Thereafter
renewal needs no popup. Storage clearing, consent revocation or 28 days without
use requires sign-in again. Offline sign-out reports failure and must be retried
online to revoke the server session. Do not log request bodies or property dumps.

Deployment checks: desktop and actual iPhone PWA initial login, reopen after days,
refresh after one hour, denial/cancellation, and device-only logout. Script Properties
are suitable for this small suite, not an unbounded public auth service. The login
queue is capped at 100 pending requests; monitor Apps Script quota errors.

Protocol reference: https://developers.google.com/identity/protocols/oauth2/web-server
