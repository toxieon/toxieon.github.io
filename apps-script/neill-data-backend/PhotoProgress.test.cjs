/* Photo progress — pure format / stage grouping (PhotoProgress.gs helpers). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({
  console, JSON, Math, Object, String, Number, Array, Date, RegExp,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: () => null
    })
  },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dt = new Date(d);
      const day = dt.getUTCDate();
      const mon = months[dt.getUTCMonth()];
      const yr = dt.getUTCFullYear();
      return `${day} ${mon} ${yr} 3:30 pm`;
    }
  },
  DriveApp: {},
  SpreadsheetApp: {},
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }), deleteTrigger() {} }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'PhotoProgress.gs'), 'utf8'), ctx, { filename: 'PhotoProgress.gs' });

const stages = ctx.ppDefaultStages_();

function img(name) {
  return { name: name || 'p.jpg', mimeType: 'image/jpeg' };
}

function tree(name, files, folders) {
  return { name: name || '', files: files || [], folders: folders || [] };
}

test('stage folder names match case- and punctuation-insensitively', () => {
  assert.equal(ctx.ppMatchStageKey_('Rough-in', stages), 'roughIn');
  assert.equal(ctx.ppMatchStageKey_('ROUGH IN', stages), 'roughIn');
  assert.equal(ctx.ppMatchStageKey_('rough in', stages), 'roughIn');
  assert.equal(ctx.ppMatchStageKey_('Fitoff', stages), 'fitOff');
  assert.equal(ctx.ppMatchStageKey_('Fit off', stages), 'fitOff');
  assert.equal(ctx.ppMatchStageKey_('Kitchen', stages), '');
});

test('counts photos by stage and unsorted', () => {
  const apt2 = tree('1.01', [img(), img()], [
    tree('Rough-in', [img(), img(), img(), img()], []),
    tree('Fit-off', [], []),
    tree('Misc', [img()], [])
  ]);
  const counts = ctx.ppCountPhotosInTree_(apt2, stages);
  assert.equal(counts.roughIn, 4);
  assert.equal(counts.fitOff, 0);
  assert.equal(counts.unsorted, 3);
  assert.equal(counts.total, 7);
});

test('stage names only on direct apartment subfolders', () => {
  const apt = tree('1.01', [], [
    tree('Misc', [], [tree('rough in', [img()], [])])
  ]);
  const counts = ctx.ppCountPhotosInTree_(apt, stages);
  assert.equal(counts.roughIn, 0);
  assert.equal(counts.unsorted, 1);
});

test('nested photos inside stage folder count toward that stage', () => {
  const apt = tree('G.01', [], [
    tree('rough in', [], [tree('batch', [img(), img()], [])])
  ]);
  const counts = ctx.ppCountPhotosInTree_(apt, stages);
  assert.equal(counts.roughIn, 2);
  assert.equal(counts.unsorted, 0);
});

test('report title uses root folder name plus Photo progress only', () => {
  const levels = [{
    levelKey: '1',
    levelName: 'Level 1',
    apartments: [
      { label: '1.01', counts: { roughIn: 1, fitOff: 0, unsorted: 0, total: 1 } },
      { label: '1.02', counts: { roughIn: 0, fitOff: 0, unsorted: 0, total: 0 } }
    ]
  }];
  const text = ctx.ppFormatReport_('Sample Site Photos', levels, stages, '1 Jan 2026 9:00 am Melbourne');
  assert.match(text, /^Sample Site Photos Photo progress/);
  assert.doesNotMatch(text, /Neill/i);
  assert.match(text, /1 of 2 have any photos \(50%\)/);
  assert.match(text, /Rough-in: 1\/2/);
  assert.match(text, /Fit-off: 0\/2/);
  assert.match(text, /1\.01  Rough-in 1 · Fit-off 0 · Unsorted 0/);
  assert.match(text, /1\.02  MISSING/);
  assert.match(text, /MISSING \(no photos\):/);
  assert.match(text, /  1\.02/);
  assert.match(text, /MISSING Rough-in:/);
  assert.match(text, /  1\.02/);
  assert.match(text, /MISSING Fit-off:/);
});

test('levels sort B before G before numbers', () => {
  const levels = [
    { levelKey: '2', levelName: 'Level 2', apartments: [{ label: '2.01', counts: { roughIn: 0, fitOff: 0, unsorted: 1, total: 1 } }] },
    { levelKey: 'b', levelName: 'Level B', apartments: [{ label: 'B.11A', counts: { roughIn: 0, fitOff: 0, unsorted: 0, total: 0 } }] },
    { levelKey: 'g', levelName: 'Level G', apartments: [{ label: 'G.01', counts: { roughIn: 0, fitOff: 0, unsorted: 0, total: 0 } }] },
    { levelKey: '1', levelName: 'Level 1', apartments: [{ label: '1.01', counts: { roughIn: 0, fitOff: 0, unsorted: 0, total: 0 } }] }
  ];
  const text = ctx.ppFormatReport_('Site', levels, stages, 't Melbourne');
  const bPos = text.indexOf('— Level B —');
  const gPos = text.indexOf('— Level G —');
  const onePos = text.indexOf('— Level 1 —');
  const twoPos = text.indexOf('— Level 2 —');
  assert.ok(bPos < gPos && gPos < onePos && onePos < twoPos);
});

test('custom stages from job config', () => {
  const custom = [{ key: 'demo', label: 'Demo', match: ['demo walk'] }];
  const apt = tree('1.01', [], [tree('Demo Walk', [img()], [])]);
  const counts = ctx.ppCountPhotosInTree_(apt, custom);
  assert.equal(counts.demo, 1);
  const merged = ctx.ppStagesForJob_({ stages: custom });
  assert.equal(merged[0].label, 'Demo');
});

test('apartment codes parse from folder names', () => {
  assert.equal(ctx.ppApartmentFromName_('B.11A').label, 'B.11A');
  assert.equal(ctx.ppApartmentFromName_('1.01').levelKey, '1');
  assert.equal(ctx.ppApartmentFromName_('APT# GROUND'), null);
});

test('standalone: property keys work without Config PROP', () => {
  assert.equal(ctx.ppJobsPropertyKey_(), 'PHOTO_PROGRESS_JOBS');
  assert.equal(ctx.ppPlannerMasterPropertyKey_(), 'PHOTO_PROGRESS_PLANNER_MASTER_SHEET_ID');
});

test('standalone: reads PHOTO_PROGRESS_JOBS from Script Properties', () => {
  const soloCtx = vm.createContext({
    console, JSON, Math, Object, String, Number, Array, Date, RegExp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'PHOTO_PROGRESS_JOBS' ? '[{"rootFolderId":"r","reportFileId":"t"}]' : null)
      })
    },
    Utilities: { formatDate: () => '1 Jan 2026' },
    DriveApp: {}, SpreadsheetApp: {}, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }), deleteTrigger() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'PhotoProgress.gs'), 'utf8'), soloCtx, { filename: 'PhotoProgress.gs' });
  const jobs = soloCtx.ppResolveJobList_();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].rootFolderId, 'r');
  assert.equal(jobs[0].reportFileId, 't');
});