'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('enhancing advanced tools retains live details, summary, IDs and existing handlers', () => {
  const dom = new JSDOM('<main><details id="tools"><summary>Altyazı <span id="count">2</span></summary><div class="bf-group-body"><button id="action">Çevir</button></div></details></main>', {runScripts:'outside-only'});
  const w = dom.window, doc = w.document;
  w.eval(fs.readFileSync(require.resolve('../src/renderer/player-ui-kit'), 'utf8'));
  const tools = doc.getElementById('tools'), summary = tools.querySelector('summary'), count = doc.getElementById('count'), action = doc.getElementById('action');
  let clicks = 0; action.addEventListener('click', () => clicks++);
  w.PlayerUiKit.enhanceControls(doc.querySelector('main'));
  w.PlayerUiKit.enhanceControls(doc.querySelector('main'));
  assert.equal(doc.getElementById('tools'), tools);
  assert.equal(tools.querySelector('summary'), summary);
  assert.equal(doc.getElementById('count'), count);
  assert.equal(tools.querySelector('#action'), action);
  assert.equal(tools.querySelectorAll('.mk-accordion-body').length, 1);
  action.click(); assert.equal(clicks, 1);
  summary.click(); assert.equal(tools.open, true);
  dom.window.close();
});
