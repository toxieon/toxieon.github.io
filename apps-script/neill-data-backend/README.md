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
   `Auth`, `Quote`, `TimesheetLive`, `Admin`, `PlannerOAuth`) and paste each one in
   (delete the default `Code.gs`). **Save**.
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


## Stable Google login (iPhone home-screen apps stop asking to sign in)

**What it does.** Today every app uses Google's browser token client: an access token
lasts about an hour and the silent renewal often fails in iOS home-screen apps, so
they ask to sign in again. With stable login the app signs in **once** through this
backend: Google returns an authorization code to the `/exec` URL, the script swaps it
for a refresh token (using the client secret from Script Properties) and keeps the
refresh token in Script Properties. The phone only stores an opaque session id; when
the access token is near expiry (or Google answers 401) the app asks this backend for
a fresh one. No popup, no re-login. 28 days without opening the app, clearing the
app's data, or revoking access at myaccount.google.com means one new sign-in.

Code: `PlannerOAuth.gs` (server), `shared/nd-auth.js` (`createServerAuth`, used by
every app that signs in with Google: Planner, Quote, Timesheet, Upload, Search, SWB,
Fit-off, Company, Assets). It is **off** until `shared/nd-backend.js` has
`plannerOAuth: true`; with it off (or no endpoint) the apps use the old sign-in
unchanged. If it's on but the Script Properties below are missing, the apps
automatically fall back to the old sign-in.

Sign-out in an app ends that device's session (its refresh token is deleted from
Script Properties). `NDAuth.signOut({ everywhere: true })` also revokes the Google
grant, which signs that Google account out on every device.

### Setup checklist (Brandon, signed in as brandon.j.neill@gmail.com)

**A. Google Cloud Console** (the project that owns the suite's existing sign-in client,
project number `418369916603`)

1. Open https://console.cloud.google.com/auth/clients and pick that project
   (top bar project picker).
2. Open the **Web application** client
   `418369916603-u3pqd7ngq7nuvd032dagjc5apq8ogg2e.apps.googleusercontent.com`
   (use this one, don't create a new client).
3. **Authorized JavaScript origins**: make sure `https://www.neilldata.com` is listed
   (it already is for today's sign-in). Nothing else is needed: `neilldata.com` and
   `http://` both redirect to `https://www.neilldata.com`.
4. **Authorized redirect URIs**: add the Apps Script `/exec` URL from step B3,
   character for character, e.g.
   `https://script.google.com/macros/s/AKfycb…/exec` (no trailing slash, no `?`).
   Save. (Do steps B1 to B3 first if you don't have the URL yet, then come back.)
5. **Client secret**: on the same client page copy the client secret (if it isn't
   shown, **Add secret** and copy the new one). It goes ONLY into Script Properties
   (B4); never into the repo, chat or email.
6. **Data access** (scopes): the list must be exactly today's scopes:
   `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`,
   `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/spreadsheets`.
   Don't add others.
7. **Audience**: User type **External**, Publishing status **In production**
   (press **Publish app** if it says Testing). This matters: in **Testing**, Google
   expires refresh tokens after **7 days**, so everyone would be asked to sign in
   weekly. In production no test users are needed. Because Drive is a restricted
   scope and the app isn't verified, Google shows "Google hasn't verified this app"
   at sign-in: tap **Advanced → Go to … (unsafe)** once per person. Fine for the
   team (unverified apps are capped at 100 users).

**B. Apps Script** (https://script.google.com, project **Neill Data Backend**)

1. Do the **Deploy** steps above (1–8), including the `PlannerOAuth` file and the
   current `Main.gs` and `appsscript.json`. If the project is already deployed:
   paste the updated `Main.gs` + `PlannerOAuth.gs`, then **Deploy → Manage
   deployments → Edit → Version: New version → Deploy** (same `/exec` URL).
2. The deployment must be: type **Web app**, Execute as **Me**, Who has access
   **Anyone** (not "Anyone with a Google account").
3. Copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfycb…/exec`
   (a Workspace account gives `https://script.google.com/a/macros/<domain>/s/…/exec`;
   both work). This is the redirect URI for A4 and the endpoint for C1.
4. **Project Settings (gear) → Script Properties → Add script property**, three times:

   | Property | Value |
   | --- | --- |
   | `PLANNER_OAUTH_CLIENT_ID` | `418369916603-u3pqd7ngq7nuvd032dagjc5apq8ogg2e.apps.googleusercontent.com` |
   | `PLANNER_OAUTH_CLIENT_SECRET` | the client secret from A5 |
   | `PLANNER_OAUTH_REDIRECT_URI` | the `/exec` URL from B3, exactly as in A4 |

   **Save script properties.** No redeploy is needed for properties. Leave `ND_PEPPER`
   (made by `setup()`) alone; the session ids are derived from it.
5. Check: open `<the /exec URL>?action=planner_oauth_status` in a browser. It must
   show `"configured":true`. (`false` means a property is missing or the redirect URI
   isn't an `/exec` URL.)
6. Send Ray the `/exec` URL (not the secret).

**C. Repo** (Ray)

1. `shared/nd-backend.js`: `endpoint: 'https://script.google.com/macros/s/AKfycb…/exec'`
   (the B3 URL, in quotes), `plannerOAuth: false`. Note this also switches Quote,
   Timesheet, Checklist and Timesheet Live to this backend (their passcode logins),
   as planned for the backend.
2. Only after Brandon confirms B5 shows `configured: true` and the iPhone check below
   passes on a test build, set `plannerOAuth: true` (Ray does this).

**Device check after C2** (iPhone home-screen Planner): Sign in → Google opens →
allow → "Sign-in finished … Return to the app" → back in Planner it signs in within a
few seconds. Close the app completely, reopen after more than an hour: no sign-in
prompt. Settings → Sign out, then sign in again works. Repeat once in Quote or Timesheet.

Notes: refresh tokens are stored in this project's Script Properties, so anyone who
can edit the script can read them. Keep editor access to Brandon. Script Properties
suit this small team (about 9 KB per value, 500 KB total; each session is under 2 KB).
Pending logins are capped at 100. Protocol reference:
https://developers.google.com/identity/protocols/oauth2/web-server
