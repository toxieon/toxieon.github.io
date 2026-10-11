// 0.4.2 — Copy timesheet: text-only clipboard write (no image overwrite).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./ts-clipboard.js");

function mockEnv(overrides) {
  const writeLog = [];
  const writeTextLog = [];
  const ClipboardItem = function (types) {
    this.types = types;
  };
  const env = {
    navigator: {
      clipboard: {
        writeText(text) {
          writeTextLog.push(text);
          return Promise.resolve();
        },
        write(items) {
          writeLog.push(items);
          const item = items[0];
          const types = item && item.types ? item.types : {};
          const keys = Object.keys(types);
          if (keys.length === 1 && keys[0] === "image/png") {
            return types["image/png"].then(() => {});
          }
          if (types["text/plain"]) return types["text/plain"].then(() => {});
          return Promise.resolve();
        }
      }
    },
    ClipboardItem,
    document: null,
    _writeLog: writeLog,
    _writeTextLog: writeTextLog
  };
  return Object.assign(env, overrides || {});
}

test("writeTimesheetText uses writeText once and never image-only clipboard.write", async () => {
  const env = mockEnv();
  const body = "Hi there,\n\nWEEKLY TIMESHEET";
  const r = C.writeTimesheetText(env, body);
  assert.equal(r.writes.writeText, 1);
  assert.equal(r.writes.write, 0);
  assert.equal(r.writes.imageOnlyWrite, 0);
  assert.deepEqual(env._writeTextLog, [body]);
  assert.equal(env._writeLog.length, 0);
  await r.promise;
});

test("writeTimesheetText without writeText uses a single text/plain ClipboardItem", async () => {
  const env = mockEnv();
  delete env.navigator.clipboard.writeText;
  const text = "plain export";
  const r = C.writeTimesheetText(env, text);
  assert.equal(r.writes.writeText, 0);
  assert.equal(r.writes.write, 1);
  assert.equal(r.writes.imageOnlyWrite, 0);
  assert.equal(env._writeLog.length, 1);
  const types = env._writeLog[0][0].types;
  assert.ok(types["text/plain"]);
  assert.equal(types["image/png"], undefined);
  const blob = await types["text/plain"];
  assert.equal(blob.type, "text/plain");
  const read = await blob.text();
  assert.equal(read, text);
  await r.promise;
});

test("copy timesheet path never performs a second image-only write after text", async () => {
  const env = mockEnv();
  const text = "timesheet body";
  const timesheet = C.writeTimesheetText(env, text);
  await timesheet.promise;
  assert.equal(env._writeTextLog.length, 1);
  assert.equal(env._writeLog.length, 0);
  const map = C.writeMapImage(env, Promise.resolve(new Blob(["png"], { type: "image/png" })));
  assert.equal(map.writes.imageOnlyWrite, 1);
  await map.promise;
  assert.equal(env._writeTextLog.length, 1, "text write count unchanged after map copy");
});
