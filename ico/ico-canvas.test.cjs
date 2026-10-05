// node --test ico/ico-canvas.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const NDIco = require("./ico-canvas.js");

test("initials and filenames match ico/generate.py", () => {
  assert.equal(NDIco.initials("TipBot"), "TB");
  assert.equal(NDIco.initials("Neill Data"), "ND");
  assert.equal(NDIco.initials("Neill Data Suite"), "NDS");
  assert.equal(NDIco.initials("planner"), "Pl");
  assert.equal(NDIco.safeFilename("TipBot", "0.45.1"), "TipBot-0.45.1.ico");
  assert.equal(NDIco.safeFilename("Neill Data", "0.19.1"), "Neill-Data-0.19.1.ico");
  assert.equal(NDIco.safeFilename('../"evil"\r\n', "1"), "evil-1.ico");
});

test("spec defaults and validation", () => {
  const s = NDIco.makeSpec({ name: " Neill Data Suite ", version: "0.19.1" });
  assert.deepEqual(s.bg, [0x0b, 0x1f, 0x3a]);
  assert.deepEqual(s.fg, [255, 255, 255]);
  assert.deepEqual(s.sizes, [16, 32, 48, 256]);
  assert.equal(s.short, "NDS");
  assert.equal(s.tiny, "ND");
  assert.throws(() => NDIco.makeSpec({ name: "", version: "1" }));
  assert.throws(() => NDIco.makeSpec({ name: "A", version: "1", bg: "red" }));
  assert.throws(() => NDIco.makeSpec({ name: "A".repeat(41), version: "1" }));
});

test("packIco writes a valid ICONDIR with PNG frames", () => {
  const png = (n) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...new Array(n).fill(7)]);
  const out = NDIco.packIco([{ size: 256, png: png(10) }, { size: 16, png: png(3) }, { size: 32, png: png(5) }]);
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint16(0, true), 0);
  assert.equal(dv.getUint16(2, true), 1);
  assert.equal(dv.getUint16(4, true), 3);
  const entries = [0, 1, 2].map((i) => ({ w: out[6 + 16 * i], len: dv.getUint32(14 + 16 * i, true), off: dv.getUint32(18 + 16 * i, true) }));
  assert.deepEqual(entries.map((e) => e.w), [16, 32, 0]);
  assert.equal(entries[0].off, 6 + 48);
  entries.forEach((e) => assert.deepEqual([...out.slice(e.off, e.off + 4)], [0x89, 0x50, 0x4e, 0x47]));
  assert.equal(out.length, 6 + 48 + 7 + 9 + 14);
  assert.throws(() => NDIco.packIco([{ size: 512, png: png(1) }]));
});
