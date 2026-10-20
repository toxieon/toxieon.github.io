const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
// Exercise production functions in isolation without booting Google or touching
// real user data. Bounds include whole top-level declarations and dependencies.
// The Planner app is split into classic scripts under js/ (no bundler). loadPlannerSource()
// joins them in the order index.html loads them, so tests can keep reading "the app" as one source.
exports.plannerScripts = () => {
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const files = [...html.matchAll(/<script src="(js\/[\w-]+\.js)(?:\?v=[\d.]+)?"[^>]*><\/script>/g)].map(m => m[1]);
  if (!files.length) throw Error('No js/*.js scripts found in planner/index.html');
  return files;
};
exports.loadPlannerSource = () =>
  exports.plannerScripts().map(f => fs.readFileSync(path.join(__dirname,f),'utf8')).join('\n');
exports.section = (from,to) => {
  const source = exports.loadPlannerSource();
  const start = source.indexOf(from), end = source.indexOf(to,start);
  if (start < 0 || end < start) throw Error('Test source boundary missing');
  return source.slice(start,end);
};
exports.context = (source, globals) => {
  const ctx=vm.createContext({console, ...globals}); vm.runInContext(source,ctx); return ctx;
};
