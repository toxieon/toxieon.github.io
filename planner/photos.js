/* Serial, retryable photo jobs. Original files stay in memory until success or
 * dismissal; nothing rewrites existing Drive photos. */
const photoJobs = [];
let photoQueueBusy = false;
let plannerCameraStream = null;

async function preparePlannerPhoto(job) {
  if (job.file.size > 40 * 1024 * 1024) throw new Error('Photo exceeds 40 MB. Export a smaller image and select it again.');
  let takenAt = job.capturedAt || job.uploadedAt, source = job.source === 'camera' ? 'App camera time' : 'Upload time (no EXIF date)';
  if (job.source !== 'camera') {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/exifreader@4.41.3/dist/exif-reader.js');
    let meta;
    try { meta = ExifReader.load(await job.file.arrayBuffer()); }
    catch (error) {
      if (!/No Exif data/i.test(error.message)) throw new Error('Photo metadata could not be read. Export as JPEG and select it again.');
    }
    const raw = meta?.DateTimeOriginal?.description;
    if (typeof raw === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      takenAt = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'); source = 'Photo EXIF time';
    }
  }
  const decode = blob => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded. Try a JPEG copy.')); };
    img.src = url;
  });
  let img;
  try { img = await decode(job.file); }
  catch (error) {
    if (!/heic|heif/i.test(job.file.type + job.file.name)) throw error;
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
    const converted = await heic2any({ blob: job.file, toType: 'image/jpeg', quality: 0.9 });
    img = await decode(Array.isArray(converted) ? converted[0] : converted);
  }
  const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale));
  // A footer preserves every source pixel; it never covers the site record.
  const font = Math.max(12, Math.round(width / 65)), pad = Math.max(8, Math.round(font * 0.6));
  canvas.width = width;
  const lines = [job.jobName, `${takenAt} — ${source}`];
  if (job.source !== 'camera') lines.push('Uploaded, not taken on site');
  let ctx = canvas.getContext('2d'); ctx.font = `${font}px sans-serif`;
  const wrapped = [];
  for (const line of lines) {
    let text = '';
    for (const char of line) { if (text && ctx.measureText(text + char).width > width - pad * 2) { wrapped.push(text); text = ''; } text += char; }
    wrapped.push(text);
  }
  canvas.height = height + pad * 2 + wrapped.length * Math.ceil(font * 1.35);
  ctx = canvas.getContext('2d'); ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, width, canvas.height);
  ctx.drawImage(img, 0, 0, width, height);
  ctx.fillStyle = '#fff'; ctx.font = `${font}px sans-serif`; ctx.textBaseline = 'top';
  wrapped.forEach((line, i) => ctx.fillText(line, pad, height + pad + i * Math.ceil(font * 1.35)));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  canvas.width = canvas.height = 1;
  if (!blob) throw new Error('Could not prepare this photo. Retry the file.');
  job.dateSource = source; job.photoDate = takenAt;
  return new File([blob], job.file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
}

function enqueuePlannerPhotos(files, { nodeId = '', projectId, source = 'existing', capturedAt = '' }) {
  const proj = projectById(projectId);
  if (!proj) { toast('Select a job before uploading photos so its name can be watermarked.'); return; }
  for (const file of files) photoJobs.push({ id: uid('photojob'), file, nodeId, projectId, jobName: proj.name, source, capturedAt, uploadedAt: new Date().toLocaleString('en-AU'), status: 'queued', error: '' });
  render(); runPlannerPhotoQueue();
}
async function runPlannerPhotoQueue() {
  if (photoQueueBusy) return;
  photoQueueBusy = true;
  try {
    for (const job of photoJobs) {
      if (job.status !== 'queued') continue;
      job.status = 'uploading'; render();
      try {
        await NDAuth.ensureToken();
        const node = job.nodeId ? state.nodes.find(n => n.id === job.nodeId) : null;
        const proj = projectById(job.projectId);
        if (!proj || (job.nodeId && !node)) throw new Error('The target job or node no longer exists.');
        if (!job.prepared) job.prepared = await preparePlannerPhoto(job);
        if (!job.uploaded) {
          const folder = node ? await ensureNodeDriveFolder(node) : await ensureProjectDriveFolder(proj);
          if (!folder) throw new Error('Could not find/create the photo folder');
          job.uploaded = await uploadFileToDrive(job.prepared, folder);
        }
        const result = job.uploaded;
        if (node) {
          if (!node.imageRefs.some(p => (p.driveFileId || p.id) === result.id)) node.imageRefs.push({ id: result.id, name: result.name, driveFileId: result.id, webViewLink: result.webViewLink, thumbnailLink: result.thumbnailLink, mimeType: result.mimeType, uploader: state.googleAuth.profile?.email || '', uploadedAt: nowStamp() });
          node.updatedAt = nowStamp(); persist();
        } else {
          const api = getPlannerInboxApi(); if (!api) throw new Error('Inbox not ready. Retry to file the uploaded photo.');
          const rec = { driveFileId: result.id, name: result.name, status: NDInbox.STATUS.FILED_TO_PROJECT, address: proj.address || '', addressSource: 'manual', projectId: proj.id, floorId: proj.floors?.[0]?.id || '', uploader: state.googleAuth.profile?.email || '', uploadedAt: new Date().toISOString(), mimeType: result.mimeType, webViewLink: result.webViewLink || '', thumbnailLink: result.thumbnailLink || '' };
          await api.upsert(rec);
          if (!_inboxRecords.some(r => r.driveFileId === rec.driveFileId)) _inboxRecords.push(rec);
          persist({ skipSync: true });
        }
        job.status = 'done'; job.file = null; job.prepared = null;
        logAudit('Photo Uploaded', { nodeId: job.nodeId, projectId: job.projectId, details: `${result.name}; ${job.dateSource}` });
      } catch (e) { job.status = 'failed'; job.error = describeError(e); }
      render();
    }
  } finally { photoQueueBusy = false; render(); }
}
function renderPhotoJobs() {
  if (!photoJobs.length) return '';
  return `<aside class="photo-jobs" aria-label="Photo uploads"><details open><summary>Photos: ${photoJobs.filter(j => j.status === 'done').length} uploaded, ${photoJobs.filter(j => j.status === 'failed').length} failed</summary><p>Keep this page open to retry failed files.</p>${photoJobs.map(j => `<div><strong>${escapeHtml(j.file?.name || j.uploaded?.name || 'Photo')}</strong> — ${escapeHtml(j.status)}${j.dateSource ? ` (${escapeHtml(j.dateSource)})` : ''}${j.error ? `<p role="alert">${escapeHtml(j.error)}</p><button data-photo-retry="${j.id}">Retry file</button>` : ''}</div>`).join('')}<button data-photo-dismiss>Dismiss completed / failed files</button></details></aside>`;
}
function stopPlannerCamera() { plannerCameraStream?.getTracks().forEach(t => t.stop()); plannerCameraStream = null; }
async function openPlannerCamera(nodeId) {
  stopPlannerCamera();
  state.modal = { mode: 'camera', nodeId }; render();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 } }, audio: false });
    if (state.modal?.mode !== 'camera' || state.modal.nodeId !== nodeId) { stream.getTracks().forEach(t => t.stop()); return; }
    plannerCameraStream = stream; bindPlannerCamera();
  } catch (_) { state.modal = null; render(); toast('Camera unavailable. Use Upload existing photos instead.'); }
}
function bindPlannerCamera() {
  const video = document.getElementById('plannerCamera');
  if (video && plannerCameraStream) { video.srcObject = plannerCameraStream; video.play().catch(() => {}); }
  else if (!video) stopPlannerCamera();
}
function renderPlannerCamera() {
  return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog" aria-label="Take site photo"><div class="modal-header"><h3>Take site photo</h3><button data-action="close-modal">Close</button></div><div class="modal-body"><video id="plannerCamera" autoplay muted playsinline style="width:100%"></video></div><div class="modal-actions"><button data-camera-take>Take photo</button></div></div>`;
}
async function takePlannerPhoto(button) {
  const video = document.getElementById('plannerCamera'), nodeId = state.modal?.nodeId;
  if (!video?.videoWidth || !nodeId) return;
  button.disabled = true;
  const capturedAt = new Date().toLocaleString('en-AU');
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  stopPlannerCamera(); state.modal = null;
  if (!blob) { render(); toast('Camera capture failed. Try again.'); return; }
  uploadPhotosToNode(nodeId, [new File([blob], 'site-photo.jpg', {type:'image/jpeg'})], {source:'camera', capturedAt});
}
document.addEventListener('click', e => {
  const retry = e.target.closest('[data-photo-retry]');
  if (retry) { const job = photoJobs.find(j => j.id === retry.dataset.photoRetry); if (job?.status === 'failed') { job.error = ''; job.status = 'queued'; runPlannerPhotoQueue(); } }
  if (e.target.closest('[data-photo-dismiss]')) { for (let i=photoJobs.length-1;i>=0;i--) if (['done','failed'].includes(photoJobs[i].status)) photoJobs.splice(i,1); render(); }
  const camera = e.target.closest('[data-camera-node]'); if (camera) openPlannerCamera(camera.dataset.cameraNode);
  const take = e.target.closest('[data-camera-take]'); if (take) takePlannerPhoto(take);
});
window.addEventListener('pagehide', stopPlannerCamera);
