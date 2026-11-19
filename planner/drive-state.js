/* Drive-first project state for Neill Planner.
 * A project's floors, rooms and nodes live in '<job folder>/Planner data/<projectId>.json'.
 * Pure logic plus an engine that takes an injected Drive adapter and cache, so it runs in the page and in Node tests.
 * Writes: only the 'Planner data' folder and that JSON file. Originals (photos, plans, Excel) are never touched. */
(function (root) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const FOLDER_NAME = "Planner data";
  const TYPES = ["floors", "rooms", "nodes"];
  const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000;

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function strip(entity) { const c = Object.assign({}, entity); delete c._mt; return c; }
  function same(a, b) { return JSON.stringify(sortKeys(strip(a))) === JSON.stringify(sortKeys(strip(b))); }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = sortKeys(v[k]); }); return o; }
    return v;
  }

  /* Big inline image data never belongs in the JSON; Drive file ids and links do. */
  function lean(entity) {
    const out = {};
    Object.keys(entity || {}).forEach((k) => {
      const v = entity[k];
      if (typeof v === "string" && v.startsWith("data:")) return;
      if (k === "imageRefs" && Array.isArray(v)) { out[k] = v.map((img) => lean(img)); return; }
      out[k] = clone(v);
    });
    return out;
  }

  function newDoc(projectId, deviceId, nowMs) {
    return { schemaVersion: SCHEMA_VERSION, projectId: projectId, updatedAt: new Date(nowMs || Date.now()).toISOString(), updatedBy: deviceId || "", rev: 0, floors: [], rooms: [], nodes: [], tombstones: { floors: {}, rooms: {}, nodes: {} } };
  }

  /* The project's data from live app state. Runtime-only floor fields are left out. */
  function extractProject(appState, projectId, deviceId, nowMs) {
    const doc = newDoc(projectId, deviceId, nowMs);
    const proj = (appState.projects || []).find((p) => p.id === projectId);
    doc.floors = ((proj && proj.floors) || []).map((f) => { const o = lean(f); delete o.planPendingUpload; return o; });
    doc.rooms = (appState.rooms || []).filter((r) => r.projectId === projectId).map(lean);
    doc.nodes = (appState.nodes || []).filter((n) => n.projectId === projectId).map(lean);
    return doc;
  }

  function hasContent(doc) { return !!doc && TYPES.some((t) => (doc[t] || []).length > 0); }

  /* Give each entity a modified time (_mt) and record deletions. An entity unchanged since `base` keeps
   * its old _mt, so merges compare real edit times without hooking every mutation. */
  function stamp(local, base, nowMs) {
    const out = clone(local);
    out.tombstones = { floors: {}, rooms: {}, nodes: {} };
    TYPES.forEach((t) => {
      const baseMap = new Map(((base && base[t]) || []).map((e) => [e.id, e]));
      out[t] = (out[t] || []).map((e) => {
        const b = baseMap.get(e.id);
        e._mt = b && b._mt != null && same(b, e) ? b._mt : nowMs;
        return e;
      });
      const have = new Set(out[t].map((e) => e.id));
      const prev = (base && base.tombstones && base.tombstones[t]) || {};
      Object.keys(prev).forEach((id) => { if (!have.has(id)) out.tombstones[t][id] = prev[id]; });
      baseMap.forEach((e, id) => { if (!have.has(id) && !out.tombstones[t][id]) out.tombstones[t][id] = nowMs; });
    });
    return out;
  }

  /* A doc taken from app state that has never been synced: each entity's time is its own updatedAt
   * (or createdAt), read as UTC, else 0. Merging this with the Drive doc keeps local-only work and lets
   * a newer Drive edit or deletion win, instead of one side replacing the other. */
  function legacyStamp(doc) {
    const out = clone(doc);
    out.tombstones = { floors: {}, rooms: {}, nodes: {} };
    const ms = (e) => { const v = String(e.updatedAt || e.createdAt || ""); const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(" ", "T") + "Z"); return Number.isNaN(t) ? 0 : t; };
    TYPES.forEach((t) => { out[t] = (out[t] || []).map((e) => { e._mt = ms(e); return e; }); });
    return out;
  }

  /* Per entity by id: newer _mt wins; a deletion beats an older edit and loses to a newer one.
   * Ties go to remote so two devices converge on the same result. */
  function merge(local, remote) {
    const out = newDoc(local.projectId || remote.projectId, local.updatedBy, Date.parse(local.updatedAt) || Date.now());
    out.rev = Math.max(local.rev || 0, remote.rev || 0) + 1;
    const stamps = [local.updatedAt, remote.updatedAt].filter(Boolean).sort();
    out.updatedAt = stamps.length ? stamps[stamps.length - 1] : out.updatedAt;
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    TYPES.forEach((t) => {
      const l = new Map((local[t] || []).map((e) => [e.id, e]));
      const r = new Map((remote[t] || []).map((e) => [e.id, e]));
      const tomb = {};
      [remote, local].forEach((d) => { const m = (d.tombstones && d.tombstones[t]) || {}; Object.keys(m).forEach((id) => { tomb[id] = Math.max(tomb[id] || 0, m[id]); }); });
      const ids = new Set([...l.keys(), ...r.keys()]);
      ids.forEach((id) => {
        const a = l.get(id), b = r.get(id);
        let pick = a && b ? ((a._mt || 0) > (b._mt || 0) ? a : b) : (a || b);
        if (tomb[id] != null && tomb[id] >= (pick._mt || 0)) return;
        out[t].push(clone(pick));
      });
      Object.keys(tomb).forEach((id) => { if (tomb[id] >= cutoff && !out[t].some((e) => e.id === id)) out.tombstones[t][id] = tomb[id]; });
    });
    return out;
  }

  /* Replace one project's floors, rooms and nodes in app state with the doc's.
   * A floor keeps its local-only fields (e.g. the plan file link resolved from Floor Plans). */
  function applyToState(appState, doc) {
    const proj = (appState.projects || []).find((p) => p.id === doc.projectId);
    if (!proj) return false;
    const localFloors = new Map((proj.floors || []).map((f) => [f.id, f]));
    proj.floors = (doc.floors || []).map((f) => { const incoming = strip(f); Object.keys(incoming).forEach((k) => { if (/^plan/.test(k) && (incoming[k] == null || incoming[k] === "")) delete incoming[k]; }); const o = Object.assign({}, localFloors.get(f.id) || {}, incoming); const lf = localFloors.get(f.id); if (lf && lf.planDriveFileId && lf.planFromJobFolder) { o.planDriveFileId = lf.planDriveFileId; o.planFromJobFolder = true; } return o; });
    appState.rooms = (appState.rooms || []).filter((r) => r.projectId !== doc.projectId).concat((doc.rooms || []).map(strip));
    appState.nodes = (appState.nodes || []).filter((n) => n.projectId !== doc.projectId).concat((doc.nodes || []).map(strip));
    return true;
  }

  /* Doc from master-sheet rows (Floors, Rooms, Nodes tabs): used to seed a job's JSON from the sheet. */
  function docFromSheetRows(projectId, rows, deviceId, nowMs) {
    const doc = newDoc(projectId, deviceId, nowMs);
    const num = (v) => (v === "" || v == null ? null : Number(v));
    (rows.floors || []).filter((r) => r[1] === projectId).forEach((r) => doc.floors.push({ id: r[0], name: r[3] || "", order: Number(r[4]) || 0, planDriveFileId: r[5] || null, planAspectRatio: num(r[9]), planPngFileId: r[10] || null, createdAt: r[8] || "" }));
    (rows.rooms || []).filter((r) => r[1] === projectId).forEach((r) => { let shape = null; try { shape = r[7] ? JSON.parse(r[7]) : null; } catch (e) { shape = null; } doc.rooms.push({ id: r[0], projectId: projectId, floorId: r[2], name: r[3] || "", createdAt: r[4] || "", updatedAt: r[5] || "", order: Number(r[6]) || 0, shape: shape }); });
    (rows.nodes || []).filter((r) => r[1] === projectId).forEach((r) => doc.nodes.push({ id: r[0], projectId: projectId, floorId: r[3], type: r[5] || "marker", title: r[6] || "", customTitle: r[7] || "", category: r[8] || "", lineItem: r[9] || "", status: r[10] || "Not Started", assignedTo: r[11] || "", description: r[16] || "", position: { x: num(r[13]), y: num(r[14]) }, size: num(r[15]) || 1, createdBy: r[19] || "", createdAt: r[20] || "", updatedAt: r[21] || "", roomId: r[27] || null, roomName: r[28] || "", imageRefs: [] }));
    const mt = Date.parse(String(rows.stampedAt || "")) || (nowMs || Date.now());
    TYPES.forEach((t) => doc[t].forEach((e) => { e._mt = mt; }));
    return doc;
  }

  function isOfflineError(e) {
    if (!e) return false;
    if (e.offline) return true;
    const status = Number(e.status || (e.result && e.result.error && e.result.error.code) || 0);
    if (status === 0 && /network|fetch|failed|offline/i.test(String(e.message || e) + (e.name || ""))) return true;
    return status === 0 || status === 502 || status === 503 || status === 504;
  }

  /* adapter: { findFolder(parentId,name), createFolder(parentId,name), findFile(folderId,name), getMeta(fileId) -> {rev},
   *            download(fileId) -> text, createFile(folderId,name,text) -> {id,rev}, updateFile(fileId,text) -> {rev} }
   * cache: { get(key), put(key,value), remove(key) } (async). */
  function createEngine(opts) {
    const drive = opts.drive, cache = opts.cache, deviceId = opts.deviceId || "device";
    const now = opts.now || (() => Date.now());
    const bases = new Map();    // projectId -> { fileId, folderId, rev, doc }

    const qKey = (pid) => "pstate-queue:" + pid, dKey = (pid) => "pstate-doc:" + pid;
    const finish = (doc) => { doc.updatedAt = new Date(now()).toISOString(); doc.updatedBy = deviceId; return doc; };

    async function readRemote(fileId) {
      const text = await drive.download(fileId);
      const doc = JSON.parse(text);
      if (!doc || doc.schemaVersion > SCHEMA_VERSION) throw new Error("Planner data was written by a newer Planner. Update the app first.");
      TYPES.forEach((t) => { doc[t] = doc[t] || []; });
      doc.tombstones = doc.tombstones || { floors: {}, rooms: {}, nodes: {} };
      TYPES.forEach((t) => { doc.tombstones[t] = doc.tombstones[t] || {}; });
      return doc;
    }

    async function remember(pid, info) { bases.set(pid, info); try { await cache.put(dKey(pid), { fileId: info.fileId, rev: info.rev, doc: info.doc }); } catch (e) {} }

    async function locate(job, create) {
      const folder = (await drive.findFolder(job.jobFolderId, FOLDER_NAME)) || (create ? await drive.createFolder(job.jobFolderId, FOLDER_NAME) : null);
      if (!folder) return { folderId: "", file: null };
      const file = await drive.findFile(folder.id, job.projectId + ".json");
      return { folderId: folder.id, file: file };
    }

    /* Open: Drive wins when its file exists. A queued offline edit is merged on top, never dropped.
     * No Drive file: report it, write nothing. */
    async function load(job) {
      const pid = job.projectId;
      const queued = await cache.get(qKey(pid)).catch(() => null);
      let found;
      try { found = await locate(job, false); }
      catch (e) {
        if (!isOfflineError(e)) throw e;
        const cached = await cache.get(dKey(pid)).catch(() => null);
        return { status: "offline", doc: queued ? queued.doc : (cached && cached.doc) || null, unsynced: !!queued, cached: !!cached };
      }
      if (!found.file) return { status: "no-drive-json", doc: null, unsynced: !!queued };
      let remote;
      try { remote = await readRemote(found.file.id); }
      catch (e) {
        if (!isOfflineError(e)) throw e;
        const cached = await cache.get(dKey(pid)).catch(() => null);
        return { status: "offline", doc: queued ? queued.doc : (cached && cached.doc) || null, unsynced: !!queued, cached: !!cached };
      }
      const meta = await drive.getMeta(found.file.id);
      await remember(pid, { fileId: found.file.id, folderId: found.folderId, rev: meta.rev, doc: remote });
      if (queued) {
        const res = await save(job, queued.doc, { fromQueue: true, baseDoc: queued.baseDoc, stampMs: queued.queuedAt });
        return { status: res.status === "queued" ? "offline" : "merged", doc: res.doc, unsynced: res.status === "queued" };
      }
      return { status: "loaded", doc: remote, unsynced: false };
    }

    /* Debounced-save target. Never writes unless a Drive file was loaded (or migrate() made one). */
    async function save(job, localDoc, o) {
      const pid = job.projectId;
      const base = bases.get(pid);
      if (!base) {
        const cached = await cache.get(dKey(pid)).catch(() => null);   // opened offline: keep the edit for later
        if (!cached) return { status: "no-remote", doc: localDoc };
        await cache.put(qKey(pid), { doc: localDoc, baseDoc: cached.doc, queuedAt: now() }).catch(() => {});
        return { status: "queued", doc: localDoc };
      }
      const o2 = o || {};
      const nowMs = o2.stampMs || now();
      const baseDoc = o2.baseDoc || base.doc;
      try {
        const meta = await drive.getMeta(base.fileId);
        let outgoing, status = "saved";
        if (meta.rev !== base.rev || o2.fromQueue) {
          const remote = await readRemote(base.fileId);
          outgoing = merge(stamp(localDoc, baseDoc, nowMs), remote);
          status = "merged";
        } else {
          outgoing = stamp(localDoc, baseDoc, nowMs);
          const unchanged = TYPES.every((t) => outgoing[t].length === base.doc[t].length && outgoing[t].every((e, i) => base.doc[t][i] && e._mt === base.doc[t][i]._mt && e.id === base.doc[t][i].id)) &&
            TYPES.every((t) => Object.keys(outgoing.tombstones[t]).length === Object.keys(base.doc.tombstones[t] || {}).length);
          if (unchanged) { await cache.remove(qKey(pid)).catch(() => {}); return { status: "clean", doc: base.doc }; }
          outgoing.rev = (base.doc.rev || 0) + 1;
        }
        finish(outgoing);
        const written = await drive.updateFile(base.fileId, JSON.stringify(outgoing));
        const info = { fileId: base.fileId, folderId: base.folderId, rev: written && written.rev != null ? written.rev : (await drive.getMeta(base.fileId)).rev, doc: outgoing };
        await remember(pid, info);
        await cache.remove(qKey(pid)).catch(() => {});
        return { status: status, doc: outgoing };
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        await cache.put(qKey(pid), { doc: localDoc, baseDoc: baseDoc, queuedAt: nowMs }).catch(() => {});
        return { status: "queued", doc: localDoc };
      }
    }

    /* One-tap migration: create the JSON from local data only when none exists. */
    async function migrate(job, localDoc) {
      const pid = job.projectId;
      const found = await locate(job, true);
      if (found.file) return { status: "exists", doc: null };   // never overwrite
      const nowMs = now();
      const doc = finish(stamp(localDoc, null, nowMs));
      doc.rev = 1;
      const created = await drive.createFile(found.folderId, pid + ".json", JSON.stringify(doc));
      await remember(pid, { fileId: created.id, folderId: found.folderId, rev: created.rev, doc: doc });
      return { status: "created", doc: doc };
    }

    /* After reconnecting: push any queued edit through the same conflict path. */
    async function flush(job) {
      const queued = await cache.get(qKey(job.projectId)).catch(() => null);
      if (!queued) return { status: "clean" };
      if (!bases.get(job.projectId)) { const res = await load(job); return { status: res.status, doc: res.doc }; }
      return save(job, queued.doc, { fromQueue: true, baseDoc: queued.baseDoc, stampMs: queued.queuedAt });
    }

    return { load: load, save: save, migrate: migrate, flush: flush, _bases: bases };
  }

  /* Floors <-> files in the Floor Plans folder. A file named like the floor wins, then one whose name
   * reads as the same level ("Level 1", "FIRST FLOOR", "Basement"). Newest file wins ties; PDFs before images. */
  function matchPlanFiles(floors, files, levelFromName) {
    const usable = (files || []).filter((f) => f && f.name && f.mimeType !== "application/vnd.google-apps.folder" && (/pdf|image\//i.test(f.mimeType || "") || /\.(pdf|png|jpe?g)$/i.test(f.name)));
    const stem = (n) => String(n).replace(/\.[A-Za-z0-9]{2,5}$/, "");
    const norm = (n) => stem(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const levelOf = (n) => {
      const direct = levelFromName(stem(n));
      if (direct) return direct.key;
      const m = norm(n).match(/\b(basement|ground|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|level (?:b|g|\d+))\b(?: floor)?/);
      const l = m ? levelFromName(m[1]) : null;
      return l ? l.key : "";
    };
    const rank = (f) => (/pdf/i.test(f.mimeType || f.name) ? 0 : 1);
    const best = (list) => list.sort((a, b) => rank(a) - rank(b) || String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")))[0] || null;
    const result = {};
    (floors || []).forEach((floor) => {
      const exact = usable.filter((f) => norm(f.name) === norm(floor.name) || norm(f.name).startsWith(norm(floor.name) + " "));
      let pick = best(exact.slice());
      if (!pick) {
        const lvl = levelFromName(floor.name);
        if (lvl) pick = best(usable.filter((f) => levelOf(f.name) === lvl.key));
      }
      if (pick) result[floor.id] = pick;
    });
    return result;
  }

  /* Job folder for a project that has no linked folder: a folder under the jobs root whose name
   * (minus a trailing "Photos") equals the project's name, ignoring case and spacing. */
  function discoverJobFolder(projectName, rootChildren) {
    const key = (s) => String(s || "").toLowerCase().replace(/\bphotos?\b/g, "").replace(/[^a-z0-9]+/g, "");
    const want = key(projectName);
    if (!want) return null;
    const hits = (rootChildren || []).filter((f) => f.mimeType === "application/vnd.google-apps.folder" && key(f.name) === want);
    return hits.length === 1 ? hits[0] : null;
  }

  const API = { SCHEMA_VERSION: SCHEMA_VERSION, FOLDER_NAME: FOLDER_NAME, extractProject: extractProject, hasContent: hasContent, stamp: stamp, legacyStamp: legacyStamp, merge: merge, applyToState: applyToState, docFromSheetRows: docFromSheetRows, createEngine: createEngine, matchPlanFiles: matchPlanFiles, discoverJobFolder: discoverJobFolder, isOfflineError: isOfflineError, newDoc: newDoc };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDDriveState = API;
})(typeof window !== "undefined" ? window : globalThis);
