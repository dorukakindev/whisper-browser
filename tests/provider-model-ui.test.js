'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

const checks = [
  ['model profile helper loads before renderer', html.indexOf('../provider-model-profiles.js') > -1
    && html.indexOf('../provider-model-profiles.js') < html.indexOf('renderer.js')],
  ['provider model controls exist', /id="translateSavedModel"/.test(html)
    && /id="translateAddModel"/.test(html) && /id="translateRemoveModel"/.test(html)],
  ['probe has accessible live result', /id="translateProbeStatus"[^>]+role="status"[^>]+aria-live="polite"/.test(html)],
  ['renderer persists provider model profiles', /modelProfiles:\s*providerModelProfilesValue\(\)/.test(renderer)],
  ['renderer invokes provider probe', /window\.api\.testTranslationProvider\(/.test(renderer)],
  ['preload exposes only the scoped probe IPC', /testTranslationProvider:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('translation:probe', payload\)/.test(preload)],
  ['main probe IPC checks sender authorization', /ipcMain\.handle\('translation:probe',[\s\S]{0,250}authorizedBrowserSender\(event\)/.test(main)],
];

for (const [name, value] of checks) {
  assert(value, name);
  console.log(`  PASS  ${name}`);
}
console.log(`\n${checks.length} provider model UI tests passed.`);
