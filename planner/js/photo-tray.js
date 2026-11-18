/* Live Drive photo tray. Files stay in Drive; this module only lists them
 * and, when one is dropped on the plan, records a node that points at the file.
 * Listing uses the signed-in account's existing full Drive scope (auth/drive),
 * which sees files other people uploaded into a folder that account can open.
 * auth/drive.file would not: it only returns files this app created. */

const PHOTO_FOLDER_MIME = "application/vnd.google-apps.folder";
const PHOTO_POLL_MS = 45000;
let photoLibrary = null;
let photoPollTimer = 0;
let photoListBusy = false;
let photoListRows = null;
let photoGhost = null;
let photoDragBlock = null;

function photoApi() { return window.NDPhotoFolders || null; }

function listDriveChildren(folderId) {
  const files = [];
  let pageToken = "";
  const step = async () => {
    const params = {
      q: "'" + escapeDriveQuery(folderId) + "' in parents and trashed=false",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await googleCall(() => gapi.client.drive.files.list(params));
    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken || "";
  };
  const run = async () => { await step(); if (pageToken) return run(); return files; };
  return run();
}

function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  };
  const n = Math.min(limit, items.length);
  return Promise.all(Array.from({ length: n }, worker)).then(() => out);
}

async function loadPhotoTree(rootId) {
  const api = photoApi();
  const rootFiles = await listDriveChildren(rootId);
  const folders = rootFiles.filter((file) => file.mimeType === PHOTO_FOLDER_MIME);
  const children = {};
  const levelLists = await mapPool(folders, 4, async (folder) => [folder.id, await listDriveChildren(folder.id)]);
  const apartments = [];
  levelLists.forEach(([id, files]) => {
    children[id] = files;
    files.forEach((file) => { if (file.mimeType === PHOTO_FOLDER_MIME) apartments.push({ file: file, parentId: id }); });
  });
  const aptLists = await mapPool(apartments, 4, async (entry) => [entry.file.id, await listDriveChildren(entry.file.id)]);
  const nested = [];
  aptLists.forEach(([id, files]) => {
    children[id] = files;
    files.forEach((file) => { if (file.mimeType === PHOTO_FOLDER_MIME) nested.push(file); });
  });
  let trimmed = false;
  const stageNamed = [];
  const otherNamed = [];
  nested.forEach((file) => { (api.stageFromName(file.name) ? stageNamed : otherNamed).push(file); });
  const capped = stageNamed.concat(otherNamed).slice(0, 400);
  if (nested.length > capped.length) trimmed = true;
  const nestedLists = await mapPool(capped, 4, async (file) => [file.id, await listDriveChildren(file.id)]);
  nestedLists.forEach(([id, files]) => { children[id] = files; });
  const grouped = api.groupPhotoFiles(rootFiles, children);
  grouped.trimmed = trimmed;
  return grouped;
}

function photoSignature(lib) {
  if (!lib) return "";
  const ids = [];
  (lib.levels || []).forEach((level) => {
    ids.push("L" + level.folderId);
    (level.apartments || []).forEach((apt) => { ids.push("A" + apt.folderId); (apt.photos || []).forEach((photo) => ids.push((photo.stage || "") + ":" + photo.id)); });
    (level.loose || []).forEach((photo) => ids.push(photo.id));
  });
  (lib.loose || []).forEach((photo) => ids.push(photo.id));
  return ids.join("|");
}

function photoFileById(id) {
  if (!photoLibrary || !id) return null;
  const found = [];
  (photoLibrary.levels || []).forEach((level) => {
    found.push(...(level.loose || []));
    (level.apartments || []).forEach((apt) => found.push(...(apt.photos || [])));
  });
  found.push(...(photoLibrary.loose || []));
  return found.find((file) => file.id === id) || null;
}

function placedPhotoIds() {
  const ids = new Set();
  state.nodes.forEach((node) => (node.imageRefs || []).forEach((image) => {
    const id = image.driveFileId || image.id;
    if (id) ids.add(id);
  }));
  return ids;
}

async function refreshPhotoLibrary(opts) {
  const proj = project();
  const manual = !opts || !opts.silent;
  if (!proj || !proj.photoFolderId) { photoLibrary = null; return; }
  if (!isTokenValid()) {
    photoLibrary = { projectId: proj.id, folderId: proj.photoFolderId, error: "Sign in to load photos from Drive.", levels: [], loose: [], fetchedAt: Date.now() };
    if (manual) render();
    return;
  }
  if (photoListBusy) return;
  photoListBusy = true;
  const folderId = proj.photoFolderId;
  try {
    const tree = await loadPhotoTree(folderId);
    if (!project() || project().photoFolderId !== folderId) return;
    const next = Object.assign({ projectId: proj.id, folderId: folderId, error: "", fetchedAt: Date.now() }, tree);
    const same = photoLibrary && photoLibrary.folderId === folderId && photoSignature(photoLibrary) === photoSignature(next) && !photoLibrary.error;
    photoLibrary = next;
    const stamped = rememberFolderStages(next);
    if (!same || stamped) render();
    else if (manual) toast("Photo folder is up to date");
  } catch (e) {
    const message = describeError(e);
    photoLibrary = { projectId: proj.id, folderId: folderId, error: message, levels: photoLibrary && photoLibrary.folderId === folderId ? photoLibrary.levels : [], loose: [], fetchedAt: Date.now() };
    if (manual) toast("Couldn't list the photo folder: " + message);
    render();
  } finally { photoListBusy = false; }
}

function syncPhotoPoll() {
  const proj = state.googleAuth.signedIn ? project() : null;
  if (state.activeView !== "map" || !proj || !proj.photoFolderId) {
    if (photoPollTimer) { clearInterval(photoPollTimer); photoPollTimer = 0; }
    return;
  }
  if (!photoLibrary || photoLibrary.folderId !== proj.photoFolderId || photoLibrary.projectId !== proj.id) refreshPhotoLibrary({ silent: true });
  if (!photoPollTimer) photoPollTimer = setInterval(() => { refreshPhotoLibrary({ silent: true }); }, PHOTO_POLL_MS);
}

function photoCount(lib) {
  if (!lib) return 0;
  let n = (lib.loose || []).length;
  (lib.levels || []).forEach((level) => {
    n += (level.loose || []).length;
    (level.apartments || []).forEach((apt) => { n += (apt.photos || []).length; });
  });
  return n;
}

function renderPhotoThumb(file, placed) {
  const id = file.id;
  const src = file.thumbnailLink || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return `<button type="button" class="photo-thumb${placed ? " is-placed" : ""}" data-photo-id="${escapeHtml(id)}" aria-label="${escapeHtml(file.name || "Photo")}. ${placed ? "Already on a node. " : ""}Long-press and drag onto the plan, or tap then tap the plan."><img data-fileid="${escapeHtml(id)}" src="${escapeHtml(src)}" alt="" draggable="false" /><span class="photo-thumb-name">${escapeHtml(file.name || "")}</span></button>`;
}

function renderPhotoGroup(title, photos, placed) {
  if (!photos.length) return "";
  return `<div class="photo-apt"><div class="photo-apt-name">${escapeHtml(title)}<span>${photos.length}</span></div><div class="photo-row">${photos.map((file) => renderPhotoThumb(file, placed.has(file.id))).join("")}</div></div>`;
}

function renderStageGroups(apt, placed) {
  const api = photoApi();
  return (apt.stages || []).map((stage) => {
    const photos = stage.photos || [];
    if (!photos.length) return "";
    const meta = api ? api.stageMeta(stage.key) : { label: stage.label || stage.key, tone: "plain" };
    return `<div class="photo-stage is-${escapeHtml(meta.tone)}"><div class="photo-stage-name"><i aria-hidden="true"></i>${escapeHtml(meta.label)}<span>${photos.length}</span></div><div class="photo-row">${photos.map((file) => renderPhotoThumb(file, placed.has(file.id))).join("")}</div></div>`;
  }).join("");
}

function renderApartmentBlock(apt, placed) {
  const body = renderStageGroups(apt, placed);
  if (!body) return "";
  return `<div class="photo-apt"><div class="photo-apt-name">${escapeHtml(apt.name)}</div>${body}</div>`;
}

function photoStageOverrideMap() {
  const api = photoApi();
  const map = {};
  state.nodes.forEach((node) => {
    const stage = api ? api.normalizeStage(node.stage) : "";
    if (!stage) return;
    (node.imageRefs || []).forEach((image) => {
      const id = image.driveFileId || image.id;
      if (id) map[id] = stage;
    });
  });
  return map;
}

function photoStageProgress(proj, lib) {
  const api = photoApi();
  if (!api || !proj) return null;
  const collected = api.collectApartmentStages(lib || { levels: [] }, photoStageOverrideMap());
  const keys = collected.keys.slice();
  const seen = new Set(keys);
  state.rooms.filter((room) => room.projectId === proj.id).forEach((room) => {
    const apt = api.apartmentFromName(room.name);
    if (!apt || seen.has(apt.key)) return;
    seen.add(apt.key);
    keys.push(apt.key);
  });
  const progress = api.stageProgress(keys, collected.present);
  return progress.total ? progress : null;
}

function renderStageProgress(progress) {
  if (!progress) return "";
  const item = (tone, label, count, pct) => `<span class="is-${tone}"><i aria-hidden="true"></i>${label} <strong>${count} of ${progress.total}</strong> <em>${pct}%</em></span>`;
  return `<p class="photo-progress" aria-label="Stage progress">${item("rough", "Rough-in", progress.roughIn, progress.roughPct)}${item("fit", "Fit-off", progress.fitOff, progress.fitPct)}</p>`;
}

function renderPhotoTray(proj) {
  if (!proj) return "";
  const linked = proj.photoFolderId || "";
  if (!linked) {
    return `<section class="photo-tray"><h3 class="section-title">Drive photos</h3><p class="summary-hint">Link the Drive folder technicians upload into. Level folders map onto floors (Level G is the ground floor) and the folders inside them are apartments. Photos stay in Drive.</p><form id="photoLinkForm" class="photo-link-form"><input name="photoFolder" aria-label="Photo folder link" placeholder="Paste a Drive folder link" autocomplete="off" /><button class="primary-button" type="submit">${icon("link")}Link</button></form></section>`;
  }
  const lib = photoLibrary && photoLibrary.folderId === linked ? photoLibrary : null;
  const placed = placedPhotoIds();
  const when = lib && lib.fetchedAt ? new Date(lib.fetchedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";
  const body = !lib ? `<p class="summary-hint">Loading the folder…</p>`
    : lib.error && !photoCount(lib) ? `<p class="summary-hint" role="alert">${escapeHtml(lib.error)}</p>`
    : `${lib.error ? `<p class="summary-hint" role="alert">${escapeHtml(lib.error)}</p>` : ""}
      ${renderStageProgress(photoStageProgress(proj, lib))}
      ${(lib.levels || []).map((level) => `<section class="photo-level"><h4>${icon("layers")}${escapeHtml(level.name)}</h4>${(level.apartments || []).map((apt) => renderApartmentBlock(apt, placed)).join("")}${renderPhotoGroup("In this level folder", level.loose || [], placed)}</section>`).join("")}
      ${renderPhotoGroup("In the photo folder", lib.loose || [], placed)}
      ${photoCount(lib) ? "" : `<p class="summary-hint">No photos in this folder yet. New uploads show up on refresh.</p>`}
      ${lib.trimmed ? `<p class="summary-hint">Some deeply nested folders were skipped.</p>` : ""}`;
  return `<section class="photo-tray" aria-label="Drive photos">
    <div class="photo-tray-head"><h3 class="section-title">Drive photos</h3><p class="summary-hint">${photoCount(lib)} photo${photoCount(lib) === 1 ? "" : "s"}${when ? " · " + escapeHtml(when) : ""}. Grouped by level, apartment, then Rough-in or Fit-off. Long-press a thumbnail, then drag it onto the plan. A tap arms placement for the next tap on the plan.</p></div>
    <div class="photo-tray-actions">
      <button class="ghost-button" type="button" data-action="refresh-photo-folder">${icon("refresh")}Refresh</button>
      <button class="ghost-button" type="button" data-action="open-photo-folder">${icon("folder")}Drive</button>
      <button class="ghost-button" type="button" data-action="sync-photo-structure">${icon("layers")}Add floors</button>
      <button class="ghost-button" type="button" data-action="push-photo-folders" title="Create level, apartment, Rough-in and Fit-off folders">${icon("upload")}Make folders</button>
      <button class="ghost-button" type="button" data-action="photo-list">${icon("edit")}From a list</button>
    </div>
    ${body}
  </section>`;
}

function renderPhotoPlaceBanner() {
  const file = photoFileById(state.photoPlace && state.photoPlace.fileId);
  const name = file ? file.name : "Photo";
  return `<div class="mass-banner photo-place-banner" role="status">${icon("camera")}<span>Tap the plan to place ${escapeHtml(name)}</span><button class="ghost-button" type="button" data-action="cancel-photo-place">${icon("close")}Cancel</button></div>`;
}

function renderPhotoListModal() {
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="photoListForm" role="dialog"><div class="modal-header"><div><h3>Apartments from a list</h3><p>Paste the apartment sheet (a heading such as APT# GROUND FLOOR, then one code per line) or choose the spreadsheet. Existing floors and apartments are left as they are.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="field full"><label for="photoListText">List</label><textarea id="photoListText" name="list" rows="8" placeholder="APT# GROUND FLOOR&#10;G.01&#10;G.02"></textarea></div><div class="field full"><label for="photoListFile">Spreadsheet</label><input id="photoListFile" name="file" type="file" accept=".xlsx,.xls,.csv,text/csv,text/plain" /></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Add missing</button></div></form>`;
}

function folderStageFor(image) {
  if (!image) return "";
  if (image.folderStage) return image.folderStage;
  const id = image.driveFileId || image.id;
  const file = id && photoFileById(id);
  return file && file.stage || "";
}

/* The folder a Drive file sits in is remembered on the photo so the card still
 * knows it after a reload. A manual node stage is left alone. Drive files are not moved. */
function rememberFolderStages(lib) {
  if (!lib) return false;
  const byId = new Map();
  (lib.levels || []).forEach((level) => {
    (level.apartments || []).forEach((apt) => {
      (apt.photos || []).forEach((photo) => { if (photo.id) byId.set(photo.id, photo.stage || "unsorted"); });
    });
  });
  if (!byId.size) return false;
  let changed = false;
  state.nodes.forEach((node) => {
    (node.imageRefs || []).forEach((image) => {
      const id = image.driveFileId || image.id;
      if (!id || !byId.has(id) || image.folderStage === byId.get(id)) return;
      image.folderStage = byId.get(id);
      changed = true;
    });
  });
  if (changed) persist();
  return changed;
}

function inheritStageLabel(node) {
  const api = photoApi();
  const keys = [];
  ((node && node.imageRefs) || []).forEach((image) => {
    const key = (api ? api.normalizeStage(folderStageFor(image)) : "") || "unsorted";
    if (keys.indexOf(key) < 0) keys.push(key);
  });
  if (!keys.length) return "From the folder";
  if (keys.length > 1) return "From the folder (mixed)";
  const meta = api ? api.stageMeta(keys[0]) : null;
  return "From the folder (" + (meta ? meta.label : "Unsorted") + ")";
}

function stageFieldOptions(node) {
  const selected = (node && node.stage) || "";
  return [["", inheritStageLabel(node)], ["rough-in", "Rough-in"], ["fit-off", "Fit-off"], ["unsorted", "Unsorted"]]
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function photoWatermarkFor(node, image) {
  const api = photoApi();
  if (!api || !node) return null;
  const proj = typeof projectById === "function" ? projectById(node.projectId) : null;
  return api.watermarkModel({
    apartment: node.apartment || "",
    room: typeof roomName === "function" ? roomName(node.roomId) : "",
    notes: node.description || "",
    photoStage: image && image.stage || "",
    nodeStage: node.stage || "",
    folderStage: folderStageFor(image),
    branding: !!(proj && proj.watermarkBranding),
    version: typeof APP_VERSION === "string" ? APP_VERSION : "",
    date: (image && (image.uploadedAt || image.modifiedTime)) || ""
  });
}

function watermarkMarkup(node, image) {
  const model = photoWatermarkFor(node, image);
  if (!model) return "";
  const place = [model.apartment, model.room].filter(Boolean).map((part) => `<b>${escapeHtml(part)}</b>`).join('<span class="wm-sep"> · </span>');
  const note = model.note ? `<span class="wm-sep" aria-hidden="true">·</span><span class="wm-note">${escapeHtml(model.note)}</span>` : "";
  const status = model.status ? `<span class="wm-status"><i class="wm-pip" aria-hidden="true"></i>${escapeHtml(model.status)}</span>` : "";
  const foot = model.footer ? `<span class="wm-foot">${escapeHtml(model.footer)}</span>` : "";
  return `<span class="photo-watermark is-${escapeHtml(model.tone)}"><span class="wm-accent" aria-hidden="true"></span><span class="wm-copy">${place ? `<span class="wm-title">${place}</span>` : ""}<span class="wm-meta"><span class="wm-stage">${escapeHtml(model.stageLabel)}</span>${status}${note}</span>${foot}</span></span>`;
}

function renderFramedPhoto(image, node, kind, index) {
  const did = image.driveFileId || image.id || "";
  const thumb = image.thumbnailLink ? (kind === "lightbox" ? image.thumbnailLink.replace(/=s\d+(-c)?$/, "=s1600") : image.thumbnailLink) : "";
  const src = thumb || (did && typeof driveThumb === "function" ? driveThumb(did, kind === "lightbox" ? 1600 : 400) : "");
  const img = (src || did) ? `<img ${did ? `data-fileid="${escapeHtml(did)}"` : ""} src="${escapeHtml(src)}" alt="${escapeHtml(image.name || "Photo")}" loading="lazy" referrerpolicy="no-referrer" draggable="false" />` : "";
  const mark = watermarkMarkup(node, image);
  if (kind === "tile") {
    return `<button type="button" class="image-tile" data-lightbox="${index}" aria-label="${escapeHtml(image.name || "Photo")}">${img}${mark || `<span>${escapeHtml(image.name || "")}</span>`}</button>`;
  }
  if (kind === "lightbox") return `<div class="lightbox-photo">${img || `<div class="lightbox-image"></div>`}${mark}</div>`;
  return `<figure class="print-photo"><span class="photo-frame">${img || `<span class="print-photo-fallback">Photo</span>`}${mark}</span><figcaption>${escapeHtml(image.name || "")}</figcaption></figure>`;
}

function linkProjectPhotoFolder(raw) {
  const proj = project();
  const api = photoApi();
  if (!proj || !api) return;
  const text = String(raw || "").trim();
  const id = text ? api.parseDriveFolderId(text) : "";
  if (text && !id) { toast("Paste a Drive folder link or the folder id"); return; }
  proj.photoFolderId = id;
  proj.updatedAt = nowStamp();
  photoLibrary = null;
  persist();
  render();
  toast(id ? "Photo folder linked" : "Photo folder removed");
}

function applyWantedApartments(proj, wanted) {
  const api = photoApi();
  if (!proj || !api) return { floors: 0, rooms: 0 };
  const plan = api.planAdditions(proj.floors || [], state.rooms.filter((room) => room.projectId === proj.id), wanted);
  const byKey = new Map();
  (proj.floors || []).forEach((floor) => {
    const key = api.levelFromName(floor.name)?.key;
    if (key && !byKey.has(key)) byKey.set(key, floor);
  });
  plan.floors.forEach((floor) => {
    const created = { id: uid("flr"), name: floor.name, order: floor.order, planDriveFileId: null, planMimeType: null, planWebViewLink: null, planFileName: null, planAspectRatio: null, createdAt: nowStamp() };
    proj.floors.push(created);
    byKey.set(floor.levelKey, created);
    if (isTokenValid()) ensureFloorDriveFolder(proj, created).catch((e) => console.warn("floor folder", e));
  });
  proj.floors.sort((a, b) => (a.order || 0) - (b.order || 0));
  plan.rooms.forEach((room) => {
    const floor = byKey.get(room.levelKey);
    if (!floor) return;
    const order = state.rooms.filter((item) => item.floorId === floor.id).length;
    state.rooms.push({ id: uid("room"), projectId: proj.id, floorId: floor.id, name: room.name, createdAt: nowStamp(), updatedAt: nowStamp(), order: order, shape: null });
  });
  if (plan.rooms.length) proj.showRooms = true;
  if (plan.floors.length || plan.rooms.length) proj.updatedAt = nowStamp();
  if (!state.selectedFloorId || !(proj.floors || []).some((floor) => floor.id === state.selectedFloorId)) state.selectedFloorId = proj.floors[0]?.id || null;
  persist();
  return { floors: plan.floors.length, rooms: plan.rooms.length };
}

async function syncPhotoStructure() {
  const proj = project();
  const api = photoApi();
  if (!proj || !proj.photoFolderId || !api) { toast("Link a photo folder first"); return; }
  if (!isTokenValid()) { toast("Sign in to read the Drive folders"); return; }
  toast("Reading the folder tree…");
  try {
    if (!photoLibrary || photoLibrary.folderId !== proj.photoFolderId || photoLibrary.error) await refreshPhotoLibrary({ silent: true });
    const wanted = api.wantedFromTree(photoLibrary ? photoLibrary.levels : []);
    const result = applyWantedApartments(proj, wanted);
    const nothing = !result.floors && !result.rooms;
    toast(nothing ? "Floors and apartments already match the folders" : `Added ${result.floors} floor${result.floors === 1 ? "" : "s"} and ${result.rooms} apartment${result.rooms === 1 ? "" : "s"}`);
    render();
  } catch (e) { toast("Couldn't read the folders: " + describeError(e)); }
}

async function createDriveFolder(name, parentId) {
  const created = await googleCall(() => gapi.client.drive.files.create({
    resource: { name: name, mimeType: PHOTO_FOLDER_MIME, parents: [parentId] },
    fields: "id,name,mimeType",
    supportsAllDrives: true
  }));
  return created.result;
}

async function pushPhotoFolders() {
  const proj = project();
  const api = photoApi();
  if (!proj || !proj.photoFolderId || !api) { toast("Link a photo folder first"); return; }
  if (!isTokenValid()) { toast("Sign in to create Drive folders"); return; }
  const plan = api.driveFolderPlan(proj.floors || [], state.rooms.filter((room) => room.projectId === proj.id));
  if (!plan.length) { toast("No floors map onto Level folders yet"); return; }
  toast("Checking Drive folders…");
  try {
    const rootFiles = await listDriveChildren(proj.photoFolderId);
    let created = 0;
    for (const level of plan) {
      let folder = api.matchLevelFolder(rootFiles, level.levelKey);
      if (!folder) {
        folder = await createDriveFolder(level.driveName, proj.photoFolderId);
        rootFiles.push(folder);
        created++;
      }
      const children = await listDriveChildren(folder.id);
      for (const apt of level.apartments) {
        let aptFolder = api.matchApartmentFolder(children, apt.key);
        if (!aptFolder) {
          aptFolder = await createDriveFolder(apt.label, folder.id);
          children.push(aptFolder);
          created++;
        }
        const inner = await listDriveChildren(aptFolder.id);
        for (const stage of (apt.stages || api.STAGE_FOLDERS)) {
          if (api.matchStageFolder(inner, stage.key)) continue;
          const made = await createDriveFolder(stage.name, aptFolder.id);
          inner.push(made);
          created++;
        }
      }
    }
    toast(created ? `Created ${created} Drive folder${created === 1 ? "" : "s"}` : "Drive folders already match");
    refreshPhotoLibrary({ silent: true });
  } catch (e) { toast("Couldn't create folders: " + describeError(e)); }
}

function placeLinkedPhoto(file, pos) {
  const proj = project();
  const floor = currentFloor();
  state.photoPlace = null;
  removePhotoGhost();
  if (!proj || !floor || !file || !pos) { render(); return; }
  const hit = roomAtPlanPoint(pos.x, pos.y, floor.id);
  const apt = hit && photoApi() ? photoApi().apartmentFromName(hit.name) : null;
  const base = String(file.name || "Photo").replace(/\.[^.]+$/, "");
  const owner = (file.owners && file.owners[0] && file.owners[0].emailAddress) || "";
  const node = {
    id: uid("node"), projectId: proj.id, floorId: floor.id, type: "photo",
    category: "", lineItem: "", customTitle: base, apartment: apt ? apt.label : "",
    stage: "", status: "Not Started", assignedTo: "", tags: [], description: "",
    roomId: hit ? hit.id : null, linkedRoomId: null, position: pos, size: 1,
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(), comments: [],
    imageRefs: [{
      id: file.id, driveFileId: file.id, name: file.name || base, mimeType: file.mimeType || "",
      webViewLink: file.webViewLink || "", thumbnailLink: file.thumbnailLink || "", uploader: owner,
      uploadedAt: file.modifiedTime || nowStamp(), folderStage: file.stage || "unsorted"
    }]
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  state.ui.rightTab = "nodes";
  persist();
  render();
  logAudit("Photo Placed", { nodeId: node.id, projectId: proj.id, details: `${file.name || file.id}${hit ? " in " + hit.name : ""}` });
  toast(hit ? `Photo placed in ${hit.name}` : "Photo placed. Set the apartment when you know it.");
}

function removePhotoGhost() {
  if (photoGhost) { photoGhost.remove(); photoGhost = null; }
  document.body.classList.remove("is-photo-drag");
  if (photoDragBlock) { document.removeEventListener("touchmove", photoDragBlock); photoDragBlock = null; }
}

function movePhotoGhost(x, y) {
  if (!photoGhost) return;
  photoGhost.style.left = Math.round(x - 28) + "px";
  photoGhost.style.top = Math.round(y - 36) + "px";
}

function beginPhotoDrag(fileId, x, y) {
  removePhotoGhost();
  const ghost = document.createElement("div");
  ghost.className = "photo-ghost";
  const img = document.querySelector(`[data-photo-id="${CSS.escape(fileId)}"] img`);
  if (img && img.src) {
    const copy = document.createElement("img");
    copy.src = img.src;
    copy.alt = "";
    ghost.appendChild(copy);
  }
  document.body.appendChild(ghost);
  photoGhost = ghost;
  movePhotoGhost(x, y);
  document.body.classList.add("is-photo-drag");
  photoDragBlock = (event) => event.preventDefault();
  document.addEventListener("touchmove", photoDragBlock, { passive: false });
}

function bindPhotoPointer(el) {
  el.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const fileId = el.dataset.photoId;
    const startX = event.clientX, startY = event.clientY;
    const pointerId = event.pointerId;
    const touch = event.pointerType === "touch";
    let dragging = false;
    let hold = 0;
    const clear = () => { if (hold) clearTimeout(hold); hold = 0; };
    const stop = () => {
      clear();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragging) {
        if (touch) { if (dist > 14) stop(); return; }
        else if (dist > 6) { clear(); dragging = true; beginPhotoDrag(fileId, ev.clientX, ev.clientY); }
        return;
      }
      ev.preventDefault();
      movePhotoGhost(ev.clientX, ev.clientY);
    };
    const finish = (ev, cancelled) => {
      if (ev.pointerId !== pointerId) return;
      const wasDragging = dragging;
      stop();
      if (cancelled) { removePhotoGhost(); return; }
      if (wasDragging) {
        const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 12;
        const pos = moved ? pointerToPlanPosition(ev) : null;
        removePhotoGhost();
        if (pos) placeLinkedPhoto(photoFileById(fileId), pos);
        else if (!moved) { state.photoPlace = { fileId: fileId }; toast("Tap the plan to place this photo"); render(); }
        else toast("Drop the photo on the plan");
        return;
      }
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 12) return;
      if (state.photoPlace && state.photoPlace.fileId === fileId) { state.photoPlace = null; toast("Placement cancelled"); }
      else { state.photoPlace = { fileId: fileId }; toast("Tap the plan to place this photo"); }
      render();
    };
    const onUp = (ev) => finish(ev, false);
    const onCancel = (ev) => finish(ev, true);
    if (touch) hold = setTimeout(() => { dragging = true; beginPhotoDrag(fileId, startX, startY); }, 420);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  });
}

function bindPhotoTray() {
  document.querySelectorAll("[data-photo-id]").forEach(bindPhotoPointer);
  const link = document.getElementById("photoLinkForm");
  if (link) link.addEventListener("submit", (event) => {
    event.preventDefault();
    linkProjectPhotoFolder(new FormData(link).get("photoFolder"));
  });
  const list = document.getElementById("photoListForm");
  if (list) {
    const file = list.querySelector('input[type="file"]');
    if (file) file.addEventListener("change", () => { readPhotoListFile(file.files && file.files[0]).catch((e) => toast(describeError(e))); });
    list.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = (new FormData(list).get("list") || "").toString();
      const rows = photoListRows && photoListRows.length ? photoListRows : text.split(/\r?\n/).map((line) => [line]);
      const wanted = photoApi() ? photoApi().parseApartmentMatrix(rows) : [];
      photoListRows = null;
      if (!wanted.length) { toast("No apartment codes in that list"); return; }
      const result = applyWantedApartments(project(), wanted);
      state.modal = null;
      render();
      const nothing = !result.floors && !result.rooms;
      toast(nothing ? "Those apartments are already on the project" : `Added ${result.floors} floor${result.floors === 1 ? "" : "s"} and ${result.rooms} apartment${result.rooms === 1 ? "" : "s"}`);
    });
  }
}

async function readPhotoListFile(file) {
  photoListRows = null;
  if (!file) return;
  if (/\.csv$/i.test(file.name) || file.type === "text/csv" || file.type === "text/plain") {
    photoListRows = (await file.text()).split(/\r?\n/).map((line) => [line]);
  } else {
    await loadScriptOnce("../shared/vendor/sheetjs/xlsx.full.min.js");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    photoListRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: "" });
  }
  const count = photoApi() ? photoApi().parseApartmentMatrix(photoListRows).length : 0;
  toast(count ? count + " apartments ready to add" : "No apartment codes in that file");
}

function openPhotoList() {
  photoListRows = null;
  state.modal = { mode: "photo-list" };
  render();
}

function openPhotoFolder() {
  const id = project()?.photoFolderId;
  if (!id) { toast("Link a photo folder first"); return; }
  window.open("https://drive.google.com/drive/folders/" + encodeURIComponent(id), "_blank", "noopener");
}
