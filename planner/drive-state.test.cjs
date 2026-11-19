const test = require("node:test");
const assert = require("node:assert/strict");
const DS = require("./drive-state.js");
const PF = require("./photo-folders.js");

/* In-memory Drive: folders and files with a revision counter; can go offline. */
function fakeDrive() {
  const d = { offline: false, files: new Map(), folders: new Map(), n: 0, writes: [] };
  const check = () => { if (d.offline) { const e = new Error("Failed to fetch"); e.offline = true; throw e; } };
  d.adapter = {
    async findFolder(parent, name) { check(); return [...d.folders.values()].find((f) => f.parent === parent && f.name === name) || null; },
    async createFolder(parent, name) { check(); const f = { id: "fold-" + (++d.n), parent, name }; d.folders.set(f.id, f); return f; },
    async findFile(folder, name) { check(); return [...d.files.values()].find((f) => f.parent === folder && f.name === name) || null; },
    async getMeta(id) { check(); return { rev: d.files.get(id).rev }; },
    async download(id) { check(); return d.files.get(id).text; },
    async createFile(folder, name, text) { check(); const f = { id: "file-" + (++d.n), parent: folder, name, text, rev: "r1" }; d.files.set(f.id, f); d.writes.push(["create", name]); return { id: f.id, rev: f.rev }; },
    async updateFile(id, text) { check(); const f = d.files.get(id); f.text = text; f.rev = "r" + (++d.n); d.writes.push(["update", f.name]); return { rev: f.rev }; }
  };
  return d;
}
function memCache() { const m = new Map(); return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, JSON.stringify(v)); }, remove: async (k) => { m.delete(k); }, m }; }
const job = { jobFolderId: "job-1", projectId: "prj-fake-1" };
const appState = (nodes, rooms) => ({ projects: [{ id: "prj-fake-1", floors: [{ id: "flr-1", name: "Ground floor", order: 0, planDriveFileId: "plan-x" }] }], rooms: rooms || [], nodes: nodes || [] });
const node = (id, title, at) => ({ id, projectId: "prj-fake-1", floorId: "flr-1", type: "marker", title, position: { x: 1, y: 2 }, updatedAt: at || "2026-11-19 10:00", imageRefs: [{ id: "i1", thumb: "data:image/png;base64,AAAA", driveFileId: "ph1" }] });
const T0 = Date.parse("2026-11-19T00:00:00Z");

function engine(drive, cache, device, clock) {
  return DS.createEngine({ drive: drive.adapter, cache, deviceId: device, now: () => clock.t });
}
async function seed(drive, cache, nodes) {
  const clock = { t: T0 };
  const e = engine(drive, cache, "dev-a", clock);
  const res = await e.migrate(job, DS.extractProject(appState(nodes), job.projectId, "dev-a", clock.t));
  assert.equal(res.status, "created");
  return e;
}

test("extract keeps ids and links, drops inline image data, and carries the schema fields", () => {
  const doc = DS.extractProject(appState([node("n1", "A")]), "prj-fake-1", "dev-a", T0);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.projectId, "prj-fake-1");
  assert.equal(doc.updatedBy, "dev-a");
  assert.equal(typeof doc.rev, "number");
  assert.ok(doc.updatedAt);
  assert.equal(doc.nodes[0].imageRefs[0].driveFileId, "ph1");
  assert.equal("thumb" in doc.nodes[0].imageRefs[0], false);
});

test("merge: newer edit wins per entity, additions union, deletion beats older edit but loses to newer", () => {
  const N = Date.now();
  const mk = (nodes, tomb) => Object.assign(DS.newDoc("p", "x", T0), { nodes: nodes, tombstones: { floors: {}, rooms: {}, nodes: tomb || {} }, rev: 1 });
  const local = mk([{ id: "a", t: "local-new", _mt: N + 200 }, { id: "b", t: "local", _mt: N + 100 }, { id: "c", t: "local-only", _mt: N + 50 }]);
  const remote = mk([{ id: "a", t: "remote-old", _mt: N + 100 }, { id: "b", t: "remote-new", _mt: N + 300 }, { id: "d", t: "remote-only", _mt: N + 10 }], { c: N + 60 });
  const m = DS.merge(local, remote);
  const byId = Object.fromEntries(m.nodes.map((n) => [n.id, n.t]));
  assert.deepEqual(byId, { a: "local-new", b: "remote-new", d: "remote-only" }, "c was deleted remotely after the local edit");
  assert.equal(m.rev, 2);
  const revived = DS.merge(mk([{ id: "c", t: "edited after delete", _mt: N + 400 }]), remote);
  assert.ok(revived.nodes.some((n) => n.id === "c"), "newer edit beats an older tombstone");
  assert.ok(m.tombstones.nodes.c, "tombstone kept for other devices");
});

test("stamp: unchanged entities keep their time, changed ones are re-stamped, deletions become tombstones", () => {
  const base = Object.assign(DS.newDoc("p", "x", T0), { nodes: [{ id: "a", t: 1, _mt: 10 }, { id: "b", t: 1, _mt: 10 }, { id: "gone", t: 1, _mt: 10 }] });
  const local = Object.assign(DS.newDoc("p", "x", T0), { nodes: [{ id: "a", t: 1 }, { id: "b", t: 2 }, { id: "new", t: 1 }] });
  const s = DS.stamp(local, base, 999);
  const mt = Object.fromEntries(s.nodes.map((n) => [n.id, n._mt]));
  assert.deepEqual(mt, { a: 10, b: 999, new: 999 });
  assert.equal(s.tombstones.nodes.gone, 999);
});

test("conflict: two devices edit different nodes; the second save merges and nothing is clobbered", async () => {
  const drive = fakeDrive(), cache = memCache();
  await seed(drive, cache, [node("n1", "one"), node("n2", "two")]);
  const clockA = { t: T0 + 1000 }, clockB = { t: T0 + 2000 };
  const a = engine(drive, memCache(), "dev-a", clockA), b = engine(drive, memCache(), "dev-b", clockB);
  const la = await a.load(job), lb = await b.load(job);
  assert.equal(la.status, "loaded"); assert.equal(lb.status, "loaded");
  const stateA = appState([node("n1", "one-edited-by-A"), node("n2", "two")]);
  const stateB = appState([node("n1", "one"), node("n2", "two-edited-by-B"), node("n3", "added-by-B")]);
  const ra = await a.save(job, DS.extractProject(stateA, job.projectId, "dev-a", clockA.t));
  assert.equal(ra.status, "saved");
  const rb = await b.save(job, DS.extractProject(stateB, job.projectId, "dev-b", clockB.t));
  assert.equal(rb.status, "merged", "revision changed under B, so it merged instead of overwriting");
  const final = JSON.parse([...drive.files.values()][0].text);
  const titles = Object.fromEntries(final.nodes.map((n) => [n.id, n.title]));
  assert.deepEqual(titles, { n1: "one-edited-by-A", n2: "two-edited-by-B", n3: "added-by-B" });
  assert.equal(final.updatedBy, "dev-b");
  assert.ok(final.rev > 1);
});

test("conflict: a delete on one device and an edit on another resolve by time", async () => {
  const drive = fakeDrive();
  await seed(drive, memCache(), [node("n1", "one"), node("n2", "two")]);
  const clockA = { t: T0 + 1000 }, clockB = { t: T0 + 3000 };
  const a = engine(drive, memCache(), "dev-a", clockA), b = engine(drive, memCache(), "dev-b", clockB);
  await a.load(job); await b.load(job);
  await a.save(job, DS.extractProject(appState([node("n2", "two")]), job.projectId, "dev-a", clockA.t));   // A deletes n1
  const rb = await b.save(job, DS.extractProject(appState([node("n1", "one-edited-later"), node("n2", "two")]), job.projectId, "dev-b", clockB.t));
  assert.equal(rb.status, "merged");
  assert.ok(rb.doc.nodes.some((n) => n.id === "n1" && n.title === "one-edited-later"), "B's later edit beats A's earlier delete");
});

test("save writes nothing when nothing changed, and never writes without a loaded Drive file", async () => {
  const drive = fakeDrive();
  const e = await seed(drive, memCache(), [node("n1", "one")]);
  const writes = drive.writes.length;
  const same = await e.save(job, DS.extractProject(appState([node("n1", "one")]), job.projectId, "dev-a", T0));
  assert.equal(same.status, "clean");
  assert.equal(drive.writes.length, writes);
  const fresh = engine(fakeDrive(), memCache(), "dev-z", { t: T0 });
  assert.equal((await fresh.save(job, DS.newDoc("prj-fake-1", "dev-z", T0))).status, "no-remote");
});

test("offline: edits queue locally, the cached doc opens offline, and reconnect syncs through the merge path", async () => {
  const drive = fakeDrive(), cache = memCache();
  await seed(drive, memCache(), [node("n1", "one"), node("n2", "two")]);
  const clock = { t: T0 + 1000 };
  const dev = engine(drive, cache, "dev-a", clock);
  await dev.load(job);
  drive.offline = true;
  const queued = await dev.save(job, DS.extractProject(appState([node("n1", "one-offline-edit"), node("n2", "two")]), job.projectId, "dev-a", clock.t));
  assert.equal(queued.status, "queued");
  assert.ok(cache.m.has("pstate-queue:prj-fake-1"));
  const reopened = engine(drive, cache, "dev-a", clock);
  const off = await reopened.load(job);
  assert.equal(off.status, "offline");
  assert.equal(off.unsynced, true);
  assert.equal(off.doc.nodes.find((n) => n.id === "n1").title, "one-offline-edit");
  const q2 = await reopened.save(job, DS.extractProject(appState([node("n1", "one-offline-edit"), node("n2", "two-offline-too")]), job.projectId, "dev-a", clock.t + 500));
  assert.equal(q2.status, "queued", "opened offline: still queued, not lost");
  // Meanwhile another device changes n2 later.
  drive.offline = false;
  const other = engine(drive, memCache(), "dev-b", { t: T0 + 9000 });
  await other.load(job);
  await other.save(job, DS.extractProject(appState([node("n1", "one"), node("n2", "two-by-B")]), job.projectId, "dev-b", T0 + 9000));
  const synced = await reopened.flush(job);
  assert.ok(["merged", "saved"].includes(synced.status), synced.status);
  assert.equal(cache.m.has("pstate-queue:prj-fake-1"), false, "queue cleared after sync");
  const final = JSON.parse([...drive.files.values()][0].text);
  const titles = Object.fromEntries(final.nodes.map((n) => [n.id, n.title]));
  assert.equal(titles.n1, "one-offline-edit", "offline edit kept");
  assert.equal(titles.n2, "two-by-B", "B's later edit wins over the earlier offline edit");
});

test("migration precedence: Drive JSON exists -> never overwritten; none -> created; load reports no-drive-json", async () => {
  const drive = fakeDrive();
  const none = engine(drive, memCache(), "dev-a", { t: T0 });
  assert.equal((await none.load(job)).status, "no-drive-json");
  assert.equal(drive.writes.length, 0, "opening writes nothing");
  assert.equal([...drive.folders.values()].length, 0, "not even the folder");
  const local = DS.extractProject(appState([node("n1", "local data")]), job.projectId, "dev-a", T0);
  const created = await none.migrate(job, local);
  assert.equal(created.status, "created");
  assert.equal([...drive.folders.values()][0].name, "Planner data");
  assert.deepEqual(drive.writes, [["create", "prj-fake-1.json"]]);
  const other = engine(drive, memCache(), "dev-b", { t: T0 + 5 });
  const again = await other.migrate(job, DS.extractProject(appState([node("n9", "other device local")]), job.projectId, "dev-b", T0 + 5));
  assert.equal(again.status, "exists");
  assert.equal(drive.writes.length, 1, "no second write");
  const loaded = await other.load(job);
  assert.equal(loaded.status, "loaded");
  assert.deepEqual(loaded.doc.nodes.map((n) => n.id), ["n1"], "Drive data is what opens");
});

test("applyToState swaps one project's data and keeps the plan link resolved from Floor Plans", () => {
  const st = appState([node("old", "x")]);
  st.nodes.push({ id: "other-proj", projectId: "prj-other" });
  st.projects[0].floors[0].planFromJobFolder = true;
  const doc = DS.extractProject(appState([node("n1", "new")]), "prj-fake-1", "dev", T0);
  doc.floors[0].planDriveFileId = "stale-from-another-device";
  DS.applyToState(st, doc);
  assert.deepEqual(st.nodes.map((n) => n.id).sort(), ["n1", "other-proj"]);
  assert.equal(st.projects[0].floors[0].planDriveFileId, "plan-x");
});

test("Floor Plans: floors match files by name or level; PDFs and newest win; no match leaves the floor alone", () => {
  const floors = [{ id: "f1", name: "Ground floor" }, { id: "f2", name: "1st floor" }, { id: "f3", name: "Basement" }, { id: "f4", name: "Roof" }];
  const files = [
    { id: "p-g-old", name: "Level G plan.pdf", mimeType: "application/pdf", modifiedTime: "2026-01-01" },
    { id: "p-g-new", name: "Level G plan v2.pdf", mimeType: "application/pdf", modifiedTime: "2026-02-01" },
    { id: "p-g-png", name: "Level G plan v3.png", mimeType: "image/png", modifiedTime: "2026-03-01" },
    { id: "p-1", name: "18132 FIRST FLOOR M05.pdf", mimeType: "application/pdf" },
    { id: "p-b", name: "site-basement.pdf", mimeType: "application/pdf" },
    { id: "x", name: "notes.txt", mimeType: "text/plain" }
  ];
  const m = DS.matchPlanFiles(floors, files, PF.levelFromName);
  assert.equal(m.f1.id, "p-g-new");
  assert.equal(m.f2.id, "p-1");
  assert.equal(m.f3.id, "p-b");
  assert.equal(m.f4, undefined);
  assert.equal(DS.matchPlanFiles([{ id: "a", name: "Level B" }], [{ id: "q", name: "Level B plan.pdf", mimeType: "application/pdf" }], PF.levelFromName).a.id, "q");
});

test("job folder discovery under the jobs root is generic and refuses ambiguity", () => {
  const F = "application/vnd.google-apps.folder";
  const kids = [{ id: "1", name: "Fake Street Photos", mimeType: F }, { id: "2", name: "Other Road Photos", mimeType: F }, { id: "3", name: "Fake street", mimeType: "text/plain" }];
  assert.equal(DS.discoverJobFolder("Fake street", kids).id, "1");
  assert.equal(DS.discoverJobFolder("Nowhere", kids), null);
  assert.equal(DS.discoverJobFolder("Fake street", kids.concat([{ id: "4", name: "fake street", mimeType: F }])), null);
});

test("a doc seeded from sheet rows has the schema, tombstone maps and per-entity times", () => {
  const doc = DS.docFromSheetRows("p1", { floors: [["f1", "p1", "n", "Ground floor", "0", "", "", "", "t", "1.4", ""]], rooms: [["r1", "p1", "f1", "14A", "t", "t", "0", '{"type":"poly","pts":[[1,2]]}']], nodes: [], stampedAt: "2026-11-16T00:00:00Z" }, "seed", T0);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.rooms[0].shape.type, "poly");
  assert.equal(doc.floors[0].planAspectRatio, 1.4);
  assert.ok(doc.rooms[0]._mt > 0);
  assert.deepEqual(doc.tombstones, { floors: {}, rooms: {}, nodes: {} });
});

test("first open with a Drive JSON merges local-only work instead of dropping it", () => {
  const N = Date.now();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  const remote = Object.assign(DS.newDoc("prj-fake-1", "seed", N), { rev: 1, nodes: [{ id: "a", title: "remote", updatedAt: iso(N - 3600e3), _mt: N - 3600e3 }, { id: "z", title: "remote only", _mt: N - 3600e3 }], tombstones: { floors: {}, rooms: {}, nodes: { gone: N - 60e3 } } });
  const local = DS.extractProject(appState([Object.assign(node("a", "local newer", iso(N - 60e3))), node("b", "local only", iso(N - 120e3)), node("gone", "deleted on Drive after this edit", iso(N - 7200e3))]), "prj-fake-1", "dev", N);
  const m = DS.merge(DS.legacyStamp(local), remote);
  const t = Object.fromEntries(m.nodes.map((n) => [n.id, n.title]));
  assert.equal(t.a, "local newer");
  assert.equal(t.b, "local only");
  assert.equal(t.z, "remote only");
  assert.equal("gone" in t, false);
});

test("the Drive sync badge shows offline/unsynced, the migrate button only when no Drive JSON exists, and never auto-writes", () => {
  const fs = require("node:fs"), path = require("node:path");
  const { context } = require("./test-utils.cjs");
  const proj = { id: "prj-fake-1", name: "Fake", floors: [{ id: "flr-1", name: "Ground floor" }] };
  const st = { projects: [proj], rooms: [], nodes: [node("n1", "x")], selectedProjectId: proj.id, ui: {} };
  const ctx = context(fs.readFileSync(path.join(__dirname, "js/drive-sync.js"), "utf8") + "\nthis.driveSync = driveSync;", {
    window: { NDDriveState: DS, addEventListener() {} }, NDDriveState: DS, state: st, project: () => proj, icon: (n) => `<i data-i="${n}"></i>`,
    escapeHtml: (v) => String(v), uid: () => "dev-x", localStorage: { getItem: () => "dev-x", setItem() {} }, render() {}
  });
  const set = (status, unsynced) => { ctx.driveSync.projectId = proj.id; ctx.driveSync.status = status; ctx.driveSync.unsynced = unsynced; };
  set("offline", true);
  assert.match(ctx.renderDriveSyncBadge(), /Offline · unsynced/);
  set("synced", false);
  assert.match(ctx.renderDriveSyncBadge(), /Drive: synced/);
  assert.doesNotMatch(ctx.renderDriveSyncBadge(), /drive-migrate/);
  set("no-drive-json", false);
  assert.match(ctx.renderDriveSyncBadge(), /data-action="drive-migrate"/);
  assert.match(ctx.renderDriveSyncBadge(), /Save this project to Drive/);
  ctx.driveSync.ready = false;
  ctx.driveSync.projectId = proj.id;
  ctx.scheduleDriveSave();
  assert.equal(ctx.driveSync.timer, 0, "no save is scheduled until a Drive file was loaded or migrated");
});

test("a doc floor with no plan link never blanks the plan link the device resolved", () => {
  const st = appState([]);
  const doc = DS.newDoc("prj-fake-1", "seed", T0);
  doc.floors = [{ id: "flr-1", name: "Ground floor", order: 0, planDriveFileId: null, planPngFileId: "" }];
  DS.applyToState(st, doc);
  assert.equal(st.projects[0].floors[0].planDriveFileId, "plan-x");
});
