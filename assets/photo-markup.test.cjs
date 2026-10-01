'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { model, isSupported } = require('./photo-markup.js');

const arrow = { type: 'arrow', color: '#ffde59', width: 6, fontSize: 32, points: [{ x: 10, y: 20 }, { x: 300, y: 240 }] };

test('working image preserves aspect ratio, bounds resolution, and never enlarges a source', () => {
  assert.deepEqual(model.fitSize(6000, 4000), { width: 2560, height: 1707 });
  assert.deepEqual(model.fitSize(1200, 2400), { width: 1200, height: 2400 });
  assert.deepEqual(model.fitSize(800, 600, 10000), { width: 800, height: 600 });
  assert.deepEqual(model.fitSize(10000, 20000, 10000), { width: 2048, height: 4096 });
  assert.deepEqual(model.fitSize(1, 100000), { width: 1, height: 2560 });
  assert.throws(() => model.fitSize(0, 600), /dimensions/);
  assert.throws(() => model.fitSize(600, Infinity), /dimensions/);
});

test('drawing points stay on the image and reversed drags produce a valid redaction box', () => {
  assert.deepEqual(model.point(-20, 900, 800, 600), { x: 0, y: 600 });
  assert.deepEqual(model.bounds({ x: 300, y: 200 }, { x: 20, y: 50 }), { x: 20, y: 50, width: 280, height: 150 });
});

test('undo and redo restore full annotations, including destructive clear', () => {
  const history = model.createHistory();
  assert.equal(history.undo(), false);
  assert.equal(history.canUndo(), false);
  history.add(arrow);
  history.add({ ...arrow, type: 'redact', color: '#000000' });
  history.clear();
  assert.deepEqual(history.items(), []);
  assert.equal(history.undo(), true);
  assert.equal(history.items().length, 2);
  assert.equal(history.items()[1].type, 'redact');
  history.undo();
  assert.deepEqual(history.items(), [arrow]);
  history.redo();
  history.redo();
  assert.deepEqual(history.items(), []);
  assert.equal(history.redo(), false);
});

test('new drawing after undo discards the redo branch', () => {
  const history = model.createHistory();
  history.add(arrow);
  history.add({ ...arrow, type: 'rectangle' });
  history.undo();
  history.add({ ...arrow, type: 'circle' });
  assert.equal(history.canRedo(), false);
  assert.deepEqual(history.items().map(item => item.type), ['arrow', 'circle']);
});

test('history snapshots and exported metadata cannot mutate an earlier annotation', () => {
  const history = model.createHistory();
  const input = structuredClone(arrow);
  history.add(input);
  input.points[0].x = 999;
  const inspection = history.items();
  inspection[0].points[1].x = 999;
  const metadata = model.documentData(800, 600, history.items());
  const roundTrip = JSON.parse(JSON.stringify(metadata));
  assert.equal(roundTrip.schemaVersion, 1);
  assert.equal(roundTrip.width, 800);
  assert.equal(roundTrip.height, 600);
  assert.deepEqual(roundTrip.items, [arrow]);
  metadata.items[0].points[0].x = 999;
  assert.deepEqual(history.items(), [arrow]);
});

test('measurement labels remain supplied text and round trip without evaluating markup', () => {
  const history = model.createHistory();
  const text = '2.4 m <script>alert(1)</script>';
  history.add({ ...arrow, type: 'measure', text });
  const metadata = model.documentData(800, 600, history.items());
  assert.equal(JSON.parse(JSON.stringify(metadata)).items[0].text, text);
  assert.equal('calculatedDistance' in metadata.items[0], false);
});

test('history bounds undo snapshots and rejects unknown tools', () => {
  const history = model.createHistory();
  assert.throws(() => history.add({ type: 'unknown' }), /Unknown/);
  for (let i = 0; i < 110; i++) history.add({ ...arrow, text: String(i) });
  let count = 0;
  while (history.undo()) count++;
  assert.equal(count, 100);
  assert.equal(history.items().length, 10);
});

test('download names avoid paths and reserved filename characters', () => {
  assert.equal(model.filename('C:\\photos\\Board 4.JPG'), 'Board 4-annotated.png');
  assert.equal(model.filename('room <2>:west?.png'), 'room -2--west--annotated.png');
  assert.equal(model.filename(''), 'site-photo-annotated.png');
  assert.equal(isSupported(), false);
});
