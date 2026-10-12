/* =========================================================================
 *  nd-site-match.js — job-site geolocation matching (Timesheet parity)
 *
 *  Extracted from timesheet/index.html: distanceMetres, findJobByLocation,
 *  nearestJob, NEAR_RADIUS_MULT, and the tiered "known / near" classification
 *  used by TsGeo.resolveClockOnTarget before quote / geocode fallbacks.
 *
 *  Browser: window.NDSiteMatch (does not touch assets/job-locator.js / NDJobLocator).
 *  Node:    require('./nd-site-match.js')
 * ========================================================================= */
(function (root) {
  "use strict";

  var NEAR_RADIUS_MULT = 3;

  function distanceMetres(lat1, lng1, lat2, lng2) {
    lat1 = parseFloat(lat1); lng1 = parseFloat(lng1); lat2 = parseFloat(lat2); lng2 = parseFloat(lng2);
    if ([lat1, lng1, lat2, lng2].some(function (v) { return v === null || v === undefined || Number.isNaN(v); })) return Infinity;
    var R = 6371000;
    var toRad = function (d) { return (d * Math.PI) / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Closest job whose centre is within its radius (or defaultRadiusM). */
  function findJobByLocation(jobs, lat, lng, defaultRadiusM) {
    var best = null;
    var bestDist = Infinity;
    (jobs || []).forEach(function (job) {
      var d = distanceMetres(lat, lng, job.lat, job.lng);
      var radius = job.radius_m || defaultRadiusM;
      if (d <= radius && d < bestDist) { best = job; bestDist = d; }
    });
    return best;
  }

  /** Closest job that has coordinates, plus distance in metres. */
  function nearestJob(jobs, lat, lng) {
    var job = null;
    var dist = Infinity;
    (jobs || []).forEach(function (j) {
      if (j.lat == null || j.lng == null) return;
      var d = distanceMetres(lat, lng, j.lat, j.lng);
      if (d < dist) { job = j; dist = d; }
    });
    return { job: job, dist: dist };
  }

  /**
   * Tiered match for clock-on / gate-code arrival (Timesheet TsGeo.resolveClockOnTarget).
   * Returns { type: 'known'|'near'|null, job, dist } — null type when no nearby job.
   */
  function classifyNearJob(jobs, lat, lng, defaultRadiusM) {
    var near = nearestJob(jobs, lat, lng);
    if (!near.job) return { type: null, job: null, dist: near.dist };
    var confirmR = near.job.radius_m || defaultRadiusM;
    if (near.dist <= confirmR) return { type: "known", job: near.job, dist: near.dist };
    if (near.dist <= confirmR * NEAR_RADIUS_MULT) return { type: "near", job: near.job, dist: near.dist };
    return { type: null, job: null, dist: near.dist };
  }

  var API = {
    NEAR_RADIUS_MULT: NEAR_RADIUS_MULT,
    distanceMetres: distanceMetres,
    findJobByLocation: findJobByLocation,
    nearestJob: nearestJob,
    classifyNearJob: classifyNearJob
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDSiteMatch = API;
})(typeof window !== "undefined" ? window : globalThis);
