const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
// Exercise production functions in isolation without booting Google or touching
// real user data. Bounds include whole top-level declarations and dependencies.
exports.section = (from,to) => {
  const source = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const start = source.indexOf(from), end = source.indexOf(to,start);
  if (start < 0 || end < start) throw Error('Test source boundary missing');
  return source.slice(start,end);
};
exports.context = (source, globals) => {
  const ctx=vm.createContext({console, ...globals}); vm.runInContext(source,ctx); return ctx;
};
