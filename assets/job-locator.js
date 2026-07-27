/* =========================================================================
 *  job-locator.js — "am I at a known job?" match / create by location
 *
 *  Origin: extracted and generalised from Timesheet's job matching
 *  (distanceMetres / findJobByLocation / nearestJob / resolveOrCreateJob).
 *  Purpose: given a coordinate and a list of jobs, find the nearest one and
 *  classify how confident we are ("here" vs "near"), or resolve/create by
 *  name+address. Framework-free and dependency-free.
 *
 *  A "job" is any object with { lat, lng, radius_m?, job_name?, address? }.
 *  You pass the array in; nothing is stored here.
 *
 *  Global `NDJobLocator`:
 *
 *    NDJobLocator.distanceMetres(lat1,lng1,lat2,lng2) -> metres | Infinity  (pure)
 *
 *    NDJobLocator.nearest(jobs, lat, lng) -> { job, dist } | { job:null, dist:Infinity }
 *        Closest job that has coordinates.
 *
 *    NDJobLocator.match(jobs, lat, lng, opts) -> { tier, job, dist }
 *        tier: "here"  (within the job's radius — certain)
 *              "near"  (within radius × opts.nearMult — assume, confirm)
 *              "none"  (nothing close enough)
 *        opts.defaultRadius (150), opts.nearMult (3).
 *
 *    NDJobLocator.resolveOrCreate(jobs, { job_name, address, lat, lng, job_type }, make)
 *        Reuse a job matching name OR address; else call make(spec) to mint one.
 *        `make` is your app's create function (it owns ids + persistence).
 * ========================================================================= */
(function (root) {
  "use strict";

  function distanceMetres(lat1, lng1, lat2, lng2) {
    lat1 = parseFloat(lat1); lng1 = parseFloat(lng1); lat2 = parseFloat(lat2); lng2 = parseFloat(lng2);
    if ([lat1, lng1, lat2, lng2].some(function (v) { return v === null || v === undefined || Number.isNaN(v); })) return Infinity;
    var R = 6371000, toRad = function (d) { return (d * Math.PI) / 180; };
    var dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearest(jobs, lat, lng) {
    var best = null, bestDist = Infinity;
    (jobs || []).forEach(function (j) {
      if (j == null || j.lat == null || j.lng == null) return;
      var d = distanceMetres(lat, lng, j.lat, j.lng);
      if (d < bestDist) { best = j; bestDist = d; }
    });
    return { job: best, dist: bestDist };
  }

  function match(jobs, lat, lng, opts) {
    opts = opts || {};
    var defaultRadius = opts.defaultRadius || 150;
    var nearMult = opts.nearMult || 3;
    var n = nearest(jobs, lat, lng);
    if (n.job) {
      var r = n.job.radius_m || defaultRadius;
      if (n.dist <= r) return { tier: "here", job: n.job, dist: n.dist };
      if (n.dist <= r * nearMult) return { tier: "near", job: n.job, dist: n.dist };
    }
    return { tier: "none", job: null, dist: n.dist };
  }

  function norm(s) { return (s || "").trim().toLowerCase(); }

  function resolveOrCreate(jobs, spec, make) {
    spec = spec || {};
    var n = norm(spec.job_name), a = norm(spec.address);
    var found = (jobs || []).filter(Boolean).find(function (j) {
      return (n && norm(j.job_name) === n) || (a && norm(j.address) === a);
    });
    if (found) return found;
    return typeof make === "function" ? make(spec) : null;
  }

  var API = { distanceMetres: distanceMetres, nearest: nearest, match: match, resolveOrCreate: resolveOrCreate };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDJobLocator = API;
})(typeof window !== "undefined" ? window : globalThis);
