/* v1.0 §5.3 — one-time migration: unallocated legacy Bulk Photos move to
 * Batch + the Inbox tab. Photo-Allocation + Bulk Photos become READ-ONLY
 * (nothing writes them any more); hard-delete comes one release later. */
async function migrateLegacyBulkPhotos() {
  const FLAG = "np-legacy-bulk-migrated-v1";
  if (localStorage.getItem(FLAG)) return;
  const api = getPlannerInboxApi();
  if (!api || !isTokenValid()) return;
  const pending = (state.bulkPhotos || []).filter((p) => (p.status || "Inbox") !== "Allocated" && p.driveFileId);
  if (!pending.length) { localStorage.setItem(FLAG, "yes"); return; }
  let moved = 0;
  const batchId = await ensureBatchFolderId().catch(() => null);
  for (const photo of pending) {
    try {
      if (batchId && state.drive.bulkPhotosFolderId) {
        await moveDriveFileToFolder(photo.driveFileId, batchId, state.drive.bulkPhotosFolderId);
      }
      await api.upsert({
        driveFileId: photo.driveFileId, name: photo.name || "", status: NDInbox.STATUS.UNFILED,
        address: "", addressSource: "manual",
        uploader: photo.uploader || "", uploadedAt: photo.uploadedAt || "",
        mimeType: photo.mimeType || "", webViewLink: photo.webViewLink || "",
        thumbnailLink: photo.thumbnailLink || "", notes: "migrated from Bulk Photos"
      });
      moved++;
    } catch (e) { console.warn("Legacy migration failed for", photo.name, e); return; } // retry next boot
  }
  localStorage.setItem(FLAG, "yes");
  if (moved) {
    logAudit("Legacy Bulk Photos Migrated", { details: `${moved} photo(s) -> unified Inbox` });
    toast(`Migrated ${moved} old bulk photo${moved === 1 ? "" : "s"} to the new inbox`);
    refreshInbox({ silent: true });
  }
}

/* §2.5 — projects quick-search (debounced, focus-preserving) */
let _projectsSearchTimer = null;
document.addEventListener("input", (ev) => {
  const input = ev.target.closest("[data-projects-search]");
  if (!input) return;
  state.projectsQuery = input.value;
  const scope = input.dataset.searchScope || "";
  clearTimeout(_projectsSearchTimer);
  _projectsSearchTimer = setTimeout(() => {
    render();
    const fresh = document.querySelector(`[data-projects-search][data-search-scope="${scope}"]`) || document.querySelector("[data-projects-search]");
    if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
  }, 250);
});

/* Delegated events — survives every render() */
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-inbox-create],[data-inbox-later],[data-inbox-never],[data-inbox-tray],[data-tray-close],[data-tray-sort],[data-tray-autonode],[data-tray-dismiss],[data-tray-autoall]");
  if (!t) return;
  if (t.dataset.inboxCreate) return void createJobFromInboxGroup(t.dataset.inboxCreate);
  if (t.dataset.inboxLater) { _bannerNotNow[t.dataset.inboxLater] = true; return void render(); }
  if (t.dataset.inboxNever) { addInboxNeverAddress(t.dataset.inboxNever); toast("Won't suggest that address again"); return void render(); }
  if (t.dataset.inboxTray) { state.modal = { mode: "sort-tray", projectId: t.dataset.inboxTray }; return void render(); }
  if (t.hasAttribute("data-tray-close")) { state.modal = null; return void render(); }
  if (t.dataset.traySort) {
    const sel = document.querySelector(`[data-tray-select="${CSS.escape(t.dataset.traySort)}"]`);
    return void fileInboxToNode(t.dataset.traySort, sel?.value);
  }
  if (t.dataset.trayAutonode) return void autoCreateNodeFromRecord(t.dataset.trayAutonode);
  if (t.dataset.trayDismiss) return void dismissInboxToBatch(t.dataset.trayDismiss);
  if (t.dataset.trayAutoall) {
    const recs = trayRecords(t.dataset.trayAutoall).filter((r) => r.room || r.location);
    (async () => { for (const r of recs) await autoCreateNodeFromRecord(r.driveFileId); })();
  }
});

render();
// §1.6 suite-wide water-fill sync tube (shared). Binds to the NDQueue facade.
if (window.NDUI && NDUI.syncTube) {
  NDUI.syncTube(window.NDQueue, {
    labels: { pending: "Saved — will sync", flushing: "Syncing…", failed: "Sync failed — tap to retry", synced: "Up to date" }
  });
}
hydrateFloorPlansFromCache().catch((e) => console.warn("plan hydration failed", e));
bootGoogle();
