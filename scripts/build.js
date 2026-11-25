'use strict';
// Bundles index.html + CSS + JS into one self-contained file: dist/nfa-dfa-simulator.html
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (_, f) => `<style>\n${read(f)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>\s*/g, '');
const js = ['utils', 'presets', 'core', 'graph', 'app'].map(n => read(`src/js/${n}.js`)).join('\n');
html = html.replace('</body>', () => `<script>\n${js}</script>\n</body>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'nfa-dfa-simulator.html');
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
