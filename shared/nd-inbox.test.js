/* Node test harness for nd-inbox.js.
 * Run:  node shared/nd-inbox.test.js
 */
const I = require("./nd-inbox.js");
const S = require("./nd-sheets.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

console.log("schema — v1.0 §5.1 columns A–X exact");
ok(I.HEADER.length === 24, "24 columns");
ok(I.HEADER[0] === "Photo ID" && I.HEADER[1] === "Drive File ID" && I.HEADER[3] === "Status" &&
   I.HEADER[5] === "Address Key" && I.HEADER[12] === "Is Floor Plan" && I.HEADER[22] === "Content Hash" &&
   I.HEADER[23] === "Notes", "spot-check column order (A,B,D,F,M,W,X)");
ok(I.ID_COLUMN === "Drive File ID", "writes keyed by Drive File ID (v1.0 §3.2)");
ok(I.STATUS_ORDER.join(">") === "UPLOADED>UNFILED>FILED_TO_PROJECT>FILED_TO_NODE", "lifecycle order");

console.log("record <-> row round trip");
{
  const rec = { driveFileId: "d1", name: "a.heic", status: "UNFILED", address: "12 Smith St, Kew VIC",
    addressSource: "exif", lat: -37.8136123456, lng: 144.9630987654, type: "Camera", room: "Bedroom 1",
    isFloorPlan: true, mimeType: "image/heic", contentHash: "abc123", uploader: "b@x.com" };
  const row = I.rowFromRecord(rec);
  ok(row["Address Key"] === "12 smith st kew", "addressKey auto-computed via canonical normalize");
  ok(row["Lat"] === -37.81361 && row["Lng"] === 144.9631, "lat/lng rounded to 5dp (geocode dedup)");
  ok(row["Is Floor Plan"] === "TRUE", "floor plan flag serialised");
  ok(row["Photo ID"].indexOf("inbox-") === 0, "photo id generated when absent");
  const back = I.recordFromRow(row);
  ok(back.driveFileId === "d1" && back.isFloorPlan === true && back.lat === -37.81361 &&
     back.type === "Camera" && back.contentHash === "abc123", "round trip preserves fields");
  const rec2 = I.recordFromRow(I.rowFromRecord({ driveFileId: "d2", address: "x" }));
  ok(rec2.isFloorPlan === false && rec2.lat === null, "blank flags/coords come back typed");
}

console.log("appProperties (v1.0 §5.2)");
{
  const props = I.toAppProperties({ addressKey: "12 smith st", isFloorPlan: true, room: "Bedroom 1", contentHash: "h" }, "nd-upload");
  ok(props.source === "nd-upload" && props.isFloorPlan === "true" && props.room === "Bedroom 1", "serialises compactly");
  ok(!("lat" in props), "only §5.2 fields included");
  const back = I.fromAppProperties(props);
  ok(back.isFloorPlan === true && back.addressKey === "12 smith st", "round trip");
}

console.log("lifecycle transitions (v1.0 §3.2)");
ok(I.isValidTransition("UPLOADED", "UNFILED"), "uploaded -> unfiled");
ok(I.isValidTransition("UNFILED", "FILED_TO_PROJECT"), "unfiled -> project");
ok(I.isValidTransition("FILED_TO_PROJECT", "FILED_TO_NODE"), "project -> node");
ok(I.isValidTransition("UNFILED", "FILED_TO_NODE"), "unfiled straight to node (Search)");
ok(I.isValidTransition("FILED_TO_PROJECT", "UNFILED"), "dismiss back to batch (§4.4)");
ok(!I.isValidTransition("FILED_TO_NODE", "UNFILED"), "filed-to-node never regresses");
ok(!I.isValidTransition("UNFILED", "BOGUS"), "unknown status rejected");

console.log("groupUnfiled — §4.3 banner feed");
{
  const recs = [
    { driveFileId: "1", status: "UNFILED", address: "12 Smith St", addressKey: "12 smith st" },
    { driveFileId: "2", status: "UNFILED", address: "12 Smith St", addressKey: "12 smith st", isFloorPlan: true },
    { driveFileId: "3", status: "UNFILED", address: "4 Bar Rd", addressKey: "4 bar rd", room: "Apt 4" },
    { driveFileId: "4", status: "FILED_TO_NODE", address: "12 Smith St", addressKey: "12 smith st" },
    { driveFileId: "5", status: "UPLOADED", address: "12 Smith St", addressKey: "12 smith st" }
  ];
  const groups = I.groupUnfiled(recs);
  ok(groups.length === 2, "two address groups");
  ok(groups[0].addressKey === "12 smith st" && groups[0].count === 3, "biggest group first, FILED excluded, UPLOADED included");
  ok(groups[0].floorPlan && groups[0].floorPlan.driveFileId === "2", "tagged floor plan surfaced");
  ok(groups[1].label === "4 Bar Rd · Apt 4", "unit-block disambiguation label (v1.0 §7)");
}

console.log("dedup across whole set (v1.0 §7)");
{
  const recs = [{ driveFileId: "1", contentHash: "aaa", status: "FILED_TO_NODE" }];
  ok(I.findByContentHash(recs, "aaa") !== null, "re-upload of a FILED photo is caught");
  ok(I.findByContentHash(recs, "zzz") === null, "unknown hash passes");
  ok(I.findByContentHash(recs, "") === null, "empty hash never matches");
}

console.log("createInboxApi over nd-sheets (fake gateway)");
(async function () {
  const book = { M: { Inbox: [I.HEADER.slice()] } };
  const gw = {
    getValues: async (ss, range) => { const t = book[ss][range.match(/'([^']+)'/)[1]]; return /!1:1$/.test(range) ? t.slice(0, 1) : t.map(r => r.slice()); },
    updateValues: async (ss, range, values) => { const t = book[ss].Inbox; t[Number(range.match(/!A(\d+):/)[1]) - 1] = values[0].slice(); },
    appendValues: async (ss, range, values) => { values.forEach(v => book[ss].Inbox.push(v.slice())); },
    deleteRow: async (ss, tab, n) => { book[ss][tab].splice(n - 1, 1); }
  };
  const sheets = S.create({ gateway: gw });
  const inbox = I.createInboxApi({ sheets, spreadsheetId: "M" });

  await inbox.upsert({ driveFileId: "d1", name: "a.jpg", status: "UNFILED", address: "12 Smith St" });
  ok(book.M.Inbox.length === 2, "row appended");
  const recs = await inbox.list();
  ok(recs.length === 1 && recs[0].addressKey === "12 smith st", "list() returns typed records");

  const next = await inbox.setStatus(recs[0], "FILED_TO_PROJECT", { projectId: "P1" });
  ok(book.M.Inbox[1][3] === "FILED_TO_PROJECT" && book.M.Inbox[1][13] === "P1", "status + projectId updated in place");
  ok(book.M.Inbox.length === 2, "upsert, not append (§0.4)");

  const dismissed = await inbox.setStatus(next, "UNFILED");
  ok(dismissed.projectId === "" && book.M.Inbox[1][13] === "", "dismiss-to-batch clears project fields");

  let rejected = false;
  await inbox.setStatus({ driveFileId: "d1", status: "FILED_TO_NODE" }, "UNFILED").catch(() => { rejected = true; });
  ok(rejected, "illegal transition rejected");

  await inbox.remove("d1");
  ok(book.M.Inbox.length === 1, "remove deletes the row");

  // ensureInboxTab
  const book2 = { M: {} };
  const gw2 = {
    getValues: async (ss, range) => { const t = book2[ss].Inbox; if (!t) throw new Error("no tab"); return t.slice(0, 1); },
    appendValues: async (ss, range, values) => { book2[ss].Inbox = book2[ss].Inbox || []; values.forEach(v => book2[ss].Inbox.push(v.slice())); },
    addSheet: async (ss, title) => { book2[ss][title] = []; }
  };
  const created = await I.ensureInboxTab(gw2, "M");
  ok(created === true && book2.M.Inbox[0].join("|") === I.HEADER.join("|"), "creates tab + §5.1 header");
  const again = await I.ensureInboxTab(gw2, "M");
  ok(again === false && book2.M.Inbox.length === 1, "idempotent — never rewrites (§0.4)");
  let guarded = false;
  book2.M.Inbox[0] = ["Something", "Else"];
  await I.ensureInboxTab(gw2, "M").catch(() => { guarded = true; });
  ok(guarded, "refuses to touch a tab with a foreign header");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
