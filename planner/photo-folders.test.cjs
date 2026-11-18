const assert = require("node:assert/strict");
const test = require("node:test");
const PF = require("./photo-folders.js");

const SHEET = [
  ["APT# BASEMENT 1"],
  ["B.11A"], ["B.12A"], ["B.13A - rooftop vari"], ["B.14A"],
  [""],
  ["APT# GROUND FLOOR"],
  ["G.01 "], ["G.02  - rooftop vari"], ["G.03 "], ["G.04  - rooftop vari"], ["G.05 "],
  ["G.11"], ["G.12"], ["G.13"], ["G.14"], ["G.15"], ["G.16"],
  [""],
  ["APT# FIRST FLOOR"],
  ["1.01"], ["1.02"], ["1.03"], ["1.04"], ["1.05"], ["1.06"],
  ["1.11"], ["1.12"], ["1.13"], ["1.14"], ["1.15"],
  ["**MULTI"],
  ["APT# SECOND FLOOR"],
  ["2.01"], ["2.02"], ["2.03"], ["2.04"], ["2.11"], ["2.12"]
];

test("level names map onto the planner floors", () => {
  assert.equal(PF.levelFromName("Level G").plannerName, "Ground floor");
  assert.equal(PF.levelFromName("Ground floor").key, "g");
  assert.equal(PF.levelFromName("Level 1").plannerName, "1st floor");
  assert.equal(PF.levelFromName("1st floor").driveName, "Level 1");
  assert.equal(PF.levelFromName("Level 2").plannerName, "2nd floor");
  assert.equal(PF.levelFromName("Level 3").plannerName, "3rd floor");
  assert.equal(PF.levelFromName("APT# FIRST FLOOR").key, "1");
  assert.equal(PF.levelFromName("APT# BASEMENT 1").key, "b");
  assert.equal(PF.levelFromName("Level B").driveName, "Level B");
  assert.equal(PF.levelFromName("Living room"), null);
});

test("apartment codes keep their level and drop the note", () => {
  assert.deepEqual(PF.apartmentFromName("B.11A"), { key: "b.11a", label: "B.11A", levelKey: "b", note: "" });
  assert.equal(PF.apartmentFromName("G.01 ").label, "G.01");
  assert.equal(PF.apartmentFromName("B.13A - rooftop vari").label, "B.13A");
  assert.equal(PF.apartmentFromName("B.13A - rooftop vari").note, "rooftop vari");
  assert.equal(PF.apartmentFromName("1.01").levelKey, "1");
  assert.equal(PF.apartmentFromName("2.11").key, "2.11");
  assert.equal(PF.apartmentFromName("14A").key, "14a");
  assert.equal(PF.apartmentFromName("14A").levelKey, null);
  assert.equal(PF.apartmentFromName("**MULTI"), null);
  assert.equal(PF.apartmentFromName("APT# GROUND FLOOR"), null);
  assert.equal(PF.apartmentFromName("LIVING ROOM UNIT 1 MODEL"), null);
});

test("a pasted apartment sheet yields one row per apartment", () => {
  const rows = PF.parseApartmentMatrix(SHEET);
  assert.equal(rows.length, 32);
  assert.equal(rows[0].label, "B.11A");
  assert.equal(rows.find((row) => row.label === "G.02").levelKey, "g");
  assert.equal(rows.filter((row) => row.levelKey === "1").length, 11);
  assert.equal(rows.some((row) => row.label === "**MULTI"), false);
  assert.deepEqual(PF.parseApartmentMatrix(SHEET).map((row) => row.key), rows.map((row) => row.key));
});

test("adding floors and apartments is idempotent and keeps an existing room", () => {
  const floors = [{ id: "fl-g", name: "Ground floor", order: 0 }];
  const rooms = [
    { id: "rm-14", floorId: "fl-g", name: "14A" },
    { id: "rm-13", floorId: "fl-g", name: "13A" }
  ];
  const wanted = PF.wantedFromTree([
    { name: "Level G", apartments: [{ name: "G.01" }, { name: "14A" }, { name: "G.01" }] },
    { name: "Level 1", apartments: [{ name: "1.01" }] },
    { name: "Level B", apartments: [{ name: "B.11A" }] }
  ]);
  const first = PF.planAdditions(floors, rooms, wanted);
  assert.deepEqual(first.floors.map((floor) => floor.name), ["1st floor", "Basement"]);
  assert.deepEqual(first.rooms.map((room) => room.name), ["G.01", "1.01", "B.11A"]);
  const nextFloors = floors.concat(first.floors.map((floor, i) => ({ id: "new-" + i, name: floor.name, order: floor.order })));
  const floorId = (key) => nextFloors.find((floor) => PF.levelFromName(floor.name).key === key).id;
  const nextRooms = rooms.concat(first.rooms.map((room, i) => ({ id: "nr-" + i, floorId: floorId(room.levelKey), name: room.name })));
  const second = PF.planAdditions(nextFloors, nextRooms, wanted);
  assert.deepEqual(second, { floors: [], rooms: [] });
});

test("drive folder names match what is already there", () => {
  const plan = PF.driveFolderPlan(
    [{ id: "fl-g", name: "Ground floor" }, { id: "fl-1", name: "1st floor" }, { id: "roof", name: "Roof plant" }],
    [{ floorId: "fl-g", name: "14A" }, { floorId: "fl-g", name: "G.01" }, { floorId: "fl-1", name: "1.01" }, { floorId: "roof", name: "Comms room" }]
  );
  assert.deepEqual(plan.map((level) => level.driveName), ["Level G", "Level 1"]);
  assert.deepEqual(plan[0].apartments.map((apt) => apt.label), ["14A", "G.01"]);
  const existing = [{ id: "a", name: "Level G", mimeType: PF.FOLDER_MIME }, { id: "b", name: "Notes.pdf", mimeType: "application/pdf" }];
  assert.equal(PF.matchLevelFolder(existing, "g").id, "a");
  assert.equal(PF.matchLevelFolder(existing, "1"), null);
  const apts = [{ id: "g01", name: "G.01 ", mimeType: PF.FOLDER_MIME }];
  assert.equal(PF.matchApartmentFolder(apts, "g.01").id, "g01");
  assert.equal(PF.matchApartmentFolder(apts, "g.02"), null);
});

test("photos group by level and apartment, including a file dropped straight into a level", () => {
  const folder = PF.FOLDER_MIME;
  const tree = PF.groupPhotoFiles(
    [
      { id: "lg", name: "Level G", mimeType: folder },
      { id: "loose-root", name: "site.jpg", mimeType: "image/jpeg" }
    ],
    {
      lg: [
        { id: "g01", name: "G.01", mimeType: folder },
        { id: "direct", name: "from-phone.heic", mimeType: "application/octet-stream" }
      ],
      g01: [{ id: "p1", name: "kitchen.jpg", mimeType: "image/jpeg" }]
    }
  );
  assert.equal(tree.levels.length, 1);
  assert.equal(tree.levels[0].levelKey, "g");
  assert.equal(tree.levels[0].apartments[0].photos[0].id, "p1");
  assert.equal(tree.levels[0].loose[0].id, "direct");
  assert.equal(tree.loose[0].id, "loose-root");
  assert.equal(PF.isPhotoFile({ name: "x.HEIC", mimeType: "" }), true);
  assert.equal(PF.isPhotoFile({ name: "plan.pdf", mimeType: "application/pdf" }), false);
});

test("folder links accept a Drive url or a bare id", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456";
  assert.equal(PF.parseDriveFolderId("https://drive.google.com/drive/folders/" + id + "?usp=sharing"), id);
  assert.equal(PF.parseDriveFolderId("https://drive.google.com/open?id=" + id), id);
  assert.equal(PF.parseDriveFolderId(id), id);
  assert.equal(PF.parseDriveFolderId("not a folder"), "");
});

test("the watermark uses apartment, room and the other attributes, and skips an empty node", () => {
  const full = PF.watermarkModel({
    apartment: "G.01", room: "Living", type: "photo", status: "In Progress",
    lineItem: "Indoor unit", notes: "Condensate pump on the left of the cupboard door frame"
  });
  assert.equal(full.lines[0], "G.01 · Living");
  assert.match(full.lines[1], /^Photo · In Progress · Indoor unit · Condensate pump/);
  assert.ok(full.lines[1].endsWith("…"));
  const same = PF.watermarkModel({ apartment: "14A", room: "14A", type: "marker", status: "Not Started" });
  assert.deepEqual(same.lines, ["14A", "Not Started"]);
  assert.equal(PF.watermarkModel({ apartment: "", room: "", type: "marker", status: "", notes: "" }), null);
  assert.equal(PF.watermarkModel({ room: "No room", type: "", status: "" }), null);
});
