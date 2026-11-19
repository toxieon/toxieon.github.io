/* Drive photo folders for Neill Planner.
 * Pure helpers: level and apartment names, Rough-in / Fit-off stage folders,
 * idempotent floor/room plans, and the watermark card drawn over a photo.
 * No Drive calls and no DOM. Works in the page (window.NDPhotoFolders) and in Node tests.
 * Stage is never written by renaming a Drive file. A manual stage lives in Planner data. */
(function (root) {
  "use strict";

  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const LEVEL_B = { key: "b", order: -1, plannerName: "Basement", driveName: "Level B" };
  const LEVEL_G = { key: "g", order: 0, plannerName: "Ground floor", driveName: "Level G" };

  function norm(value) {
    return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\.$/, "");
  }

  function ordinalLevel(n) {
    if (!Number.isInteger(n) || n < 0 || n > 40) return null;
    if (n === 0) return Object.assign({}, LEVEL_G);
    const teen = n % 100;
    const suf = (teen >= 11 && teen <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return { key: String(n), order: n, plannerName: n + suf + " floor", driveName: "Level " + n };
  }

  function levelByKey(key) {
    if (key === "b") return Object.assign({}, LEVEL_B);
    if (key === "g") return Object.assign({}, LEVEL_G);
    if (/^\d+$/.test(String(key || ""))) return ordinalLevel(Number(key));
    return null;
  }

  /* "Level G", "Ground floor", "APT# FIRST FLOOR", "Level 1", "1st floor", "Level B". */
  function levelFromName(name) {
    let n = norm(name).replace(/^apt#\s*/, "").replace(/^level\s+/, "");
    if (!n) return null;
    if (/^(b|basement)( \d+)?$/.test(n)) return Object.assign({}, LEVEL_B);
    if (/^(g|gf|ground)( floor)?$/.test(n)) return Object.assign({}, LEVEL_G);
    const words = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
    const word = n.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)( floor)?$/);
    if (word) return ordinalLevel(words[word[1]]);
    const num = n.match(/^(\d+)(st|nd|rd|th)?( floor)?$/);
    if (num) return ordinalLevel(Number(num[1]));
    return null;
  }

  /* "B.11A", "G.01", "1.01", "2.11", "14A", "B.13A - rooftop vari".
   * Section headers and non-codes (a room called "Living") return null. */
  function apartmentFromName(name) {
    const raw = String(name || "").trim();
    if (!raw || /^apt#/i.test(raw) || /^\*+/.test(raw)) return null;
    const noteMatch = raw.match(/^(.+?)\s+-\s+(.+)$/);
    const head = (noteMatch ? noteMatch[1] : raw).trim();
    const note = noteMatch ? noteMatch[2].trim() : "";
    const dotted = head.match(/^([A-Za-z]+|\d+)\.(\d+[A-Za-z]?)$/);
    if (dotted) {
      const prefix = /^\d+$/.test(dotted[1]) ? String(Number(dotted[1])) : dotted[1].toUpperCase();
      const suffix = dotted[2].toUpperCase();
      const label = prefix + "." + suffix;
      const level = levelFromName(/^\d+$/.test(prefix) ? prefix : prefix);
      return { key: label.toLowerCase(), label: label, levelKey: level ? level.key : null, note: note };
    }
    const plain = head.match(/^(\d+[A-Za-z])$/);
    if (!plain) return null;
    const label = plain[1].toUpperCase();
    return { key: label.toLowerCase(), label: label, levelKey: null, note: note };
  }

  /* Spreadsheet or pasted lines. A row is either "APT# GROUND FLOOR" or an apartment code.
   * The code's own level wins; a bare code such as 14A uses the current section. */
  function parseApartmentMatrix(rows) {
    let section = null;
    const out = [];
    const seen = new Set();
    (rows || []).forEach((row) => {
      const cell = String((Array.isArray(row) ? row[0] : row) || "").trim();
      if (!cell) return;
      if (/^apt#/i.test(cell)) { section = levelFromName(cell); return; }
      const apt = apartmentFromName(cell);
      if (!apt) return;
      const levelKey = apt.levelKey || (section && section.key) || "";
      if (!levelKey) return;
      const id = levelKey + "|" + apt.key;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ levelKey: levelKey, key: apt.key, label: apt.label, note: apt.note || "" });
    });
    return out;
  }

  function parseDriveFolderId(input) {
    const s = String(input || "").trim();
    if (!s) return "";
    const folder = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folder) return folder[1];
    const id = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (id) return id[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
    return "";
  }

  /* Floors and rooms to add so the project matches `wanted`. Existing matches are skipped. */
  function planAdditions(floors, rooms, wanted) {
    const floorList = floors || [];
    const roomList = rooms || [];
    const floorKey = new Map();
    floorList.forEach((floor) => {
      const key = levelFromName(floor.name)?.key;
      if (key && !floorKey.has(key)) floorKey.set(key, floor);
    });
    const floorsOut = [];
    const seenFloors = new Set();
    const roomsOut = [];
    const seenRooms = new Set();
    (wanted || []).forEach((item) => {
      if (!item || !item.levelKey || !item.key || !item.label) return;
      const level = levelByKey(item.levelKey);
      if (!level) return;
      if (!floorKey.has(item.levelKey) && !seenFloors.has(item.levelKey)) {
        floorsOut.push({ levelKey: level.key, name: level.plannerName, order: level.order, driveName: level.driveName });
        seenFloors.add(item.levelKey);
      }
      const floor = floorKey.get(item.levelKey);
      const already = floor
        ? roomList.some((room) => room.floorId === floor.id && apartmentFromName(room.name)?.key === item.key)
        : false;
      const token = item.levelKey + "|" + item.key;
      if (!already && !seenRooms.has(token)) {
        roomsOut.push({ levelKey: item.levelKey, name: item.label, key: item.key });
        seenRooms.add(token);
      }
    });
    return { floors: floorsOut, rooms: roomsOut };
  }

  function wantedFromTree(levels) {
    const out = [];
    (levels || []).forEach((level) => {
      const parsed = levelFromName(level.name);
      if (!parsed) return;
      (level.apartments || []).forEach((apt) => {
        const parsedApt = apartmentFromName(apt.name || apt.label || "");
        if (!parsedApt) return;
        out.push({ levelKey: parsed.key, key: parsedApt.key, label: parsedApt.label });
      });
    });
    return out;
  }

  /* Level folders and apartment folders the project should have under the photo root. */
  function driveFolderPlan(floors, rooms) {
    const byFloor = new Map();
    (rooms || []).forEach((room) => {
      const apt = apartmentFromName(room.name);
      if (!apt) return;
      const list = byFloor.get(room.floorId) || [];
      list.push(apt);
      byFloor.set(room.floorId, list);
    });
    const map = new Map();
    (floors || []).forEach((floor) => {
      const level = levelFromName(floor.name);
      if (!level) return;
      if (!map.has(level.key)) map.set(level.key, { levelKey: level.key, driveName: level.driveName, order: level.order, apartments: [] });
      const bucket = map.get(level.key);
      (byFloor.get(floor.id) || []).forEach((apt) => {
        if (!bucket.apartments.some((item) => item.key === apt.key)) {
          bucket.apartments.push({
            key: apt.key,
            label: apt.label,
            stages: STAGE_FOLDERS.map((stage) => ({ key: stage.key, name: stage.name }))
          });
        }
      });
    });
    return [...map.values()].sort((a, b) => a.order - b.order);
  }

  function isFolder(file) {
    return !!(file && (file.mimeType === FOLDER_MIME || file.kind === "folder"));
  }

  function matchLevelFolder(files, levelKey) {
    return (files || []).find((file) => isFolder(file) && levelFromName(file.name)?.key === levelKey) || null;
  }

  function matchApartmentFolder(files, key) {
    return (files || []).find((file) => isFolder(file) && apartmentFromName(file.name)?.key === key) || null;
  }

  /* Optional folders inside an apartment. Names match case-insensitively,
   * and "Rough in" / "Roughin" / "Fit off" / "Fitoff" count as the same stage. */
  const STAGE_FOLDERS = [
    { key: "rough-in", name: "Rough-in" },
    { key: "fit-off", name: "Fit-off" }
  ];
  const STAGES = {
    "rough-in": { key: "rough-in", label: "Rough-in", status: "In progress", tone: "rough" },
    "fit-off": { key: "fit-off", label: "Fit-off", status: "Fit off", tone: "fit" },
    unsorted: { key: "unsorted", label: "Unsorted", status: "", tone: "plain" }
  };

  function stageFromName(name) {
    const compact = norm(name).replace(/[^a-z0-9]/g, "");
    if (compact === "roughin") return "rough-in";
    if (compact === "fitoff") return "fit-off";
    if (compact === "unsorted") return "unsorted";
    return "";
  }

  /* "" means "not set" (inherit). A known stage, including explicit Unsorted, is kept. */
  function normalizeStage(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (STAGES[raw]) return raw;
    return stageFromName(raw);
  }

  function stageMeta(key) {
    return STAGES[normalizeStage(key) || "unsorted"];
  }

  /* Photo override, then the node's override, then the folder the file sits in. */
  function effectiveStage(info) {
    const src = info || {};
    const photo = normalizeStage(src.photoStage);
    if (photo) return photo;
    const node = normalizeStage(src.nodeStage);
    if (node) return node;
    const folder = normalizeStage(src.folderStage);
    if (folder) return folder;
    return "unsorted";
  }

  /* Backup only: a stage word in the file name ("rough in", "Fit-off", "fitoff") for a photo that is
   * not inside a stage subfolder. Both words in one name means no hint. */
  function stageFromFilename(name) {
    const text = String(name || "").toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "");
    const rough = /(^|[^a-z])rough[\s_-]*in([^a-z]|$)/.test(text);
    const fit = /(^|[^a-z])fit[\s_-]*off([^a-z]|$)/.test(text);
    if (rough && !fit) return "rough-in";
    if (fit && !rough) return "fit-off";
    return "";
  }

  /* The stage folder a photo sits in wins. The file-name hint is used only without one. */
  function stageForPhoto(info) {
    const src = info || {};
    const folder = stageFromName(src.folderName || "");
    if (folder === "rough-in" || folder === "fit-off") return folder;
    return stageFromFilename(src.fileName) || "unsorted";
  }

  /* Job-level folders that hold files, not levels. Matching is tolerant of case, spacing and dashes. */
  const RESERVED_FOLDERS = { "excel files": "excel", "excel": "excel", "floor plans": "plans", "floorplans": "plans", "plans": "plans", "watermarked": "watermarked", "planner data": "data" };
  function reservedFolderKind(name) {
    return RESERVED_FOLDERS[norm(name)] || "";
  }

  /* Special items directly inside a job folder: Excel Files and Floor Plans folders, the Plans status sheet. */
  function jobSpecials(rootFiles) {
    const out = { excelFolderId: "", plansFolderId: "", plansStatusFileId: "" };
    (rootFiles || []).forEach((file) => {
      if (isFolder(file)) {
        const kind = reservedFolderKind(file.name);
        if (kind === "excel" && !out.excelFolderId) out.excelFolderId = file.id;
        if (kind === "plans" && !out.plansFolderId) out.plansFolderId = file.id;
      } else if (!out.plansStatusFileId && /^application\/vnd\.google-apps\.spreadsheet$/.test(file.mimeType || "") && norm(file.name) === "plans status") {
        out.plansStatusFileId = file.id;
      }
    });
    return out;
  }

  function matchStageFolder(files, key) {
    const wanted = normalizeStage(key);
    if (!wanted || wanted === "unsorted") return null;
    return (files || []).find((file) => isFolder(file) && stageFromName(file.name) === wanted) || null;
  }

  function isPhotoFile(file) {
    if (!file || isFolder(file)) return false;
    if (/^image\//i.test(file.mimeType || "")) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || "");
  }

  function taggedPhoto(file, stage) {
    return Object.assign({}, file, { stage: stage });
  }

  /* Photos directly in the apartment, and photos in any other subfolder, are Unsorted.
   * Rough-in and Fit-off come only from a stage subfolder. */
  function stageGroupsFor(children, kids) {
    const buckets = { "rough-in": [], "fit-off": [], unsorted: [] };
    (children || []).forEach((child) => {
      if (isFolder(child)) {
        const stage = stageFromName(child.name);
        const inner = (kids[child.id] || []).filter(isPhotoFile);
        inner.forEach((file) => {
          const key = stageForPhoto({ folderName: child.name, fileName: file.name });
          buckets[key].push(taggedPhoto(file, key));
        });
      } else if (isPhotoFile(child)) {
        const key = stageForPhoto({ fileName: child.name });
        buckets[key].push(taggedPhoto(child, key));
      }
    });
    const stages = ["rough-in", "fit-off", "unsorted"].map((key) => ({
      key: key,
      label: STAGES[key].label,
      tone: STAGES[key].tone,
      photos: buckets[key]
    })).filter((item) => item.photos.length);
    const photos = [];
    stages.forEach((item) => photos.push(...item.photos));
    return { stages: stages, photos: photos };
  }

  /* rootFiles plus childrenById (folder id -> direct children) become the tray groups.
   * Photos dropped straight into a level folder land in that level's loose list.
   * Photos inside an apartment are grouped by stage subfolder. */
  function groupPhotoFiles(rootFiles, childrenById) {
    const kids = childrenById || {};
    const levels = [];
    const loose = [];
    (rootFiles || []).forEach((file) => {
      if (isFolder(file)) {
        if (reservedFolderKind(file.name)) return;
        const level = levelFromName(file.name);
        const nested = kids[file.id] || [];
        const apartments = [];
        const levelLoose = [];
        nested.forEach((child) => {
          if (isFolder(child)) {
            const grouped = stageGroupsFor(kids[child.id] || [], kids);
            const apt = apartmentFromName(child.name);
            apartments.push({
              folderId: child.id,
              name: child.name,
              key: apt ? apt.key : "",
              stages: grouped.stages,
              photos: grouped.photos
            });
          } else if (isPhotoFile(child)) levelLoose.push(child);
        });
        apartments.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
        levels.push({
          folderId: file.id,
          name: file.name,
          levelKey: level ? level.key : null,
          order: level ? level.order : 999,
          apartments: apartments,
          loose: levelLoose
        });
      } else if (isPhotoFile(file)) loose.push(file);
    });
    levels.sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
    return { levels: levels, loose: loose };
  }

  /* "18 Nov 2026" in Sydney. A date-only value stays on that calendar day. */
  function watermarkDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(raw)) return raw;
    const stamp = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
    let date = null;
    if (stamp) {
      if (stamp[7]) date = new Date(raw.replace(" ", "T"));
      else if (stamp[4] != null) date = new Date(Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +(stamp[6] || 0)));
      else date = new Date(Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], 1, 0, 0));
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) date = parsed;
    }
    if (!date || Number.isNaN(date.getTime())) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" }).formatToParts(date);
      const part = (type) => (parts.find((item) => item.type === type) || {}).value || "";
      const day = part("day"), month = part("month"), year = part("year");
      return day && month && year ? day + " " + month + " " + year : "";
    } catch (e) { return ""; }
  }

  /* Overlay card. Nothing is written back to the file.
   * Line 1 is the apartment and the room. Line 2 is the stage, its status and the note.
   * Branding is off unless asked: the footer is then the date alone, when one is known. */
  function watermarkModel(info) {
    const src = info || {};
    const apt = String(src.apartment || "").trim();
    const room = String(src.room || "").trim();
    const roomShow = room && room.toLowerCase() !== "no room" && room.toLowerCase() !== apt.toLowerCase() ? room : "";
    const stageKey = effectiveStage(src);
    const stage = stageMeta(stageKey);
    const note = String(src.notes || "").trim().replace(/\s+/g, " ");
    if (!apt && !roomShow && !note && stageKey === "unsorted") return null;
    const branding = src.branding === true;
    const version = String(src.version || "").trim();
    const date = watermarkDate(src.date);
    let footer = "";
    if (branding && version) footer = date ? "Neill Planner " + version + " · " + date : "Neill Planner " + version;
    else if (date) footer = date;
    return {
      apartment: apt,
      room: roomShow,
      stage: stage.key,
      stageLabel: stage.label,
      status: stage.status,
      tone: stage.tone,
      note: note,
      footer: footer,
      branding: branding
    };
  }

  /* Apartments that have at least one photo of a stage, for the progress line.
   * overrides maps a Drive file id to a manual stage; that stage wins for that file. */
  function collectApartmentStages(tree, overrides) {
    const present = {};
    const keys = [];
    const ensure = (name) => {
      const apt = apartmentFromName(name);
      if (!apt) return "";
      if (!Object.prototype.hasOwnProperty.call(present, apt.key)) {
        present[apt.key] = [];
        keys.push(apt.key);
      }
      return apt.key;
    };
    ((tree && tree.levels) || []).forEach((level) => {
      (level.apartments || []).forEach((apt) => {
        const key = ensure(apt.name || apt.label || "");
        if (!key) return;
        (apt.photos || []).forEach((photo) => {
          const manual = overrides && (overrides[photo.id] || overrides[photo.driveFileId]) || "";
          const stage = effectiveStage({ nodeStage: manual, folderStage: photo.stage || "" });
          if (present[key].indexOf(stage) < 0) present[key].push(stage);
        });
      });
    });
    return { keys: keys, present: present };
  }

  function stageProgress(apartmentKeys, present) {
    const keys = [];
    const seen = {};
    (apartmentKeys || []).forEach((key) => {
      const id = String(key || "").trim().toLowerCase();
      if (!id || seen[id]) return;
      seen[id] = true;
      keys.push(id);
    });
    const has = (key, stage) => {
      const list = present && present[key];
      return Array.isArray(list) && list.indexOf(stage) >= 0;
    };
    const total = keys.length;
    const roughIn = keys.filter((key) => has(key, "rough-in")).length;
    const fitOff = keys.filter((key) => has(key, "fit-off")).length;
    const pct = (n) => (total ? Math.round((100 * n) / total) : 0);
    return { total: total, roughIn: roughIn, fitOff: fitOff, roughPct: pct(roughIn), fitPct: pct(fitOff) };
  }

  const API = {
    FOLDER_MIME: FOLDER_MIME,
    levelFromName: levelFromName,
    levelByKey: levelByKey,
    apartmentFromName: apartmentFromName,
    parseApartmentMatrix: parseApartmentMatrix,
    parseDriveFolderId: parseDriveFolderId,
    planAdditions: planAdditions,
    wantedFromTree: wantedFromTree,
    driveFolderPlan: driveFolderPlan,
    isFolder: isFolder,
    matchLevelFolder: matchLevelFolder,
    matchApartmentFolder: matchApartmentFolder,
    STAGE_FOLDERS: STAGE_FOLDERS,
    stageFromName: stageFromName,
    stageFromFilename: stageFromFilename,
    stageForPhoto: stageForPhoto,
    reservedFolderKind: reservedFolderKind,
    jobSpecials: jobSpecials,
    normalizeStage: normalizeStage,
    stageMeta: stageMeta,
    effectiveStage: effectiveStage,
    matchStageFolder: matchStageFolder,
    isPhotoFile: isPhotoFile,
    groupPhotoFiles: groupPhotoFiles,
    watermarkDate: watermarkDate,
    watermarkModel: watermarkModel,
    collectApartmentStages: collectApartmentStages,
    stageProgress: stageProgress
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDPhotoFolders = API;
})(typeof window !== "undefined" ? window : globalThis);
