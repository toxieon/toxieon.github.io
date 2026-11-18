/* Time-driven photo progress reports (Drive read-only; report file setContent only).
 * Config: Script Property PHOTO_PROGRESS_JOBS — JSON array of jobs (see README).
 * Optional: PHOTO_PROGRESS_PLANNER_MASTER_SHEET_ID to resolve rootFolderId from Projects. */

var PP_HANDLER = 'runPhotoProgressJobs_';
var PP_MELBOURNE = 'Australia/Melbourne';
var PP_MAX_DEPTH = 4;
var PP_BUDGET_MS = 5 * 60 * 1000;

/* ── defaults / config ─────────────────────────────────────────── */

function ppDefaultStages_() {
  return [
    { key: 'roughIn', label: 'Rough-in', match: ['rough in', 'rough-in', 'roughin'] },
    { key: 'fitOff', label: 'Fit-off', match: ['fit off', 'fit-off', 'fitoff'] }
  ];
}

function ppNormalizeStageToken_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function ppStagesForJob_(job) {
  var raw = job && job.stages;
  if (!Array.isArray(raw) || !raw.length) return ppDefaultStages_().map(function (x) { return Object.assign({}, x, { match: x.match.slice() }); });
  return raw.map(function (st) {
    return {
      key: String(st.key || '').trim() || 'stage',
      label: String(st.label || st.key || 'Stage').trim(),
      match: Array.isArray(st.match) ? st.match.map(String) : []
    };
  });
}

function ppMatchStageKey_(folderName, stages) {
  var norm = ppNormalizeStageToken_(folderName);
  if (!norm) return '';
  for (var i = 0; i < (stages || []).length; i++) {
    var st = stages[i];
    for (var j = 0; j < (st.match || []).length; j++) {
      if (ppNormalizeStageToken_(st.match[j]) === norm) return st.key;
    }
    if (ppNormalizeStageToken_(st.label) === norm) return st.key;
  }
  return '';
}

/* ── level / apartment names (aligned with planner photo-folders) ── */

function ppNormName_(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\.$/, '');
}

function ppLevelFromName_(name) {
  var n = ppNormName_(name).replace(/^apt#\s*/, '').replace(/^level\s+/, '');
  if (!n) return null;
  if (/^(b|basement)( \d+)?$/.test(n)) return { key: 'b', order: -1, driveName: 'Level B' };
  if (/^(g|gf|ground)( floor)?$/.test(n)) return { key: 'g', order: 0, driveName: 'Level G' };
  var words = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  var word = n.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)( floor)?$/);
  if (word) return ppOrdinalLevel_(words[word[1]]);
  var num = n.match(/^(\d+)(st|nd|rd|th)?( floor)?$/);
  if (num) return ppOrdinalLevel_(Number(num[1]));
  return null;
}

function ppOrdinalLevel_(n) {
  if (!Number.isInteger(n) || n < 0 || n > 40) return null;
  return { key: String(n), order: n, driveName: 'Level ' + n };
}

function ppApartmentFromName_(name) {
  var raw = String(name || '').trim();
  if (!raw || /^apt#/i.test(raw) || /^\*+/.test(raw)) return null;
  var noteMatch = raw.match(/^(.+?)\s+-\s+(.+)$/);
  var head = (noteMatch ? noteMatch[1] : raw).trim();
  var dotted = head.match(/^([A-Za-z]+|\d+)\.(\d+[A-Za-z]?)$/);
  if (dotted) {
    var prefix = /^\d+$/.test(dotted[1]) ? String(Number(dotted[1])) : dotted[1].toUpperCase();
    var suffix = dotted[2].toUpperCase();
    var label = prefix + '.' + suffix;
    var level = ppLevelFromName_(/^\d+$/.test(prefix) ? prefix : prefix);
    return { key: label.toLowerCase(), label: label, levelKey: level ? level.key : null };
  }
  var plain = head.match(/^(\d+[A-Za-z])$/);
  if (!plain) return null;
  return { key: plain[1].toLowerCase(), label: plain[1].toUpperCase(), levelKey: null };
}

function ppCompareNatural_(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function ppLevelHeading_(levelKey, displayName) {
  if (displayName) return String(displayName);
  if (levelKey === 'b') return 'Level B';
  if (levelKey === 'g') return 'Level G';
  if (/^\d+$/.test(String(levelKey))) return 'Level ' + levelKey;
  return String(levelKey || 'Other');
}

/* ── image detection ───────────────────────────────────────────── */

function ppIsImageMime_(mime) {
  return /^image\//i.test(String(mime || ''));
}

function ppIsImageByName_(name) {
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(String(name || ''));
}

function ppIsImageFile_(file) {
  if (!file) return false;
  if (file.mimeType && String(file.mimeType).indexOf('folder') >= 0) return false;
  if (ppIsImageMime_(file.mimeType)) return true;
  return ppIsImageByName_(file.name);
}

/* ── pure tree scan (tested in Node) ─────────────────────────────── */

/** Count every image under a folder node (no stage labels). */
function ppCountAllImages_(node, depth) {
  depth = depth == null ? 0 : depth;
  if (!node || depth > PP_MAX_DEPTH) return 0;
  var n = 0;
  (node.files || []).forEach(function (f) { if (ppIsImageFile_(f)) n++; });
  (node.folders || []).forEach(function (child) { n += ppCountAllImages_(child, depth + 1); });
  return n;
}

/** Apartment root: stage labels apply only to immediate child folders. */
function ppCountPhotosInTree_(node, stages) {
  var counts = ppEmptyCounts_(stages);
  if (!node) return counts;
  (node.files || []).forEach(function (f) {
    if (ppIsImageFile_(f)) { counts.unsorted++; counts.total++; }
  });
  (node.folders || []).forEach(function (child) {
    var stageKey = ppMatchStageKey_(child.name, stages);
    var n = ppCountAllImages_(child, 0);
    if (stageKey) {
      counts[stageKey] = (counts[stageKey] || 0) + n;
    } else {
      counts.unsorted += n;
    }
    counts.total += n;
  });
  return counts;
}

function ppEmptyCounts_(stages) {
  var o = { unsorted: 0, total: 0 };
  (stages || []).forEach(function (st) { o[st.key] = 0; });
  return o;
}

function ppStageHasPhoto_(counts, stageKey) {
  return (counts[stageKey] || 0) > 0;
}

function ppAnyPhoto_(counts) {
  return (counts.total || 0) > 0;
}

/** levels: [{ levelKey, levelName, apartments: [{ label, counts }] }] */
function ppSummarizeJobs_(levels, stages) {
  var apartments = [];
  (levels || []).forEach(function (lv) {
    (lv.apartments || []).forEach(function (apt) {
      apartments.push({ label: apt.label, levelKey: lv.levelKey, counts: apt.counts });
    });
  });
  var n = apartments.length;
  var withAny = apartments.filter(function (a) { return ppAnyPhoto_(a.counts); }).length;
  var stageDone = {};
  (stages || []).forEach(function (st) {
    stageDone[st.key] = apartments.filter(function (a) { return ppStageHasPhoto_(a.counts, st.key); }).length;
  });
  var pct = n ? Math.round((withAny / n) * 100) : 0;
  return { total: n, withAny: withAny, pct: pct, stageDone: stageDone, apartments: apartments };
}

function ppFormatStageCounts_(counts, stages) {
  var parts = (stages || []).map(function (st) {
    return st.label + ' ' + (counts[st.key] || 0);
  });
  parts.push('Unsorted ' + (counts.unsorted || 0));
  return parts.join(' · ');
}

function ppFormatReport_(rootName, levels, stages, updatedAt) {
  var lines = [];
  var titleRoot = String(rootName || 'Photos').trim() || 'Photos';
  lines.push(titleRoot + ' Photo progress');
  lines.push('Last updated: ' + updatedAt);
  lines.push('');

  var summary = ppSummarizeJobs_(levels, stages);
  lines.push(summary.withAny + ' of ' + summary.total + ' have any photos (' + summary.pct + '%)');
  (stages || []).forEach(function (st) {
    var d = summary.stageDone[st.key] || 0;
    lines.push(st.label + ': ' + d + '/' + summary.total);
  });
  lines.push('');

  var sortedLevels = (levels || []).slice().sort(function (a, b) {
    var la = ppLevelFromName_(a.levelName) || { order: 999 };
    var lb = ppLevelFromName_(b.levelName) || { order: 999 };
    return (la.order - lb.order) || ppCompareNatural_(a.levelName, b.levelName);
  });

  sortedLevels.forEach(function (lv) {
    lines.push('— ' + ppLevelHeading_(lv.levelKey, lv.levelName) + ' —');
    var apts = (lv.apartments || []).slice().sort(function (x, y) { return ppCompareNatural_(x.label, y.label); });
    apts.forEach(function (apt) {
      if (ppAnyPhoto_(apt.counts)) {
        lines.push(apt.label + '  ' + ppFormatStageCounts_(apt.counts, stages));
      } else {
        lines.push(apt.label + '  MISSING');
      }
    });
    lines.push('');
  });

  var missingAny = summary.apartments.filter(function (a) { return !ppAnyPhoto_(a.counts); }).map(function (a) { return a.label; });
  missingAny.sort(ppCompareNatural_);
  lines.push('MISSING (no photos):');
  if (!missingAny.length) lines.push('  (none)');
  else missingAny.forEach(function (lbl) { lines.push('  ' + lbl); });
  lines.push('');

  (stages || []).forEach(function (st) {
    var miss = summary.apartments.filter(function (a) { return !ppStageHasPhoto_(a.counts, st.key); }).map(function (a) { return a.label; });
    miss.sort(ppCompareNatural_);
    lines.push('MISSING ' + st.label + ':');
    if (!miss.length) lines.push('  (none)');
    else miss.forEach(function (lbl) { lines.push('  ' + lbl); });
  });

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

function ppFormatMelbourneTimestamp_(date) {
  return Utilities.formatDate(date || new Date(), PP_MELBOURNE, 'd MMM yyyy h:mm a') + ' Melbourne';
}

/* ── Script Property keys (standalone or Neill Data Config.gs) ───── */

function ppJobsPropertyKey_() {
  return (typeof PROP !== 'undefined' && PROP && PROP.photoProgressJobs) ? PROP.photoProgressJobs : 'PHOTO_PROGRESS_JOBS';
}

function ppPlannerMasterPropertyKey_() {
  return (typeof PROP !== 'undefined' && PROP && PROP.photoProgressPlannerMaster)
    ? PROP.photoProgressPlannerMaster : 'PHOTO_PROGRESS_PLANNER_MASTER_SHEET_ID';
}

/* ── job list ────────────────────────────────────────────────────── */

function ppParseJobsProperty_() {
  var key = ppJobsPropertyKey_();
  var raw = PropertiesService.getScriptProperties().getProperty(key) || '[]';
  try {
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Photo progress: invalid ' + key + ' JSON');
    return [];
  }
}

function ppPlannerMasterId_() {
  return String(PropertiesService.getScriptProperties().getProperty(ppPlannerMasterPropertyKey_()) || '').trim();
}

/** Merge explicit jobs with sheet rows that have projectId + reportFileId. */
function ppResolveJobList_() {
  var jobs = ppParseJobsProperty_();
  var out = [];
  var seen = Object.create(null);

  function addJob(rootId, reportId, stages, label) {
    rootId = String(rootId || '').trim();
    reportId = String(reportId || '').trim();
    if (!rootId || !reportId) return;
    var key = rootId + '|' + reportId;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ rootFolderId: rootId, reportFileId: reportId, stages: stages, label: label || '' });
  }

  jobs.forEach(function (job) {
    if (!job) return;
    var reportId = job.reportFileId;
    var rootId = job.rootFolderId;
    if (job.projectId && !rootId) {
      rootId = ppPhotoFolderIdForProject_(String(job.projectId).trim());
    }
    addJob(rootId, reportId, job.stages, job.label);
  });

  var masterId = ppPlannerMasterId_();
  if (masterId) {
    var sheetJobs = ppJobsFromPlannerSheet_(masterId, jobs);
    sheetJobs.forEach(function (sj) { addJob(sj.rootFolderId, sj.reportFileId, sj.stages, sj.label); });
  }

  return out;
}

function ppJobsFromPlannerSheet_(spreadsheetId, configuredJobs) {
  var byProject = Object.create(null);
  var byRoot = Object.create(null);
  (configuredJobs || []).forEach(function (job) {
    if (!job || !job.reportFileId) return;
    if (job.projectId) byProject[String(job.projectId).trim()] = job;
    if (job.rootFolderId) byRoot[String(job.rootFolderId).trim()] = job;
  });
  if (!Object.keys(byProject).length && !Object.keys(byRoot).length) return [];

  var ss;
  try { ss = SpreadsheetApp.openById(spreadsheetId); } catch (e) {
    console.error('Photo progress: cannot open planner master sheet');
    return [];
  }
  var sh = ss.getSheetByName('Projects');
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var header = data[0].map(function (c) { return String(c).trim(); });
  var iProj = header.indexOf('Project ID');
  var iPhoto = header.indexOf('Photo Folder ID');
  var iName = header.indexOf('Name');
  if (iPhoto < 0) return [];

  var found = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var photoId = String(row[iPhoto] || '').trim();
    if (!photoId) continue;
    var job = byRoot[photoId];
    if (!job && iProj >= 0) {
      var pid = String(row[iProj] || '').trim();
      if (pid) job = byProject[pid];
    }
    if (!job || !job.reportFileId) continue;
    var label = iName >= 0 ? String(row[iName] || '').trim() : '';
    found.push({ rootFolderId: photoId, reportFileId: job.reportFileId, stages: job.stages, label: label });
  }
  return found;
}

function ppPhotoFolderIdForProject_(projectId) {
  var masterId = ppPlannerMasterId_();
  if (!masterId || !projectId) return '';
  var ss;
  try { ss = SpreadsheetApp.openById(masterId); } catch (e) { return ''; }
  var sh = ss.getSheetByName('Projects');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return '';
  var header = data[0].map(function (c) { return String(c).trim(); });
  var iProj = header.indexOf('Project ID');
  var iPhoto = header.indexOf('Photo Folder ID');
  if (iProj < 0 || iPhoto < 0) return '';
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iProj] || '').trim() === projectId) return String(data[r][iPhoto] || '').trim();
  }
  return '';
}

/* ── Drive read-only walk ────────────────────────────────────────── */

function ppDriveFolderToTree_(folder, budget, depth) {
  depth = depth == null ? 0 : depth;
  var name = folder.getName();
  var files = [];
  var subfolders = [];
  if (depth > PP_MAX_DEPTH) return { name: name, files: files, folders: subfolders };
  var itFiles = folder.getFiles();
  while (itFiles.hasNext()) {
    if (ppOverBudget_(budget)) break;
    var f = itFiles.next();
    files.push({ name: f.getName(), mimeType: f.getMimeType() });
  }
  var itFolders = folder.getFolders();
  while (itFolders.hasNext()) {
    if (ppOverBudget_(budget)) break;
    var sub = itFolders.next();
    subfolders.push(ppDriveFolderToTree_(sub, budget, depth + 1));
  }
  return { name: name, files: files, folders: subfolders };
}

function ppOverBudget_(budget) {
  return budget && (Date.now() - budget.start) > budget.ms;
}

function ppApplyStagesToLevels_(levels, stages) {
  return (levels || []).map(function (lv) {
    return {
      levelKey: lv.levelKey,
      levelName: lv.levelName,
      apartments: (lv.apartments || []).map(function (apt) {
        var counts = apt.tree ? ppCountPhotosInTree_(apt.tree, stages) : (apt.counts || ppEmptyCounts_(stages));
        return { label: apt.label, counts: counts };
      })
    };
  });
}

function ppRunOneJob_(job, budget) {
  var stages = ppStagesForJob_(job);
  var root = DriveApp.getFolderById(job.rootFolderId);
  var rootName = root.getName();
  var levels = [];
  var levelIt = root.getFolders();
  while (levelIt.hasNext()) {
    if (ppOverBudget_(budget)) {
      console.warn('Photo progress: time budget — partial scan for ' + rootName);
      break;
    }
    var lvlFolder = levelIt.next();
    var lvlParsed = ppLevelFromName_(lvlFolder.getName());
    var levelKey = lvlParsed ? lvlParsed.key : ('z|' + lvlFolder.getName());
    var levelName = lvlParsed ? lvlParsed.driveName : lvlFolder.getName();
    var bucket = { levelKey: levelKey, levelName: levelName, apartments: [] };

    var aptIt = lvlFolder.getFolders();
    while (aptIt.hasNext()) {
      if (ppOverBudget_(budget)) break;
      var aptFolder = aptIt.next();
      var apt = ppApartmentFromName_(aptFolder.getName());
      if (!apt) continue;
      var tree = ppDriveFolderToTree_(aptFolder, budget);
      bucket.apartments.push({ label: apt.label, tree: tree });
    }
    if (bucket.apartments.length) levels.push(bucket);
  }

  levels = ppApplyStagesToLevels_(levels, stages);
  var text = ppFormatReport_(rootName, levels, stages, ppFormatMelbourneTimestamp_(new Date()));
  DriveApp.getFileById(job.reportFileId).setContent(text);
  return 'Updated "' + rootName + '" → ' + levels.reduce(function (n, lv) { return n + lv.apartments.length; }, 0) + ' apartments';
}

/* ── triggers (editor) ───────────────────────────────────────────── */

function runPhotoProgressJobs_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Photo progress: skipped (lock held)');
    return;
  }
  var budget = { start: Date.now(), ms: PP_BUDGET_MS };
  var messages = [];
  try {
    var jobs = ppResolveJobList_();
    if (!jobs.length) {
      console.log('Photo progress: no jobs configured');
      return;
    }
    jobs.forEach(function (job) {
      try {
        messages.push(ppRunOneJob_(job, budget));
      } catch (err) {
        console.error('Photo progress job failed: ' + (job.label || job.rootFolderId), err && err.stack || err);
      }
    });
    if (messages.length) console.log(messages.join('\n'));
  } catch (err) {
    console.error('Photo progress run failed', err && err.stack || err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Run once from the editor to authorise Drive (read) and test output. */
function runPhotoProgressNow() {
  runPhotoProgressJobs_();
  return 'Photo progress run finished — check execution log and report file(s).';
}

function installPhotoProgressTrigger() {
  removePhotoProgressTrigger();
  ScriptApp.newTrigger(PP_HANDLER).timeBased().everyMinutes(15).create();
  return 'Photo progress trigger installed (every 15 minutes, as script owner).';
}

function removePhotoProgressTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === PP_HANDLER) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return 'Removed ' + n + ' photo progress trigger(s).';
}