/* Node test harness for nd-config.js (ASCII-only, zero deps — SWB model).
 * Run:  node shared/nd-config.test.js
 */
const C = require("./nd-config.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

console.log("nd-config tests");

/* -- credentials present and well-formed ---------------------------------- */
ok(/^AIza[A-Za-z0-9_-]{20,}$/.test(C.keys.browserKey), "browser key shape");
ok(/^AIza[A-Za-z0-9_-]{20,}$/.test(C.keys.mapsKey), "maps key shape");
ok(/\.apps\.googleusercontent\.com$/.test(C.keys.clientId), "client id shape");

/* -- scope union (handoff 1.1): must cover every app's old scope set ------ */
const need = [
  "https://www.googleapis.com/auth/drive",        // planner/upload/search/swb
  "https://www.googleapis.com/auth/spreadsheets", // everyone
  "openid", "email", "profile"
];
ok(need.every(s => C.SCOPES.indexOf(s) !== -1), "scope union covers all apps");
ok(C.SCOPES.indexOf("https://www.googleapis.com/auth/drive.file") === -1,
   "drive.file dropped (drive is a superset)");

/* -- ids match what the live apps use today ------------------------------- */
ok(C.sheets.masterSpreadsheetId === "1NmPyp5Ie0afzVS6VXDBSP1M1AX3EX3F7puufE5QaftQ",
   "master spreadsheet id matches search/index.html");
ok(C.sheets.quoteSheetId === "1uxaEppfmUoC0l1nZXS3rvsvKsysDxH5m1AyBK2biUeE",
   "quote sheet id matches quote + timesheet");
ok(/^https:\/\/script\.google\.com\/macros\//.test(C.appsScriptUrl), "apps script url shape");

/* -- single-writer / inbox contract names (v1.0 5.1, 0.4) ----------------- */
ok(C.tabs.inbox === "Inbox" && C.tabs.photos === "Photos", "inbox + photos tab names");
ok(C.drive.batchFolderName === "Batch", "single landing zone is Batch");

/* -- forApp() drop-in shape ------------------------------------------------ */
const p = C.forApp("planner");
ok(p.googleApiKey === C.keys.browserKey, "forApp: api key");
ok(p.googleClientId === C.keys.clientId, "forApp: client id");
ok(p.driveRootFolderName === "NeillPlanner", "forApp: drive root");
ok(p.addressCountry === "au", "forApp: address country");
ok(Array.isArray(p.scopes) && p.scopes.length === C.SCOPES.length, "forApp: scopes copied");
p.scopes.push("tampered");
ok(C.SCOPES.indexOf("tampered") === -1, "forApp: scopes are a defensive copy");

const t = C.forApp("timesheet");
ok(t.mapsKey === C.keys.mapsKey, "forApp(timesheet): maps key");
ok(t.timesheetFileName === "Timesheet-Data", "forApp(timesheet): data file name");

const q = C.forApp("quote");
ok(q.business.name === "Neill Data & Security", "forApp(quote): business block");
ok(q.appsScriptUrl === C.appsScriptUrl, "forApp(quote): backend url");

let threw = false;
try { C.forApp("voltdrop"); } catch (e) { threw = true; }
ok(threw, "forApp: throws on unknown app id");

ok(C.APP_IDS.length === 7, "seven app ids registered");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
