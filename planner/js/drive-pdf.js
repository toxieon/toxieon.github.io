/* ============================================================ DRIVE PDF (v0.9.2)
 * Lean path: on-demand vendored html2canvas-pro + jsPDF → blob → uploadFileToDrive.
 * Browser Print remains the full-fidelity path; Drive PDF caps photos/pages.
 * ======================================================================= */

function loadScriptOnce(src, integrity) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-np-cdn="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load " + src)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; }
    s.dataset.npCdn = src;
    s.onload = () => { s.dataset.loaded = "1"; resolve(); };
    s.onerror = () => { s.remove(); reject(new Error("Failed to load " + src + ". Check your connection and retry.")); };
    document.head.appendChild(s);
  });
}

async function loadDrivePdfLibs() {
  if (!window.html2canvas) await loadScriptOnce(DRIVE_PDF_HTML2CANVAS_SRC);
  if (!(window.jspdf && window.jspdf.jsPDF) && !window.jsPDF) await loadScriptOnce(DRIVE_PDF_JSPDF_SRC);
  const JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  const h2c = typeof window.html2canvas === "function" ? window.html2canvas : (window.html2canvas && window.html2canvas.default);
  if (!h2c || !JsPDF) throw new Error("PDF libraries failed to load");
  return { html2canvas: h2c, jsPDF: JsPDF };
}

function applyDrivePdfPhotoCaps(root) {
  const perNode = DRIVE_PDF_MAX_PHOTOS_PER_NODE;
  let totalKept = 0;
  let totalDropped = 0;
  let nodesCapped = 0;
  root.querySelectorAll(".print-node-card").forEach((card) => {
    const photos = [...card.querySelectorAll(".print-photo")];
    if (!photos.length) return;
    let keptHere = 0;
    photos.forEach((fig) => {
      if (keptHere >= perNode || totalKept >= DRIVE_PDF_MAX_IMAGES_TOTAL) {
        fig.remove();
        totalDropped++;
        return;
      }
      keptHere++;
      totalKept++;
    });
    if (photos.length > keptHere) {
      nodesCapped++;
      const note = document.createElement("p");
      note.className = "print-muted";
      note.textContent = `Drive PDF: showing ${keptHere} of ${photos.length} photos (cap ${perNode}/node, ${DRIVE_PDF_MAX_IMAGES_TOTAL} total).`;
      const block = card.querySelector(".print-photo-block") || card;
      block.appendChild(note);
    }
  });
  if (totalDropped > 0 || nodesCapped > 0) {
    const banner = document.createElement("p");
    banner.className = "print-muted";
    banner.style.cssText = "margin:8px 0 16px;padding:8px 10px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;color:#92400e;";
    banner.textContent = `Lean Drive PDF: omitted ${totalDropped} photo(s) across ${nodesCapped} node(s) to keep file size manageable. Use Print / Save as PDF for the full set.`;
    const cover = root.querySelector(".print-cover-meta") || root.querySelector(".print-cover");
    const header = root.querySelector(".print-header");
    if (cover) cover.appendChild(banner);
    else if (header) header.appendChild(banner);
    else root.insertBefore(banner, root.firstChild);
  }
  return { totalKept, totalDropped, nodesCapped };
}

function waitForPrintImages(root, timeoutMs = 12000) {
  const imgs = [...root.querySelectorAll("img")];
  if (!imgs.length) return Promise.resolve();
  return Promise.race([
    Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      return new Promise((res) => {
        const done = () => res();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    })),
    new Promise((res) => setTimeout(res, timeoutMs))
  ]);
}

async function buildPdfBlobFromPrintElement(sourceEl) {
  const { html2canvas, jsPDF } = await loadDrivePdfLibs();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:794px;background:#fff;pointer-events:none;';
  const clone = sourceEl.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.cssText = 'width:794px;max-width:794px;background:white;color:#111;';
  // Snapshot image URLs BEFORE removing capped figures; index-based remapping
  // after removal used to assign the wrong image to later cards.
  clone.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
  const caps = applyDrivePdfPhotoCaps(clone);
  host.appendChild(clone); document.body.appendChild(host);
  const pdf = new jsPDF({orientation:'p', unit:'mm', format:'a4', compress:true});
  let pages = 0;
  try {
    await hydrateReportImages(clone);
    await waitForPrintImages(clone);
    const failed = [...clone.querySelectorAll('img')].filter(img => !img.complete || !img.naturalWidth);
    if (failed.length) throw new Error(`${failed.length} report image(s) unavailable. Wait for images or reconnect and retry.`);
    const units = [];
    function collect(parent) {
      for (const child of [...parent.children]) {
        if (child.matches('.print-floor-section,.print-room')) collect(child);
        else units.push(child);
      }
    }
    collect(clone);
    clone.remove();
    const page = document.createElement('div');
    page.className = clone.className + ' pdf-render-page';
    page.style.cssText = 'box-sizing:border-box;width:794px;min-height:1123px;padding:32px;margin:0;background:white;color:#111;display:flow-root;';
    host.appendChild(page);
    async function flush() {
      if (!page.children.length) return;
      if (++pages > DRIVE_PDF_MAX_PAGES) throw new Error(`Report exceeds ${DRIVE_PDF_MAX_PAGES} PDF pages. Use Print for the full report.`);
      const height = Math.ceil(page.getBoundingClientRect().height);
      if (height > 3500) throw new Error('One report card is too long for image export. Use Print for this report.');
      const canvas = await html2canvas(page, {scale:1.35,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,imageTimeout:12000,windowWidth:794});
      try {
        if (pages > 1) pdf.addPage();
        // One bounded canvas per page prevents whole-report iOS canvas limits.
        const w = Math.min(210, 297 * canvas.width / canvas.height);
        pdf.addImage(canvas.toDataURL('image/jpeg',0.88),'JPEG',(210-w)/2,0,w,canvas.height*w/canvas.width,undefined,'FAST');
      } finally { canvas.width = canvas.height = 1; }
      page.replaceChildren();
    }
    for (const unit of units) {
      const ownPage = unit.hasAttribute('data-report-page');
      if (ownPage) await flush();
      page.appendChild(unit);
      if (!ownPage && page.getBoundingClientRect().height > 1124 && page.children.length > 1) {
        unit.remove();
        // Keep a room heading with its first card when a page fills.
        let heading = null;
        if (page.lastElementChild?.matches('h2,h3')) { heading = page.lastElementChild; heading.remove(); }
        await flush(); if (heading) page.appendChild(heading); page.appendChild(unit);
      }
      if (ownPage) await flush();
    }
    await flush();
    const blob = pdf.output('blob');
    if (!blob || blob.size < 64) throw new Error('PDF generation produced an empty file');
    if (blob.size > DRIVE_PDF_MAX_BLOB_BYTES) throw new Error('PDF exceeds 18 MB. Use Print for this report.');
    return {blob,pages,caps};
  } finally { host.remove(); }
}


async function hydrateReportImages(root) {
  for (const img of root.querySelectorAll('img[data-fileid]')) {
    img.loading = 'eager';
    if (/^(blob:|data:)/.test(img.src)) continue;
    if (!window.NDDriveImage) throw new Error('Photo loader unavailable. Reload and retry.');
    let token = await NDAuth.ensureToken();
    try { img.src = await NDDriveImage.url(img.dataset.fileid, token); }
    catch (e) {
      if (!/401/.test(String(e.message))) throw e;
      token = await NDAuth.ensureToken({force:true});
      img.src = await NDDriveImage.url(img.dataset.fileid, token);
    }
    img.classList.remove('is-broken', 'img-failed');
  }
}
function plannerPdfName() {
  const name = (project()?.name || 'project').replace(/[\\/:*?"<>|]+/g,'_').slice(0,80);
  return name + ' - ' + (state.modal?.reportMode === 'full' ? 'Full report' : 'Overview') + '.pdf';
}
function renderReadyPdf() {
  if (!_downloadPdf) return '';
  return `<div class="pdf-ready"><span>Ready: ${escapeHtml(_downloadPdf.file.name)} (${_downloadPdf.pages} pages${_downloadPdf.dropped ? ', ' + _downloadPdf.dropped + ' photos omitted' : ''})</span><div class="button-row"><button class="ghost-button" data-action="share-pdf">Save / Share PDF</button><a class="ghost-button" href="${escapeHtml(_downloadPdf.url)}" target="_blank" rel="noopener">Open PDF</a><a class="ghost-button" href="${escapeHtml(_downloadPdf.url)}" download="${escapeHtml(_downloadPdf.file.name)}">Save file</a></div></div>`;
}
async function downloadPlannerPdf() {
  if (_drivePdfBusy || state.modal?.loading) return;
  const page = document.getElementById('printPage'); if (!page) return;
  const snapshot = page.cloneNode(true), name = plannerPdfName();
  _drivePdfBusy = true; toast('Building PDF…'); render();
  try {
    const {blob,pages,caps} = await buildPdfBlobFromPrintElement(snapshot);
    if (_downloadPdf) URL.revokeObjectURL(_downloadPdf.url);
    _downloadPdf = {file:new File([blob],name,{type:'application/pdf'}),url:URL.createObjectURL(blob),pages,dropped:caps.totalDropped};
    const mobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!mobile) { const a = document.createElement('a'); a.href = _downloadPdf.url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    toast(mobile ? 'PDF ready. Tap Save / Share PDF, then Save to Files.' : 'PDF downloaded. A saved copy is also ready below.');
  } catch (e) { toast('PDF failed: ' + describeError(e)); }
  finally { _drivePdfBusy = false; render(); }
}
async function sharePlannerPdf() {
  if (!_downloadPdf) return;
  // Separate tap preserves user activation on iOS after PDF generation.
  const data = {files:[_downloadPdf.file]};
  if (navigator.canShare?.(data) && navigator.share) {
    try { await navigator.share(data); }
    catch (e) { if (e.name !== 'AbortError') toast('Sharing unavailable. Tap Open PDF, then use the browser Share menu.'); }
  } else toast('Tap Open PDF, then use the browser Share or Save command.');
}
async function printPlannerReport() {
  if (state.modal?.loading || _drivePdfBusy) return;
  const page = document.getElementById('printPage'); if (!page) return;
  const copy = page.cloneNode(true); copy.id = 'plannerPrintRoot';
  copy.querySelectorAll('img').forEach(img => {img.loading='eager';});
  try {
    document.getElementById('plannerPrintRoot')?.remove();
    document.body.appendChild(copy);
    await hydrateReportImages(copy); await waitForPrintImages(copy);
    if ([...copy.querySelectorAll('img')].some(img => !img.complete || !img.naturalWidth)) throw new Error('Report images are still unavailable. Reconnect and retry.');
    document.body.classList.add('is-report-printing');
    const clean = () => {copy.remove();document.body.classList.remove('is-report-printing');};
    window.addEventListener('afterprint',clean,{once:true});
    window.print();
  } catch (e) { copy.remove();document.body.classList.remove('is-report-printing');toast('Print failed: ' + describeError(e)); }
}

async function savePrintPdfToDrive() {
  if (_drivePdfBusy || state.modal?.loading) return;
  const page = document.getElementById("printPage");
  if (!page) { toast("Open Overview or Full report first"); return; }
  if (!isTokenValid()) { toast("Sign in required to save to Drive"); return; }
  const proj = project();
  if (!proj) { toast("No project selected"); return; }

  // Snapshot the live preview *before* any re-render so hydrated Drive
  // image blobs (data:/blob:) are preserved for html2canvas.
  const snapshot = page.cloneNode(true);
  _drivePdfBusy = true;
  const reportMode = state.modal?.reportMode === "full" ? "full" : "overview";
  toast("Building PDF for Drive…");
  render();
  try {
    const { blob, pages, caps } = await buildPdfBlobFromPrintElement(snapshot);
    const parentId = await ensureProjectDriveFolder(proj);
    if (!parentId) throw new Error("Project Drive folder unavailable");
    const exportsId = await ensureFolder(DRIVE_PDF_EXPORTS_FOLDER, parentId);
    const stamp = nowStamp().replace(/[:\s]/g, "-").slice(0, 19);
    const safeName = (proj.name || "project").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
    const fileName = `${safeName} — ${reportMode === "full" ? "Full report" : "Overview"} — ${stamp}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });
    const uploaded = await uploadFileToDrive(file, exportsId || parentId, fileName);
    const capNote = caps.totalDropped ? ` (${caps.totalDropped} photos omitted)` : "";
    toast(`Saved PDF to Drive (${pages}p)${capNote}`);
    logAudit("Report PDF to Drive", {
      projectId: proj.id,
      details: `${reportMode}; ${pages} pages; ${(blob.size / 1024).toFixed(0)} KB; dropped ${caps.totalDropped} photos`
    });
    if (uploaded?.webViewLink) {
      try { window.open(uploaded.webViewLink, "_blank", "noopener"); } catch (e) {}
    }
  } catch (e) {
    console.warn("Drive PDF failed", e);
    toast("Drive PDF failed: " + describeError(e) + " — try Print / Save as PDF");
  } finally {
    _drivePdfBusy = false;
    render();
  }
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { state.toast = ""; render(); }, 2800);
}

/* BOOT */

/* Quote -> job handoff: Quote's "Create job" opens
 *   /planner/#newproject=1&name=<client>&address=<site>&ref=<quote id>
 * which opens the normal New project form prefilled (nothing is created until
 * the user presses Save, so the Drive folder / Projects sheet path is unchanged). */
function quoteJobPrefillFromHash() {
  if (!/(^#|&)newproject=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  const clip = (v, n) => String(v || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
  const name = clip(p.get("name"), 120), address = clip(p.get("address"), 200), ref = clip(p.get("ref"), 60);
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}   // one-shot: a reload must not reopen it
  if (!name && !address) return null;
  return { name: name || address, address, description: ref ? `From Quote ${ref}` : "" };
}

function hydrateFromHash() {
  const prefill = quoteJobPrefillFromHash();
  if (prefill) { state.activeView = "projects"; state.modal = { mode: "new-project", prefill }; return; }
  const projMatch = location.hash.match(/project=([^&]+)/);
  if (projMatch) {
    const proj = projectById(decodeURIComponent(projMatch[1]));
    if (proj) { state.selectedProjectId = proj.id; state.selectedFloorId = proj.floors?.[0]?.id || null; state.activeView = "map"; recordRecentProject(proj); }
  }
  const match = location.hash.match(/node=([^&]+)/); if (!match) return;
  const node = state.nodes.find((n) => n.id === decodeURIComponent(match[1])); if (!node) return;
  state.selectedProjectId = node.projectId;
  state.selectedFloorId = node.floorId;
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  recordRecentProject(projectById(node.projectId));
  state.activeView = "map";
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (state.modal) { dismissModal(); render(); }
    else if (state.roomDraw?.mode) { clearRoomDraw(); render(); }
    else if (state.massMode.active) { stopMassMode(); }
    else if (state.drawerOpen) { state.drawerOpen = false; render(); }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedNodeId && !e.target.closest("input,textarea,select,[contenteditable]")) {
    e.preventDefault();
    deleteNode(state.selectedNodeId);
  }
});

hydrateFromHash();
