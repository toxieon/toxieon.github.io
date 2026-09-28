/**
 * Neill Data Backend — ONE Apps Script project behind Neill Quote, the
 * Timesheet → Quote bridge, the Install Checklist login and Timesheet Live.
 *
 * Files (paste each into the Apps Script editor as a separate script file):
 *   Config.gs         ← constants (this file)
 *   Main.gs           ← doGet / doPost router
 *   Auth.gs           ← peppered hashing, sessions, server-side rate limits
 *   Quote.gs          ← every Quote action (users, quotes, status, photos, tags, activity)
 *   TimesheetLive.gs  ← the read-only live week view
 *   Admin.gs          ← setup(), code rotation, migration, price sheet — run from the editor
 *
 * Nothing secret lives in this repo. The pepper, the price-sheet ID and the
 * private-sheet ID are Script Properties that setup() creates; passcodes are
 * only ever typed into the editor (then cleared) or into the Quote Staff tab.
 * Deploy steps: README.md next to this file.
 */

const QUOTE_SHEET_ID     = '1uxaEppfmUoC0l1nZXS3rvsvKsysDxH5m1AyBK2biUeE'; // Neill Quote spreadsheet (goes Restricted)
const TIMESHEET_SHEET_ID = '1VG2Pejfd0ZGRpAEs65YAkVf1082O1CUeYjitZSidDl4'; // private Timesheet-Data (live_snapshot)

// Quote spreadsheet tabs the backend owns. Everything else in that spreadsheet
// is treated as a price tab and copied to the public price sheet.
const TAB = {
  users: 'Users', quotes: 'Quotes', invoices: 'Invoices', activity: 'Activity',
  photos: 'Photos', tags: 'Tags'
};
const PRIVATE_TABS = ['Users', 'Quotes', 'Invoices', 'Activity', 'Photos', 'Tags', 'TimesheetLive', 'TimesheetLiveLog'];

const HEADERS = {
  Users:    ['Username', 'PasswordHash', 'Role', 'Locked', 'Phone', 'Email', 'Start Date', 'Address', 'Discount Cap', 'Notes', 'Favourites', 'Products'],
  Quotes:   ['ID', 'Username', 'Created At', 'Client Name', 'Client Address', 'Total', 'Cash Mode', 'JSON Data'],
  Activity: ['Timestamp', 'Username', 'Role', 'Action', 'Detail', 'DeviceFingerprint', 'Result'],
  Photos:   ['PhotoRef', 'ChunkIndex', 'TotalChunks', 'QuoteId', 'Username', 'Width', 'Height', 'Tags', 'Notes', 'CustomerVisible', 'CreatedAt', 'DataChunk'],
  Tags:     ['TagName', 'Color', 'CreatedBy', 'CreatedAt']
  // Invoices has NO header row (legacy): ID, Username, Created At, Completed At,
  // Client Name, Client Address, Total, Cash Mode, JSON Data.
};

// Private spreadsheet (created by setup(), ID in Script Property PRIVATE_SHEET_ID)
const TSL_CODES_TAB = 'TimesheetLive';
const TSL_LOG_TAB   = 'TimesheetLiveLog';
const SNAPSHOT_TAB  = 'live_snapshot';

// Script Property names
const PROP = {
  pepper: 'ND_PEPPER', priceSheet: 'PRICE_SHEET_ID', privateSheet: 'PRIVATE_SHEET_ID',
  requireUsername: 'REQUIRE_USERNAME'
};

// Fill these IN THE EDITOR ONLY before running setup(), then empty them again and
// save. Never commit real codes. Format: [['Label', 'code'], ...]
const SEED_TSL_CODES = [];
// One-off code changes for applyCodeChanges() — same rule: editor only, clear after.
//   quote:         [['Username', 'newcode'], ...]   (Quote staff logins)
//   timesheetLive: [['Label', 'newcode'], ...]      (Timesheet Live viewers)
const CODE_CHANGES = { quote: [], timesheetLive: [] };

// Sessions / limits
const QUOTE_SESSION_TTL_MS = 20 * 3600 * 1000; // covers Quote's 14h "stay unlocked" + queued writes
const TSL_SESSION_TTL_MS   = 14 * 3600 * 1000;
const FAIL_WINDOW_MS       = 15 * 60 * 1000;
const MAX_FAILS_GLOBAL     = 10;   // wrong codes per 15 min, all users together (per app)
const MAX_FAILS_GLOBAL_DAY = 50;   // wrong codes per 24 h, all users together (per app)
const MAX_FAILS_PER_USER   = 5;    // wrong codes per 15 min against one named user
const PHOTO_CHUNK          = 45000; // chars per Photos row (cell limit is 50,000)
const MAX_CELL             = 49000;
const SNAPSHOT_CACHE_S     = 10;
const BACKEND_VERSION      = 'neill-data-backend 1';
