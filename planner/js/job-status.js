/* Per-job status view. Read-only on Drive: it lists folders and reads the Plans status sheet and the
 * thermostat tracker. The pure parsing and counting live in job-status.js (NDJobStatus). */

let jobStatusState = { folderId: "", busy: false, error: "", data: null, fetchedAt: 0, notes: [] };

function jobStatusApi() { return window.NDJobStatus || null; }

async function readFirstSheetRows(spreadsheetId) {
  const meta = await googleCall(() => gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId, fields: "sheets.properties.title" }));
  const title = meta.result.sheets && meta.result.sheets[0] && meta.result.sheets[0].properties.title;
  if (!title) return [];
  const range = "'" + String(title).replace(/'/g, "''") + "'!A1:AZ800";
  const values = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: spreadsheetId, range: range }));
  return values.result.values || [];
}

async function readExcelFileRows(file) {
  if (/google-apps\.spreadsheet/.test(file.mimeType || "")) return readFirstSheetRows(file.id);
  const token = await NDAuth.ensureToken();
  const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media&supportsAllDrives=true", { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("Drive download " + response.status);
  await loadScriptOnce("../shared/vendor/sheetjs/xlsx.full.min.js");
  const book = XLSX.read(await response.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: "" });
}

async function listPlanFiles(folderId) {
  const top = await listDriveChildren(folderId);
  const files = top.filter((file) => file.mimeType !== PHOTO_FOLDER_MIME);
  const sub = top.filter((file) => file.mimeType === PHOTO_FOLDER_MIME).slice(0, 40);
  const nested = await mapPool(sub, 4, async (folder) => [folder, await listDriveChildren(folder.id)]);
  nested.forEach(([folder, list]) => { files.push(folder); list.forEach((file) => { if (file.mimeType !== PHOTO_FOLDER_MIME) files.push(file); }); });
  return files;
}

async function loadJobStatus(opts) {
  const proj = project();
  const jobs = jobStatusApi();
  const pf = photoApi();
  if (!proj || !proj.photoFolderId || !jobs || !pf) return;
  if (jobStatusState.busy) return;
  if (!isTokenValid()) { jobStatusState = { folderId: proj.photoFolderId, busy: false, error: "Sign in to read the job folder.", data: null, fetchedAt: Date.now(), notes: [] }; render(); return; }
  jobStatusState = Object.assign({}, jobStatusState, { folderId: proj.photoFolderId, busy: true, error: "" });
  if (!opts || !opts.silent) render();
  const notes = [];
  try {
    const tree = await loadPhotoTree(proj.photoFolderId);
    const specials = tree.specials || {};
    const apartments = [];
    (tree.levels || []).forEach((level) => (level.apartments || []).forEach((apt) => {
      const parsed = pf.apartmentFromName(apt.name || "");
      if (parsed && level.levelKey != null) apartments.push({ levelKey: level.levelKey, key: parsed.key, label: parsed.label });
    }));
    let plans = [];
    if (specials.plansStatusFileId) {
      try { plans = jobs.parsePlansStatus(await readFirstSheetRows(specials.plansStatusFileId)); }
      catch (e) { notes.push("Couldn't read the Plans status sheet: " + describeError(e)); }
    }
    if (!plans.length && specials.plansFolderId) {
      try { plans = jobs.plansFromFiles(await listPlanFiles(specials.plansFolderId), apartments); }
      catch (e) { notes.push("Couldn't read the Floor Plans folder: " + describeError(e)); }
    }
    if (!plans.length) notes.push(specials.plansStatusFileId || specials.plansFolderId ? "No plan rows found." : "No Plans status sheet or Floor Plans folder in this job yet.");
    let thermostat = null;
    if (specials.excelFolderId) {
      try {
        const tracker = jobs.findThermostatTracker(await listDriveChildren(specials.excelFolderId));
        if (!tracker) notes.push("No thermostat tracker (a Google Sheet or Excel file with thermostat in its name) in Excel Files.");
        else {
          thermostat = jobs.parseThermostatTracker(await readExcelFileRows(tracker));
          if (!thermostat.found) notes.push("Found \u201c" + tracker.name + "\u201d but couldn't match an apartment column and thermostat columns in it.");
        }
      } catch (e) { notes.push("Couldn't read the thermostat tracker: " + describeError(e)); }
    } else notes.push("No Excel Files folder in this job yet.");
    const data = jobs.buildJobStatus({ tree: tree, plans: plans, thermostat: thermostat, overrides: photoStageOverrideMap() });
    jobStatusState = { folderId: proj.photoFolderId, busy: false, error: "", data: data, fetchedAt: Date.now(), notes: notes };
  } catch (e) {
    jobStatusState = Object.assign({}, jobStatusState, { busy: false, error: describeError(e), fetchedAt: Date.now() });
  }
  render();
}

function openJobStatus() {
  if (!project()?.photoFolderId) { toast("Link a photo folder first"); return; }
  state.modal = { mode: "job-status" };
  render();
  loadJobStatus();
}

function jobPlanChip(row) {
  if (row.plan === "present") {
    const mark = `${icon("check")}Plan`;
    return row.planLink ? `<a class="js-chip is-ok" href="${escapeHtml(row.planLink)}" target="_blank" rel="noopener">${mark}</a>` : `<span class="js-chip is-ok">${mark}</span>`;
  }
  if (row.plan === "missing") return `<span class="js-chip is-bad">MISSING</span>`;
  return `<span class="js-chip">Plan ?</span>`;
}

function jobStageCounts(row) {
  const c = row.counts;
  return `<span class="js-count is-rough" title="Rough-in photos"><i aria-hidden="true"></i>${c["rough-in"]}</span><span class="js-count is-fit" title="Fit-off photos"><i aria-hidden="true"></i>${c["fit-off"]}</span>${c.unsorted ? `<span class="js-count" title="Unsorted photos"><i aria-hidden="true"></i>${c.unsorted}</span>` : ""}`;
}

function renderJobStatusBody() {
  const s = jobStatusState;
  if (s.busy && !s.data) return `<p class="summary-hint">Reading the job folder\u2026</p>`;
  if (s.error && !s.data) return `<p class="summary-hint" role="alert">${escapeHtml(s.error)}</p>`;
  const data = s.data;
  if (!data) return `<p class="summary-hint">Loading\u2026</p>`;
  const t = data.totals;
  const thermo = data.hasThermostat
    ? `<div class="js-card"><span>Thermostats</span><strong>${t.thermoDone} of ${t.thermoTotal}</strong><em>${t.thermoApts} apartments tracked</em></div>`
    : `<div class="js-card is-off"><span>Thermostats</span><strong>\u2014</strong><em>No tracker found</em></div>`;
  const plans = data.hasPlanData
    ? `<div class="js-card"><span>Floor plans</span><strong>${t.plansPresent} present</strong><em class="${t.plansMissing ? "is-bad" : ""}">${t.plansMissing} missing</em></div>`
    : `<div class="js-card is-off"><span>Floor plans</span><strong>\u2014</strong><em>No plan list yet</em></div>`;
  const cards = `<div class="js-cards">
    ${plans}
    <div class="js-card is-rough"><span>Rough-in</span><strong>${t.aptsRough} of ${t.apartments}</strong><em>${t.counts["rough-in"]} photos</em></div>
    <div class="js-card is-fit"><span>Fit-off</span><strong>${t.aptsFit} of ${t.apartments}</strong><em>${t.counts["fit-off"]} photos</em></div>
    ${thermo}
  </div>`;
  const levels = data.levels.map((level, i) => {
    const rows = level.apartments.map((row) => `<div class="js-row">
      <strong class="js-apt">${escapeHtml(row.label)}</strong>
      ${jobPlanChip(row)}
      <span class="js-counts" aria-label="Photos: Rough-in ${row.counts["rough-in"]}, Fit-off ${row.counts["fit-off"]}">${jobStageCounts(row)}</span>
      <span class="js-thermo">${row.thermostat ? `${icon("check")}${row.thermostat.done}/${row.thermostat.total}` : ""}</span>
    </div>`).join("");
    const meta = [data.hasPlanData ? `${level.plansMissing} plan${level.plansMissing === 1 ? "" : "s"} missing` : "", `${level.counts["rough-in"]} rough-in`, `${level.counts["fit-off"]} fit-off`, data.hasThermostat ? `thermostats ${level.thermoDone}/${level.thermoTotal}` : ""].filter(Boolean).join(" \u00b7 ");
    return `<details class="js-level"${i === 0 || data.levels.length <= 2 ? " open" : ""}><summary><span>${escapeHtml(level.name)}</span><em>${level.apartments.length} apt \u00b7 ${escapeHtml(meta)}</em></summary><div class="js-rows">${rows}</div></details>`;
  }).join("");
  const notes = (s.notes || []).map((n) => `<p class="summary-hint">${escapeHtml(n)}</p>`).join("");
  const when = s.fetchedAt ? new Date(s.fetchedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";
  return `${s.error ? `<p class="summary-hint" role="alert">${escapeHtml(s.error)}</p>` : ""}${cards}${levels || `<p class="summary-hint">No levels or apartments found in this job folder.</p>`}${notes}<p class="summary-hint">Read from Drive${when ? " at " + escapeHtml(when) : ""}. Nothing here changes any file.</p>`;
}

function renderJobStatusModal() {
  return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal js-modal" role="dialog" aria-label="Job status"><div class="modal-header"><div><h3>Job status</h3><p>Floor plans, photo counts per stage, and thermostat progress for ${escapeHtml(project()?.name || "this job")}.</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("close")}</button></div><div class="modal-body js-body">${renderJobStatusBody()}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="job-status-refresh"${jobStatusState.busy ? " disabled" : ""}>${icon("refresh")}${jobStatusState.busy ? "Reading\u2026" : "Refresh"}</button><button type="button" class="primary-button" data-action="close-modal">Done</button></div></div>`;
}
