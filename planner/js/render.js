/* ============================================================ RENDER */

function render() {
  document.body.classList.toggle("report-fullscreen", !!(state.modal?.mode === "print-preview" && state.modal.fullscreen));
  const app = document.getElementById("app"); if (!app) return;
  if (_masterReloading) { app.innerHTML = renderLoadingOverlay("Reloading master records and floor-plan files from Drive…"); return; }
  // Returning user — silent re-auth in flight, show reconnecting screen
  if (state.googleAuth.bootstrapped && !state.googleAuth.signedIn && state.googleAuth.bootstrapping) {
    const skel = (window.NDUI && NDUI.skeletonMarkup) ? NDUI.skeletonMarkup({ rows: 3, variant: "list-row" }) : '<span class="app-spinner"></span>';
    app.innerHTML = `<div class="login-gate"><div class="brand" style="justify-content:center;margin-bottom:18px"><div class="brand-mark">NP</div></div><div class="login-skel-wrap" style="max-width:320px;margin:24px auto 0;text-align:center">${skel}<p style="margin-top:12px;opacity:.75">Reconnecting&hellip;</p></div></div>`; return;
  }
  // Mandatory login gate: render only the sign-in screen until signed in
  if (!state.googleAuth.signedIn) { app.innerHTML = renderLoginGate(); bindLoginEvents(); return; }
  app.innerHTML = `
    <div class="app-shell ${state.massMode.active ? "is-mass-mode" : ""}">
      ${renderSidebar()}
      <main class="main">${renderTopbar()}<div class="content">${renderView()}</div></main>
      ${renderBottomNav()}
    </div>
    ${state.massMode.active ? renderMassBanner() : ""}${state.roomDraw?.mode ? renderRoomDrawBanner() : ""}
    ${state.bulkSelection.length ? renderBulkBar() : ""}
    ${state.drawerOpen && selectedNode() ? renderDrawer(selectedNode()) : ""}
    ${state.modal ? renderModal() : ""}
    ${state.lightbox ? renderLightbox() : ""}
    ${renderPhotoJobs()}
    ${state.planUpload ? renderLoadingOverlay(`${state.planUpload.step} ${state.planUpload.pct}%`) : ""}
    ${(state.googleAuth.bootstrapping || state.googleAuth.hydrating) ? renderLoadingOverlay(state.googleAuth.hydrating && !state.googleAuth.bootstrapping ? "Loading from cloud..." : "Loading planner data...") : ""}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
  // Hide the fixed sync tube while a drawer/modal/lightbox is open so it
  // isn't pinned in front of that content.
  document.body.classList.toggle("np-overlay", !!((state.drawerOpen && selectedNode()) || state.modal || state.lightbox));
  bindEvents();
  bindPlannerCamera();
  bindRoomVertexHandles();
  mountOsd();
  applyCanvasTransform();
  hydrateDriveImages();   // #37 — swap Drive photo tiles in with authenticated bytes
  if (window.NDUI && NDUI.skeletonOverlay) {
    NDUI.skeletonOverlay(!!(state.googleAuth.signedIn && (state.googleAuth.bootstrapping || state.googleAuth.hydrating)));
  }
}

function authContinueLabel(fallback) {
  const email = (window.NDAuth && NDAuth.getResumeEmail && NDAuth.getResumeEmail()) || null;
  return email ? ("Continue as " + email) : (fallback || "Sign in with Google");
}
function renderLoginGate() {
  const auth = state.googleAuth;
  const prior = !!(window.NDAuth && NDAuth.hasPriorSession && NDAuth.hasPriorSession());
  return `
    <div class="login-gate">
      <div class="login-card">
        <div class="brand" style="justify-content:center;margin-bottom:18px"><div class="brand-mark">NP</div><div><h1>NeillPlanner</h1><p>Neill Data &amp; Security</p></div></div>
        <h2>${prior ? "Welcome back" : "Sign in to continue"}</h2>
        <p>${prior ? "Tap below to resume your Google session (no re-consent if Google still remembers this device)." : "This is an internal app. Only invited Google accounts can access it."}</p>
        <button class="primary-button login-button" data-action="google-sign-in" ${!hasGoogleClientId || !auth.librariesReady ? "disabled" : ""}>${icon("google")}${escapeHtml(authContinueLabel())}</button>
        ${auth.bootstrapping ? `<div class="login-skel-wrap">${(window.NDUI && NDUI.skeletonMarkup) ? NDUI.skeletonMarkup({ rows: 3, variant: "list-row" }) : '<span class="app-spinner"></span>'}<p class="login-skel-label">Signing in and loading planner data...</p></div>` : ""}
        ${auth.lastError ? `<p class="login-error">${escapeHtml(auth.lastError)}</p>` : ""}
        ${!auth.librariesReady ? `<p class="login-status">Loading Google libraries...</p>` : ""}
        <p class="login-footnote">If you can't sign in, ask your administrator to invite your Google email.</p>
      </div>
    </div>`;
}

function renderLoadingOverlay(message = "Loading...") {
  const skel = (window.NDUI && NDUI.skeletonMarkup)
    ? NDUI.skeletonMarkup({ rows: 4, variant: "list-row" })
    : '<span class="app-spinner"></span>';
  return `<div class="loading-overlay" role="status" aria-live="polite"><div class="loading-card loading-card--skel">${skel}<strong>${escapeHtml(message)}</strong></div></div>`;
}

function bindLoginEvents() {
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", (e) => {
    const action = b.dataset.action;
    if (action === "google-sign-in") signIn();
  }));
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">NP</div><div><h1>NeillPlanner</h1><p>Neill Data &amp; Security</p></div></div>
      <nav class="nav-list" aria-label="Primary">${navItems().map((i) => `<button class="nav-button ${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>
      <div class="sidebar-section-title">Projects</div>
      <div class="search-wrap sidebar-search">${icon("search")}<input data-projects-search data-search-scope="sidebar" value="${escapeHtml(state.projectsQuery || "")}" placeholder="Search projects" aria-label="Search projects" /></div>
      <div class="project-list">${state.projects.length === 0 ? '<div class="empty-state" style="font-size:12px;padding:14px">No projects yet</div>' : groupedProjectButtons()}</div>
    </aside>`;
}

function groupedProjectButtons() {
  const { inProgress, completed } = partitionProjects(state.projects);
  let html = `<div class="proj-section-label">In progress <span>${inProgress.length}</span></div>`;
  html += inProgress.length ? inProgress.map(renderProjectButton).join("") : '<div class="proj-empty">Nothing in progress</div>';
  if (completed.length) {
    html += `<button class="proj-section-toggle ${state.ui.showCompleted ? "is-open" : ""}" data-action="toggle-completed">${icon("arrowRight")}Completed <span>${completed.length}</span></button>`;
    if (state.ui.showCompleted) html += completed.map(renderProjectButton).join("");
  }
  return html;
}

function renderFolderButton(folder, isAll = false) {
  const id = isAll ? "all" : folder.id;
  const s = folderStats(id);
  return `<button class="folder-button ${state.selectedFolderId === id ? "is-active" : ""}" data-folder="${id}" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span></button>`;
}

function renderProjectButton(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const color = projectColor(item);
  const linkedCount = nodes.filter((n) => n.type === "portal").length;
  return `<button class="project-button ${item.id === state.selectedProjectId ? "is-active" : ""}" data-project="${item.id}" style="--folder:${color}"><span class="status-dot" style="--status:${s.issue ? "var(--red)" : "var(--teal)"}"></span><span><strong>${escapeHtml(item.name)}</strong><span class="project-meta"><span>${s.total} nodes</span><span>${s.completePercent}%</span><span title="Floors">${icon("layers")}${item.floors?.length || 1}</span>${linkedCount ? `<span title="Linked">${icon("link")}${linkedCount}</span>` : ""}${s.missingPhotos ? `<span class="missing-photos-badge" title="${s.missingPhotos} node${s.missingPhotos === 1 ? "" : "s"} missing a photo">${icon("camera")}${s.missingPhotos}</span>` : ""}</span></span></button>`;
}

function renderTopbar() {
  const proj = project();
  const folder = projectFolder(proj);
  const folderName = folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : "");
  const folderColor = folder?.color || "#64748b";
  const auth = state.googleAuth;
  return `<header class="topbar"><div class="topbar-title"><h2>${proj ? escapeHtml(proj.name) : "NeillPlanner"}</h2><p>${proj ? `<span class="inline-folder" style="--folder:${folderColor}">${escapeHtml(folderName)}</span> / ${escapeHtml(proj.address || "No address")}` : "Welcome"}</p></div><div class="topbar-actions">${renderToSortChip()}<button class="user-pill" data-action="${isAdmin() ? "go-settings" : "google-sign-out"}" title="${escapeHtml(isAdmin() ? "Settings" : "Sign out")}"><span class="avatar">${initials(auth.profile?.name || auth.profile?.email || "?")}</span><span class="hide-mobile">${escapeHtml(auth.profile?.name || auth.profile?.email || "Signed in")}${isPrimaryOwner() ? " (owner)" : ""}</span></button></div></header>`;
}

function renderBottomNav() { return `<nav class="bottom-nav" aria-label="Primary">${navItems().map((i) => `<button class="${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>`; }

function renderMassBanner() {
  const m = state.massMode;
  return `<div class="mass-banner" role="status">${icon("mass")}<span>Mass placing: <strong>${escapeHtml(m.category)} / ${escapeHtml(m.lineItem)}</strong> &middot; ${m.count} placed</span><span class="hint">Click the plan to drop. <kbd>Esc</kbd> to stop.</span><button class="ghost-button" data-action="mass-stop">${icon("close")}Stop</button></div>`;
}

function setBulkNodeSize(allFloor) {
  const input = document.querySelector(allFloor ? '[data-floor-size]' : '[data-bulk-size]');
  const value = Number(input?.value) / 100;
  if (!Number.isFinite(value) || value < 0.05 || value > 3) { toast('Choose a size from 5% to 300%'); return; }
  const nodes = allFloor ? floorNodes() : state.nodes.filter(n => state.bulkSelection.includes(n.id));
  nodes.forEach(n => { n.size = value; n.updatedAt = nowStamp(); });
  persist(); render(); toast('Resized ' + nodes.length + ' node(s)');
  logAudit('Bulk Marker Size', {details: nodes.length + ' nodes to ' + Math.round(value*100) + '%'});
}

function renderBulkBar() {
  const count = state.bulkSelection.length;
  return `<div class="bulk-bar" role="status">
    <strong>${count} selected</strong>
    <label>Size (%) <input type="number" min="5" max="300" step="5" value="${state.ui.bulkSizePercent ?? 100}" data-bulk-size aria-label="Selected marker size percent" /></label><button data-action="bulk-size">Apply size</button>
    <label>Status <select data-bulk-status><option value="">—</option>${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}</select></label>
    <label>Category <select data-bulk-category><option value="">—</option>${categoryNames().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select></label>
    <button class="danger-button" data-action="bulk-delete">${icon("trash")}Delete</button>
    <button class="ghost-button" data-action="bulk-clear">${icon("close")}Clear</button>
  </div>`;
}

function renderView() {
  switch (state.activeView) {
    case "projects": return renderProjectsView();
    case "progress": return renderProgressView();
    case "audit": return renderAuditView();
    case "settings": return renderSettingsViewMobile();
    default: return renderMapView();
  }
}

function projectSearchTexts(p) {
  const nodes = state.nodes.filter((n) => n.projectId === p.id);
  return [p.name, p.address, ...nodes.map((n) => nodeDisplayTitle(n)), ...state.rooms.filter((r) => r.projectId === p.id).map((r) => r.name)];
}

function renderProjectsView() {
  const { inProgress, completed } = partitionProjects(state.projects);
  const q = (state.projectsQuery || "").trim();
  const recent = state.projects.filter((p2) => p2.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4);
  const emptyIn = state.projects.length
    ? `<div class="empty-state" style="grid-column:1/-1;padding:28px;text-align:center"><p>${q ? "No projects match your search." : "No jobs in progress."}</p></div>`
    : `<div class="empty-state" style="grid-column:1/-1;padding:36px;text-align:center"><p style="margin-bottom:12px">No projects yet.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create your first project</button></div>`;
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Projects</h3><div class="button-row"><button class="primary-button" data-action="new-project">${icon("plus")}New project</button></div></div>
      ${renderInboxBanners()}
      ${recent.length && !q ? `<div class="recent-projects"><span class="recents-label">Recent</span>${recent.map((p2) => `<button class="recent-project-chip" data-project-open="${p2.id}"><span class="rc-dot" style="background:${projectColor(p2)}"></span>${escapeHtml(p2.name)}</button>`).join("")}</div>` : ""}
      <div class="search-wrap projects-search">${icon("search")}<input data-projects-search data-search-scope="main" value="${escapeHtml(state.projectsQuery || "")}" placeholder="Search projects: name, address, node" aria-label="Search projects" /></div>
      <div class="proj-section-label">In progress <span>${inProgress.length}</span></div>
      <div class="projects-grid">${inProgress.length ? inProgress.map(renderProjectCard).join("") : emptyIn}</div>
      ${completed.length ? `<button class="proj-section-toggle ${state.ui.showCompleted ? "is-open" : ""}" data-action="toggle-completed">${icon("arrowRight")}Completed <span>${completed.length}</span></button>${state.ui.showCompleted ? `<div class="projects-grid">${completed.map(renderProjectCard).join("")}</div>` : ""}` : ""}
    </section>`;
}

function renderProjectCard(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const color = projectColor(item);
  const complete = isProjectComplete(item);
  const links = state.nodes.filter((n) => n.projectId === item.id && n.type === "portal").length;
  const swatches = PROJECT_COLORS.map((c) => `<button class="proj-swatch ${c === color ? "is-active" : ""}" style="background:${c}" data-project-color="${item.id}" data-color="${c}" title="Set colour" aria-label="Set colour ${c}"></button>`).join("");
  return `<article class="project-card ${complete ? "is-complete" : ""}" style="--folder:${color}">
    <div class="project-card-body">
      <div class="compact-row" style="margin-bottom:10px">
        <span class="mini-chip">${icon("layers")}${item.floors?.length || 1} floor(s)</span>
        ${links ? `<span class="mini-chip">${icon("link")}${links} linked</span>` : ""}
        ${complete ? `<span class="mini-chip complete-chip">${icon("check")}Complete</span>` : ""}
      </div>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.address || item.description || "No address")}</p>
      <div class="compact-row" style="margin-top:12px">${statusPill(`${s.completePercent}% complete`)}<span class="mini-chip">${s.total} nodes</span>${s.issue ? `<span class="mini-chip">${s.issue} issues</span>` : ""}</div>
      <div class="proj-swatches" aria-label="Project colour">${swatches}</div>
      <label class="proj-toggle-row"><input type="checkbox" data-project-rooms="${item.id}" ${item.showRooms ? "checked" : ""}><span>Show rooms bar on the map</span></label>
      <div class="button-row" style="margin-top:12px">
        <button class="primary-button" data-project-open="${item.id}">${icon("map")}Open</button>
        <button class="ghost-button" data-project-complete="${item.id}">${complete ? "Reopen" : "Mark complete"}</button>
        <button class="ghost-button icon-only" data-project-delete="${item.id}" title="Delete project">${icon("trash")}</button>
      </div>
    </div>
  </article>`;
}

function renderFolderColourRow(folder) {
  const s = folderStats(folder.id);
  return `<div class="folder-colour-row" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span><input type="color" value="${escapeHtml(folder.color)}" data-folder-color="${folder.id}" aria-label="Colour" /><button class="icon-button" data-folder-rename="${folder.id}" aria-label="Rename">${icon("edit")}</button><button class="icon-button" data-folder-delete="${folder.id}" aria-label="Delete">${icon("trash")}</button></div>`;
}

function renderMapView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("map")}<h3 class="section-title">No project selected</h3><p>Create a project first to start dropping nodes on a plan.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create a project</button></div></section>`;
  const floor = currentFloor();
  if (!floor) return `<section class="view-panel"><div class="empty-state empty-state--big"><h3 class="section-title">Project has no floors</h3><button class="primary-button" data-action="add-floor">${icon("plus")}Add floor</button></div></section>`;
  const hasPlan = Boolean(state.floorPlans[floor.id] || floor.planDriveFileId);
  const allFloorNodes = floorNodes();
  const rooms = floorRooms(floor.id);
  const nodes = selectedRoomNodes(allFloorNodes);
  const matched = nodes.filter(matchesNode);
  const cats = ["All", ...categoryNames()];
  const catsLoaded = Object.keys(state.categoriesData).length > 0;
  const planAspect = Number(floor.planAspectRatio) || 1.6;
  const nodesCollapsed = state.ui.nodesCollapsed ?? isPhoneLayout();
  const rightTab = state.ui.rightTab || "nodes";
  return `
    <section class="map-layout">
      <div class="map-panel">
        <div class="floor-tabs floor-layers" aria-label="Floor layers">
          <span class="floor-layers-label" title="Floor layers">${icon("layers")}<span>Layers</span></span>
          ${proj.floors.sort((a, b) => (a.order || 0) - (b.order || 0)).map((f) => { const fc = state.nodes.filter((n) => n.floorId === f.id).length; return `<button class="floor-tab ${f.id === state.selectedFloorId ? "is-active" : ""}" data-floor="${f.id}" data-floor-tab="${f.id}" draggable="true" title="Switch to ${escapeHtml(f.name)} layer">${escapeHtml(f.name)}<span class="floor-tab-count">${fc}</span></button>`; }).join("")}
          <button class="floor-tab floor-tab--add" data-action="add-floor" title="Add floor layer">${icon("plus")}</button>
          <button class="floor-tab floor-tab--add" data-action="rename-floor" title="Rename current floor">${icon("edit")}</button>
          <button class="floor-tab floor-tab--add" data-action="delete-floor" title="Delete current floor">${icon("trash")}</button><button class="floor-tab floor-tab--add floor-tab--help" data-action="show-help" title="Help / Legend">${icon("question")}</button>
        </div>
        ${proj.showRooms ? `<div class="room-strip" aria-label="Rooms">
          <button class="room-chip ${state.selectedRoomId === "all" ? "is-active" : ""}" data-room="all">All rooms <span>${allFloorNodes.length}</span></button>
          ${rooms.map((r) => `<button class="room-chip ${state.selectedRoomId === r.id ? "is-active" : ""}" data-room="${r.id}">${escapeHtml(r.name)} <span>${state.nodes.filter((n) => n.roomId === r.id).length}</span>${parseRoomShape(r.shape) ? '<span class="room-chip-shape" title="Has plan shape">◇</span>' : ""}</button>`).join("")}
          <button class="room-chip room-chip--add" data-action="new-room">${icon("plus")}Room</button>
          ${hasPlan ? `<button class="room-chip" data-action="auto-rooms" title="Detect rooms from plan walls">${icon("layers")}Auto rooms</button><button class="room-chip ${state.roomDraw?.mode === "poly" && !state.roomDraw?.roomId ? "is-active" : ""}" data-action="draw-room-poly" title="Draw polygon room">${icon("edit")}Draw</button><button class="room-chip ${state.roomDraw?.mode === "rect" && !state.roomDraw?.roomId ? "is-active" : ""}" data-action="draw-room-rect" title="Draw rectangle room">${icon("plus")}Rect</button>` : ""}
          ${state.selectedRoomId !== "all" ? `<button class="room-chip" data-action="rename-room">${icon("edit")}Rename</button>${hasPlan ? `<button class="room-chip" data-action="edit-room-shape" title="Edit room shape on plan">${icon("layers")}Edit shape</button>` : ""}<button class="room-chip room-chip--danger" data-action="delete-room">${icon("trash")}Delete</button>` : ""}
        </div>` : ""}
        <div class="map-toolbar">
          <div class="search-wrap">${icon("search")}<input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search nodes, tags, users" aria-label="Search" /></div>
          <div class="filter-row">${renderSelect("status", ["All", ...Object.keys(statusMeta)], state.filters.status)}${renderSelect("category", cats, state.filters.category)}${renderSelect("assignee", ["All", ...teamNames()], state.filters.assignee)}</div>
          <div class="button-row">
            <button class="ghost-button" data-action="upload-plan">${icon("upload")}<span>Plan</span></button>
            <button class="primary-button" data-action="create-node" ${!hasPlan || !catsLoaded ? "disabled" : ""}>${icon("plus")}<span>Node</span></button>
            <button class="ghost-button" data-action="mass-start" ${!hasPlan || !catsLoaded ? "disabled" : ""}>${icon("mass")}<span>Mass</span></button>
            <button class="ghost-button" data-action="add-portal" ${!hasPlan ? "disabled" : ""}>${icon("portal")}<span>Door</span></button>
            <button class="ghost-button ${state.titlePlacing ? "is-active" : ""}" data-action="add-title-pin" ${!hasPlan ? "disabled" : ""} title="Place a room title pin">${icon("map")}<span>${state.titlePlacing ? "Tap plan…" : "Room title"}</span></button>
            <button class="ghost-button" data-action="print-report" title="Print plan overview">${icon("printer")}<span>Overview</span></button>
            <button class="ghost-button" data-action="print-full-report" title="Full project report with rooms, notes and photos">${icon("download")}<span>Full report</span></button>
          </div>
        </div>
        <div class="canvas-shell">
          <div class="canvas-viewport ${state.massMode.active || state.roomDraw?.mode || state.titlePlacing ? "is-placing" : ""} ${osdFloorReady(floor) ? "is-osd" : ""}" id="canvasViewport">
            <div class="plan-stage ${osdFloorReady(floor) ? "is-osd" : ""}" id="planStage" style="--plan-ar:${planAspect}">
              ${hasPlan ? `<img class="floor-plan" src="${escapeHtml(state.floorPlans[floor.id] || "")}" alt="Floor plan" draggable="false" style="opacity:${floor.planOpacity ?? 1};filter:brightness(${floor.planBrightness ?? 1})" />${floor.planGrid ? '<div class="plan-grid"></div>' : ""}${proj.showRooms ? renderRoomOverlays(rooms) : ""}${state.modal?.mode === "auto-rooms" && state.modal.candidates?.length ? renderAutoRoomPreview(state.modal.candidates) : ""}${state.roomDraw?.mode ? renderRoomDrawPreview() + renderRoomVertexHandles() : ""}` : renderEmptyPlanArea()}
              <div class="node-layer">${nodes.map(renderMarker).join("")}</div>
            </div>
          </div>
          <div class="canvas-tools" aria-label="Canvas tools"><button class="icon-button ${state.ui.planLocked ? "is-active" : ""}" data-action="toggle-plan-lock" title="${state.ui.planLocked ? "Plan locked — tap to allow panning" : "Lock plan (stops panning so you can place/move nodes)"}">${icon(state.ui.planLocked ? "lock" : "unlock")}</button><button class="icon-button" data-action="zoom-in" title="Zoom in">${icon("zoomIn")}</button><button class="icon-button" data-action="zoom-out" title="Zoom out">${icon("zoomOut")}</button><button class="icon-button" data-action="reset-view" title="Recenter">${icon("target")}</button></div>
          <div class="scale-readout" data-action="plan-debug" role="button" title="Tap for plan debug info"><span class="scale-bar"></span><span>${Math.round(state.canvas.zoom * 100)}%</span></div>
          ${hasPlan && state.ui.planDebug ? `<div class="plan-debug" id="planDebug">${escapeHtml(planDebugLine())}</div>` : ""}
          ${hasPlan && !state.floorPlans[floor.id] && !osdFloorReady(floor) && (_planFetchError[floor.id] || !isTokenValid()) ? `<div class="plan-flat-notice" role="status"><span>${!isTokenValid() ? "Sign in to load this plan from Google Drive." : "Couldn't load this plan from Google Drive (" + escapeHtml(_planFetchError[floor.id]) + "). Check you're signed in with the Neill account."}</span>${isTokenValid() ? `<button class="ghost-button" data-action="retry-plan-fetch">Retry</button>` : ""}</div>` : ""}
          ${hasPlan && planIsFlat(floor) ? `<div class="plan-flat-notice" role="status"><span>This plan is a flat image; re-upload the PDF for sharp zoom.</span><button class="ghost-button" data-action="upload-plan">${icon("upload")}Re-upload PDF</button></div>` : ""}
        </div>
        
      </div>
      <aside class="summary-panel ${nodesCollapsed ? "is-collapsed" : ""}">
        <div class="summary-grid"><div class="metric"><span>${state.selectedRoomId === "all" ? "Floor nodes" : "Room nodes"}</span><strong>${nodes.length}</strong></div><div class="metric"><span>Shown</span><strong>${matched.length}</strong></div><div class="metric"><span>Complete</span><strong>${stats(nodes).completePercent}%</strong></div><div class="metric"><span>Issues</span><strong>${stats(nodes).issue}</strong></div></div>
        <div class="right-tabs">
          <button class="right-tab ${rightTab === "nodes" ? "is-active" : ""}" data-right-tab="nodes">${icon("map")}Nodes</button>
          <button class="right-tab ${rightTab === "plan" ? "is-active" : ""}" data-right-tab="plan">${icon("settings")}Plan</button>
        </div>
        ${rightTab === "plan" ? renderPlanSettings(floor) : `
        <div class="size-control"><label>All floor nodes size (%) <input type="number" min="5" max="300" step="5" value="${state.ui.floorSizePercent ?? 100}" data-floor-size /></label><button class="ghost-button" data-action="floor-size">Apply to floor</button></div><div class="collapsible-heading"><h3 class="section-title">Nodes (${state.selectedRoomId === "all" ? "this floor" : escapeHtml(roomLabel(state.selectedRoomId))})</h3><button class="ghost-button compact-toggle" data-action="toggle-node-list">${nodesCollapsed ? "Show" : "Hide"}</button></div>
        <p class="summary-hint">Shift-click markers to multi-select.</p>
        <div class="node-list">${matched.length ? matched.map(renderNodeSummary).join("") : `<div class="empty-state">${nodes.length ? "No matching nodes" : (hasPlan ? "No nodes on this floor yet." : "Upload a plan to start.")}</div>`}</div>
        ${renderBatchNodesPanel(proj)}`}
      </aside>
    </section>`;
}

function removePlan() {
  const fl = currentFloor(); if (!fl) return;
  const ask = window.NDUI && NDUI.confirm
    ? NDUI.confirm({ title: "Remove plan?", message: "Unlinks the plan from this floor. The file stays in Drive.", confirmLabel: "Remove", danger: true })
    : Promise.resolve(window.confirm("Remove the plan from this floor? (The file stays in Drive.)"));
  Promise.resolve(ask).then((ok) => {
    if (!ok) return;
    evictFloorPlan(fl.id);
    fl.planDriveFileId = null; fl.planPngFileId = null; fl.planFileName = null; fl.planMimeType = null; fl.planWebViewLink = null;
    fl.planRecoveryDisabled = true; fl.planPendingUpload = false;
    delete _pendingPlanSources[fl.id];
    if (window.NDCache) NDCache.remove(PLAN_PENDING_CACHE_PREFIX + fl.id).catch(() => {});
    fl.planOpacity = 1; fl.planBrightness = 1; fl.planGrid = false;
    persist(); render(); toast("Plan removed from this floor");
  });
}

function renderRoomOverlays(rooms) {
  const polys = (rooms || []).map((r) => {
    const shape = parseRoomShape(r.shape);
    if (!shape) return "";
    const pts = shape.pts.map(([x, y]) => `${x},${y}`).join(" ");
    const c = polygonCentroid(shape.pts);
    const selected = state.selectedRoomId === r.id;
    return `<g class="room-poly ${selected ? "is-selected" : ""}" data-room-poly="${escapeHtml(r.id)}" style="${roomOverlayStyle(r)}"><polygon points="${pts}"></polygon>${state.ui.roomTitlesVisible === false || titlePinForRoom(r.id) ? "" : `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(r.name)}</text>`}</g>`;
  }).join("");
  if (!polys) return "";
  return `<svg class="room-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polys}</svg>`;
}
function renderRoomDrawPreview() {
  const draw = state.roomDraw;
  if (!draw?.mode || !(draw.points || []).length) return "";
  let pts = draw.points.map((p) => [...p]);
  if (draw.mode === "rect" && pts.length === 2) {
    const [a, b] = pts;
    pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  }
  const preview = roomDrawGeometry(pts, pts.length >= 3);
  pts = preview.points;
  const pointsAttr = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const dots = draw.points.map(([x, y], i) => `<circle class="room-draw-vertex" cx="${x}" cy="${y}" r="0.9" data-i="${i}"></circle>`).join("");
  const closed = pts.length >= 3 && (draw.mode === "poly" || draw.points.length >= 2);
  return `<svg class="room-overlay room-overlay--draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${closed ? `<polygon class="room-draw-poly" points="${pointsAttr}"></polygon>` : `<polyline class="room-draw-line" points="${pointsAttr}" fill="none"></polyline>`}${dots}</svg>`;
}
function renderRoomVertexHandles() {
  const draw = state.roomDraw;
  if (!draw?.editHandles) return "";
  return (draw.points || []).map(([x, y], i) => `<span class="room-vertex-handle" data-vertex="${i}" style="left:${x}%;top:${y}%;--hs:${(30 / (state.canvas.zoom || 1)).toFixed(2)}px"></span>`).join("");
}
function bindRoomVertexHandles() {
  document.querySelectorAll(".room-vertex-handle").forEach((el) => {
    let active = null;
    el.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) {} active = e.pointerId; });
    el.addEventListener("pointermove", (e) => {
      if (active !== e.pointerId) return;
      e.stopPropagation();
      const plan = document.querySelector(".floor-plan"); if (!plan) return;
      const r = plan.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      const i = Number(el.dataset.vertex);
      state.roomDraw.points[i] = [Number(x.toFixed(4)), Number(y.toFixed(4))];
      el.style.left = x + "%"; el.style.top = y + "%";
      const poly = document.querySelector(".room-draw-poly");
      if (poly) poly.setAttribute("points", roomDrawGeometry(state.roomDraw.points).points.map(([a, b]) => `${a},${b}`).join(" "));
    });
    const end = (e) => { if (active !== e.pointerId) return; e.stopPropagation(); active = null; render(); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  });
}
function renderRoomDrawBanner() {
  const draw = state.roomDraw || {};
  const n = (draw.points || []).length;
  const editing = Boolean(draw.roomId);
  const label = draw.mode === "rect" ? "Rectangle" : "Polygon";
  const hint = draw.mode === "rect" ? "Tap two opposite corners." : "Tap to add vertices (≥3), then Done.";
  return `<div class="mass-banner room-draw-banner" role="status">${icon("layers")}<span>${editing ? "Editing room shape" : `Drawing room (${label})`} &middot; ${n} pt${n === 1 ? "" : "s"}</span><span class="hint">${hint} <kbd>Esc</kbd> cancel.</span>${!draw.editHandles && n ? `<button class="ghost-button" data-action="room-draw-undo">Undo point</button>` : ""}<button class="ghost-button" data-action="toggle-room-snap" aria-pressed="${state.ui.roomSnap !== false}">Wall snap: ${state.ui.roomSnap !== false ? "On" : "Off"}</button><button class="ghost-button" data-action="room-draw-cancel">${icon("close")}Cancel</button><button class="primary-button" data-action="room-draw-done" ${n < (draw.mode === "rect" ? 2 : 3) ? "disabled" : ""}>${icon("check")}Done</button></div>`;
}
function renderEmptyPlanArea() {
  return `<div class="empty-plan"><div class="empty-plan-inner"><div class="empty-plan-icon">${icon("map")}</div><h3>No floor plan yet</h3><p>Upload a building plan (PNG, JPG, SVG, or PDF). It will sync to Drive automatically.</p><p class="empty-plan-hint">Added the plan on another device? Open Planner there, signed in with reception, so it can finish syncing.</p><button class="primary-button" type="button" data-action="upload-plan">${icon("upload")}Upload plan image</button></div></div>`;
}

/* §22 Floor-plan settings (right panel "Plan" tab). Per-floor display prefs
 * (opacity / brightness / grid) applied to the plan image, plus replace and
 * unlink. Stored on the floor object and persisted locally. */
function renderPlanSettings(floor) {
  const hasPlan = Boolean(state.floorPlans[floor.id] || floor.planDriveFileId);
  if (!hasPlan) {
    return `<div class="plan-settings"><div class="empty-state" style="padding:24px 10px;text-align:center">No plan on <strong>${escapeHtml(floor.name)}</strong> yet.<br><button class="primary-button" data-action="upload-plan" style="margin-top:12px">${icon("upload")}Upload plan</button></div></div>`;
  }
  const op = Math.round((floor.planOpacity ?? 1) * 100);
  const br = Math.round((floor.planBrightness ?? 1) * 100);
  return `<div class="plan-settings">
    <h3 class="section-title">Floor plan</h3>
    <div class="ps-field"><label>Plan opacity <span class="ps-val">${op}%</span></label><input type="range" min="20" max="100" step="5" value="${op}" data-plan-set="opacity"></div>
    <div class="ps-field"><label>Brightness <span class="ps-val">${br}%</span></label><input type="range" min="50" max="150" step="5" value="${br}" data-plan-set="brightness"></div>
    <label class="ps-toggle"><input type="checkbox" data-plan-set="grid" ${floor.planGrid ? "checked" : ""}><span>Grid overlay</span></label>
    <label class="ps-toggle"><input type="checkbox" data-plan-set="lock" ${state.ui.planLocked ? "checked" : ""}><span>Lock plan — place / move nodes without panning</span></label>
    <h3 class="section-title">Rooms</h3>
    <button type="button" class="ghost-button" data-action="auto-rooms" style="width:100%;justify-content:center;margin-bottom:10px">${icon("layers")}Auto rooms</button>
    <p class="summary-hint" style="margin-top:0">Detect closed spaces from the plan image (and any drawn room walls). Preview before saving; undo after commit.</p>
    <label class="ps-toggle"><input type="checkbox" data-room-pref="titles" ${state.ui.roomTitlesVisible !== false ? "checked" : ""}><span>Show room titles (off keeps the pins)</span></label>
    <label class="ps-toggle"><input type="checkbox" data-room-pref="snap" ${state.ui.roomSnap !== false ? "checked" : ""}><span>Snap to nearby room walls</span></label>
    <div class="ps-field"><label for="room-opacity-master">All room opacity <span class="ps-val">${Math.round((state.ui.roomOpacity ?? 1) * 100)}%</span></label><input id="room-opacity-master" type="range" min="0" max="100" step="1" value="${Math.round((state.ui.roomOpacity ?? 1) * 100)}" data-room-pref="opacity"></div>
    <p class="summary-hint">Multiplies each room’s own border and fill settings. At 50%, a room set to 50% displays at 25%.</p>
    <div class="ps-field"><label for="room-title-size-all">All room title sizes (%)</label><input id="room-title-size-all" type="number" min="1" max="300" step="1" value="${state.ui.roomTitleSizePercent ?? 100}" data-room-title-size><button class="ghost-button" data-action="room-title-size">Apply to this floor</button></div>
    ${floor.planFileName ? `<p class="ps-meta">${icon("map")}${escapeHtml(floor.planFileName)}</p>` : ""}
    ${_planFetchError[floor.id] ? `<p class="summary-hint" role="status">Drive plan status: ${escapeHtml(_planFetchError[floor.id])}</p>` : ""}
    <a class="ghost-button" href="../fitoff/?project=${escapeHtml(state.selectedProjectId || "")}" target="_blank" rel="noopener" style="justify-content:center;text-decoration:none">${icon("map")}Open fit-off view</a>
    <div class="ps-actions">
      <button class="ghost-button" data-action="upload-plan">${icon("upload")}Replace</button>
      <button class="ghost-button" data-action="reset-view">${icon("target")}Reset view</button>
      <button class="danger-button" data-action="remove-plan">${icon("trash")}Remove</button>
    </div>
  </div>`;
}

function renderSelect(name, options, value) { return `<select data-filter="${name}" aria-label="${name}">${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`; }

/* A node "pings" red when it has no photo, overriding its status colour.
 * Portals are wayfinding links that carry no photos, so they're exempt. */
function nodeMissingPhoto(node) {
  return node.type !== "portal" && node.type !== "title" && (node.imageRefs || []).length === 0;
}

function renderMarker(node) {
  const isSelected = node.id === state.selectedNodeId;
  const isBulk = state.bulkSelection.includes(node.id);
  const isDim = !matchesNode(node);
  if (node.type === "title") {   // 0.16.1 room title pin: map pin + readable label, tip sits on the position
    return `<button class="node-marker is-title-pin ${isSelected ? "is-selected" : ""} ${isBulk ? "is-bulk" : ""}" style="--x:${node.position.x};--y:${node.position.y};--size:${node.size || 1};--pin-hit:${28 / (state.canvas.zoom || 1)}px" data-node="${node.id}" aria-label="Room title: ${escapeHtml(nodeDisplayTitle(node))}"><span class="title-pin-visual"><span class="title-pin-label" ${state.ui.roomTitlesVisible === false ? "hidden" : ""}>${escapeHtml(nodeDisplayTitle(node))}</span><span class="title-pin-head" aria-hidden="true"></span></span></button>`;
  }
  const isPortal = node.type === "portal";
  const isSwitchboard = node.type === "switchboard";
  const isSubboard = node.type === "subboard";
  const catColor = nodeColor(node);
  const extraClass = isPortal ? "is-portal" : isSwitchboard ? "is-switchboard" : isSubboard ? "is-subboard" : "";
  const innerIcon = isPortal ? icon("portal") : isSwitchboard ? icon("switchboard") : isSubboard ? icon("subboard") : "";
  const swbBadge = (isSwitchboard || isSubboard) && node.swbProjectId
    ? `<span class="swb-linked-dot" title="Linked to SWB project"></span>` : "";
  return `<button class="node-marker ${extraClass} ${isSelected ? "is-selected" : ""} ${isBulk ? "is-bulk" : ""} ${isDim ? "is-dim" : ""} ${nodeMissingPhoto(node) ? "no-photo" : ""}" style="--x:${node.position.x};--y:${node.position.y};--cat:${catColor};--size:${node.size || 1};${statusStyle(node.status)}" data-node="${node.id}" aria-label="${escapeHtml(nodeDisplayTitle(node))}"><span class="node-hit-area" aria-hidden="true"></span>${innerIcon}${node.comments?.length ? `<span class="comment-count">${node.comments.length}</span>` : ""}${swbBadge}</button>`;
}

function renderNodeSummary(node) {
  const isPortal = node.type === "portal";
  const catColor = nodeColor(node);
  const linkedTarget = isPortal ? projectById(node.linkedProjectId)?.name : null;
  const isBulk = state.bulkSelection.includes(node.id);
  return `<button class="node-summary ${node.id === state.selectedNodeId ? "is-selected" : ""} ${isBulk ? "is-bulk" : ""} ${nodeMissingPhoto(node) ? "no-photo" : ""}" data-node="${node.id}"><span class="status-dot" style="${statusStyle(node.status)}"></span><span class="category-dot" style="--cat:${catColor}"></span><span><strong>${escapeHtml(nodeDisplayTitle(node))}</strong><span>${isPortal ? `${icon("portal")} -> ${escapeHtml(linkedTarget || roomLabel(node.linkedRoomId) || "(unlinked)")}` : `${escapeHtml(node.category || "-")} / ${escapeHtml(roomLabel(node.roomId))} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</span></span></button>`;
}
