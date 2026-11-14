'use strict';
// Evaluates the REAL expressions found in src/renderer/podcast-library-ui.js (not a copy of them).
// Usage: node tests/podcast-duration-format.test.js            (project root = parent of tests/)
//        WB_ROOT=/path/to/root node tests/podcast-duration-format.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = process.env.WB_ROOT || path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/renderer/podcast-library-ui.js'), 'utf8');

function between(start, end, from = 0) {
  const i = src.indexOf(start, from);
  assert(i >= 0, 'source marker not found: ' + start);
  const j = src.indexOf(end, i + start.length);
  assert(j >= 0, 'source end marker not found: ' + end);
  return src.slice(i, j + end.length);
}
const numHelper = (src.match(/^\s*const num=.*;$/m) || [''])[0];            // exists only after the fix
const factsExpr = between("seconds>0?(hours>=1?", "):''");                     // episode-length fact
const rangeExpr = between("const time=row.timed?", "' s':row.timingUnverified").replace(/^const time=row.timed\?/, '').replace(/:row.timingUnverified$/, '');
const mbExpr = between("mb=n=>", "' MiB'");

function run(lang, code, vars = {}) {
  const ctx = { window: { UiLocale: { get: () => lang } }, Intl, Math, Number, String, ...vars };
  vm.createContext(ctx);
  vm.runInContext("const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;" + numHelper + ';', ctx);
  return vm.runInContext('(' + code + ')', ctx);
}
const facts = (lang, seconds) => run(lang, factsExpr, { seconds, hours: seconds / 3600 });
const range = (lang, a, b) => run(lang, rangeExpr.replace(/^row\.timed\?/, ''), { row: { seconds: a, end: b, timed: true } });
const mb = (lang, n) => run(lang, '(' + mbExpr.replace(/^mb=n=>/, 'n=>') + ')', {})(n);

let failed = 0;
function check(name, got, want) {
  try { assert.strictEqual(got, want); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n       got:  ' + JSON.stringify(got) + '\n       want: ' + JSON.stringify(want)); }
}
check('TR hours uses decimal comma', facts('tr', 15840), '4,4 saat');       // 4.4 h
check('EN hours uses decimal point', facts('en', 15840), '4.4 hours');
check('TR whole hours without ".0"', facts('tr', 18000), '5 saat');
check('EN exactly one hour is singular', facts('en', 3600), '1 hour');
check('TR minutes unchanged', facts('tr', 1380), '23 dk');
check('EN minutes unchanged', facts('en', 1380), '23 min');
check('very short total is not "0 dk"', facts('tr', 20), '1 dk');
check('TR timed range uses comma', range('tr', 3.25, 5.8), '3,3–5,8 s');
check('EN timed range uses point', range('en', 3.25, 5.8), '3.3–5.8 s');
check('TR storage MiB uses comma', mb('tr', 12.34 * 1048576), '12,3 MiB');
check('EN storage MiB uses point', mb('en', 12.34 * 1048576), '12.3 MiB');
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
