const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function loadTS(file, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {};
  const requireMock = name => {
    if (!(name in dependencies)) throw new Error(`Missing mock: ${name}`);
    return dependencies[name];
  };
  // Keep plain-object prototypes in the Firebase SDK's realm.
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, requireMock, ...Object.values(globals));
  return exports;
}
module.exports = { loadTS };
