const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');

assert.match(renderer, /const LOG_LINE_LIMIT\s*=\s*500/,
  'log görünür satır üst sınırı korunmalı');
assert.match(renderer, /const LOG_LINE_RETAIN\s*=\s*450/,
  'budama her olayda tek satır silmek yerine pay bırakmalı');

const trim = renderer.slice(renderer.indexOf('function trimLogLines('),
  renderer.indexOf('function logLine('));
assert.match(trim, /document\.createRange\(\)/,
  'eski log satırları tek DOM Range işlemiyle topluca silinmeli');
assert.match(trim, /range\.deleteContents\(\)/,
  'toplu log budama işlemi uygulanmalı');
assert.doesNotMatch(trim, /removeChild|while\s*\(/,
  'log budama satır başına removeChild döngüsüne dönmemeli');

const nodes = Array.from({ length: 501 }, (_, index) => ({ index }));
let deleteCalls = 0;
let rangeEnd = null;
const context = {
  document: {
    createRange() {
      return {
        setStartBefore() {},
        setEndBefore(node) { rangeEnd = node; },
        deleteContents() {
          deleteCalls += 1;
          nodes.splice(0, nodes.indexOf(rangeEnd));
        },
      };
    },
  },
};
vm.createContext(context);
vm.runInContext(renderer.slice(renderer.indexOf('const LOG_LINE_LIMIT'),
  renderer.indexOf('function logLine(')), context);
const log = { children: nodes, get firstChild() { return nodes[0] || null; } };
context.trimLogLines(log);
assert.equal(nodes.length, 450, '501 satır tek budamada 450 satıra inmeli');
assert.equal(deleteCalls, 1, 'birikmiş satırlar tek DOM silme işlemiyle kaldırılmalı');

const logLine = renderer.slice(renderer.indexOf('function logLine('),
  renderer.indexOf("window.addEventListener('unhandledrejection'"));
assert.match(logLine, /trimLogLines\(log\)/,
  'logLine toplu budama yardımcısını çağırmalı');

console.log('renderer-log-trim: toplu DOM budama sözleşmesi geçti');
