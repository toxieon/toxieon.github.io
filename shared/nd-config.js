/* =========================================================================
 *  nd-config.js — Neill Data Suite shared configuration (Slice 0)
 *
 *  ONE place for every API key, client ID, spreadsheet ID, Drive folder
 *  name, sheet name and OAuth scope used across the suite.
 *
 *  Pattern: same UMD shape as swb_engine.js — works in the browser
 *  (window.ND.config + window.NDConfig) and in Node (module.exports)
 *  so tests can run with `node shared/nd-config.test.js`.
 *
 *  ── KEY SWAP (Brandon's §6 config task) ─────────────────────────────────
 *  When the new referrer-restricted keys exist, replace the values in
 *  `keys` below. That is the ONLY edit needed — every app reads from here
 *  once wired to the shared layer (Slice 1+).
 * ========================================================================= */
(function (root) {
  "use strict";

  /* ── 1. Google Cloud credentials ────────────────────────────────────────
   * browserKey : Drive/Sheets/gapi discovery key (currently unrestricted —
   *              to be replaced with a referrer-restricted key).
   * mapsKey    : Maps JS / Places / Geocoding key (Timesheet, Quote, and
   *              Upload's reverse-geocoding in Slice 2).
   * clientId   : GIS OAuth client — one client serves the whole suite.
   */
  const keys = {
    browserKey: "AIzaSyBZ2b4fa-YV89q6Ld_LfGlzbqM798iCMsA", // <- swap for restricted key
    mapsKey:    "AIzaSyDlf9uWhJl1yXwDq8GU8V4p9DDoC1zNn0w", // <- swap for restricted key
    clientId:   "418369916603-u3pqd7ngq7nuvd032dagjc5apq8ogg2e.apps.googleusercontent.com"
  };

  /* ── 2. OAuth scope union (handoff §1.1) ────────────────────────────────
   * The union of every scope any suite app needs, requested once so a
   * sign-in inside any app signs you into all of them.
   * `drive` is a superset of Timesheet's old `drive.file`.
   */
  const SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "openid",
    "email",
    "profile"
  ];

  /* ── 3. Spreadsheets / backends ─────────────────────────────────────── */
  const sheets = {
    masterSpreadsheetId:   "1NmPyp5Ie0afzVS6VXDBSP1M1AX3EX3F7puufE5QaftQ",
    masterSpreadsheetName: "NeillPlanner-Master",
    quoteSheetId:          "1uxaEppfmUoC0l1nZXS3rvsvKsysDxH5m1AyBK2biUeE",
    timesheetFileName:     "Timesheet-Data",   // created per-account in Drive
    uploadSheetName:       "Upload Log"        // terms acceptance + raw receipts only (v1.0 §3.1)
  };

  /* Google Apps Script backend (Quote today; gains `sendTimesheet` in §3.4) */
  const appsScriptUrl =
    "https://script.google.com/macros/s/AKfycbzkrnzibo7guyNhzWXmjJWNCkyx0j_5aoILnEnBYq4jK0EodqrxIevaSwyRThRqnPxM/exec";

  /* ── 4. Drive folder names ──────────────────────────────────────────── */
  const drive = {
    rootFolderName:         "NeillPlanner",
    batchFolderName:        "Batch",              // single landing zone (v1.0 §3.1)
    adminFolderName:        "Admin Files",
    projectsRootFolderName: "NeillPlanner Projects",
    unfiledRootFolderName:  "Unfiled Projects",
    timesheetRootFolderName:"Timesheet",
    /* retired as primary structures after Slice 2 migration (v1.0 §5.3): */
    legacyBulkPhotosFolderName: "Bulk Photos"
  };

  /* ── 5. Master sheet tab names (incl. new Inbox tab, v1.0 §5.1) ─────── */
  const tabs = {
    inbox:  "Inbox",
    photos: "Photos",
    /* legacy — read-only for one release after migration (§2.1.4): */
    legacyAllocations: "Photo-Allocation"
  };

  /* ── 6. People / business ───────────────────────────────────────────── */
  const owner = {
    primaryOwnerEmail: "brandon.j.neill@gmail.com",
    adminEmail:        "brandon.j.neill@gmail.com"
  };

  const business = {
    name:        "Neill Data & Security",
    abn:         "73 761 986 361",
    phone:       "0418 912 681",
    email:       "brandon.j.neill@gmail.com",
    homeAddress: "1/84 Mount Eliza Way, Mount Eliza VIC 3930"
  };

  /* ── 7. Locale ──────────────────────────────────────────────────────── */
  const locale = {
    addressCountry: "au",
    /* VIC lock stays, but as a visible warning not a silent failure (§2.1.5) */
    addressRegionLock: "VIC"
  };

  /* ── 8. Per-app view ────────────────────────────────────────────────────
   * forApp(id) returns the flat shape today's apps expect, so wiring an app
   * to the shared layer is a drop-in swap for its old window.*_CONFIG block.
   */
  const APP_IDS = ["planner", "upload", "search", "swb", "timesheet", "quote", "hub"];

  function forApp(appId) {
    if (APP_IDS.indexOf(appId) === -1) {
      throw new Error("nd-config: unknown app id '" + appId + "'");
    }
    return {
      appId: appId,
      googleApiKey: keys.browserKey,
      googleClientId: keys.clientId,
      mapsKey: keys.mapsKey,
      scopes: SCOPES.slice(),
      appsScriptUrl: appsScriptUrl,
      masterSpreadsheetId: sheets.masterSpreadsheetId,
      masterSpreadsheetName: sheets.masterSpreadsheetName,
      quoteSheetId: sheets.quoteSheetId,
      timesheetFileName: sheets.timesheetFileName,
      uploadSheetName: sheets.uploadSheetName,
      driveRootFolderName: drive.rootFolderName,
      batchFolderName: drive.batchFolderName,
      adminFolderName: drive.adminFolderName,
      projectsRootFolderName: drive.projectsRootFolderName,
      unfiledRootFolderName: drive.unfiledRootFolderName,
      timesheetRootFolderName: drive.timesheetRootFolderName,
      tabs: Object.assign({}, tabs),
      primaryOwnerEmail: owner.primaryOwnerEmail,
      destinationOwnerEmail: owner.primaryOwnerEmail,
      adminEmail: owner.adminEmail,
      business: Object.assign({}, business),
      addressCountry: locale.addressCountry,
      addressRegionLock: locale.addressRegionLock
    };
  }

  const API = {
    version: "2.0.0-slice0",
    keys, SCOPES, sheets, appsScriptUrl, drive, tabs, owner, business, locale,
    APP_IDS, forApp
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.config = API;
    root.NDConfig = API; // convenience alias
  }
})(typeof window !== "undefined" ? window : globalThis);
