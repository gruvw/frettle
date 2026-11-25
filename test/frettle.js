/* Frettle's script for the tests: its four parts (web/, as index.html
   loads them), run in the same order into one scope, as a browser runs
   them (a part needing at load what a later one makes fails here too),
   without a page. What app.js exports for Node. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PARTS = ['music.js', 'state.js', 'sound.js', 'app.js'];
const exported = { exports: {} };
globalThis.module = exported;   // (what app.js exports into, as Node gives a file)
try {
  for (const part of PARTS) {
    const file = path.join(__dirname, '..', 'web', part);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
} finally {
  delete globalThis.module;
}
module.exports = exported.exports;
