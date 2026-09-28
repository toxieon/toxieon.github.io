# Timesheet Live — backend

`/timesheetlive/` is a public, read-only, passcode-gated view of Brandon's
current timesheet week.

```
Timesheet app (Brandon, signed in with Google)
   └─ on every save (debounced 4s) writes a sanitized current-week snapshot
      → Timesheet-Data spreadsheet (private) → tab `live_snapshot`, cell A2

/timesheetlive page (anyone with a passcode, no Google sign-in)
   └─ POST {action:'tsl_login', codeHash:sha256(lowercase code)} → Apps Script (Code.gs)
        ├─ checks HMAC(pepper, codeHash) against Quote spreadsheet → tab `TimesheetLive`
        ├─ rate-limits failures (5/device, 30 global per 15 min)
        ├─ logs label + time → Quote spreadsheet → tab `TimesheetLiveLog`
        └─ returns a 6h session token + the whitelisted snapshot
   └─ POST {action:'tsl_get', token} every 45s while the tab is visible
```

The page and its JS contain no codes, no Google credentials and no write access.
The script executes as Brandon, reads only the `live_snapshot` cell, and
re-whitelists every field before returning it (`sanitize_`).

## One-time deploy (Brandon, signed in as brandon.j.neill@gmail.com)

1. Go to https://script.google.com → **New project** → rename to **Timesheet Live**.
2. Paste `Code.gs` over the default `Code.gs` → **Save**.
3. In the editor only, set the initial codes, e.g.
   `const SEED_CODES = [['<code>', 'Brandon'], ['<code>', 'Carol']];`
4. Pick **setup** in the function dropdown → **Run** → approve the permission prompt
   (Advanced → Go to Timesheet Live → Allow). The log shows `Added …`.
5. Set `SEED_CODES` back to `[]` and **Save** (the codes now exist only as peppered hashes).
6. **Deploy → New deployment** → gear → **Web app** → Execute as **Me** →
   Who has access **Anyone** → **Deploy** → copy the **Web app URL** (ends in `/exec`).
7. Put that URL in `timesheetlive/config.js` → `endpoint: '…/exec'` and commit.
8. Open the Timesheet app signed in → Settings → Timesheet Export → **Publish now**.

## Managing codes

- Add / re-activate: in the editor run `addCode('newcode', 'Label')`
  (e.g. temporarily edit a one-line function that calls it, run it, delete it).
- Revoke: set **Active** to `FALSE` on that row in the `TimesheetLive` tab.
- Rotate all: delete the `TSL_PEPPER` Script Property, run `setup` again, re-add codes.
- Codes match case-insensitively; leading/trailing spaces are ignored.

After editing `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version → Deploy**
(keeps the same `/exec` URL).
