/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTS(file, mocks = {}) {
    const filename = path.resolve(__dirname, '..', file);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const realRequire = loaded.require.bind(loaded);
    loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name);
    loaded._compile(compiled, filename);
    return loaded.exports;
}

module.exports = { loadTS };
