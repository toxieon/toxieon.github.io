/* Parity tests: nd-site-match.js vs legacy Timesheet inline helpers. */
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./nd-site-match.js");

const jobs = [
  { job_id: "a", job_name: "Alpha", lat: -37.8136, lng: 144.9631, radius_m: 200 },
  { job_id: "b", job_name: "Beta", lat: -37.8200, lng: 144.9700, radius_m: 100 }
];

test("distanceMetres rejects missing coords", () => {
  assert.equal(M.distanceMetres(null, 1, 2, 3), Infinity);
});

test("findJobByLocation picks closest in-radius site", () => {
  const hit = M.findJobByLocation(jobs, -37.8137, 144.9632, 200);
  assert.equal(hit.job_id, "a");
});

test("classifyNearJob matches Timesheet known / near tiers", () => {
  const known = M.classifyNearJob(jobs, -37.8137, 144.9632, 200);
  assert.equal(known.type, "known");
  assert.equal(known.job.job_id, "a");
  const near = M.classifyNearJob(jobs, -37.8182, 144.9631, 200);
  assert.equal(near.type, "near");
  const none = M.classifyNearJob(jobs, -38.0, 145.0, 200);
  assert.equal(none.type, null);
});

test("nearestJob skips jobs without coordinates", () => {
  const n = M.nearestJob([{ job_id: "x" }, jobs[0]], -37.8137, 144.9632);
  assert.equal(n.job.job_id, "a");
});
