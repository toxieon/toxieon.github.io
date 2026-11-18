const assert = require("node:assert/strict");
const fs = require("node:fs");
const { context } = require("./test-utils.cjs");

const src = fs.readFileSync(__dirname + "/js/drive-photo-sources.js", "utf8")
  + "\n" + fs.readFileSync(__dirname + "/js/photo-watermark.js", "utf8");

const ctx = context(src, {
  document: { querySelectorAll: () => [], addEventListener: () => {} },
  MASTER_TABS: { Projects: [] },
  state: { drive: {}, projects: [], googleAuth: {}, photoSources: {} },
  googleCall: async (fn) => fn(),
  isTokenValid: () => false,
  project: () => null,
  render: () => {},
  icon: () => "",
  escapeHtml: (s) => String(s),
  driveThumb: (id) => `thumb:${id}`,
  describeError: (e) => String(e),
  nowStamp: () => "now",
  sydneyFromStored: (s) => s,
  projectById: () => ({ floors: [{ id: "f", name: "Level 1" }] }),
  floorById: (_, id) => ({ id, name: "Level 1" }),
  roomById: () => ({ name: "Bedroom" }),
  roomLabel: () => "Bedroom",
  nodeDisplayTitle: () => "GPO",
  currentFloor: () => ({ name: "Level 1" }),
  categoryNames: () => ["Data"]
});

assert.equal(ctx.parseDriveFolderIdFromPaste("https://drive.google.com/drive/folders/abc123XYZ"), "abc123XYZ");
assert.equal(JSON.stringify(ctx.parsePhotoSourceFolderIdsField("id1, id2")), '["id1","id2"]');
const pathHints = ctx.inferLevelAndAptFromPath(["Level 1", "1.01"]);
assert.equal(pathHints.level, "1");
assert.equal(pathHints.apt, "1.01");
const lines = ctx.photoWatermarkLines({
  projectId: "p", floorId: "f", roomId: "r", customTitle: "GPO", status: "In Progress", category: "Data", tags: ["apt:1.02"]
}, { uploadedAt: "2026-11-01", sourceFolderApt: "1.02" });
assert.ok(lines.some((l) => l.includes("Bedroom")));
console.log("photo-sources.test.cjs: ok");