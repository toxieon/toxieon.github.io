/* ==== DIAGNOSTIC (temporary) — bucket render isolation test ==============
 * Injects a synthetic FILED_TO_PROJECT record into _inboxRecords (in memory
 * ONLY — never written to the sheet, wiped on the next inbox refresh) so we can
 * see whether the "To sort" bucket / Batch-nodes panel renders a node when the
 * data is definitely present.
 *   - Node appears  -> bucket UI works; the bug is upstream (upload -> Inbox feed).
 *   - Node missing  -> the bug is in the bucket render path itself.
 * Triggered from Settings -> Diagnostics -> "Inject test bucket node".
 * Safe to delete this whole block + its switch case + the Settings panel once
 * the bucket bug is resolved. */
function diagInjectBucketNode() {
  const proj = project();
  if (!proj) { toast("Open a project first, then run the diagnostic"); state.activeView = "projects"; return render(); }
  const floorId = currentFloor()?.id || proj.floors?.[0]?.id || "";
  const STATUS_FTP = window.NDInbox?.STATUS?.FILED_TO_PROJECT || "FILED_TO_PROJECT";
  const tag = "thermostat bedroom two";
  const id = "DIAG-" + Date.now();
  _inboxRecords.push({
    driveFileId: id, photoId: id, name: "DIAGNOSTIC test photo.jpg",
    status: STATUS_FTP, projectId: proj.id, floorId,
    room: tag, location: tag, isFloorPlan: false,
    thumbnailLink: "", webViewLink: "", mimeType: "image/jpeg",
    uploader: "diagnostic", uploadedAt: nowStamp(), _diagnostic: true
  });
  state.ui.batchCollapsed = false;                          // reveal Batch-nodes panel
  state.activeView = "map";                                 // where the bucket lives
  state.modal = { mode: "sort-tray", projectId: proj.id };  // and open the tray
  render();
  console.info("[diag] injected test bucket node", { projectId: proj.id, floorId, inboxCount: _inboxRecords.length, trayCount: trayRecords(proj.id).length });
  toast(`Injected 1 test node ("${tag}"). If it shows in the tray / Batch panel, the bucket UI works — bug is upstream.`);
}
