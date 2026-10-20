/* ============================================================ EVENTS */

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.activeView = b.dataset.view; state.drawerOpen = state.activeView === "map" && Boolean(selectedNode()); persist(); render(); }));
  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", () => selectProject(b.dataset.project)));
  document.querySelectorAll("[data-project-open]").forEach((b) => b.addEventListener("click", () => {
    const proj = projectById(b.dataset.projectOpen);
    if (proj) { proj.lastOpenedAt = Date.now(); }
    selectProject(b.dataset.projectOpen); state.activeView = "map"; render();
  }));
  document.querySelectorAll("[data-project-delete]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); deleteProject(b.dataset.projectDelete); }));
  document.querySelectorAll("[data-project-color]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const p = projectById(b.dataset.projectColor); if (!p) return;
    p.color = b.dataset.color; persist(); render();
  }));
  document.querySelectorAll("[data-project-complete]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const p = projectById(b.dataset.projectComplete); if (!p) return;
    p.completed = !isProjectComplete(p); persist(); render();
    toast(p.completed ? `${p.name} marked complete` : `${p.name} reopened`);
  }));
  document.querySelectorAll("[data-project-rooms]").forEach((cb) => cb.addEventListener("change", (e) => {
    e.stopPropagation();
    const p = projectById(cb.dataset.projectRooms); if (!p) return;
    p.showRooms = cb.checked; if (!cb.checked && p.id === state.selectedProjectId) state.selectedRoomId = "all"; persist(); render();
  }));
  document.querySelectorAll("[data-folder]").forEach((b) => b.addEventListener("click", () => { state.selectedFolderId = b.dataset.folder; state.activeView = "projects"; state.drawerOpen = false; persist(); render(); }));
  document.querySelectorAll("[data-room]").forEach((b) => b.addEventListener("click", () => { state.selectedRoomId = b.dataset.room || "all"; state.selectedNodeId = null; state.drawerOpen = false; persist(); render(); }));
  document.querySelectorAll("[data-folder-color]").forEach((input) => input.addEventListener("change", () => {
    const folder = state.projectFolders.find((f) => f.id === input.dataset.folderColor); if (!folder) return;
    folder.color = input.value; persist(); render(); toast(`${folder.name} colour updated`);
    logAudit("Folder Edited", { details: `Colour set to ${input.value} for ${folder.name}` });
  }));
  document.querySelectorAll("[data-folder-rename]").forEach((b) => b.addEventListener("click", () => { state.modal = { mode: "rename-folder", folderId: b.dataset.folderRename }; render(); }));
  document.querySelectorAll("[data-folder-delete]").forEach((b) => b.addEventListener("click", () => deleteFolder(b.dataset.folderDelete)));
  document.querySelectorAll("[data-project-folder]").forEach((sel) => sel.addEventListener("change", () => {
    const item = projectById(sel.dataset.projectFolder); if (!item) return;
    const previousFolderId = item.folderId || null;
    item.folderId = sel.value || null;
    persist(); render(); toast(`${item.name} moved`);
    logAudit("Project Moved", { projectId: item.id, details: `Folder set to ${item.folderId ? state.projectFolders.find((f) => f.id === item.folderId)?.name : DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) moveProjectDriveFolder(item, previousFolderId).catch((e) => console.warn(e));
  }));
  document.querySelectorAll("[data-floor]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.dragged === "true") { b.dataset.dragged = ""; return; } state.selectedFloorId = b.dataset.floor; state.selectedRoomId = "all"; state.selectedNodeId = null; state.drawerOpen = false; persist(); render(); maybeFetchPlanForCurrentFloor(); }));
  bindFloorReorder();
  document.querySelectorAll("[data-node]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.shiftKey) return toggleBulkSelect(b.dataset.node);
    const node = state.nodes.find((n) => n.id === b.dataset.node);
    // Portal = floor-layer jump affordance: one tap walks through when linked.
    if (node?.type === "portal" && node.linkedProjectId && node.linkedFloorId
        && (node.linkedFloorId !== state.selectedFloorId || node.linkedProjectId !== state.selectedProjectId)) {
      state.selectedNodeId = node.id;
      return followPortal();
    }
    openNode(b.dataset.node);
  }));
  document.querySelectorAll("[data-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.filters[input.dataset.filter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-audit-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.auditView.filters[input.dataset.auditFilter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", handleAction));
  document.querySelectorAll("[data-batch-key]").forEach((el) => el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", el.dataset.batchKey);
    e.dataTransfer.effectAllowed = "copy";
  }));
  // §UI: "Sync master" buttons use the shared water fill (assets/sync-fill.js),
  // filling red→green with the master-sheet sync status.
  if (window.NDSyncFill && window.NDQueue) {
    const s = NDQueue.status();
    document.querySelectorAll('[data-action="sync-master-sheet"]').forEach((b) => NDSyncFill.apply(b, s));
    document.querySelectorAll("[data-sfill]").forEach((el) => NDSyncFill.apply(el, el.dataset.sfill));
    if (!window._plannerSyncFillSub) {
      window._plannerSyncFillSub = NDQueue.onStatus((st) => document.querySelectorAll('[data-action="sync-master-sheet"]').forEach((b) => NDSyncFill.apply(b, st)));
    }
  }
  document.querySelectorAll("[data-right-tab]").forEach((b) => b.addEventListener("click", () => { state.ui.rightTab = b.dataset.rightTab; persist(); render(); }));
  document.querySelectorAll("[data-plan-set]").forEach((el) => {
    const fl = currentFloor(); if (!fl) return;
    function live() {
      const img = document.querySelector(".floor-plan");
      if (el.dataset.planSet === "opacity") { fl.planOpacity = Number(el.value) / 100; if (img) img.style.opacity = fl.planOpacity; }
      else if (el.dataset.planSet === "brightness") { fl.planBrightness = Number(el.value) / 100; if (img) img.style.filter = `brightness(${fl.planBrightness})`; }
      const v = el.closest(".ps-field") && el.closest(".ps-field").querySelector(".ps-val"); if (v) v.textContent = el.value + "%";
    }
    if (el.type === "checkbox") { el.addEventListener("change", () => { if (el.dataset.planSet === "lock") state.ui.planLocked = el.checked; else fl.planGrid = el.checked; persist(); render(); }); }
    else { el.addEventListener("input", live); el.addEventListener("change", () => { live(); persist(); }); }
  });
  document.querySelectorAll("[data-room-pref]").forEach(el => {
    const update = () => {
      if (el.dataset.roomPref === "opacity") {
        state.ui.roomOpacity = Number(el.value) / 100;
        el.closest(".ps-field").querySelector(".ps-val").textContent = el.value + "%";
        document.querySelectorAll("[data-room-poly]").forEach(poly => poly.setAttribute("style", roomOverlayStyle(roomById(poly.dataset.roomPoly))));
      } else if (el.dataset.roomPref === "titles") state.ui.roomTitlesVisible = el.checked;
      else state.ui.roomSnap = el.checked;
    };
    if (el.type === "range") el.addEventListener("input", update);
    el.addEventListener("change", () => { update(); persist({ skipSync: true }); if (el.type !== "range") render(); });
  });
  document.querySelectorAll("[data-room-opacity]").forEach(el => {
    const update = () => {
      const room = roomById(el.dataset.roomId), shape = parseRoomShape(room?.shape); if (!shape) return;
      shape.appearance = { borderOpacity: .85, fillOpacity: .18, ...shape.appearance, [el.dataset.roomOpacity]: Number(el.value) / 100 }; room.shape = shape;
      el.closest(".ps-field").querySelector(".ps-val").textContent = el.value + "%";
      document.querySelectorAll("[data-room-poly]").forEach(poly => { if (poly.dataset.roomPoly === room.id) poly.setAttribute("style", roomOverlayStyle(room)); });
    };
    el.addEventListener("input", update);
    el.addEventListener("change", () => { update(); const room = roomById(el.dataset.roomId); if (room) room.updatedAt = nowStamp(); persist(); });
  });
  const quickStatus = document.querySelector("[data-quick-status]");
  if (quickStatus) quickStatus.addEventListener("change", () => updateNodeStatus(quickStatus.value));
  document.querySelectorAll("[data-notes]").forEach((textarea) => textarea.addEventListener("change", () => {
    const node = state.nodes.find((n) => n.id === textarea.dataset.notes); if (!node) return;
    node.description = textarea.value; node.updatedAt = nowStamp(); persist(); toast("Notes saved");
    logAudit("Notes Updated", { nodeId: node.id, details: "Notes edited" });
  }));
  document.querySelectorAll("[data-lightbox]").forEach((b) => b.addEventListener("click", () => { state.lightbox = { index: Number(b.dataset.lightbox) }; render(); }));
  document.querySelectorAll("[data-bulk-photo-assign]").forEach((b) => b.addEventListener("click", () => assignBulkPhotoToNode(b.dataset.bulkPhotoAssign)));
  document.querySelectorAll("[data-photo-upload]").forEach((input) => input.addEventListener("change", (e) => { const files = Array.from(e.target.files || []); if (files.length) uploadPhotosToNode(input.dataset.photoUpload, files); }));
  document.querySelectorAll("[data-node-size]").forEach((input) => {
    input.addEventListener("input", () => {
      const node = state.nodes.find((n) => n.id === input.dataset.nodeSize);
      if (!node) return;
      node.size = Number(input.value);
      node.updatedAt = nowStamp();
      const el = document.querySelector(`.node-marker[data-node="${node.id}"]`);
      if (el) el.style.setProperty("--size", node.size);
      const label = input.parentElement?.querySelector("label strong");
      if (label) label.textContent = Math.round(node.size * 100) + "%";
    });
    input.addEventListener("change", () => {
      const node = state.nodes.find((n) => n.id === input.dataset.nodeSize);
      if (!node) return;
      persist();
      logAudit("Marker Resized", { nodeId: node.id, details: `Size ${Math.round(node.size * 100)}%` });
    });
  });
  document.querySelectorAll("[data-node-category]").forEach((sel) => sel.addEventListener("change", () => {
    const itemSel = sel.form.querySelector("[data-node-item]"); if (!itemSel) return;
    const items = categoryItems(sel.value);
    itemSel.innerHTML = items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`;
    const nameInput = sel.form.querySelector('input[name="customTitle"]');
    if (nameInput && !nameInput.dataset.userEdited) {
      nameInput.value = autoSuggestName(items[0]?.item || "");
    }
  }));
  document.querySelectorAll("[data-node-item]").forEach((sel) => sel.addEventListener("change", () => {
    const nameInput = sel.form.querySelector('input[name="customTitle"]');
    if (nameInput && !nameInput.dataset.userEdited) {
      nameInput.value = autoSuggestName(sel.value);
    }
  }));
  document.querySelectorAll('input[name="customTitle"]').forEach((inp) => inp.addEventListener("input", () => { inp.dataset.userEdited = "1"; }));
  document.querySelectorAll("[data-portal-target]").forEach((sel) => sel.addEventListener("change", () => {
    const floorSel = sel.form.querySelector("#portalFloor"); if (!floorSel) return;
    const target = projectById(sel.value);
    const fs = target?.floors || [];
    floorSel.innerHTML = fs.length ? fs.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") : `<option value="">No floors</option>`;
    updatePortalRoomOptions(sel.form);
  }));
  document.querySelectorAll("[data-portal-floor]").forEach((sel) => sel.addEventListener("change", () => updatePortalRoomOptions(sel.form)));
  document.querySelectorAll("[data-team-remove]").forEach((b) => b.addEventListener("click", () => removeTeamMember(b.dataset.teamRemove, b.dataset.teamEmail)));
  document.querySelectorAll("[data-category-editor-tab]").forEach((sel) => sel.addEventListener("change", () => {
    state.ui.categoryEditorTab = sel.value;
    persist({ skipSync: true });
    render();
  }));
  const bulkStatus = document.querySelector("[data-bulk-status]");
  if (bulkStatus) bulkStatus.addEventListener("change", (e) => { if (e.target.value) bulkSetStatus(e.target.value); });
  const bulkCategory = document.querySelector("[data-bulk-category]");
  if (bulkCategory) bulkCategory.addEventListener("change", (e) => { if (e.target.value) bulkSetCategory(e.target.value); });
  const nodeForm = document.getElementById("nodeForm"); if (nodeForm) nodeForm.addEventListener("submit", handleNodeForm);
  const folderForm = document.getElementById("folderForm"); if (folderForm) folderForm.addEventListener("submit", handleFolderForm);
  const projectForm = document.getElementById("projectForm");
  if (projectForm) {
    projectForm.addEventListener("submit", handleProjectForm);
    initProjectAddressAutocomplete();
    const hereBtn = projectForm.querySelector("[data-here-project]");
    const addrInput = projectForm.querySelector("[data-project-address]");
    if (window.NDHere && hereBtn && addrInput) NDHere.attachButton(hereBtn, addrInput, { region: ADDRESS_COUNTRY, busyLabel: "Locating…", mapsKey: googleConfig.googleApiKey, onResult: () => addrInput.setCustomValidity("") });
  }
  // Toast expiry and background sync can re-render while the user is typing.
  // Retain size drafts so those renders cannot silently reset the chosen size.
  document.querySelector('[data-bulk-size]')?.addEventListener('input', e => { state.ui.bulkSizePercent = e.target.value; });
  document.querySelector('[data-floor-size]')?.addEventListener('input', e => { state.ui.floorSizePercent = e.target.value; });
  document.getElementById('massSize')?.addEventListener('input', e => { if (state.modal) state.modal.sizePercent = e.target.value; });
  const massForm = document.getElementById("massForm"); if (massForm) massForm.addEventListener("submit", handleMassForm);
  const portalForm = document.getElementById("portalForm"); if (portalForm) portalForm.addEventListener("submit", handlePortalForm);
  const floorForm = document.getElementById("floorForm"); if (floorForm) floorForm.addEventListener("submit", handleFloorForm);
  const roomForm = document.getElementById("roomForm"); if (roomForm) roomForm.addEventListener("submit", handleRoomForm);
  const autoRoomsForm = document.getElementById("autoRoomsForm");
  if (autoRoomsForm) {
    autoRoomsForm.addEventListener("submit", commitAutoRooms);
    autoRoomsForm.querySelectorAll("[data-auto-room-idx],[data-auto-room-name],[data-auto-rooms-ocr]").forEach((el) => {
      el.addEventListener("change", () => { syncAutoRoomsModalFromDom(); render(); });
      el.addEventListener("input", () => { syncAutoRoomsModalFromDom(); });
    });
  }
  bindCanvasEvents();
  bindMarkerDrag();
}

function loadPlannerPlacesLibrary() {
  if (!hasGoogleApiKey) return Promise.reject(new Error("Google Maps API key is missing"));
  if (window.google?.maps?.places) return Promise.resolve();
  if (plannerPlacesPromise) return plannerPlacesPromise;
  plannerPlacesPromise = new Promise((resolve, reject) => {
    const callbackName = `initPlannerPlaces_${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleConfig.googleApiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      plannerPlacesPromise = null;
      delete window[callbackName];
      reject(new Error("Address search could not load"));
    };
    document.head.appendChild(script);
  });
  return plannerPlacesPromise;
}

async function initProjectAddressAutocomplete() {
  const input = document.querySelector("[data-project-address]");
  if (!input || input.dataset.autocompleteBound) return;
  input.dataset.autocompleteBound = "pending";
  try {
    await loadPlannerPlacesLibrary();
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(VICTORIA_ADDRESS_BOUNDS.south, VICTORIA_ADDRESS_BOUNDS.west),
      new google.maps.LatLng(VICTORIA_ADDRESS_BOUNDS.north, VICTORIA_ADDRESS_BOUNDS.east)
    );
    const autocomplete = new google.maps.places.Autocomplete(input, {
      fields: ["formatted_address", "address_components"],
      types: ["address"],
      bounds,
      strictBounds: true,
      componentRestrictions: ADDRESS_COUNTRY ? { country: ADDRESS_COUNTRY } : undefined
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!isVictorianPlace(place)) {
        input.setCustomValidity("Select a street address in Victoria, Australia");
        toast("Select a street address in Victoria, Australia");
        return;
      }
      input.value = place.formatted_address || input.value;
      input.setCustomValidity("");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.dataset.autocompleteBound = "true";
  } catch (e) {
    input.dataset.autocompleteBound = "";
    console.warn("Address autocomplete failed", e);
  }
}

function isVictorianPlace(place) {
  const components = place?.address_components || [];
  return components.some((component) =>
    component.types?.includes("administrative_area_level_1") &&
    (component.short_name === "VIC" || component.long_name === "Victoria")
  );
}

function bindFloorReorder() {
  let draggedId = null;
  document.querySelectorAll("[data-floor-tab]").forEach((tab) => {
    tab.addEventListener("dragstart", (e) => {
      draggedId = tab.dataset.floorTab;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
    });
    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      const sourceId = draggedId || e.dataTransfer.getData("text/plain");
      const targetId = tab.dataset.floorTab;
      tab.dataset.dragged = "true";
      reorderFloor(sourceId, targetId);
    });
  });
}

function updatePortalRoomOptions(form) {
  const floorId = form.querySelector("#portalFloor")?.value || "";
  const roomSel = form.querySelector("#portalTargetRoom"); if (!roomSel) return;
  const rooms = floorRooms(floorId);
  roomSel.innerHTML = `<option value="">No room</option>${rooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")}`;
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (["close-drawer", "close-modal", "close-lightbox"].includes(action)) event.preventDefault();
  switch (action) {
    case "google-sign-in": return signIn();
    case "google-sign-out": return signOut();
    case "google-bootstrap": return bootstrapDrive();
    case "sync-all-folders": return syncAllDriveFolders();
    case "refresh-all": return refreshAllPlannerData();
    case "sync-master-sheet": return flushMasterDeltas({ manual: true });
    case "remove-plan": return removePlan();
    case "rebuild-master-sheet": return confirmRebuildMasterSheet();
    case "sync-chip": return flushMasterDeltas({ manual: true });
    case "hydrate-cloud": return reloadMasterData();
    case "import-master-photos": return importMasterPhotos();
    case "repair-search-images": return repairMovedSearchImages();
    case "refresh-users": return refreshUsers();
    case "refresh-bulk-photos": return refreshBulkPhotos();
    case "upload-bulk-photos": return uploadBulkPhotos();
    case "diag-inject-bucket-node": return diagInjectBucketNode();
    case "show-help": state.modal = { mode: "help" }; return render();
    case "refresh-categories": return refreshCategories();
    case "save-category-csv": return saveCategoryCsvFromSettings();
    case "refresh-team": return refreshTeamAccess();
    case "team-add": {
      const email = document.getElementById("newTeamEmail")?.value.trim();
      const role = document.getElementById("newTeamRole")?.value || "writer";
      if (email) addTeamMember(email, role);
      return;
    }
    case "go-settings": state.activeView = "settings"; persist(); return render();
    case "toggle-node-list": {
      const current = state.ui.nodesCollapsed ?? isPhoneLayout();
      state.ui.nodesCollapsed = !current;
      persist();
      return render();
    }
    case "toggle-plan-lock": state.ui.planLocked = !state.ui.planLocked; persist(); return render();
    case "toggle-completed": state.ui.showCompleted = !state.ui.showCompleted; persist(); return render();
    case "refresh-batch": toast("Refreshing batch nodes…"); refreshInbox({ silent: false }).then(() => toast("Batch nodes refreshed")).catch(() => {}); return;
    case "open-batch-folder": {
      // Open the raw Batch folder in Drive (all uploads). The batch-nodes panel
      // itself already filters to this job by address.
      if (!state.drive.rootFolderId) { toast("Drive not ready yet"); return; }
      ensureBatchFolderId()
        .then((bid) => window.open("https://drive.google.com/drive/folders/" + (bid || state.drive.rootFolderId), "_blank", "noopener"))
        .catch(() => window.open("https://drive.google.com/drive/folders/" + state.drive.rootFolderId, "_blank", "noopener"));
      return;
    }
    case "toggle-batch": {
      const collapsedNow = state.ui.batchCollapsed != null ? state.ui.batchCollapsed : (batchNodeGroups(project()).length === 0);
      state.ui.batchCollapsed = !collapsedNow;
      persist();
      return render();
    }
    case "create-node": return openCreateModal({ x: 50, y: 50 });
    case "new-project": state.modal = { mode: "new-project" }; return render();
    case "edit-project": state.modal = { mode: "edit-project" }; return render();
    case "delete-project": return deleteProject(state.selectedProjectId);
    case "new-folder": state.modal = { mode: "new-folder" }; return render();
    case "add-floor": state.modal = { mode: "add-floor" }; return render();
    case "new-room": state.modal = { mode: "new-room" }; return render();
    case "rename-room": if (state.selectedRoomId === "all") return; state.modal = { mode: "rename-room", roomId: state.selectedRoomId }; return render();
    case "delete-room": return deleteSelectedRoom();
    case "auto-rooms": return startAutoRooms();
    case "auto-rooms-cancel": state.modal = null; return render();
    case "draw-room-poly": return startRoomDraw("poly");
    case "draw-room-rect": return startRoomDraw("rect");
    case "edit-room-shape": if (state.selectedRoomId === "all") return; return startRoomDraw("poly", state.selectedRoomId);
    case "room-draw-done": return finishRoomDraw();
    case "room-draw-cancel": clearRoomDraw(); return render();
    case "room-draw-undo": if (state.roomDraw?.points?.length) state.roomDraw.points.pop(); return render();
    case "toggle-room-snap": state.ui.roomSnap = state.ui.roomSnap === false; persist({ skipSync: true }); return render();
    case "room-title-size": {
      const percent = Number(document.querySelector("[data-room-title-size]")?.value);
      if (!Number.isFinite(percent) || percent < 1 || percent > 300) { toast("Choose a room title size from 1% to 300%"); return; }
      state.ui.roomTitleSizePercent = percent;
      floorNodes().filter(n => n.type === "title").forEach(n => { n.size = percent / 100; n.updatedAt = nowStamp(); });
      persist(); render(); toast("Room title sizes updated"); return;
    }
    case "export-rooms": return openRoomExport();
    case "title-draw-room": return startTitleRoomDraw(false);
    case "title-edit-room": return startTitleRoomDraw(true);
    case "rename-floor": if (!currentFloor()) return; state.modal = { mode: "rename-floor" }; return render();
    case "delete-floor": return deleteCurrentFloor();
    case "upload-plan": return uploadFloorPlan();
    case "retry-plan-fetch": { const f = currentFloor(); if (f) delete _planFetchError[f.id]; render(); return maybeFetchPlanForCurrentFloor(); }
    case "mass-start":
      if (!categoryNames().length) { toast("No categories - hit Refresh categories in Settings"); state.activeView = "settings"; return render(); }
      state.modal = { mode: "mass-pick", category: categoryNames()[0] }; return render();
    case "mass-stop": return stopMassMode();
    case "add-portal": state.modal = { mode: "portal-create" }; return render();
    case "add-title-pin": state.titlePlacing = !state.titlePlacing; if (state.titlePlacing) toast("Tap the plan where the room title goes"); return render();
    case "follow-portal": return followPortal();
    case "plan-debug": state.ui.planDebug = !state.ui.planDebug; return render();
    case "zoom-in": return setZoom(state.canvas.zoom + 0.15, false, { animate: true });
    case "zoom-out": return setZoom(state.canvas.zoom - 0.15, false, { animate: true });
    case "reset-view":
      if (osdActive() && _osd.ready) { _osd.viewer.viewport.goHome(); return; }
      state.canvas = { zoom: 1, panX: 0, panY: 0 };
      persist();
      applyCanvasTransform();
      updateScaleReadout();
      flashStageAnimating();
      return;
    case "close-drawer": state.drawerOpen = false; persist(); return render();
    case "close-modal": dismissModal(); return render();
    case "close-lightbox": state.lightbox = null; return render();
    case "edit-node": state.modal = { mode: "edit" }; return render();
    case "bulk-photo-picker": state.modal = { mode: "bulk-photo-picker" }; return render();
    case "clone-node": return cloneSelectedNode();
    case "delete-node": return deleteSelectedNode();
    case "share-node": return shareSelectedNode();
    case "send-comment": return sendComment();
    case "prev-image": return stepImage(-1);
    case "next-image": return stepImage(1);
    case "audit-load": return fetchAuditRows();
    case "hours-load": return fetchTimesheetHours();
    case "hours-toggle": { const id = event.currentTarget.dataset.hoursJob; if (_hoursUI.excluded.has(id)) _hoursUI.excluded.delete(id); else _hoursUI.excluded.add(id); return render(); }
    case "hours-range": { _hoursUI.range = event.currentTarget.dataset.range || "all"; return render(); }
    case "audit-download": return downloadAuditCsv(filteredAuditRows());
    case "audit-clear-filters": state.auditView.filters = freshState().auditView.filters; persist(); return render();
    case "print-report": return openPlannerReport("overview");
    case "print-full-report": return openPlannerReport("full");
    case "print-mode-overview": if (state.modal) state.modal.reportMode = "overview"; return render();
    case "print-mode-full": if (state.modal) state.modal.reportMode = "full"; return render();
    case "report-fullscreen": return toggleReportView('fullscreen');
    case "report-photo-view": return toggleReportView('fullImages');
    case "print-now": return printPlannerReport();
    case "download-pdf": return downloadPlannerPdf();
    case "share-pdf": return sharePlannerPdf();
    case "save-pdf-drive": return savePrintPdfToDrive();
    case "bulk-size": return setBulkNodeSize(false);
    case "floor-size": return setBulkNodeSize(true);
    case "bulk-delete": return bulkDelete();
    case "bulk-clear": state.bulkSelection = []; return render();
    case "wipe-local": return confirmWipeLocal();
    case "format-planner": return formatPlannerData();
  }
}

function bindCanvasEvents() {
  const viewport = document.getElementById("canvasViewport"); if (!viewport) return;
  // Batch-node drop: drag a premade node from the panel onto the plan to place it.
  viewport.addEventListener("dragover", (e) => { if (e.dataTransfer) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  viewport.addEventListener("drop", (e) => {
    const key = e.dataTransfer && e.dataTransfer.getData("text/plain"); if (!key || !_batchGroups[key]) return;
    e.preventDefault();
    const pos = pointerToPlanPosition(e) || { x: 50, y: 50 };
    placeBatchNode(key, pos);
  });
  if (osdFloorReady(currentFloor())) return;   // 0.18.1: OpenSeadragon handles pan/pinch/zoom/taps
  // Non-passive touch listeners: block Safari page pinch/double-tap zoom while plan-pinching.
  const blockSafariPageZoom = (e) => {
    if ((e.touches && e.touches.length >= 2) || pinchState) e.preventDefault();
  };
  viewport.addEventListener("touchstart", blockSafariPageZoom, { passive: false });
  viewport.addEventListener("touchmove", blockSafariPageZoom, { passive: false });
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    viewport.addEventListener(type, (e) => e.preventDefault());
  });
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const focal = clientToViewportFocal(e.clientX, e.clientY, viewport);
    setZoom(state.canvas.zoom + (e.deltaY < 0 ? 0.08 : -0.08), false, { skipPersist: true, focal });
    // Persist after a short idle so live wheel doesn't jank every tick.
    clearTimeout(bindCanvasEvents._wheelPersistT);
    bindCanvasEvents._wheelPersistT = setTimeout(() => persist(), 180);
  }, { passive: false });
  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node-marker")) return;
    if (e.target.closest(".empty-plan")) return;
    if (e.target.closest("button")) return;
    // Do not capture touch pointers — setPointerCapture on the first finger
    // prevents iOS from delivering a second finger for pinch.
    if (e.pointerType !== "touch") {
      try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    }
    canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (canvasPointers.size >= 2) {
      const points = [...canvasPointers.values()].slice(0, 2);
      const mid = pointerMidpoint(points[0], points[1]);
      const focal = clientToViewportFocal(mid.x, mid.y, viewport);
      pinchState = {
        distance: pointerDistance(points[0], points[1]),
        zoom: state.canvas.zoom,
        panX: state.canvas.panX,
        panY: state.canvas.panY,
        focalX: focal.x,
        focalY: focal.y
      };
      dragState = null;
      viewport.classList.add("is-dragging", "is-gesturing");
      const stage = document.getElementById("planStage");
      if (stage) stage.classList.remove("is-animating");
      return;
    }
    dragState = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: state.canvas.panX, panY: state.canvas.panY, moved: false };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (canvasPointers.has(e.pointerId)) canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchState && canvasPointers.size >= 2) {
      const points = [...canvasPointers.values()].slice(0, 2);
      const distance = pointerDistance(points[0], points[1]);
      if (pinchState.distance > 0) {
        const mid = pointerMidpoint(points[0], points[1]);
        const focal = clientToViewportFocal(mid.x, mid.y, viewport);
        const rawZoom = pinchState.zoom * (distance / pinchState.distance);
        const newZoom = Math.max(0.55, Math.min(MAX_ZOOM, Number(rawZoom.toFixed(2))));
        const ratio = newZoom / pinchState.zoom;
        // Absolute focal zoom from pinch-start: keeps midpoint under fingers and pans with mid movement.
        state.canvas.panX = focal.x - (pinchState.focalX - pinchState.panX) * ratio;
        state.canvas.panY = focal.y - (pinchState.focalY - pinchState.panY) * ratio;
        setZoom(newZoom, false, { skipPersist: true });
      }
      return;
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 10) {
      dragState.moved = true;
      if (!state.ui.planLocked) {   // §38 locked plan doesn't pan
        viewport.classList.add("is-dragging", "is-gesturing");
        state.canvas.panX = dragState.panX + dx; state.canvas.panY = dragState.panY + dy;
        applyCanvasTransform();
      }
    }
  });
  viewport.addEventListener("pointerup", (e) => {
    const wasPinching = Boolean(pinchState) || canvasPointers.size > 1;
    canvasPointers.delete(e.pointerId);
    if (wasPinching) {
      if (canvasPointers.size < 2) {
        pinchState = null;
        lastPinchEndedAt = Date.now();
        persist();
      }
      dragState = null;
      viewport.classList.remove("is-dragging", "is-gesturing");
      try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
    viewport.classList.remove("is-dragging", "is-gesturing");
    const wasMoved = dragState.moved;
    dragState = null;
    persist();
    if (!wasMoved && Date.now() - lastPinchEndedAt > 450 && !e.target.closest(".node-marker") && !e.target.closest(".empty-plan") && !e.target.closest("button")) {
      const pos = pointerToPlanPosition(e); if (!pos) return;
      planTapAt(pos);
    }
  });
  viewport.addEventListener("pointercancel", (e) => {
    canvasPointers.delete(e.pointerId);
    const endingPinch = Boolean(pinchState);
    pinchState = null;
    dragState = null;
    viewport.classList.remove("is-dragging", "is-gesturing");
    if (endingPinch || canvasPointers.size === 0) persist();
  });
}

// Shared plan-tap action (custom stage gestures and the OpenSeadragon viewer).
function planTapAt(pos) {
  if (state.titlePlacing) { state.titlePlacing = false; state.modal = { mode: "create", nodeType: "title", position: pos }; return render(); }
  if (state.roomDraw?.mode) return handleRoomDrawPoint(pos);
  if (state.massMode.active) return placeMassNode(pos);
  const proj = project();
  const fl = currentFloor();
  if (proj && fl && (state.floorPlans[fl.id] || fl.planDriveFileId)) openCreateModal(pos);
}

function pointerDistance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function pointerMidpoint(a, b) {
  return { x: ((a?.x || 0) + (b?.x || 0)) / 2, y: ((a?.y || 0) + (b?.y || 0)) / 2 };
}

/** Focal point in viewport-center-relative pixels (matches panX/panY space). */
function clientToViewportFocal(clientX, clientY, viewport) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2)
  };
}

function bindMarkerDrag() {
  document.querySelectorAll(".node-marker").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.shiftKey) return; // shift = multi-select, not drag
      const nodeId = el.dataset.node;
      const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      nodeDragState = { pointerId: e.pointerId, nodeId, startX: e.clientX, startY: e.clientY, originX: node.position.x, originY: node.position.y, moved: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (!nodeDragState || nodeDragState.pointerId !== e.pointerId) return;
      const plan = document.querySelector(".floor-plan"); if (!plan) return;
      const rect = plan.getBoundingClientRect();
      const node = state.nodes.find((n) => n.id === nodeDragState.nodeId); if (!node) return;
      // Title pins are grabbed by the label above the tip: move by the finger's delta so the tip doesn't jump.
      const x = node.type === "title" ? nodeDragState.originX + ((e.clientX - nodeDragState.startX) / rect.width) * 100 : ((e.clientX - rect.left) / rect.width) * 100;
      const y = node.type === "title" ? nodeDragState.originY + ((e.clientY - nodeDragState.startY) / rect.height) * 100 : ((e.clientY - rect.top) / rect.height) * 100;
      node.position.x = Math.max(0, Math.min(100, x));
      node.position.y = Math.max(0, Math.min(100, y));
      nodeDragState.moved = true;
      el.style.setProperty("--x", node.position.x);
      el.style.setProperty("--y", node.position.y);
    });
    el.addEventListener("pointerup", (e) => {
      if (!nodeDragState || nodeDragState.pointerId !== e.pointerId) return;
      el.releasePointerCapture(e.pointerId);
      const moved = nodeDragState.moved;
      const nodeId = nodeDragState.nodeId;
      nodeDragState = null;
      if (moved) {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.position.x = Number(node.position.x.toFixed(1));
          node.position.y = Number(node.position.y.toFixed(1));
          const prevRoomId = node.roomId || "";
          const nextRoomId = resolveInitialRoomId(node.position) || "";
          node.roomId = nextRoomId || null;
          node.updatedAt = nowStamp();
          persist();
          logAudit("Node Moved", { nodeId: node.id, details: `to ${node.position.x},${node.position.y}` });
          if (nextRoomId !== prevRoomId) {
            toast(nextRoomId ? `Room → ${roomName(nextRoomId) || roomLabel(nextRoomId)}` : "Moved outside room");
          }
        }
      }
    });
  });
}

function pointerToPlanPosition(event) {
  const plan = document.querySelector(".floor-plan"); if (!plan) return null;
  const rect = plan.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return { x: Number(Math.max(0, Math.min(100, x)).toFixed(1)), y: Number(Math.max(0, Math.min(100, y)).toFixed(1)) };
}

function applyCanvasTransform() {
  const stage = document.getElementById("planStage");
  if (!stage) return;
  if (stage.classList.contains("is-osd")) { syncStageToOsd(); return; }
  stage.style.transform = `translate(calc(-50% + ${state.canvas.panX}px), calc(-50% + ${state.canvas.panY}px)) scale(${state.canvas.zoom})`;
  scheduleHiresPlan();
}

/* ── 0.15.2 sharp PDF plans at zoom ──────────────────────────────────────
 * The <img> plan is a fixed <=3200px raster that the stage CSS-scales, so
 * PDF plans blur at high zoom. Keep the pdf.js page and, once zoom/pan
 * settles, re-render just the visible part of the plan into a canvas at
 * zoom x devicePixelRatio, laid over the <img>. The low-res <img> (and the
 * previous canvas, CSS-scaled with the stage) show while gesturing.
 * Budget keeps iOS Safari safe: <=16M px per canvas, longest side <=4096. */

function rememberPlanPdf(floorId, dataUrl) {
  if (!floorId || typeof dataUrl !== "string" || !dataUrl.startsWith("data:application/pdf")) return;
  if (_planPdfSrc[floorId] === dataUrl) return;
  _planPdfSrc[floorId] = dataUrl;
  delete _planPdfLoading[floorId];
  delete _planKind[floorId];
  if (_planImage[floorId]) { URL.revokeObjectURL(_planImage[floorId].url); delete _planImage[floorId]; }
  if (_osd && _osd.floorId === floorId) destroyOsd();
  setPlanPdfStatus(floorId, "pdf", "original PDF stored");
  if (_planPdfDoc && _planPdfDoc.floorId === floorId) { releasePlanPdfDoc(); }
  if (_hires && _hires.floorId === floorId) dropHiresCanvas();
  if (window.NDCache) NDCache.put(PLAN_PDF_CACHE_PREFIX + floorId, dataUrl, null).catch((e) => console.warn("PDF plan cache put failed", e));
}

// 0.15.3 — sniff "%PDF" so a PDF labelled application/octet-stream (iOS Files, Drive) is still treated as a PDF.
function normalizePdfDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.startsWith("data:application/pdf")) return dataUrl;
  const m = /^data:[^,]*;base64,/.exec(dataUrl);
  if (m && dataUrl.startsWith("JVBER", m[0].length)) return "data:application/pdf;base64," + dataUrl.slice(m[0].length);
  return dataUrl;
}

// kind: "pdf" | "png" (flat render only) | "image" (original is an image) | "unknown" (not resolved yet / transient)
function setPlanPdfStatus(floorId, kind, reason) {
  const prev = _planPdfStatus[floorId];
  _planPdfStatus[floorId] = { kind, reason };
  const flat = (k) => k === "png" || k === "image";
  if (!prev || flat(prev.kind) !== flat(kind)) { clearTimeout(setPlanPdfStatus._t); setPlanPdfStatus._t = setTimeout(() => { if (!state.modal) render(); }, 50); }
  refreshPlanDebug();
}
function planIsFlat(floor) {
  const s = floor && _planPdfStatus[floor.id];
  return !!(s && (s.kind === "png" || s.kind === "image") && !_planPdfSrc[floor.id]);
}
function setHiresDebug(status, extra) {
  _hiresDebug = Object.assign({ status }, extra ? extra : { scale: null, canvas: null });
  refreshPlanDebug();
}
function planDebugLine() {
  const floor = currentFloor();
  if (!floor) return "No floor selected";
  const s = _planPdfStatus[floor.id];
  const kind = _planPdfSrc[floor.id] ? "pdf" : (s ? s.kind : "unknown");
  const d = _hiresDebug || {};
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  return `src=${kind}${s && s.reason && kind !== "pdf" ? " (" + s.reason + ")" : ""} · fileId=${floor.planDriveFileId ? "yes" : "no"} · pdfStored=${_planPdfSrc[floor.id] ? "yes" : "no"} · pdf=${planKindLabel(floor.id)} · viewer=${osdActive() ? "osd" : "stage"} · link=${_planLinkStatus[floor.id] || "-"} · last=${d.status || "none"} · scale=${d.scale ? d.scale.toFixed(1) + "/" + (state.canvas.zoom * dpr).toFixed(1) : "-"} · canvas=${d.canvas || "-"} · dpr=${window.devicePixelRatio || 1}`;
}
function refreshPlanDebug() {
  const el = document.getElementById("planDebug");
  if (el) el.textContent = planDebugLine();
}

function releasePlanPdfDoc() {
  const d = _planPdfDoc; _planPdfDoc = null;
  if (d) d.promise.then((x) => x && x.pdf && x.pdf.destroy()).catch(() => {});
}

function dropHiresCanvas() {
  if (_hiresTask) { try { _hiresTask.cancel(); } catch (e) {} _hiresTask = null; }
  _hiresInflightKey = null;
  if (_hires && _hires.canvas) { _hires.canvas.remove(); _hires.canvas.width = 0; _hires.canvas.height = 0; }
  _hires = null;
}

// PDF source for a floor: memory, then IndexedDB, then the Drive original. Concurrent callers share one load.
function planPdfSource(floor) {
  const id = floor.id;
  if (_planPdfSrc[id]) return Promise.resolve(_planPdfSrc[id]);
  const st = _planPdfStatus[id];
  if (st && (st.kind === "png" || st.kind === "image")) return Promise.resolve(null);
  if (st && st.retryAt && Date.now() < st.retryAt) return Promise.resolve(null);
  if (_planPdfLoading[id]) return _planPdfLoading[id];
  const p = (async () => {
    try {
      if (window.NDCache) {
        const cached = await NDCache.get(PLAN_PDF_CACHE_PREFIX + id).catch(() => null);
        if (typeof cached === "string" && cached.startsWith("data:application/pdf")) { _planPdfSrc[id] = cached; setPlanPdfStatus(id, "pdf", "from device cache"); if (!floor.planDriveFileId) linkLocalPlanOriginal(project(), floor); return cached; }
      }
      if (!floor.planDriveFileId) { setPlanPdfStatus(id, floor.planPngFileId ? "png" : "image", "no original file id"); return null; }
      if (floor.planFileName && /\.(png|jpe?g|webp|svg|heic|gif)$/i.test(floor.planFileName)) { setPlanPdfStatus(id, "image", "original is " + floor.planFileName.split(".").pop()); return null; }
      if (!isTokenValid()) { _planPdfStatus[id] = { kind: "unknown", reason: "signed out", retryAt: Date.now() + 5000 }; refreshPlanDebug(); return null; }
      let mime = "";
      try { mime = (await gapi.client.drive.files.get({ fileId: floor.planDriveFileId, fields: "mimeType" }))?.result?.mimeType || ""; } catch (e) {}
      if (/^image\//.test(mime)) { setPlanPdfStatus(id, "image", "original is " + mime); return null; }
      const url = await fetchDriveFileAsDataUrl(floor.planDriveFileId);   // sniffs %PDF
      if (url && url.startsWith("data:application/pdf")) { rememberPlanPdf(id, url); setPlanPdfStatus(id, "pdf", "from Drive"); return url; }
      setPlanPdfStatus(id, url ? "image" : "unknown", url ? "original is not a PDF (" + (mime || url.slice(5, url.indexOf(";"))) + ")" : "download failed");
    } catch (e) {
      _planPdfStatus[id] = { kind: "unknown", reason: "fetch error: " + describeError(e), retryAt: Date.now() + 30000 };
      refreshPlanDebug();
      console.warn("PDF plan source unavailable", e);
    } finally { delete _planPdfLoading[id]; }
    return null;
  })();
  _planPdfLoading[id] = p;
  return p;
}

function planPdfPage(floorId, src) {
  if (!_planPdfDoc || _planPdfDoc.floorId !== floorId || _planPdfDoc.src !== src) {
    releasePlanPdfDoc();
    const promise = (async () => {
      const pdfjsLib = await loadPdfJs();
      const bytes = Uint8Array.from(atob(src.split(",")[1]), (c) => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument(NDPdf.docOptions({ data: bytes, isOffscreenCanvasSupported: false, isEvalSupported: false })).promise;
      return { pdf, page: await pdf.getPage(1) };
    })();
    promise.catch(() => { if (_planPdfDoc && _planPdfDoc.promise === promise) _planPdfDoc = null; });
    _planPdfDoc = { floorId, src, promise };
  }
  return _planPdfDoc.promise.then((x) => x.page);
}

/* ── 0.17.2 single-image (scanned/exported raster) PDFs ───────────────────
 * Procore-style PDFs wrap ONE full-page bitmap (e.g. 4725×3391 + smask). pdf.js
 * redraws were soft on iPhone, so extract that bitmap at full size (no 3200 cap),
 * flattened on white, as <=2048px JPEG tiles (iOS canvas limits) cached in
 * IndexedDB, and draw the visible part from the tiles. pdf.js stays for vector PDFs. */
function planKindLabel(floorId) {
  const k = _planKind[floorId];
  return !k ? "?" : k.kind === "raster" ? `raster ${k.w}×${k.h}` : k.kind === "mixed" ? `mixed (img ${k.w}×${k.h})` : "vector";
}
function mulM(a, b) { return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]; }
async function analyzePlanPdf(floorId, src) {
  const k = _planKind[floorId];
  if (k && k.srcLen === src.length) return k;
  if (_planKindLoading[floorId]) return _planKindLoading[floorId];
  const p = (async () => {
    try {
      const cached = window.NDCache ? await NDCache.get(PLAN_IMAGE_PREFIX + floorId).catch(() => null) : null;
      if (cached && cached.srcLen === src.length && cached.blob) {
        setPlanImage(floorId, cached);
        return (_planKind[floorId] = { kind: "raster", w: cached.w, h: cached.h, srcLen: src.length });
      }
      if (window.NDCache) NDCache.remove("plantiles:" + floorId).catch(() => {});   // retired 0.17.2 tiles
      const page = await planPdfPage(floorId, src);
      const ol = await page.getOperatorList();
      const O = window.pdfjsLib.OPS;
      const imageOps = [O.paintImageXObject, O.paintInlineImageXObject, O.paintImageXObjectRepeat, O.paintInlineImageXObjectGroup, O.paintImageMaskXObject, O.paintJpegXObject].filter((v) => v !== undefined);
      const drawOps = [O.constructPath, O.showText, O.showSpacedText, O.fill, O.stroke, O.eoFill, O.fillStroke, O.shadingFill].filter((v) => v !== undefined);
      let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let img = null, nImg = 0, nDraw = 0;
      for (let i = 0; i < ol.fnArray.length; i++) {
        const fn = ol.fnArray[i], a = ol.argsArray[i];
        if (fn === O.save) stack.push(ctm); else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === O.transform) ctm = mulM(ctm, a);
        else if (imageOps.includes(fn)) { nImg++; if (fn === O.paintImageXObject) img = { id: a[0], ctm }; }
        else if (drawOps.includes(fn)) nDraw++;
      }
      const vp = page.getViewport({ scale: 1 });
      if (nImg !== 1 || !img) return (_planKind[floorId] = { kind: nImg ? "mixed" : "vector", w: 0, h: 0, srcLen: src.length });
      const obj = await new Promise((res) => { try { (img.id.startsWith("g_") ? page.commonObjs : page.objs).get(img.id, res); } catch (e) { res(null); } });
      const [pa, pb, pc, pd, pe, pf] = img.ctm, [x0v, y0v, x1v, y1v] = page.view;
      const pw = x1v - x0v, ph = y1v - y0v;
      // Axis-aligned, upright image; it may sit inside page margins (Procore adds ~40pt).
      const upright = Math.abs(pb) < 1e-6 && Math.abs(pc) < 1e-6 && pa > 0 && pd > 0 && !page.rotate;
      const rect = { rx: (pe - x0v) / pw, ry: 1 - (pf + pd - y0v) / ph, rw: pa / pw, rh: pd / ph };
      if (!obj || !obj.data || !upright || nDraw > 4) return (_planKind[floorId] = { kind: "mixed", w: obj?.width || 0, h: obj?.height || 0, srcLen: src.length });
      const blob = await buildPlanImageBlob(obj);
      const entry = { blob, w: obj.width, h: obj.height, ...rect, srcLen: src.length };
      setPlanImage(floorId, entry);
      if (window.NDCache) NDCache.put(PLAN_IMAGE_PREFIX + floorId, entry, null).catch((e) => console.warn("plan image cache put failed", e));
      return (_planKind[floorId] = { kind: "raster", w: obj.width, h: obj.height, srcLen: src.length });
    } finally { delete _planKindLoading[floorId]; }
  })();
  _planKindLoading[floorId] = p;
  return p;
}
function setPlanImage(floorId, e) {
  const old = _planImage[floorId]; if (old && old.url) URL.revokeObjectURL(old.url);
  _planImage[floorId] = { url: URL.createObjectURL(e.blob), w: e.w, h: e.h, rx: e.rx ?? 0, ry: e.ry ?? 0, rw: e.rw ?? 1, rh: e.rh ?? 1 };
}
// pdf.js image data (kind 1 = 1bpp gray, 2 = RGB, 3 = RGBA incl. smask) -> one full-size JPEG flattened on white.
async function buildPlanImageBlob(obj) {
  const { width: w, height: h, data, kind } = obj;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); if (!ctx) throw new Error("canvas " + w + "×" + h + " unavailable");
  const id = ctx.createImageData(w, h); const o = id.data, n = w * h;
  if (kind === 3) { for (let i = 0, j = 0; i < n; i++, j += 4) { const a = data[j + 3], ia = 255 - a; o[j] = (data[j] * a + 255 * ia) / 255; o[j + 1] = (data[j + 1] * a + 255 * ia) / 255; o[j + 2] = (data[j + 2] * a + 255 * ia) / 255; o[j + 3] = 255; } }
  else if (kind === 2) { for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += 3) { o[j] = data[k]; o[j + 1] = data[k + 1]; o[j + 2] = data[k + 2]; o[j + 3] = 255; } }
  else { const rb = (w + 7) >> 3; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ((data[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1) ? 255 : 0, j = (y * w + x) * 4; o[j] = o[j + 1] = o[j + 2] = v; o[j + 3] = 255; } }
  ctx.putImageData(id, 0, 0);
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.95));
  c.width = c.height = 0;
  if (!blob) throw new Error("image encode failed");
  return blob;
}

/* ── 0.18.1 OpenSeadragon plan view for raster PDFs ───────────────────────
 * OSD (vendor/openseadragon, 4.1.1) shows the page render plus the full-size embedded
 * image and owns pan/pinch/zoom. #planStage (markers, rooms, title pins) is kept as a
 * transparent layer whose transform is synced to OSD's viewport, so positions stay
 * plan percentages and all existing marker/room code keeps working. */
function osdFloorReady(floor) {
  if (_pausePlanViewer) return false;
  return !!(floor && window.OpenSeadragon && _planKind[floor.id]?.kind === "raster" && _planImage[floor.id] && state.floorPlans[floor.id]);
}
function osdActive() { const f = currentFloor(); return !!(_osd && f && _osd.floorId === f.id && osdFloorReady(f)); }
function destroyOsd() {
  if (!_osd) return;
  try { _osd.viewer.destroy(); } catch (e) {}
  _osd.el.remove(); _osd = null;
}
function mountOsd() {
  const floor = currentFloor();
  const viewport = document.getElementById("canvasViewport");
  if (!viewport || !osdFloorReady(floor)) { if (_osd && (!floor || _osd.floorId !== floor.id || !viewport)) destroyOsd(); return; }
  if (_osd && _osd.floorId !== floor.id) destroyOsd();
  if (!_osd) {
    const el = document.createElement("div"); el.className = "osd-host";
    viewport.prepend(el);
    const aspect = floor.planAspectRatio || 1.6, im = _planImage[floor.id];
    const viewer = OpenSeadragon({
      element: el, showNavigationControl: false, animationTime: 0.25, springStiffness: 9,
      maxZoomPixelRatio: 1e6, visibilityRatio: 0.2, constrainDuringPan: false, preserveImageSizeOnResize: true,
      imageSmoothingEnabled: true, minPixelRatio: 0.5,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
      gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: false, pinchRotate: false, flickEnabled: true },
      tileSources: [
        { tileSource: { type: "image", url: state.floorPlans[floor.id], buildPyramid: true }, x: 0, y: 0, width: 1 },
        { tileSource: { type: "image", url: im.url, buildPyramid: true }, x: im.rx, y: im.ry / aspect, width: im.rw }
      ]
    });
    _osd = { floorId: floor.id, viewer, el, aspect, ready: false };
    viewer.addHandler("open", () => {
      const home = viewer.viewport.getHomeZoom();
      viewer.viewport.maxZoomLevel = home * MAX_ZOOM;
      viewer.viewport.minZoomLevel = home * 0.55;
      _osd.ready = true;
      syncStageToOsd();
    });
    viewer.addHandler("update-viewport", syncStageToOsd);
    viewer.addHandler("resize", syncStageToOsd);
    viewer.addHandler("canvas-click", (ev) => {
      if (!ev.quick || !_osd) return;
      const pt = viewer.viewport.pointFromPixel(ev.position);
      const x = pt.x * 100, y = pt.y * _osd.aspect * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      planTapAt({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
    });
    viewer.addHandler("open-failed", (e) => setHiresDebug("error: viewer open failed " + (e.message || "")));
  } else if (_osd.el.parentNode !== viewport) viewport.prepend(_osd.el);
  _osd.viewer.panHorizontal = _osd.viewer.panVertical = !state.ui.planLocked;
  syncStageToOsd();
}
function syncStageToOsd() {
  const stage = document.getElementById("planStage");
  if (!_osd || !_osd.ready || !stage || !stage.offsetWidth) return;
  const vp = _osd.viewer.viewport;
  const r = vp.viewportToViewerElementRectangle(new OpenSeadragon.Rect(0, 0, 1, 1 / _osd.aspect));
  const s = r.width / stage.offsetWidth;
  stage.style.transform = `translate(${r.x}px, ${r.y}px) scale(${s})`;
  state.canvas.zoom = Number((vp.getZoom(true) / vp.getHomeZoom()).toFixed(2));
  updateScaleReadout();
  const pi = _planImage[_osd.floorId];
  // scale = source image px per plan CSS px (vs. zoom×dpr device px needed); OSD shows every source pixel.
  setHiresDebug("ok (osd)", { scale: pi ? pi.w / ((pi.rw || 1) * (stage.offsetWidth || 1)) : 0, canvas: "osd" });
}

function scheduleHiresPlan() {
  if (_pausePlanViewer) { dropHiresCanvas(); return; }
  const stage = document.getElementById("planStage");
  const floor = currentFloor();
  // render() rebuilds the stage: re-attach the current canvas at once so it doesn't flicker.
  if (_hires && stage) {
    if (!floor || _hires.floorId !== floor.id) dropHiresCanvas();
    else if (_hires.canvas.parentNode !== stage) {
      const img = stage.querySelector("img.floor-plan");
      if (img) { syncHiresStyle(_hires.canvas, img); img.after(_hires.canvas); } else dropHiresCanvas();
    }
  }
  clearTimeout(_hiresTimer);
  _hiresTimer = setTimeout(() => {
    updateHiresPlan().catch((e) => { setHiresDebug("error: " + describeError(e)); console.warn("hi-res plan render failed", e); });
  }, 220);
}

function syncHiresStyle(canvas, img) {
  canvas.style.opacity = img.style.opacity || "";
  canvas.style.filter = img.style.filter || "";
}

function hiresGeometry(stage, viewport, img) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // Map onto the <img> content box (inside its border) so the overlay lines up exactly.
  const ir = img.getBoundingClientRect(), vr = viewport.getBoundingClientRect();
  if (!ir.width || !ir.height || !img.offsetWidth || !img.clientWidth || !img.clientHeight) return null;
  const z = ir.width / img.offsetWidth;
  const box = { left: img.offsetLeft + img.clientLeft, top: img.offsetTop + img.clientTop, w: img.clientWidth, h: img.clientHeight };
  const sr = { left: ir.left + img.clientLeft * z, top: ir.top + img.clientTop * z, width: box.w * z, height: box.h * z };
  return { dpr, vr, box, sr, fullW: sr.width * dpr, fullH: sr.height * dpr };
}

async function updateHiresPlan() {
  if (_pausePlanViewer) { dropHiresCanvas(); return; }
  const stage = document.getElementById("planStage");
  const viewport = document.getElementById("canvasViewport");
  const img = stage && stage.querySelector("img.floor-plan");
  const floor = currentFloor();
  if (!stage || !viewport || !img || !floor || !state.floorPlans[floor.id]) { dropHiresCanvas(); return; }
  if (osdFloorReady(floor)) { dropHiresCanvas(); return; }   // 0.18.1: raster plans render in OpenSeadragon
  const srcPromise = planPdfSource(floor);   // resolve the source even at low zoom so the flat-plan notice can show
  srcPromise.then((src) => src && analyzePlanPdf(floor.id, src)).then((k) => { if (k && k.kind === "raster" && osdFloorReady(currentFloor())) render(); })
    .catch((e) => { setHiresDebug("error: " + describeError(e)); console.warn("plan PDF analysis failed", e); });
  if (viewport.classList.contains("is-gesturing")) { scheduleHiresPlan(); return; }
  let g = hiresGeometry(stage, viewport, img);
  if (!g) { setHiresDebug("skipped: plan not laid out"); return; }
  if (!img.complete || !img.naturalWidth) { img.addEventListener("load", scheduleHiresPlan, { once: true }); setHiresDebug("skipped: base image loading"); return; }
  // The base raster is sharp enough: no overlay needed.
  if (g.fullW <= img.naturalWidth * 1.05 && g.fullH <= img.naturalHeight * 1.05) { dropHiresCanvas(); setHiresDebug("skipped: base image sharp enough at this zoom"); return; }
  const src = await srcPromise;
  if (!src) {
    const st = _planPdfStatus[floor.id];
    setHiresDebug("skipped: no PDF (" + (st ? st.kind + ": " + st.reason : "unknown") + ")");
    if (st && st.kind === "unknown" && st.retryAt) setTimeout(scheduleHiresPlan, Math.max(1000, st.retryAt - Date.now()));
    return;
  }
  // Re-measure after the await: the stage may have been rebuilt or moved.
  const stage2 = document.getElementById("planStage"), viewport2 = document.getElementById("canvasViewport");
  const img2 = stage2 && stage2.querySelector("img.floor-plan");
  if (!img2 || currentFloor()?.id !== floor.id) return;
  if (viewport2.classList.contains("is-gesturing")) { scheduleHiresPlan(); return; }
  g = hiresGeometry(stage2, viewport2, img2);
  if (!g) return;
  const { vr, sr, box, fullW, fullH } = g;
  // Visible part of the plan (+ a margin for small pans), as plan fractions.
  const mx = vr.width * 0.25, my = vr.height * 0.25;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const fx0 = clamp01((vr.left - mx - sr.left) / sr.width), fx1 = clamp01((vr.right + mx - sr.left) / sr.width);
  const fy0 = clamp01((vr.top - my - sr.top) / sr.height), fy1 = clamp01((vr.bottom + my - sr.top) / sr.height);
  if (fx1 - fx0 <= 0 || fy1 - fy0 <= 0) { setHiresDebug("skipped: plan off screen"); return; }
  const rw = (fx1 - fx0) * fullW, rh = (fy1 - fy0) * fullH;
  const scale = Math.min(1, HIRES_MAX_SIDE / rw, HIRES_MAX_SIDE / rh, Math.sqrt(HIRES_MAX_PIXELS / (rw * rh)));
  const W = fullW * scale, H = fullH * scale;
  const x0 = Math.floor(fx0 * W), y0 = Math.floor(fy0 * H);
  const cw = Math.max(1, Math.min(HIRES_MAX_SIDE, Math.ceil(fx1 * W) - x0));
  const ch = Math.max(1, Math.min(HIRES_MAX_SIDE, Math.ceil(fy1 * H) - y0));
  const key = [floor.id, src.length, Math.round(W), Math.round(H), x0, y0, cw, ch].join(":");
  const dbgExtra = { scale: W / box.w, canvas: cw + "×" + ch };
  if (_hires && _hires.key === key && _hires.canvas.parentNode === stage2) { setHiresDebug("ok", dbgExtra); return; }
  // 0.15.3 — an identical render is already running: let it finish. Every render() (toasts,
  // sync, photo queue) used to restart it, so slow iPhone renders never completed.
  if (_hiresInflightKey === key) return;
  const seq = ++_hiresSeq;
  if (_hiresTask) { try { _hiresTask.cancel(); } catch (e) {} _hiresTask = null; }
  _hiresInflightKey = key;
  setHiresDebug("rendering…", dbgExtra);
  let page;
  try { page = await planPdfPage(floor.id, src); }
  catch (e) {
    if (_hiresInflightKey === key) _hiresInflightKey = null;
    if (/pdf\.js failed to load/.test(String(e && e.message))) { setHiresDebug("error: pdf.js failed to load (offline?)"); return; }
    // Stored PDF is unreadable: forget it so the flat-plan notice offers a re-upload.
    delete _planPdfSrc[floor.id];
    if (window.NDCache) NDCache.remove(PLAN_PDF_CACHE_PREFIX + floor.id).catch(() => {});
    setPlanPdfStatus(floor.id, "png", "original PDF unreadable");
    setHiresDebug("error: PDF unreadable: " + describeError(e));
    return;
  }
  if (seq !== _hiresSeq) return;
  const vp = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.className = "plan-hires";
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.width = canvas.height = 0; _hiresInflightKey = null; setHiresDebug("error: canvas context unavailable (memory)"); return; }
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch);
  const task = page.render({ canvasContext: ctx, viewport: vp, transform: [W / vp.width, 0, 0, H / vp.height, -x0, -y0] });
  _hiresTask = task;
  try { await task.promise; }
  catch (e) { canvas.width = 0; canvas.height = 0; if (_hiresInflightKey === key) _hiresInflightKey = null; if (e && e.name === "RenderingCancelledException") return; throw e; }
  finally { if (_hiresTask === task) _hiresTask = null; }
  if (_hiresInflightKey === key) _hiresInflightKey = null;
  return placeHiresCanvas(canvas, floor, seq, key, box, W, H, x0, y0, cw, ch, dbgExtra);
}
function placeHiresCanvas(canvas, floor, seq, key, box, W, H, x0, y0, cw, ch, dbgExtra) {
  const liveStage = document.getElementById("planStage");
  const liveImg = liveStage && liveStage.querySelector("img.floor-plan");
  if (seq !== _hiresSeq || !liveImg || currentFloor()?.id !== floor.id) { canvas.width = 0; canvas.height = 0; return; }
  canvas.style.left = (box.left + x0 / W * box.w) + "px";
  canvas.style.top = (box.top + y0 / H * box.h) + "px";
  canvas.style.width = (cw / W * box.w) + "px";
  canvas.style.height = (ch / H * box.h) + "px";
  syncHiresStyle(canvas, liveImg);
  const old = _hires;
  _hires = { floorId: floor.id, key, canvas };
  liveImg.after(canvas);
  if (old && old.canvas !== canvas) { old.canvas.remove(); old.canvas.width = 0; old.canvas.height = 0; }
  setHiresDebug("ok", dbgExtra);
}

function updateScaleReadout() {
  const el = document.querySelector(".scale-readout span:last-child");
  if (el) el.textContent = `${Math.round(state.canvas.zoom * 100)}%`;
}

function flashStageAnimating() {
  const stage = document.getElementById("planStage");
  if (!stage) return;
  stage.classList.add("is-animating");
  clearTimeout(flashStageAnimating._t);
  flashStageAnimating._t = setTimeout(() => stage.classList.remove("is-animating"), 160);
}

/**
 * @param {number} value
 * @param {boolean} [rerender=true]
 * @param {{ skipPersist?: boolean, focal?: {x:number,y:number}|null, animate?: boolean }} [opts]
 */
function setZoom(value, rerender = true, opts = {}) {
  if (osdActive() && _osd.ready) { const vp = _osd.viewer.viewport; vp.zoomTo(vp.getHomeZoom() * Math.max(0.55, Math.min(MAX_ZOOM, value))); return; }
  const skipPersist = Boolean(opts && opts.skipPersist);
  const focal = opts && opts.focal;
  const animate = Boolean(opts && opts.animate);
  const oldZoom = state.canvas.zoom;
  const newZoom = Math.max(0.55, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
  if (focal && oldZoom > 0 && newZoom !== oldZoom) {
    const ratio = newZoom / oldZoom;
    state.canvas.panX = focal.x - (focal.x - state.canvas.panX) * ratio;
    state.canvas.panY = focal.y - (focal.y - state.canvas.panY) * ratio;
  }
  state.canvas.zoom = newZoom;
  if (!skipPersist) persist();
  if (animate) flashStageAnimating();
  if (rerender) render();
  else {
    applyCanvasTransform();
    updateScaleReadout();
  }
}
