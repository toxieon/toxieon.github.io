/* Drive photo folders for Neill Planner.
 * Pure helpers: level and apartment names, idempotent floor/room plans,
 * and the watermark text drawn over a photo. No Drive calls and no DOM.
 * Works in the page (window.NDPhotoFolders) and in Node tests. */
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
        if (!bucket.apartments.some((item) => item.key === apt.key)) bucket.apartments.push({ key: apt.key, label: apt.label });
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

  function isPhotoFile(file) {
    if (!file || isFolder(file)) return false;
    if (/^image\//i.test(file.mimeType || "")) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name || "");
  }

  /* rootFiles plus childrenById (folder id -> files) become the tray groups.
   * Photos dropped straight into a level folder land in that level's loose list. */
  function groupPhotoFiles(rootFiles, childrenById) {
    const kids = childrenById || {};
    const levels = [];
    const loose = [];
    (rootFiles || []).forEach((file) => {
      if (isFolder(file)) {
        const level = levelFromName(file.name);
        const nested = kids[file.id] || [];
        const apartments = [];
        const levelLoose = [];
        nested.forEach((child) => {
          if (isFolder(child)) {
            const photos = (kids[child.id] || []).filter(isPhotoFile);
            apartments.push({ folderId: child.id, name: child.name, photos: photos });
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

  /* Overlay text. Nothing is written back to the file.
   * Apartment and room share one line; type, status, line item and notes share the next. */
  function watermarkModel(info) {
    const src = info || {};
    const apt = String(src.apartment || "").trim();
    const room = String(src.room || "").trim();
    const roomShow = room && room.toLowerCase() !== "no room" && room.toLowerCase() !== apt.toLowerCase() ? room : "";
    const primary = [apt, roomShow].filter(Boolean).join(" · ");
    const type = String(src.type || "").trim();
    const extra = [];
    if (type && type !== "marker") extra.push(type === "photo" ? "Photo" : type);
    const status = String(src.status || "").trim();
    if (status) extra.push(status);
    const item = String(src.lineItem || src.category || "").trim();
    if (item) extra.push(item);
    const notes = String(src.notes || "").trim().replace(/\s+/g, " ");
    if (notes) extra.push(notes.length > 42 ? notes.slice(0, 41) + "…" : notes);
    const secondary = extra.join(" · ");
    const lines = [primary, secondary].filter(Boolean);
    if (!lines.length) return null;
    return { lines: lines };
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
    isPhotoFile: isPhotoFile,
    groupPhotoFiles: groupPhotoFiles,
    watermarkModel: watermarkModel
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDPhotoFolders = API;
})(typeof window !== "undefined" ? window : globalThis);
