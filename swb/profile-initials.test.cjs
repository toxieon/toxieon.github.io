"use strict";
// Keep in sync with swb/app.js renderTopbar() profile initials.
const test = require("node:test");
const assert = require("node:assert/strict");

function profileInitials(profile) {
  if (!profile) return "?";
  const s = ((profile.given_name?.[0] || "") + (profile.family_name?.[0] || "")).trim();
  return s || "?";
}

test("profile initials include given and family first letters", () => {
  assert.equal(profileInitials({ given_name: "Jane", family_name: "Smith" }), "JS");
  assert.equal(profileInitials({ given_name: "Jane", family_name: "" }), "J");
  assert.equal(profileInitials({ given_name: "", family_name: "Smith" }), "S");
  assert.equal(profileInitials(null), "?");
});
