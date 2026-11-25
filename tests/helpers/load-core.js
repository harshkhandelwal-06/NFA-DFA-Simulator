'use strict';
// Loads the real simulator source (utils + presets + core) into Node so tests exercise the shipped code.
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../../src/js');
const src = ['utils.js', 'presets.js', 'core.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
module.exports = new Function(src + '\n;return {EPS,PRESETS,closure,move,sortSet,convert,buildDfa,minimize,runNFA,runDFA,runMin,LIMIT,fmt};')();
