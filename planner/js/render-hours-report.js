/* ── §20 Hours on site — reads timesheet's shared sheet (per-user tabs),
 * matches jobs to this project by address, aggregates hours per employee.
 * Live confirm (include/exclude chips); nothing is persisted. */
const TIMESHEET_SHEET_ID = googleConfig.timesheetSpreadsheetId || "1VG2Pejfd0ZGRpAEs65YAkVf1082O1CUeYjitZSidDl4";
const TS_SESSION_COLS = ["session_id","date","day_of_week","job_id","job_name","address_confirmed","lat_on","lng_on","lat_off","lng_off","time_on","time_off","time_on_rounded","time_off_rounded","break_taken","break_minutes","total_hours","overtime_hours","job_type","notes","departed_offsite","manual_departure_time","missed_clockoff","pay_period","entry_method","user"];
const TS_JOB_COLS = ["job_id","job_name","address","lat","lng","radius_m","job_type","neill_quote_id","neill_quote_status","first_visit","visit_count","last_visit","user"];
let _hoursData = { loaded: false, loading: false, error: "", sessions: [], jobs: [] };
let _hoursUI = { excluded: new Set(), range: "all" };
function tsAddrKey(addr) { return window.NDMatch ? NDMatch.addressKey(addr || "") : (addr || "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " "); }
function isoDay(d) { return localDateStr(d); }
function hoursRangeBounds(range) {
  if (range === "all") return null;
  const now = new Date();
  if (range === "4w") { const from = new Date(now); from.setDate(now.getDate() - 27); return { from: isoDay(from), to: isoDay(now) }; }
  const day = (now.getDay() + 6) % 7; const from = new Date(now); from.setDate(now.getDate() - day); return { from: isoDay(from), to: isoDay(now) };
}
async function fetchTimesheetHours() {
  if (!requireAuth("view hours on site")) return;
  _hoursData.loading = true; _hoursData.error = ""; render();
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: TIMESHEET_SHEET_ID, fields: "sheets.properties.title" });
    const titles = (meta.result.sheets || []).map((s) => s.properties.title);
    const readTab = async (t, cols) => {
      const r = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: TIMESHEET_SHEET_ID, range: `${t}!A2:AZ` });
      return (r.result.values || []).filter((row) => row[0]).map((row) => { const o = {}; cols.forEach((c, i) => (o[c] = row[i] ?? "")); return o; });
    };
    const sessions = [], jobs = [];
    for (const t of titles.filter((t) => t === "sessions" || t.startsWith("sessions_"))) sessions.push(...await readTab(t, TS_SESSION_COLS));
    for (const t of titles.filter((t) => t === "jobs" || t.startsWith("jobs_"))) jobs.push(...await readTab(t, TS_JOB_COLS));
    _hoursData = { loaded: true, loading: false, error: "", sessions, jobs };
  } catch (e) { _hoursData.loading = false; _hoursData.error = describeError(e); toast("Hours fetch failed: " + describeError(e)); }
  render();
}
function hoursBreakdown(proj) {
  const key = tsAddrKey(proj.address);
  const matchedJobs = key ? _hoursData.jobs.filter((j) => tsAddrKey(j.address) === key) : [];
  const matchedIds = new Set(matchedJobs.map((j) => j.job_id));
  const range = hoursRangeBounds(_hoursUI.range);
  const perUser = {}; let total = 0;
  _hoursData.sessions.forEach((s) => {
    const byId = s.job_id && matchedIds.has(s.job_id);
    const byAddr = key && s.address_confirmed && tsAddrKey(s.address_confirmed) === key;
    if (!byId && !byAddr) return;
    if (_hoursUI.excluded.has(s.job_id)) return;
    if (range && s.date && (s.date < range.from || s.date > range.to)) return;
    const h = parseFloat(s.total_hours) || 0;
    const u = s.user || "Unknown";
    perUser[u] = (perUser[u] || 0) + h; total += h;
  });
  return { perUser, total, matchedJobs };
}
function renderHoursPanel(proj) {
  if (!proj) return "";
  const d = _hoursData;
  const ranges = [["all", "All"], ["4w", "4 wks"], ["week", "This wk"]];
  let body;
  if (d.loading) body = `<div class="empty-state">Loading hours…</div>`;
  else if (!d.loaded) body = `<div class="empty-state">Load timesheet data to see hours logged on this job’s address.</div>`;
  else {
    const { perUser, total, matchedJobs } = hoursBreakdown(proj);
    const chips = matchedJobs.length
      ? matchedJobs.map((j) => `<button class="hours-chip ${_hoursUI.excluded.has(j.job_id) ? "is-off" : "is-on"}" data-action="hours-toggle" data-hours-job="${escapeHtml(j.job_id)}">${escapeHtml(j.job_name || "Job")}</button>`).join("")
      : `<span class="empty-state" style="padding:6px 0">No timesheet jobs matched this address.</span>`;
    const rows = Object.entries(perUser).sort((a, b) => b[1] - a[1]);
    body = `<div class="hours-matched"><span class="hours-label">Matched jobs — tap to include/exclude</span><div class="hours-chips">${chips}</div></div>
      <div class="metrics-grid" style="margin:12px 0"><div class="metric"><span>Total on site</span><strong>${total.toFixed(1)} hrs</strong></div><div class="metric"><span>People</span><strong>${rows.length}</strong></div></div>
      ${rows.length ? `<div class="hours-table">${rows.map(([u, h]) => `<div class="hours-row"><span>${escapeHtml(u)}</span><span class="mono">${h.toFixed(1)} hrs</span></div>`).join("")}</div>` : `<div class="empty-state">No hours in this range.</div>`}`;
  }
  return `<section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Hours on site</h3><div class="button-row"><div class="seg-inline">${ranges.map(([r, l]) => `<button class="ghost-button ${_hoursUI.range === r ? "is-active" : ""}" data-action="hours-range" data-range="${r}">${l}</button>`).join("")}</div><button class="ghost-button" data-action="hours-load">${icon("refresh")}${d.loading ? "Loading…" : d.loaded ? "Refresh" : "Load"}</button></div></div>
      ${d.error ? `<div class="empty-state" style="color:var(--red)">${escapeHtml(d.error)}</div>` : ""}
      ${body}
    </section>`;
}

function renderProgressView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state" style="padding:36px">No project selected.</div></section>`;
  const nodes = projectNodes();
  const s = stats(nodes);
  const total = Math.max(s.total, 1);
  const completeDeg = (s.complete / total) * 100;
  const progressDeg = completeDeg + (s.progress / total) * 100;
  const issueDeg = progressDeg + (s.issue / total) * 100;
  const cats = categoryNames().map((c) => { const count = nodes.filter((n) => n.category === c).length; return { category: c, count, value: Math.round((count / total) * 100) }; }).filter((c) => c.count > 0);
  const floorRows = (proj.floors || []).map((f) => { const fn = nodes.filter((n) => n.floorId === f.id); return { name: f.name, total: fn.length, percent: stats(fn).completePercent, issues: stats(fn).issue }; });
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Progress Dashboard</h3><div class="button-row"><button class="ghost-button" data-action="print-report">${icon("printer")}Overview</button><button class="ghost-button" data-action="print-full-report">${icon("download")}Full report</button></div></div>
      <div class="metrics-grid"><div class="metric"><span>Total nodes</span><strong>${s.total}</strong></div><div class="metric"><span>Complete</span><strong>${s.completePercent}%</strong></div><div class="metric"><span>In progress</span><strong>${s.progress}</strong></div><div class="metric"><span>Issues</span><strong>${s.issue}</strong></div></div>
    </section>
    <section class="view-panel">
      <div class="charts-grid">
        <div><h3 class="section-title">Status</h3><div class="donut-wrap"><div class="donut" style="--complete:${completeDeg}%;--progress:${progressDeg}%;--issue:${issueDeg}%"><div class="donut-label"><strong>${s.completePercent}%</strong><span>Complete</span></div></div></div></div>
        <div><h3 class="section-title">Category Load</h3><div class="bar-list">${cats.length ? cats.map((item) => `<div class="bar-row"><span><span class="category-dot" style="--cat:${categoryColor(item.category)}"></span>${escapeHtml(item.category)}</span><span class="bar-track"><span class="bar-fill" style="--value:${item.value}%;--cat:${categoryColor(item.category)}"></span></span><span>${item.count}</span></div>`).join("") : `<div class="empty-state">No nodes yet</div>`}</div></div>
      </div>
    </section>
    <section class="view-panel">
      <h3 class="section-title">By Floor</h3>
      <div class="bar-list">${floorRows.length ? floorRows.map((f) => `<div class="bar-row"><span>${escapeHtml(f.name)}</span><span class="bar-track"><span class="bar-fill" style="--value:${f.percent}%"></span></span><span>${f.percent}% &middot; ${f.total} nodes &middot; ${f.issues} issues</span></div>`).join("") : `<div class="empty-state">No floors</div>`}</div>
    </section>
    ${renderHoursPanel(proj)}`;
}

function renderAuditView() {
  if (!isAdmin()) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("audit")}<h3>Admin only</h3><p>The audit log is restricted to ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p></div></section>`;
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  const distinctUsers = [...new Set(av.rows.map((r) => r.user).filter(Boolean))].sort();
  const distinctActions = [...new Set(av.rows.map((r) => r.action).filter(Boolean))].sort();
  const distinctProjects = [...new Set(av.rows.map((r) => ({ id: r.projectId, name: r.projectName })).filter((p) => p.id))].reduce((acc, p) => { if (!acc.some((x) => x.id === p.id)) acc.push(p); return acc; }, []);
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Audit Log</h3><div class="button-row"><span class="sync-chip" style="opacity:.8">${av.loaded ? `${av.rows.length} rows / fetched ${escapeHtml(av.lastFetchedAt || "")}` : "Not loaded"}</span><button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh" : "Load from Sheet"}</button><button class="primary-button" data-action="audit-download" ${!av.loaded || filtered.length === 0 ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button></div></div>
      ${av.loaded ? `
        <div class="audit-filters">
          <label><span>From</span><input type="date" data-audit-filter="from" value="${escapeHtml(av.filters.from)}" /></label>
          <label><span>To</span><input type="date" data-audit-filter="to" value="${escapeHtml(av.filters.to)}" /></label>
          <label><span>User</span><select data-audit-filter="user"><option value="All">All</option>${distinctUsers.map((u) => `<option value="${escapeHtml(u)}" ${av.filters.user === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></label>
          <label><span>Action</span><select data-audit-filter="action"><option value="All">All</option>${distinctActions.map((a) => `<option value="${escapeHtml(a)}" ${av.filters.action === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}</select></label>
          <label><span>Project</span><select data-audit-filter="projectId"><option value="All">All</option>${distinctProjects.map((p) => `<option value="${escapeHtml(p.id)}" ${av.filters.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}</select></label>
          <label><span>Node title</span><input data-audit-filter="nodeQuery" value="${escapeHtml(av.filters.nodeQuery)}" placeholder="contains..." /></label>
          <label><span>Details</span><input data-audit-filter="detailsQuery" value="${escapeHtml(av.filters.detailsQuery)}" placeholder="contains..." /></label>
          <label><span>Anywhere</span><input data-audit-filter="query" value="${escapeHtml(av.filters.query)}" placeholder="free-text" /></label>
          <button class="ghost-button" data-action="audit-clear-filters">Clear</button>
        </div>
        <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Project</th><th>Folder</th><th>Floor</th><th>Node ID</th><th>Node Title</th><th>Category</th><th>Status</th><th>Details</th><th>Device</th></tr></thead><tbody>${filtered.length ? filtered.map((r) => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.projectName || r.projectId)}</td><td>${escapeHtml(r.folderName)}</td><td>${escapeHtml(r.floorName)}</td><td>${escapeHtml(r.nodeId)}</td><td>${escapeHtml(r.nodeTitle)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.details)}</td><td>${escapeHtml(r.device)}</td></tr>`).join("") : `<tr><td colspan="12" style="text-align:center;padding:24px;color:rgba(255,255,255,.6)">No rows match</td></tr>`}</tbody></table></div>
      ` : `<div class="empty-state empty-state--big">${icon("audit")}<h3>Audit log is not loaded</h3><p>Lives in <code>${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/${AUDIT_SHEET_NAME}</code>. Fetched on demand.</p><button class="primary-button" data-action="audit-load">${icon("refresh")}Load from Sheet</button></div>`}
      ${state.auditQueue.length ? `<p style="margin-top:12px;color:#f59e0b">${state.auditQueue.length} audit row(s) queued locally.</p>` : ""}
    </section>`;
}

function renderStaffSettingsView() {
  const auth = state.googleAuth;
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Account</h3><span class="sync-chip" data-sfill="synced">${escapeHtml(state.myRole || "staff")}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Role</strong><span>${escapeHtml(state.myRole || "staff")}</span></span>${statusPill("Complete")}</div>
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button>
          <button class="ghost-button" data-action="hydrate-cloud">${icon("refresh")}Reload from cloud</button>
        </div>
        <p style="margin-top:14px;color:rgba(255,255,255,.55)">Admin-only settings are hidden. Contact the owner to request admin access.</p>
      </div>
    </section>
  `;
}

function renderSettingsView() {
  if (!isAdmin()) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("settings")}<h3>Admin only</h3><p>Settings are restricted to ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p><button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button></div></section>`;
  const auth = state.googleAuth;
  const proj = project();
  const driveOk = Boolean(state.drive.rootFolderId);
  const sheetOk = Boolean(state.drive.auditSheetId);
  const catsOk = Boolean(state.drive.categoriesSheetId);
  const catTabs = Object.entries(state.categoriesData);
  const owner = isPrimaryOwner();
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Account</h3><span class="sync-chip" data-sfill="synced">${owner ? "Signed in (owner)" : "Signed in"}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
          <div class="integration-row"><span><strong>Data owner</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}</span></span>${statusPill(owner ? "You" : "Shared")}</div>
        </div>
        <div class="settings-actions" style="margin-top:14px">
          <h4 class="settings-actions-title">Routine</h4>
          <div class="settings-action-row"><span><strong>Sync now</strong><span>Write pending changes to the master sheet</span></span><button class="ghost-button" data-action="sync-master-sheet">${icon("refresh")}Sync</button></div>
          <div class="settings-action-row"><span><strong>Import photos</strong><span>Pull newly filed photos onto their nodes</span></span><button class="ghost-button" data-action="import-master-photos">${icon("download")}Import</button></div>
          <div class="settings-action-row"><span><strong>Reload from cloud</strong><span>Reload master records and refresh associated plan files from Drive</span></span><button class="ghost-button" data-action="hydrate-cloud">${icon("download")}Reload</button></div>
          <div class="settings-action-row"><span><strong>Drive</strong><span>Re-sync Drive connection and folder tree</span></span><span class="button-row"><button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync</button><button class="ghost-button" data-action="sync-all-folders">${icon("folder")}Folders</button></span></div>
          <div class="settings-action-row"><span><strong>Reference data</strong><span>Categories and team access</span></span><span class="button-row"><button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Categories</button><button class="ghost-button" data-action="refresh-users">${icon("refresh")}Users</button></span></div>
          <div class="settings-action-row"><span><strong>Account</strong><span>Sign out of Google on this device</span></span><button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button></div>
          <h4 class="settings-actions-title is-danger">Danger zone</h4>
          <div class="settings-danger-zone">
            <div class="settings-action-row"><span><strong>Rebuild master sheet</strong><span>Wipe + rewrite all tabs from this device (never touches Inbox)</span></span><button class="danger-button" data-action="rebuild-master-sheet">${icon("refresh")}Rebuild</button></div>
            <div class="settings-action-row"><span><strong>Format data</strong><span>Trash unprotected projects, bulk photos and matching rows</span></span><button class="danger-button" data-action="format-planner">${icon("trash")}Format</button></div>
          </div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Team Access</h3>${owner ? `<button class="ghost-button" data-action="refresh-team">${icon("refresh")}Refresh</button>` : ""}</div>
        ${owner ? `
          <p style="margin-bottom:12px;color:rgba(255,255,255,.6)">Add users by Google email. They'll receive an invite and can sign in to NeillPlanner. Files live in your Drive; their writes go into the shared folder.</p>
          <div class="team-add-row">
            <input id="newTeamEmail" type="email" placeholder="user@gmail.com" />
            <select id="newTeamRole"><option value="writer">Editor (read/write)</option><option value="reader">Viewer (read only)</option></select>
            <button class="primary-button" data-action="team-add">${icon("plus")}Invite</button>
          </div>
          <div class="integration-list" style="margin-top:12px">
            ${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} &middot; ${escapeHtml(p.role)}</span></span>${p.role === "owner" ? statusPill("Owner") : `<button class="icon-button" data-team-remove="${p.id}" data-team-email="${escapeHtml(p.emailAddress)}" title="Revoke">${icon("trash")}</button>`}</div>`).join("")}
          </div>
          <p style="margin-top:12px;color:rgba(255,255,255,.55)">Also add each new user under <strong>Google Cloud → OAuth consent screen → Test users</strong>, or your app will refuse their sign-in.</p>
        ` : `
          <p>Access is managed by ${escapeHtml(PRIMARY_OWNER_EMAIL)}. To request access, ask them to add you in their Settings → Team Access.</p>
          <div class="integration-list" style="margin-top:12px">${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} &middot; ${escapeHtml(p.role)}</span></span></div>`).join("")}</div>
        `}
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Google Services</h3><span class="sync-chip" data-sfill="${hasGoogleApiKey && hasGoogleClientId ? "synced" : "failed"}">${hasGoogleApiKey && hasGoogleClientId ? "Configured" : "Config needed"}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Scopes</strong><span>${escapeHtml(googleScopes)}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Drive Root</strong><span>${driveOk ? `/${DRIVE_ROOT_NAME}/ (in ${escapeHtml(PRIMARY_OWNER_EMAIL)})` : "Pending sign-in"}</span></span>${statusPill(driveOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Audit Sheet</strong><span>${sheetOk ? AUDIT_SHEET_NAME : "Pending"}</span></span>${statusPill(sheetOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Categories Sheet</strong><span>${catsOk ? CATEGORIES_SHEET_NAME : "Pending"}</span></span>${statusPill(catsOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Master Sheet</strong><span>${state.drive.masterSheetId ? MASTER_SHEET_NAME + " (auto-syncs)" : "Pending"}</span></span>${statusPill(state.drive.masterSheetId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Users Sheet</strong><span>${state.drive.usersSheetId ? USERS_SHEET_NAME + " (" + state.users.length + " loaded)" : "Pending"}</span></span>${statusPill(state.drive.usersSheetId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Bulk Photos</strong><span>${state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? `${DRIVE_BULK_PHOTOS_FOLDER} / ${DRIVE_SORTED_PHOTOS_FOLDER}` : "Pending"}</span></span>${statusPill(state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Photo Allocation</strong><span>${state.drive.photoAllocationSheetId ? PHOTO_ALLOCATION_SHEET_NAME + " (" + state.bulkPhotos.length + " rows)" : "Pending"}</span></span>${statusPill(state.drive.photoAllocationSheetId ? "Complete" : "Not Started")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Bulk Photos</h3><div class="button-row"><button class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button><button class="primary-button" data-action="upload-bulk-photos">${icon("upload")}Upload batch</button></div></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Inbox</strong><span>${state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated").length} unallocated photo(s)</span></span>${statusPill("In Progress")}</div>
          <div class="integration-row"><span><strong>Allocated</strong><span>${state.bulkPhotos.filter((p) => p.status === "Allocated").length} mapped photo(s)</span></span>${statusPill("Complete")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Diagnostics</h3><span class="sync-chip">Bucket test</span></div>
        <div class="settings-actions">
          <div class="settings-action-row"><span><strong>Inject test bucket node</strong><span>Drops a fake unplaced node straight into the current project's "To sort" bucket (in memory only — never written to the sheet). Isolates bucket UI vs. the upload pipeline.</span></span><button class="ghost-button" data-action="diag-inject-bucket-node">${icon("plus")}Inject</button></div>
          <div class="settings-action-row"><span><strong>Bucket state (live)</strong><span>${_inboxRecords.length} inbox record(s) loaded${proj ? ` · ${trayRecords(proj.id).length} in this project's bucket` : " · no project open"}</span></span>${statusPill(proj ? "Ready" : "Open a project")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Categories (from Sheet)</h3><div class="button-row"><button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh</button></div></div>
        ${catTabs.length ? `<div class="integration-list">${catTabs.map(([tab, data]) => `<div class="integration-row"><span><strong><span class="category-dot" style="--cat:${data.color}"></span>${escapeHtml(tab)}</strong><span>${data.items.length} line items${data.items.length ? ": " + data.items.slice(0, 6).map((i) => escapeHtml(i.item)).join(", ") + (data.items.length > 6 ? "..." : "") : ""}</span></span>${statusPill(data.items.length ? "Complete" : "In Progress")}</div>`).join("")}</div><p style="margin-top:10px;color:rgba(255,255,255,.55)">Edit ${CATEGORIES_SHEET_NAME} to add tabs / line items. Hit Refresh when done. Last loaded: ${escapeHtml(state.categoriesLoadedAt || "never")}.</p>` : `<div class="empty-state" style="padding:18px"><p>Categories not loaded yet. Hit Refresh after signing in.</p></div>`}
      </div>
      ${proj ? `
        <div class="view-panel">
          <div class="panel-header"><h3 class="section-title">Current Project</h3><span class="sync-chip">${icon("folder")}${escapeHtml(proj.name)}</span></div>
          <div class="integration-list">
            <div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div>
            ${(proj.floors || []).map((f) => `<div class="integration-row"><span><strong>Floor: ${escapeHtml(f.name)}</strong><span>${state.drive.floorFolderMap[f.id] ? `/${escapeHtml(proj.name)}/${escapeHtml(f.name)}/ (synced)` : "Not synced to Drive yet"}</span></span>${statusPill(state.drive.floorFolderMap[f.id] ? "Complete" : "Not Started")}</div>`).join("")}
          </div>
          <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button></div>
        </div>
      ` : ""}
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">About</h3><span class="sync-chip">v${APP_VERSION}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Login</strong><span>Mandatory Google sign-in</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Data location</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}'s Drive only</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Audit log</strong><span>${AUDIT_SHEET_NAME}. Fetched on demand.</span></span>${statusPill(sheetOk ? "Complete" : "In Progress")}</div>
        </div>
        <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local cache</button></div>
      </div>
    </section>`;
}

function settingsSection(title, body, open = false) {
  return `<details class="settings-section view-panel" ${open ? "open" : ""}><summary><h3 class="section-title">${escapeHtml(title)}</h3><span>${icon("arrowRight")}</span></summary><div class="settings-section-body">${body}</div></details>`;
}

function renderSettingsViewMobile() {
  if (!isAdmin()) return renderStaffSettingsView();
  const auth = state.googleAuth;
  const owner = isPrimaryOwner();
  const proj = project();
  const driveReady = Boolean(state.drive.rootFolderId);
  const accountBody = `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
      <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
      <div class="integration-row"><span><strong>Drive</strong><span>${driveReady ? `${DRIVE_ROOT_NAME} ready in ${escapeHtml(PRIMARY_OWNER_EMAIL)}` : "Pending sign-in"}</span></span>${statusPill(driveReady ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
    </div>
    <div class="settings-action-strip">
      <button class="primary-button" data-action="refresh-all">${icon("refresh")}Refresh all</button>
      <button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync Drive</button>
      <button class="ghost-button" data-action="sync-all-folders">${icon("folder")}Sync folders</button>
      <button class="ghost-button" data-action="sync-master-sheet">${icon("refresh")}Sync master</button>
      <button class="ghost-button" data-action="hydrate-cloud">${icon("download")}Reload cloud</button>
      <button class="ghost-button" data-action="import-master-photos">${icon("download")}Import photos</button>
      <button class="ghost-button" data-action="repair-search-images">${icon("search")}Find moved images</button>
      <button class="ghost-button" data-action="refresh-users">${icon("refresh")}Refresh users</button>
      <button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button>
      <button class="danger-button" data-action="format-planner">${icon("trash")}Format data</button>
    </div>
  `;

  const teamBody = owner ? `
    <p class="muted-copy">Add users by Google email. Uploaded-image users are also available as assignees automatically.</p>
    <div class="team-add-row">
      <input id="newTeamEmail" type="email" placeholder="user@gmail.com" />
      <select id="newTeamRole"><option value="writer">Editor (read/write)</option><option value="reader">Viewer (read only)</option></select>
      <button class="primary-button" data-action="team-add">${icon("plus")}Invite</button>
    </div>
    <div class="integration-list" style="margin-top:12px">
      ${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} / ${escapeHtml(p.role)}</span></span>${p.role === "owner" ? statusPill("Owner") : `<button class="icon-button" data-team-remove="${p.id}" data-team-email="${escapeHtml(p.emailAddress)}" title="Revoke">${icon("trash")}</button>`}</div>`).join("")}
    </div>
  ` : `<p>Access is managed by ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p>`;

  const servicesBody = `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Master Sheet</strong><span>${state.drive.masterSheetId ? MASTER_SHEET_NAME : "Pending"}</span></span>${statusPill(state.drive.masterSheetId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Users Sheet</strong><span>${state.drive.usersSheetId ? `${USERS_SHEET_NAME} (${state.users.length} loaded)` : "Pending"}</span></span>${statusPill(state.drive.usersSheetId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Bulk Photos</strong><span>${state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? `${DRIVE_BULK_PHOTOS_FOLDER} / ${DRIVE_SORTED_PHOTOS_FOLDER}` : "Pending"}</span></span>${statusPill(state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? "Complete" : "Not Started")}</div>
    </div>
  `;

  const bulkBody = `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button>
      <button class="primary-button" data-action="upload-bulk-photos">${icon("upload")}Upload batch</button>
      <button class="ghost-button" data-action="repair-search-images">${icon("search")}Find moved images</button>
    </div>
    <div class="integration-list">
      <div class="integration-row"><span><strong>Inbox</strong><span>${state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated").length} unallocated photo(s)</span></span>${statusPill("In Progress")}</div>
      <div class="integration-row"><span><strong>Allocated</strong><span>${state.bulkPhotos.filter((p) => p.status === "Allocated").length} mapped photo(s)</span></span>${statusPill("Complete")}</div>
    </div>
  `;

  const projectBody = proj ? `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Current project</strong><span>${escapeHtml(proj.name)}</span></span>${statusPill(proj.protected ? "Protected" : "Editable")}</div>
      <div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div>
      ${(proj.floors || []).map((f) => `<div class="integration-row"><span><strong>Floor: ${escapeHtml(f.name)}</strong><span>${state.drive.floorFolderMap[f.id] ? "Synced to Drive" : "Not synced to Drive yet"}</span></span>${statusPill(state.drive.floorFolderMap[f.id] ? "Complete" : "Not Started")}</div>`).join("")}
    </div>
    <div class="settings-action-strip"><button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button></div>
  ` : `<div class="empty-state">No current project selected.</div>`;

  return `
    <section class="settings-stack">
      ${settingsSection("Account", accountBody, true)}
      ${settingsSection("Team Access", teamBody)}
      ${settingsSection("Google Services", servicesBody)}
      ${settingsSection("Bulk Photos", bulkBody)}
      ${settingsSection("Categories From Sheet", renderCategoryEditor(), true)}
      ${settingsSection("Audit", renderAuditSettingsBody())}
      ${settingsSection("Current Project", projectBody)}
      ${settingsSection("About", `<div class="integration-list"><div class="integration-row"><span><strong>Version</strong><span>v${APP_VERSION}</span></span>${statusPill("Complete")}</div><div class="integration-row"><span><strong>Plan debug</strong><span class="plan-debug-inline">${escapeHtml(planDebugLine())}</span></span></div><div class="integration-row"><span><strong>Data owner</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}</span></span>${statusPill(owner ? "You" : "Shared")}</div></div><div class="settings-action-strip"><button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local cache</button></div>`)}
    </section>`;
}

function renderAuditSettingsBody() {
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  return `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh audit" : "Load audit"}</button>
      <button class="primary-button" data-action="audit-download" ${!av.loaded || !filtered.length ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button>
    </div>
    ${av.loaded ? `<div class="audit-table-wrap settings-audit-table"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Project</th><th>Details</th></tr></thead><tbody>${filtered.slice(0, 80).map((r) => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.projectName || r.projectId)}</td><td>${escapeHtml(r.details)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Audit is fetched on demand.</div>`}
  `;
}

function renderCategoryEditor() {
  const tabs = Object.keys(state.categoriesData || {});
  const current = state.ui.categoryEditorTab && state.categoriesData[state.ui.categoryEditorTab] ? state.ui.categoryEditorTab : tabs[0] || "";
  const data = current ? state.categoriesData[current] : { color: "#0ea5e9", items: [] };
  const csv = categoryDataToCsv(data.items || []);
  return `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh</button>
      <button class="primary-button" data-action="save-category-csv">${icon("save")}Save category CSV</button>
    </div>
    <div class="category-editor-grid">
      <label class="field"><span>Category tab</span><select data-category-editor-tab>${tabs.length ? tabs.map((tab) => `<option value="${escapeHtml(tab)}" ${tab === current ? "selected" : ""}>${escapeHtml(tab)}</option>`).join("") : `<option value="">New category</option>`}</select></label>
      <label class="field"><span>New / rename category</span><input id="categoryEditorName" value="${escapeHtml(current)}" placeholder="Electrical" /></label>
      <label class="field"><span>Tab colour</span><input id="categoryEditorColor" type="color" value="${escapeHtml(data.color || "#0ea5e9")}" /></label>
      <label class="field full"><span>CSV rows</span><textarea id="categoryEditorCsv" class="category-csv-editor" spellcheck="false">${escapeHtml(csv)}</textarea></label>
    </div>
  `;
}

function categoryDataToCsv(items) {
  const rows = [["Item", "Code", "Description", "Color", "Shorthand"], ...(items || []).map((i) => [i.item || "", i.code || "", i.description || "", i.color || "", i.shorthand || ""])];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 0.18.4: PapaParse via shared/nd-csv.js. Quoted fields may contain commas and line breaks.
function parseCategoryCsv(text) {
  const rows = NDCSV.rows(text).map((r) => r.map((v) => String(v ?? "").trim())).filter((r) => r.some((v) => v !== ""));
  if (!rows.length) return [];
  const hasHeader = rows[0].map((h) => h.toLowerCase()).includes("item");
  return rows.slice(hasHeader ? 1 : 0).map(([item, code, description, color, shorthand]) => (
    { item: item || "", code: code || "", description: description || "", color: color || "", shorthand: (shorthand || "").slice(0, 4) }
  )).filter((row) => row.item);
}

function hexToRgbColor(hex) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(full || "0ea5e9", 16);
  return {
    red: ((num >> 16) & 255) / 255,
    green: ((num >> 8) & 255) / 255,
    blue: (num & 255) / 255
  };
}

async function refreshAllPlannerData() {
  if (!isTokenValid()) { toast("Sign in first"); return; }
  try {
    state.googleAuth.bootstrapping = true;
    render();
    await Promise.all([
      refreshCategories(),
      refreshUsers(),
      refreshBulkPhotos({ silent: true }),
      importMasterPhotos({ silent: true })
    ]);
    await syncAllDriveFolders({ silent: true });
    await reloadMasterData();
  } catch (e) {
    toast("Refresh failed: " + describeError(e));
  } finally {
    state.googleAuth.bootstrapping = false;
    render();
  }
}

async function saveCategoryCsvFromSettings() {
  if (!isTokenValid() || !state.drive.categoriesSheetId) { toast("Categories sheet is not ready"); return; }
  const selectedTab = document.querySelector("[data-category-editor-tab]")?.value || "";
  const tabName = (document.getElementById("categoryEditorName")?.value || selectedTab || "New Category").trim();
  const color = document.getElementById("categoryEditorColor")?.value || "#0ea5e9";
  const rows = parseCategoryCsv(document.getElementById("categoryEditorCsv")?.value || "");
  if (!tabName) { toast("Name the category tab first"); return; }
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: state.drive.categoriesSheetId,
      fields: "sheets.properties.title,sheets.properties.sheetId"
    });
    let sheet = (meta.result.sheets || []).find((s) => s.properties.title === selectedTab || s.properties.title === tabName);
    if (!sheet) {
      const created = await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: state.drive.categoriesSheetId,
        resource: { requests: [{ addSheet: { properties: { title: tabName, tabColor: hexToRgbColor(color) } } }] }
      });
      const sheetId = created.result.replies?.[0]?.addSheet?.properties?.sheetId;
      sheet = { properties: { title: tabName, sheetId } };
    } else {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: state.drive.categoriesSheetId,
        resource: { requests: [{ updateSheetProperties: { properties: { sheetId: sheet.properties.sheetId, title: tabName, tabColor: hexToRgbColor(color) }, fields: "title,tabColor" } }] }
      });
    }
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.drive.categoriesSheetId,
      range: categorySheetRange(tabName, "A:E")
    });
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.drive.categoriesSheetId,
      range: categorySheetRange(tabName, `A1:E${rows.length + 1}`),
      valueInputOption: "RAW",
      resource: { values: [CATEGORIES_HEADER, ...rows.map((r) => [r.item, r.code, r.description, r.color, r.shorthand])] }
    });
    // Publish the successful write immediately. A failed subsequent read must
    // not leave the editor's new shorthand hidden behind the previous cache.
    if (selectedTab && selectedTab !== tabName) delete state.categoriesData[selectedTab];
    state.categoriesData[tabName] = { color, items: rows.map(r => ({...r})) };
    state.categoriesLoadedAt = nowStamp();
    state.ui.categoryEditorTab = tabName;
    persist(); render();
    await refreshCategories();
    toast(`${tabName} saved`);
  } catch (e) {
    toast("Category save failed: " + describeError(e));
  }
}

async function repairMovedSearchImages() {
  if (!isTokenValid()) { toast("Sign in first"); return; }
  state.ui.imageRepairRunning = true;
  render();
  try {
    const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
    let pageToken = null;
    let added = 0;
    do {
      const resp = await gapi.client.drive.files.list({
        q: "appProperties has { key='source' and value='Search' } and trashed=false",
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,appProperties)",
        pageToken,
        pageSize: 100
      });
      pageToken = resp.result.nextPageToken || null;
      (resp.result.files || []).forEach((file) => {
        const nodeId = file.appProperties?.nodeId || "";
        const node = nodesById.get(nodeId);
        if (!node) return;
        node.imageRefs = Array.isArray(node.imageRefs) ? node.imageRefs : [];
        if (node.imageRefs.some((image) => (image.driveFileId || image.id) === file.id)) return;
        node.imageRefs.push({
          id: `photo-${file.id}`,
          driveFileId: file.id,
          name: file.name || "",
          uploader: file.appProperties?.uploadedBy || file.appProperties?.uploader || "Neill Search",
          uploadedAt: file.createdTime || nowStamp(),
          mimeType: file.mimeType || "",
          webViewLink: file.webViewLink || "",
          thumbnailLink: file.thumbnailLink || ""
        });
        node.updatedAt = nowStamp();
        added += 1;
      });
    } while (pageToken);
    if (added) {
      persist({ skipSync: true });
      await flushMasterDeltas({ silent: true });
      render();
    }
    toast(added ? `Recovered ${added} moved image${added === 1 ? "" : "s"}` : "No missing Search images found");
  } catch (e) {
    toast("Image search failed: " + describeError(e));
  } finally {
    state.ui.imageRepairRunning = false;
    render();
  }
}

function renderDrawer(node) {
  if (node.type === "title") {   // 0.17.1 compact drawer for room title pins
    const room = roomById(node.linkedRoomId);
    const count = room ? state.nodes.filter((n) => n.roomId === room.id && n.type !== "title").length : 0;
    return `<div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer drawer--title" role="dialog" aria-label="${escapeHtml(nodeDisplayTitle(node))}">
      <div class="drawer-header"><div class="drawer-title"><h3>${escapeHtml(nodeDisplayTitle(node))}</h3><p>Room title${room ? ` · room drawn · ${count} node(s) inside` : " · no room drawn yet"}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button></div>
      <div class="drawer-body"><div class="drawer-actions">
        ${room && parseRoomShape(room.shape) ? `<button class="primary-button" data-action="title-edit-room">${icon("edit")}Edit room</button>` : `<button class="primary-button" data-action="title-draw-room">${icon("layers")}Draw room</button>`}
        <button class="ghost-button" data-action="edit-node">${icon("edit")}Rename</button>
        <button class="ghost-button" data-action="delete-node">${icon("trash")}Delete</button>
      </div>
        <div class="size-control"><label for="room-pin-size">Room title size: <strong>${Math.round((node.size || 1) * 100)}%</strong></label><input id="room-pin-size" type="range" min="0.01" max="3" step="0.01" value="${node.size || 1}" data-node-size="${node.id}" aria-label="Room title size" /></div>
        ${room && parseRoomShape(room.shape) ? `<div class="room-appearance"><h3 class="section-title">Room appearance</h3><div class="ps-field"><label for="room-border-opacity">Border opacity <span class="ps-val">${Math.round(roomAppearance(room).borderOpacity * 100)}%</span></label><input id="room-border-opacity" type="range" min="0" max="100" step="1" value="${Math.round(roomAppearance(room).borderOpacity * 100)}" data-room-opacity="borderOpacity" data-room-id="${room.id}"></div><div class="ps-field"><label for="room-fill-opacity">Fill opacity <span class="ps-val">${Math.round(roomAppearance(room).fillOpacity * 100)}%</span></label><input id="room-fill-opacity" type="range" min="0" max="100" step="1" value="${Math.round(roomAppearance(room).fillOpacity * 100)}" data-room-opacity="fillOpacity" data-room-id="${room.id}"></div><p class="summary-hint">Also multiplied by All room opacity (${Math.round((state.ui.roomOpacity ?? 1)*100)}%).</p><button class="primary-button" data-action="export-rooms">${icon("download")}Export rooms</button></div>` : '<p class="summary-hint">Draw this room to adjust its border/fill and export the room section.</p>'}
      </div>
    </aside>`;
  }
  const isPortal = node.type === "portal";
  const isSwitchboard = node.type === "switchboard" || node.type === "subboard";
  const linkedProject = isPortal ? projectById(node.linkedProjectId) : null;
  const linkedFloor = linkedProject ? floorById(linkedProject, node.linkedFloorId) : null;
  const linkedLabel = [linkedProject?.name, linkedFloor?.name, roomName(node.linkedRoomId)].filter(Boolean).join(" / ");
  const catColor = nodeColor(node);
  const swbUrl = isSwitchboard && node.swbProjectId ? `${SWB_APP_URL}?project=${node.swbProjectId}` : SWB_APP_URL;
  const swbLinked = isSwitchboard && Boolean(node.swbProjectId);
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(nodeDisplayTitle(node))}">
      <div class="drawer-header"><div class="drawer-title"><h3>${isPortal ? icon("portal") : isSwitchboard ? icon("switchboard") : ""}${escapeHtml(nodeDisplayTitle(node))}</h3><p>${isPortal ? `Door / link to ${linkedLabel ? `<strong>${escapeHtml(linkedLabel)}</strong>` : "(unlinked)"}` : isSwitchboard ? `${escapeHtml(node.boardLabel || node.type)} · ${escapeHtml(node.phaseConfig || "")}${node.mainBreakerA ? ` · ${node.mainBreakerA}A` : ""}` : `<span class="category-dot" style="--cat:${catColor}"></span>${escapeHtml(node.category || "-")} / ${escapeHtml(roomLabel(node.roomId))} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button></div>
      ${isSwitchboard ? `<div class="swb-link-strip${swbLinked ? " is-linked" : ""}"><div class="swb-link-strip-inner">${icon("swb")}<div><strong>${swbLinked ? "Linked to SWB" : "Not linked to SWB"}</strong><span>${swbLinked ? `Project: ${escapeHtml(node.swbProjectId)}` : "Open SWB to link this board"}</span></div></div><a href="${escapeHtml(swbUrl)}" target="_blank" rel="noopener" class="primary-button swb-open-btn">${icon("swb")} Open in SWB ↗</a></div>` : ""}
      <div class="drawer-body">
        <div class="drawer-actions">${statusPill(node.status)}${isPortal && linkedProject ? `<button class="primary-button" data-action="follow-portal">${icon("arrowRight")}Walk to ${escapeHtml(linkedLabel || linkedProject.name)}</button>` : ""}<button class="icon-button" data-action="share-node" title="Share">${icon("share")}</button><button class="icon-button" data-action="edit-node" title="Edit">${icon("edit")}</button>${!isPortal ? `<button class="icon-button" data-action="clone-node" title="Duplicate">${icon("copy")}</button>` : ""}<button class="icon-button" data-action="delete-node" title="Delete">${icon("trash")}</button></div>
        ${!isPortal ? `
        <div class="quick-edit">${renderSelect("quick-status", Object.keys(statusMeta), node.status).replace('data-filter="quick-status"', 'data-quick-status="true"')}<label class="ghost-button drawer-photo-upload" style="cursor:pointer">${icon("camera")}<span>Upload existing photos</span><input type="file" accept="image/*,.heic,.heif" multiple data-photo-upload="${node.id}" style="display:none" /></label><button class="ghost-button" data-camera-node="${node.id}">${icon("camera")}Take photo</button>${isAdmin() ? `<button class="ghost-button" data-action="bulk-photo-picker">${icon("folder")}Pick bulk photo</button>` : ""}</div>
        <div class="size-control"><label>Marker size: <strong>${Math.round((node.size || 1) * 100)}%</strong></label><input type="range" min="0.05" max="3" step="0.05" value="${node.size || 1}" data-node-size="${node.id}" aria-label="Marker size" /></div>
        <div class="info-grid"><div class="info-box"><span>Images</span><strong>${node.imageRefs.length}</strong></div><div class="info-box"><span>Room</span><strong>${escapeHtml(roomLabel(node.roomId))}</strong></div><div class="info-box"><span>Category</span><strong>${escapeHtml(node.category || "-")}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div>
        <div><h3 class="section-title">Notes</h3><textarea data-notes="${node.id}" aria-label="Node notes">${escapeHtml(node.description || "")}</textarea></div>
        <div><h3 class="section-title">Gallery</h3>${node.imageRefs.length ? `<div class="gallery-grid">${node.imageRefs.map((image, index) => { const did = image.driveFileId || image.id || ""; const tsrc = image.thumbnailLink || driveThumb(did, 400); return `<button class="image-tile" style="--thumb:linear-gradient(135deg,#1e293b,#334155)" data-lightbox="${index}" aria-label="${escapeHtml(image.name)}">${(tsrc || did) ? `<img ${did ? `data-fileid="${escapeHtml(did)}"` : ""} src="${escapeHtml(tsrc || "")}" alt="${escapeHtml(image.name)}" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />` : ""}<span>${escapeHtml(image.name)}</span></button>`; }).join("")}</div>` : `<div class="empty-state">No images. Use "Upload photos" above.</div>`}</div>
        <div><h3 class="section-title">Comments</h3><div class="comments-list">${node.comments.length ? node.comments.map((c) => `<article class="comment"><span class="comment-meta">${escapeHtml(c.author)} / ${escapeHtml(c.time)}</span><p>${escapeHtml(c.text)}</p></article>`).join("") : `<div class="empty-state">No comments</div>`}</div><div class="comment-input" style="margin-top:10px"><input data-comment-input="${node.id}" placeholder="@mention or comment" aria-label="Add comment" /><button class="icon-button" data-action="send-comment" aria-label="Send">${icon("arrowRight")}</button></div></div>
        ` : `<div class="info-grid"><div class="info-box"><span>Linked destination</span><strong>${escapeHtml(linkedLabel || "(missing)")}</strong></div><div class="info-box"><span>Current room</span><strong>${escapeHtml(roomLabel(node.roomId))}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div><p style="margin-top:14px;color:rgba(255,255,255,.7)">This is a door / stairs / link node. Walk through to the linked floor or room. Both sides have a matching portal that updates together.</p>`}
      </div>
    </aside>`;
}

function renderModal() {
  const m = state.modal;
  if (m.mode === "new-folder" || m.mode === "rename-folder") return renderFolderModal(m.folderId);
  if (m.mode === "sort-tray") return renderSortTrayModal(m);
  if (m.mode === "new-project" || m.mode === "edit-project") return renderProjectModal(m.mode === "edit-project");
  if (m.mode === "create" || m.mode === "edit") return renderNodeModal();
  if (m.mode === "mass-pick") return renderMassPickModal();
  if (m.mode === "portal-create") return renderPortalCreateModal();
  if (m.mode === "add-floor" || m.mode === "rename-floor") return renderFloorModal();
  if (m.mode === "new-room" || m.mode === "rename-room") return renderRoomModal();
  if (m.mode === "auto-rooms") return renderAutoRoomsModal();
  if (m.mode === "bulk-photo-picker") return renderBulkPhotoPickerModal();
  if (m.mode === "help") return renderHelpModal();
  if (m.mode === "camera") return renderPlannerCamera();
  if (m.mode === "print-preview") return renderPrintPreviewModal();
  return "";
}

function renderFolderModal(folderId = null) {
  const existing = folderId ? state.projectFolders.find((f) => f.id === folderId) : null;
  const defaultColor = DEFAULT_FOLDER_COLORS[state.projectFolders.length % DEFAULT_FOLDER_COLORS.length];
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="folderForm" role="dialog"><div class="modal-header"><div><h3>${existing ? "Edit folder" : "New folder"}</h3><p>Group projects (e.g. "Tower A", "Apartments")</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="folderName">Name</label><input id="folderName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Apartments" /></div><div class="field"><label for="folderColor">Colour</label><input id="folderColor" name="color" type="color" value="${escapeHtml(existing?.color || defaultColor)}" /></div></div>${existing ? `<input type="hidden" name="folderId" value="${escapeHtml(existing.id)}" />` : ""}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderProjectModal(isEdit) {
  // New project may carry a prefill from Quote's "Create job" (see quoteJobPrefillFromHash).
  const existing = isEdit ? project() : (state.modal?.prefill || null);
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="projectForm" role="dialog"><div class="modal-header"><div><h3>${isEdit ? "Edit project" : "New project"}</h3><p>Drive folder will be created at /${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/&lt;folder&gt;/&lt;project&gt;/</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="projectName">Name</label><input id="projectName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Tower A Stage 1" /></div><div class="field"><label for="projectFolder">Folder</label><select id="projectFolder" name="folderId"><option value="">${DRIVE_UNFILED_FOLDER}</option>${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === existing?.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></div><div class="field"><label for="projectFirstFloor">First floor name</label><input id="projectFirstFloor" name="firstFloor" value="${escapeHtml(existing?.floors?.[0]?.name || "Ground floor")}" placeholder="Ground floor" /></div><div class="field full"><label for="projectAddress">Address</label><div class="field-with-here"><input id="projectAddress" name="address" value="${escapeHtml(existing?.address || "")}" placeholder="25 Watts Parade, Mount Eliza VIC" autocomplete="off" data-project-address /><button type="button" class="here-btn" data-here-project title="Use my current location">${icon("target")}Here</button></div></div><label class="check-row full"><input type="checkbox" name="protected" ${existing?.protected ? "checked" : ""} /><span><strong>Protect this job from format</strong><small>Keeps this project when Format data is run.</small></span></label><div class="field full"><label for="projectDescription">Description</label><textarea id="projectDescription" name="description">${escapeHtml(existing?.description || "")}</textarea></div></div></div><div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-project">${icon("trash")}Delete project</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderFloorModal() {
  const isRename = state.modal.mode === "rename-floor";
  const existing = isRename ? currentFloor() : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="floorForm" role="dialog"><div class="modal-header"><div><h3>${isRename ? "Rename floor" : "Add floor"}</h3><p>${escapeHtml(project()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="floorName">Floor name</label><input id="floorName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Level 1" /></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderRoomModal() {
  const isRename = state.modal.mode === "rename-room";
  const existing = isRename ? roomById(state.modal.roomId) : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="roomForm" role="dialog"><div class="modal-header"><div><h3>${isRename ? "Rename room" : "Add room"}</h3><p>${escapeHtml(currentFloor()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="roomName">Room name</label><input id="roomName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Comms room" /></div>${existing ? `<input type="hidden" name="roomId" value="${escapeHtml(existing.id)}" />` : ""}</div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderNodeModal() {
  const proj = project(); if (!proj) return "";
  const isEdit = state.modal.mode === "edit";
  const node = isEdit ? selectedNode() : null;
  const nodeType = state.modal.nodeType || node?.type || "marker";
  if (nodeType === "title") {
    return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal modal--node" id="nodeForm" role="dialog">
    <div class="modal-header"><div><h3>${isEdit ? "Rename room title" : "Room title"}</h3><p>${escapeHtml(currentFloor()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
    <div class="modal-body"><input type="hidden" name="nodeType" value="title" /><div class="field full"><label for="nodeCustomTitle">Room name</label><input id="nodeCustomTitle" name="customTitle" value="${escapeHtml(node?.customTitle || "")}" placeholder="e.g. Bedroom 1" required autofocus enterkeyhint="done" autocomplete="off" /></div></div>
    <div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${isEdit ? "Save" : "Place title"}</button></div></form>`;
  }
  const isSwitchboard = nodeType === "switchboard" || nodeType === "subboard";
  const cats = categoryNames();
  if (!cats.length && !isSwitchboard) {
    return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog"><div class="modal-header"><div><h3>No categories yet</h3></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><p>Add line items to the ${CATEGORIES_SHEET_NAME} sheet (under Admin Files), then hit Refresh categories in Settings.</p></div><div class="modal-actions"><button class="ghost-button" data-action="close-modal">Close</button></div></div>`;
  }
  const initialCategory = node?.category || cats[0] || "";
  const items = categoryItems(initialCategory);
  const initialItem = node?.lineItem || items[0]?.item || "";
  const assignees = teamNames();
  const rooms = floorRooms();
  const initialRoom = node?.roomId || resolveInitialRoomId(state.modal?.position) || "";
  const nodeTypeOptions = [
    ["marker","Marker (default)"],
    ["portal","Door / Portal"],
    ["switchboard","Switchboard (MSB)"],
    ["subboard","Sub-board (SSB)"],
  ];
  const swbSection = isSwitchboard ? `
    <div class="field"><label for="nodeBoardLabel">Board label</label><input id="nodeBoardLabel" name="boardLabel" value="${escapeHtml(node?.boardLabel || (nodeType==="switchboard"?"Main Switchboard":"Sub-board"))}" placeholder="MSB / SSB-Kitchen" /></div>
    <div class="field"><label for="nodePhaseConfig">Phase config</label><select id="nodePhaseConfig" name="phaseConfig"><option value="" ${!node?.phaseConfig?"selected":""}>—</option><option value="single" ${node?.phaseConfig==="single"?"selected":""}>Single phase</option><option value="3ph" ${node?.phaseConfig==="3ph"?"selected":""}>Three phase</option></select></div>
    <div class="field"><label for="nodeMainBreakerA">Main breaker (A)</label><input id="nodeMainBreakerA" name="mainBreakerA" type="number" min="6" max="400" value="${escapeHtml(String(node?.mainBreakerA||"63"))}" /></div>
    <div class="field"><label for="nodeSwbProjectId">SWB Project ID <span class="form-note">(auto-filled by SWB)</span></label><input id="nodeSwbProjectId" name="swbProjectId" value="${escapeHtml(node?.swbProjectId||"")}" placeholder="Leave blank — SWB will set this" /></div>` : `
    <div class="field"><label for="nodeCircuit">Circuit</label><input id="nodeCircuit" name="circuit" value="${escapeHtml(node?.circuit||"")}" placeholder="e.g. L1-7" /></div>
    <div class="field"><label for="nodeCableRunM">Cable run (m)</label><input id="nodeCableRunM" name="cableRunM" type="number" step="0.5" min="0" value="${escapeHtml(String(node?.cableRunM||""))}" placeholder="0" /></div>`;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal modal--node" id="nodeForm" role="dialog">
    <div class="modal-header"><div><h3>${isEdit ? "Edit Node" : "Create Node"}</h3><p>${escapeHtml(currentFloor()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label for="nodeType">Node type</label><select id="nodeType" name="nodeType">${nodeTypeOptions.map(([v,l])=>`<option value="${v}" ${nodeType===v?"selected":""}>${l}</option>`).join("")}</select></div>
      ${isSwitchboard ? "" : `<div class="field"><label for="nodeCategory">Category</label><select id="nodeCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div>`}
      ${isSwitchboard ? "" : `<div class="field"><label for="nodeItem">Line item</label><select id="nodeItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}" ${initialItem === i.item ? "selected" : ""}>${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div>`}
      <div class="field"><label for="nodeStatus">Status</label><select id="nodeStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${(node?.status || "Not Started") === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div>
      <div class="field"><label for="nodeRoom">Room</label><select id="nodeRoom" name="roomId"><option value="">No room</option>${rooms.map((r) => `<option value="${escapeHtml(r.id)}" ${initialRoom === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="nodeAssigned">Assigned to</label><select id="nodeAssigned" name="assignedTo"><option value="">Unassigned</option>${assignees.map((u) => `<option value="${escapeHtml(u)}" ${node?.assignedTo === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></div>
      <div class="field full"><label for="nodeCustomTitle">Name</label><input id="nodeCustomTitle" name="customTitle" value="${escapeHtml(node?.customTitle || (isEdit ? "" : autoSuggestName(initialItem)))}" placeholder="e.g. GPO 7, MSB Level 1" /><span class="form-note">Leave blank to use the line item as the title.</span></div>
      ${swbSection}
      <div class="field"><label for="nodeTags">Tags</label><input id="nodeTags" name="tags" value="${escapeHtml(node?.tags?.join(", ") || "")}" placeholder="entry, urgent" /></div>
      <div class="field full"><label for="nodeDescription">Notes</label><textarea id="nodeDescription" name="description">${escapeHtml(node?.description || "")}</textarea></div>
      <div class="field full"><label for="nodeImages">Initial photos (optional)</label><input id="nodeImages" name="images" type="file" accept="image/*" multiple /></div>
    </div></div>
    <div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-node">${icon("trash")}Delete</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div>
  </form>`;
}

function renderMassPickModal() {
  const cats = categoryNames();
  const initialCategory = state.modal.category || cats[0];
  const items = categoryItems(initialCategory);
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="massForm" role="dialog"><div class="modal-header"><div><h3>Mass place nodes</h3><p>Pick what to drop. Click the plan to place. ESC to stop.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="massCategory">Category</label><select id="massCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div><div class="field"><label for="massItem">Line item</label><select id="massItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div><div class="field"><label for="massSize">Marker size (%)</label><input id="massSize" name="size" type="number" min="5" max="300" step="5" value="${state.modal.sizePercent ?? 100}" required /></div><div class="field"><label for="massStatus">Status</label><select id="massStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${s === "Not Started" ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("mass")}Start placing</button></div></form>`;
}

function renderPortalCreateModal() {
  const proj = project();
  const others = state.projects;
  const currentRooms = floorRooms();
  const initialTarget = others[0];
  const initialTargetFloor = initialTarget?.floors?.[0] || null;
  const initialTargetRooms = initialTargetFloor ? floorRooms(initialTargetFloor.id) : [];
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="portalForm" role="dialog"><div class="modal-header"><div><h3>Add door / stairs</h3><p>Link floors or rooms. A matching return door is created automatically.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="portalLabel">Label</label><input id="portalLabel" name="label" required placeholder="Door to Store Room" /></div><div class="field"><label for="portalSourceRoom">From room</label><select id="portalSourceRoom" name="sourceRoomId"><option value="">No room</option>${currentRooms.map((r) => `<option value="${escapeHtml(r.id)}" ${state.selectedRoomId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select></div><div class="field"><label for="portalTarget">Links to project</label><select id="portalTarget" name="targetProjectId" required data-portal-target>${others.length ? others.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("") : `<option value="">No projects exist yet</option>`}</select></div><div class="field"><label for="portalFloor">Target floor</label><select id="portalFloor" name="targetFloorId" data-portal-floor>${initialTarget ? (initialTarget.floors || []).map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") : `<option value="">No floors</option>`}</select></div><div class="field"><label for="portalTargetRoom">Target room</label><select id="portalTargetRoom" name="targetRoomId"><option value="">No room</option>${initialTargetRooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")}</select></div><div class="field full"><label for="portalReturn">Return door label</label><input id="portalReturn" name="returnLabel" placeholder="Door back" /></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit" ${state.projects.length ? "" : "disabled"}>${icon("check")}Create door</button></div></form>`;
}

function renderPrintPlanHero(floor, nodes, heading, thumbnail = false) {
  if (!floor) return "<p>(No floor.)</p>";
  const planUrl = state.floorPlans[floor.id];
  const planAspect = Number(floor.planAspectRatio) || 1.6;
  const title = heading || floor.name;
  return `
    <section class="print-hero" ${thumbnail ? "" : "data-report-page"}>
      <h2>${escapeHtml(title)}</h2>
      ${planUrl ? `<div class="print-plan" style="--plan-ar:${planAspect}"><img src="${escapeHtml(planUrl)}" alt="Floor plan" /><div class="print-marker-layer">${nodes.filter(n => n.position && Number.isFinite(Number(n.position.x)) && Number.isFinite(Number(n.position.y))).map((n) => { if (n.type === "title") return `<span class="print-title-pin" style="--x:${n.position.x};--y:${n.position.y}">${escapeHtml(nodeDisplayTitle(n))}</span>`; const sh = nodeShorthand(n) || nodeDisplayTitle(n).slice(0, 4); return `<span class="print-marker" data-len="${sh.length}" style="--x:${n.position.x};--y:${n.position.y};--cat:${nodeColor(n)};${statusStyle(n.status)}">${escapeHtml(sh)}</span>`; }).join("")}</div></div>` : `<p>${floor.planDriveFileId ? "Floor plan unavailable. Reopen the report online to retry." : "No floor plan uploaded."}</p>`}
    </section>`;
}
/* Report cover logo: the ONE swap point for the cover's big logo (keep it in sw.js PRECACHE). */
const REPORT_COVER_LOGO_SRC = "../logo.png";
function renderReportCover(proj) {
  const address = proj.address ? `<p class="print-cover-address">${escapeHtml(proj.address)}</p>` : "";
  return `<section class="print-cover" data-report-page>
    <div class="print-cover-main">
      <img class="print-cover-logo" src="${REPORT_COVER_LOGO_SRC}" alt="Neill Data" />
      <h1>Neill Planner</h1>
      <h2>${escapeHtml(proj.name)}</h2>
    </div>
    <footer class="print-cover-meta">${address}<p class="print-muted">Generated ${escapeHtml(sydneyStamp())}</p></footer>
  </section>`;
}
function renderPrintNodeCard(n) {
  const photos = n.imageRefs || [];
  const comments = n.comments || [];
  const photoHtml = photos.length
    ? `<div class="print-photos">${photos.map((image) => {
        const did = image.driveFileId || image.id || "";
        const tsrc = image.thumbnailLink || driveThumb(did, 400);
        return `<figure class="print-photo">${(tsrc || did) ? `<img ${did ? `data-fileid="${escapeHtml(did)}"` : ""} src="${escapeHtml(tsrc || "")}" alt="${escapeHtml(image.name || "Photo")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('is-broken');this.alt='Photo unavailable'" />` : `<div class="print-photo-fallback">Photo</div>`}<figcaption>${escapeHtml(image.name || "")}</figcaption></figure>`;
      }).join("")}</div>`
    : `<p class="print-muted">No photos</p>`;
  const commentsHtml = comments.length
    ? `<ul class="print-comments">${comments.map((c) => `<li><strong>${escapeHtml(c.author || "")}</strong> <span>${escapeHtml(c.time || "")}</span><br>${escapeHtml(c.text || "")}</li>`).join("")}</ul>`
    : "";
  return `<article class="print-node-card">
    <div class="print-node-location">${renderPrintPlanHero(floorById(projectById(n.projectId), n.floorId), [n], "Node location", true)}</div>
    <header><h4>${escapeHtml(nodeDisplayTitle(n))}</h4><p>${escapeHtml(n.category || "-")} / ${escapeHtml(n.lineItem || "-")} &middot; <strong>${escapeHtml(n.status || "")}</strong>${n.assignedTo ? " &middot; " + escapeHtml(n.assignedTo) : ""}</p></header>
    ${n.description ? `<p class="print-notes">${escapeHtml(n.description)}</p>` : ""}
    ${(n.tags || []).length ? `<p class="print-muted">Tags: ${escapeHtml(n.tags.join(", "))}</p>` : ""}
    ${commentsHtml}
    <div class="print-photo-block"><span class="print-muted">${photos.length} photo${photos.length === 1 ? "" : "s"}</span>${photoHtml}</div>
  </article>`;
}
function renderPrintOverviewBody(proj, floor) {
  const nodes = floor ? floorNodes(floor.id) : [];
  return `
    ${renderReportCover(proj)}
    ${renderPrintPlanHero(floor, [], `${floor?.name || "Plan"} — bare plan`)}
    ${renderPrintPlanHero(floor, nodes, `${floor?.name || "Plan"} — all nodes`)}
    <header class="print-header">
      <h1>${escapeHtml(proj.name)}</h1>
      <p>${escapeHtml(proj.address || "")} &middot; Floor: ${escapeHtml(floor?.name || "-")} &middot; Generated ${escapeHtml(sydneyStamp())}</p>
      <p>Owner: ${escapeHtml(PRIMARY_OWNER_EMAIL)} &middot; Total nodes (this floor): ${nodes.length}</p>
    </header>
    <h2>Node Schedule</h2>
    <table class="print-table">
      <thead><tr><th>#</th><th>Title</th><th>Category</th><th>Line item</th><th>Status</th><th>Assignee</th><th>Room</th><th>Updated</th></tr></thead>
      <tbody>${nodes.map((n, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(nodeDisplayTitle(n))}</td><td>${escapeHtml(n.category || "")}</td><td>${escapeHtml(n.lineItem || "")}</td><td>${escapeHtml(n.status)}</td><td>${escapeHtml(n.assignedTo || "-")}</td><td>${escapeHtml(roomLabel(n.roomId))}</td><td>${escapeHtml(sydneyFromStored(n.updatedAt))}</td></tr>`).join("")}</tbody>
    </table>`;
}
function renderPrintFullBody(proj) {
  const floors = [...(proj.floors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const sections = floors.map((fl, idx) => {
    const nodes = floorNodes(fl.id).filter((n) => n.type !== "portal" && n.type !== "title");
    const rooms = floorRooms(fl.id);
    const byRoom = new Map();
    rooms.forEach((r) => byRoom.set(r.id, []));
    const unassigned = [];
    nodes.forEach((n) => {
      if (n.roomId && byRoom.has(n.roomId)) byRoom.get(n.roomId).push(n);
      else unassigned.push(n);
    });
    const roomBlocks = [
      ...rooms.map((r) => {
        const list = byRoom.get(r.id) || [];
        if (!list.length) return `<section class="print-room"><h3>${escapeHtml(r.name)}</h3><p class="print-muted">No nodes</p></section>`;
        return `<section class="print-room"><h3>${escapeHtml(r.name)} <span class="print-muted">(${list.length})</span></h3>${list.map(renderPrintNodeCard).join("")}</section>`;
      }),
      unassigned.length ? `<section class="print-room"><h3>No room <span class="print-muted">(${unassigned.length})</span></h3>${unassigned.map(renderPrintNodeCard).join("")}</section>` : ""
    ].join("");
    return `<section class="print-floor-section ${idx ? "print-break" : ""}">
      ${renderPrintPlanHero(fl, [], `Floor: ${fl.name} — bare plan`)}
      ${renderPrintPlanHero(fl, floorNodes(fl.id), `Floor: ${fl.name} — all nodes`)}
      ${roomBlocks || `<p class="print-muted">No nodes on this floor.</p>`}
    </section>`;
  }).join("");
  return `${renderReportCover(proj)}${sections}`;
}
function toggleReportView(key) {
  if (state.modal?.mode !== 'print-preview') return;
  const scrollTop = document.querySelector('.print-modal .modal-body')?.scrollTop || 0;
  state.modal[key] = !state.modal[key]; render();
  const body = document.querySelector('.print-modal .modal-body'); if (body) body.scrollTop = scrollTop;
  document.querySelector(key === 'fullscreen' ? '[data-action="report-fullscreen"]' : '[data-action="report-photo-view"]')?.focus();
}
async function openPlannerReport(reportMode) {
  const proj = project(); if (!proj) return;
  const modal = {mode:'print-preview', reportMode, loading:true};
  state.modal = modal; render();
  // Fetch every floor before rendering, not just the floor open on the map.
  for (const floor of (proj.floors || [])) {
    if (!state.floorPlans[floor.id] && floor.planDriveFileId) {
      try {
        await NDAuth.ensureToken();
        // 0.15.2 — original first: the flattened PNG render replaced the vector PDF in the plan cache.
        let url = null;
        try { url = await fetchDriveFileAsDataUrl(floor.planDriveFileId); } catch (e) {}
        if (!url && floor.planPngFileId) url = await fetchDriveFileAsDataUrl(floor.planPngFileId);
        if (url) { await cacheFloorPlan(floor.id, url); floor.planAspectRatio = await readImageAspectRatio(state.floorPlans[floor.id]) || floor.planAspectRatio; }
      } catch (e) { console.warn('Report floor plan unavailable', floor.id); }
    }
  }
  if (state.modal === modal) { modal.loading = false; render(); }
}
function renderPrintPreviewModal() {
  const proj = project(); if (!proj) return "";
  const floor = currentFloor();
  const reportMode = state.modal?.reportMode === "full" ? "full" : "overview";
  const body = state.modal?.loading ? "<p>Loading report plans…</p>" : reportMode === "full" ? renderPrintFullBody(proj) : renderPrintOverviewBody(proj, floor);
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal print-modal ${state.modal?.fullscreen ? "is-fullscreen" : ""}" role="dialog" aria-modal="true" aria-label="Planner report">
      <div class="modal-header">
        <div><h3>${reportMode === "full" ? "Full project report" : "Print overview"}</h3><p>${escapeHtml(proj.name)}${reportMode === "overview" ? " / " + escapeHtml(floor?.name || "") : ""}</p></div>
        <button type="button" class="ghost-button" data-action="report-fullscreen">${state.modal?.fullscreen ? "Exit full screen" : "Full screen"}</button><button type="button" class="icon-button" data-action="close-modal" aria-label="Close report">${icon("close")}</button>
      </div>
      <div class="print-mode-tabs">
        <button type="button" class="ghost-button ${reportMode === "overview" ? "is-active" : ""}" data-action="print-mode-overview">${icon("printer")}Overview</button>
        <button type="button" class="ghost-button ${reportMode === "full" ? "is-active" : ""}" data-action="print-mode-full">${icon("download")}Full report</button>
        <button type="button" class="ghost-button" data-action="report-photo-view">${state.modal?.fullImages ? "Compact photos" : "Full-size photos"}</button>
      </div>
      <div class="modal-body">
        <div class="print-page ${state.modal?.fullImages ? "report-full-images" : ""}" id="printPage">${body}</div>
      </div>
      ${reportMode === "full" ? `<p class="print-muted" style="margin:0 16px 10px">Download and Drive PDFs include up to 3 photos per node and 48 overall. Use Print for all photos.</p>` : ""}
      ${renderReadyPdf()}
      <div class="modal-actions print-modal-actions"><button type="button" class="ghost-button" data-action="download-pdf" ${_drivePdfBusy || state.modal?.loading ? "disabled" : ""}>${icon("download")}Download PDF</button><button type="button" class="ghost-button" data-action="close-modal">Close</button><button type="button" class="ghost-button" data-action="save-pdf-drive" ${_drivePdfBusy ? "disabled" : ""}>${icon("download")}Save PDF to Drive</button><button class="primary-button" data-action="print-now">${icon("printer")}Print / Save as PDF</button></div>
    </div>`;
}

function renderHelpModal() {
  const statuses = Object.keys(statusMeta);
  const cats = categoryNames();
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal help-modal" role="dialog">
      <div class="modal-header"><div><h3>Help &amp; Legend</h3><p>Quick reference</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <h4 class="help-h">Status (marker ring)</h4>
        <div class="help-legend">${statuses.map((n) => `<span class="legend-item"><span class="status-dot" style="${statusStyle(n)}"></span>${escapeHtml(n)}</span>`).join("")}</div>
        <h4 class="help-h">Categories (marker fill)${cats.length ? "" : " - none yet, add tabs to your Categories sheet"}</h4>
        <div class="help-legend">${cats.map((c) => `<span class="legend-item"><span class="category-dot" style="--cat:${categoryColor(c)}"></span>${escapeHtml(c)}</span>`).join("")}</div>
        <h4 class="help-h">Tips</h4>
        <ul class="help-tips">
          <li>Click anywhere on the plan to drop a new node.</li>
          <li>Drag a marker to move it. Shift-click to multi-select.</li>
          <li>Use the marker size slider in the drawer to resize a node.</li>
          <li>The <strong>Mass</strong> button lets you drop many of the same item in a row.</li>
          <li>The <strong>Door</strong> button creates a portal linking this floor to another project / floor. Tap a door marker to jump to that floor layer.</li>
          <li>With <strong>Show rooms</strong> on, use Draw/Rect to outline rooms on the plan. New nodes auto-pick the room under the tap.</li>
          <li><strong>Overview</strong> prints the current floor plan; <strong>Full report</strong> adds rooms, notes, comments and photos. Use <strong>Save PDF to Drive</strong> for large reports (photo caps apply).</li>
          <li><kbd>Esc</kbd> closes the active modal / drawer / mass mode.</li>
          <li>Categories &amp; line items live in <code>NeillPlanner-Categories</code> on Drive - edit there, then hit Refresh in Settings.</li>
        </ul>
      </div>
      <div class="modal-actions"><button class="ghost-button" data-action="close-modal">Close</button></div>
    </div>
  `;
}

function renderLightbox() {
  const node = selectedNode(); if (!node) return "";
  const image = node.imageRefs[state.lightbox.index]; if (!image) return "";
  return `<div class="lightbox-backdrop" data-action="close-lightbox"></div><div class="lightbox" role="dialog"><div class="lightbox-header"><div><h3>${escapeHtml(image.name)}</h3><p>${escapeHtml(image.uploader || "")} / ${escapeHtml(image.uploadedAt || "")}</p></div><div class="lightbox-actions">${image.webViewLink ? `<a class="icon-button" href="${escapeHtml(image.webViewLink)}" target="_blank" rel="noopener" aria-label="Open in Drive">${icon("link")}</a>` : ""}<button class="icon-button" data-action="prev-image" aria-label="Previous">${icon("arrowLeft")}</button><button class="icon-button" data-action="next-image" aria-label="Next">${icon("arrowRight")}</button><button class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button></div></div><div class="lightbox-stage">${(image.thumbnailLink || image.driveFileId || image.id) ? `<img ${(image.driveFileId || image.id) ? `data-fileid="${escapeHtml(image.driveFileId || image.id)}"` : ""} src="${escapeHtml(image.thumbnailLink ? image.thumbnailLink.replace(/=s\d+(-c)?$/, "=s1600") : "")}" alt="${escapeHtml(image.name)}" referrerpolicy="no-referrer" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px" />` : `<div class="lightbox-image" style="--thumb:linear-gradient(135deg,#1e293b,#334155)"></div>`}</div></div>`;
}

function renderBulkPhotoPickerModal() {
  const node = selectedNode(); if (!node) return "";
  const available = state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated");
  return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal bulk-photo-modal" role="dialog"><div class="modal-header"><div><h3>Pick bulk photo</h3><p>Allocate an inbox photo to ${escapeHtml(nodeDisplayTitle(node))}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body">${available.length ? `<div class="bulk-photo-grid">${available.map((p) => `<button class="bulk-photo-tile" data-bulk-photo-assign="${escapeHtml(p.id)}">${(p.thumbnailLink || p.driveFileId || p.id) ? `<img ${(p.driveFileId || p.id) ? `data-fileid="${escapeHtml(p.driveFileId || p.id)}"` : ""} src="${escapeHtml(p.thumbnailLink || "")}" alt="${escapeHtml(p.name)}" referrerpolicy="no-referrer" loading="lazy" />` : `<span class="bulk-photo-empty">${icon("upload")}</span>`}<strong>${escapeHtml(p.name || p.driveFileId)}</strong><span>${escapeHtml(p.uploadedAt || "")}</span></button>`).join("")}</div>` : `<div class="empty-state">No unallocated bulk photos. Upload a batch from Settings.</div>`}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button><button type="button" class="ghost-button" data-action="close-modal">Close</button></div></div>`;
}
