'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
function fn(name) { const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm')); assert(start >= 0); return source.slice(start, source.indexOf('\n}', start) + 2); }
const page = new JSDOM('<button id="inputDir" type="button"></button>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = page.window; let copied, occlusions = 0;
w.$ = id => w.document.getElementById(id); w.interfaceChoice = (_, en) => en;
w.api = { copyText: async value => { copied = value; return true; } }; w.syncBrowserOcclusion = async () => { occlusions++; };
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
w.eval(fn('updateFolderPathDisplay') + '\n' + fn('showFolderPathDetails'));
(async () => {
  const fullPath = 'D:\\Very_long_parent_folder_'.repeat(6) + '\\FINAL_FOLDER';
  w.updateFolderPathDisplay('inputDir', fullPath);
  assert.equal(w.document.querySelector('.folder-path-leaf').textContent, 'FINAL_FOLDER');
  assert.equal(copied, undefined, 'Displaying a path must not copy or transmit it');
  await w.showFolderPathDetails('inputDir');
  const dialog = w.document.querySelector('dialog'); assert(dialog.open); assert.equal(dialog.querySelector('textarea').value, fullPath); assert(dialog.querySelector('textarea').readOnly);
  await dialog.querySelector('.btn-primary').onclick(); assert.equal(copied, fullPath, 'Only explicit Copy sends the unchanged full path to clipboard API');
  dialog.querySelector('.folder-path-actions button:last-child').click(); assert(!w.document.querySelector('dialog')); assert.equal(w.document.activeElement.id, 'inputDir'); assert.equal(occlusions, 2);
  console.log('report817-folder-path: tail, full detail, explicit copy, close and focus passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => w.close());
