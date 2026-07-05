/* =========================================================================
 *  nd-match.js — Neill Data Suite fuzzy match engine (§1.7)
 *
 *  Lifted VERBATIM from search/app.js — "the reconciliation brain"
 *  (v1.0 §1.2): Levenshtein + weighted field scoring, weights
 *  node 120 / project 45 / address 45 / type 28 / room 24 / floor 24,
 *  exact-vs-fuzzy (0.72) and filename-source (0.7) penalties.
 *  Behaviour must stay byte-identical for Search.
 *
 *  normalize() is also the CANONICAL addressKey function (v1.0 §3.3):
 *  Upload, Search and Planner must all group photos with this exact
 *  implementation so batches land in the same bucket everywhere.
 *
 *  Consumers: Search (unchanged behaviour), Planner quick-search (§2.5),
 *  Hub filter (§5.1). Quote material search is DEFERRED to the Quote
 *  rework (§0.3) — do not wire this into Quote.
 *
 *  Pure + dependency-free, SWB-engine style.
 *  Run tests:  node shared/nd-match.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  /* ── normalisers (exact copies from search/app.js) ─────────────────── */
  function clean(value) {
    return String(value || "").trim();
  }

  function normalize(value) {
    return clean(value)
      .toLowerCase()
      .replace(/\b(victoria|vic|australia|au)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeRoom(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function normalizeCompact(value) {
    return normalize(value).replace(/\s+/g, "");
  }

  /* The canonical group key for a photo batch (v1.0 §3.3). */
  function addressKey(address) {
    return normalize(address);
  }

  /* ── string distance ───────────────────────────────────────────────── */
  function levenshteinDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      let diagonal = previous[0];
      previous[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const above = previous[rightIndex];
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        previous[rightIndex] = Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, diagonal + cost);
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  function stringSimilarity(left, right) {
    if (left === right) return 1;
    const maxLength = Math.max(left.length, right.length);
    if (!maxLength) return 1;
    return 1 - (levenshteinDistance(left, right) / maxLength);
  }

  /* ── field matching ────────────────────────────────────────────────── */
  function exactFieldMatch(label, source) {
    return { kind: "exact", label: clean(label), source, similarity: 1 };
  }

  function bestFieldMatch(sources, candidates, fuzzyThreshold = 0.8) {
    let best = null;
    sources.filter((source) => clean(source.value)).forEach((source) => {
      candidates.filter(Boolean).forEach((candidate) => {
        const sourceValue = normalizeCompact(source.value);
        const candidateValue = normalizeCompact(candidate);
        if (!sourceValue || !candidateValue) return;
        const exact = sourceValue === candidateValue;
        const shorter = Math.min(sourceValue.length, candidateValue.length);
        const longer = Math.max(sourceValue.length, candidateValue.length);
        const contained = shorter >= 5 && (sourceValue.includes(candidateValue) || candidateValue.includes(sourceValue));
        const similarity = exact ? 1 : contained ? shorter / longer : stringSimilarity(sourceValue, candidateValue);
        const threshold = shorter >= 8 ? fuzzyThreshold : Math.max(fuzzyThreshold, 0.86);
        if (!exact && !contained && similarity < threshold) return;
        const kind = exact && source.source !== "filename" ? "exact" : "fuzzy";
        const match = { kind, label: clean(candidate), source: source.source, similarity };
        if (!best || match.similarity > best.similarity || (match.kind === "exact" && best.kind !== "exact")) best = match;
      });
    });
    return best;
  }

  /* ── destination scoring (exact copy from search/app.js) ───────────── */
  const WEIGHTS = { node: 120, project: 45, address: 45, room: 24, floor: 24, type: 28 };

  function destinationMatchDetails(file, destination) {
    const fields = {};
    const fileName = clean(file.name).replace(/\.[^.]+$/, "");

    if (file.projectId && destination.projectId === file.projectId) {
      fields.project = exactFieldMatch(destination.projectName || destination.projectId, "projectId");
    } else {
      fields.project = bestFieldMatch([{ value: file.projectName, source: "project" }], [destination.projectName]);
    }

    fields.address = bestFieldMatch([{ value: file.address, source: "address" }], [destination.address], 0.92);
    fields.room = bestFieldMatch([
      { value: file.room, source: "room" },
      { value: fileName, source: "filename" }
    ], destination.roomNames || destination.roomKeys || []);

    if (file.floorId && destination.floorId === file.floorId) {
      fields.floor = exactFieldMatch(destination.floorName || destination.floorId, "floorId");
    } else {
      fields.floor = bestFieldMatch([
        { value: file.floorName, source: "floor" },
        { value: file.location, source: "location" },
        { value: fileName, source: "filename" }
      ], [destination.floorName]);
    }

    fields.type = bestFieldMatch([
      { value: file.type, source: "type" },
      { value: fileName, source: "filename" }
    ], [destination.deviceType, destination.lineItem, destination.category, destination.nodeName]);

    if (file.nodeId && destination.nodeId === file.nodeId) {
      fields.node = exactFieldMatch(destination.nodeName || destination.nodeId, "nodeId");
    } else {
      fields.node = bestFieldMatch([
        { value: file.nodeName, source: "node" },
        { value: fileName, source: "filename" }
      ], [destination.nodeName]);
    }

    Object.keys(fields).forEach((field) => {
      if (!fields[field]) delete fields[field];
    });

    const score = Object.entries(fields).reduce((total, [field, detail]) => {
      const kindFactor = detail.kind === "exact" ? 1 : 0.72;
      const sourceFactor = detail.source === "filename" ? 0.7 : 1;
      return total + WEIGHTS[field] * kindFactor * sourceFactor;
    }, 0);
    const explicitFields = [
      (file.projectId || file.projectName) && "project",
      file.address && "address",
      file.room && "room",
      (file.floorId || file.floorName || file.location) && "floor",
      file.type && "type",
      (file.nodeId || file.nodeName) && "node"
    ].filter(Boolean);
    const allExplicitFieldsExact = explicitFields.length > 0 && explicitFields.every((field) => fields[field]?.kind === "exact");
    const exactAnchor = ["node", "project", "address"].some((field) => fields[field]?.kind === "exact");
    const destinationDetails = ["room", "floor", "type", "node"].filter((field) => fields[field]).length;
    const nodeIdMatch = Boolean(file.nodeId && destination.nodeId === file.nodeId);
    const exactDestination = nodeIdMatch || (exactAnchor && destinationDetails >= 2 && allExplicitFieldsExact);

    return { destination, fields, score, exactDestination };
  }

  /* Pure ranking half of Search's matchFile(): returns the decision,
   * leaves state mutation / destination application to the caller. */
  function rankDestinations(file, destinations) {
    const ranked = destinations
      .map((destination) => destinationMatchDetails(file, destination))
      .filter((details) => details.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0] || null;
    const second = ranked[1] || null;
    const uniqueEnough = !second || best.score - second.score >= 10;
    const nodeIdMatch = Boolean(file.nodeId && best?.destination.nodeId === file.nodeId);
    const exactDestination = Boolean(best?.exactDestination && (uniqueEnough || nodeIdMatch));
    return {
      ranked,
      best,
      matchDetails: best ? { ...best, exactDestination } : null,
      match: exactDestination ? best.destination : null
    };
  }

  /* ── lightweight scored filter (Planner §2.5 / Hub §5.1) ───────────── */
  function fuzzyFilter(query, items, getText) {
    const q = normalizeCompact(query);
    if (!q) return items.slice();
    const scored = [];
    items.forEach(function (item) {
      const texts = [].concat(getText ? getText(item) : item);
      let best = 0;
      texts.forEach(function (t) {
        const v = normalizeCompact(t);
        if (!v) return;
        let s = 0;
        if (v === q) s = 3;
        else if (v.startsWith(q)) s = 2.5;
        else if (v.includes(q)) s = 2;
        else {
          const sim = stringSimilarity(q, v.slice(0, Math.max(q.length + 2, v.length > q.length * 2 ? q.length + 2 : v.length)));
          if (sim >= 0.72) s = sim;
        }
        if (s > best) best = s;
      });
      if (best > 0) scored.push({ item: item, score: best });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.item; });
  }

  const API = {
    WEIGHTS,
    clean, normalize, normalizeRoom, normalizeCompact, addressKey,
    levenshteinDistance, stringSimilarity,
    exactFieldMatch, bestFieldMatch,
    destinationMatchDetails, rankDestinations,
    fuzzyFilter
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.match = API;
    root.NDMatch = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
