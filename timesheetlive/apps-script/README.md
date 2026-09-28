# Timesheet Live — backend

Timesheet Live's backend is now part of the single **Neill Data Backend**
Apps Script project (the same deployment serves Quote, the Timesheet → Quote
bridge and the Checklist login):

- Source: [`apps-script/neill-data-backend/TimesheetLive.gs`](../../apps-script/neill-data-backend/TimesheetLive.gs)
- Deploy / manage codes: [`apps-script/neill-data-backend/README.md`](../../apps-script/neill-data-backend/README.md)
- Page endpoint: `shared/nd-backend.js` → `endpoint` (read by `timesheetlive/config.js`)

```
Timesheet app (Brandon, signed in with Google)
   └─ on every save (debounced 4s) writes a sanitized current-week snapshot
      → Timesheet-Data spreadsheet (private) → tab `live_snapshot`, cell A2

/timesheetlive page (anyone with a passcode, no Google sign-in)
   └─ POST {action:'tsl_login', code} → Neill Data Backend
        ├─ checks the code server-side against peppered hashes
        │    → PRIVATE backend spreadsheet → tab `TimesheetLive`
        ├─ server-side rate limits (not tied to the device)
        ├─ logs label + time → PRIVATE backend spreadsheet → tab `TimesheetLiveLog`
        └─ returns a 14h session token + the whitelisted snapshot (incl. the on-clock card)
   └─ POST {action:'tsl_get', token} every 45s while the tab is visible
```

The page keeps only the session token — never the code or a hash of it.
Codes match case-insensitively. Manage them from the Apps Script editor with
`setTimesheetLiveCode(label, code)` / `revokeTimesheetLiveCode(label)` (see the
backend README).
