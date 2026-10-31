'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createBrowserSeriesContext } = require('../src/browser-series-context');
const root = path.resolve(__dirname, '..');
function temp(name) {
  const base = path.join(root, 'tmp', 'reports818-823');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, name + '-'));
}
test('series production feature to job snapshot to provider prompt respects target language', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'reports820-823', 'series.cjs')], {
    cwd: root, env: { ...process.env, AUDIT823_OUT: temp('series-provider') },
    encoding: 'utf8', windowsHide: true, timeout: 20000,
  });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
test('unknown-language legacy draft requires confirmation, stays on disk, and never becomes another target glossary', () => {
  const filePath = path.join(temp('series-legacy'), 'series.json');
  let store = createBrowserSeriesContext({ filePath });
  const media = 'https://series.example|episode';
  store.bindAndSave(media, 'Legacy Show', 'https://series.example', {
    synopsis: 'Legacy synopsis', addressStyle: 'Legacy style', terms: [{ source: 'Captain', target: 'Kaptan' }],
  });
  const before = fs.readFileSync(filePath, 'utf8');
  assert.equal(store.get(media, 'tr').legacyUnconfirmed, true);
  assert.equal(store.get(media, 'de').profile.terms[0].target, 'Kaptan', 'unknown draft must remain visible');
  assert.equal(store.translationContext(media, 'tr'), null);
  assert.equal(store.translationContext(media, 'de'), null);
  assert.equal(store.check(media, { targetLanguage: 'de' }).legacyUnconfirmed, true);
  assert.throws(() => store.save(media, store.get(media).profile, 'tr'), /açıkça onaylayın/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), before);
  store.save(media, store.get(media).profile, 'tr', { confirmLegacy: true });
  store = createBrowserSeriesContext({ filePath });
  assert.equal(store.translationContext(media, 'tr').terms[0].target, 'Kaptan');
  assert.equal(store.translationContext(media, 'de'), null);
  assert.equal(store.get(media).profile.terms[0].target, 'Kaptan', 'legacy profile remains unchanged');
  assert.throws(() => store.save(media, { terms: [] }, 'de', { confirmLegacy: false }), /onaylayın/);
  store.save(media, { terms: [{ source: 'Captain', target: 'Kapitän' }] }, 'de', { confirmLegacy: true });
  assert.equal(store.translationContext(media, 'tr').terms[0].target, 'Kaptan');
  assert.equal(store.translationContext(media, 'de').terms[0].target, 'Kapitän');
  for (let i = 0; i < 30; i++) store.save(media, {}, `en-${String(i).padStart(3, '0')}`, { confirmLegacy: true });
  assert.throws(() => store.save(media, {}, 'fr', { confirmLegacy: true }), /sınır/);
});
test('series UI refreshes language profiles and explicitly confirms unknown legacy draft', async () => {
  const { JSDOM } = require('jsdom');
  const ids = ['bfSeriesContext', 'bfContextSeries', 'bfContextStyle', 'bfContextSynopsis', 'bfContextTerms',
    'bfContextIssues', 'bfContextStatus', 'bfContextBind', 'bfContextSave', 'bfContextCheck'];
  const dom = new JSDOM('<select id="translateTo"><option value="tr">tr</option><option value="de">de</option></select>'
    + ids.map(id => `<${/Bind|Save|Check/.test(id) ? 'button' : 'textarea'} id="${id}"></${/Bind|Save|Check/.test(id) ? 'button' : 'textarea'}>`).join(''));
  const calls = [], intervals = [];
  let legacy = false, confirmed = false, confirmCalls = 0;
  dom.window.confirm = () => { confirmCalls++; return confirmed; };
  dom.window.api = { browserExtras: async payload => {
    calls.push(payload);
    return { ok: true, context: { seriesName: 'Show', legacyUnconfirmed: legacy,
      profile: { terms: legacy || payload.targetLanguage === 'tr' ? [{ source: 'Captain', target: 'Kaptan' }] : [] } } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/renderer/browser-series-context.js'), 'utf8'), {
    document: dom.window.document, window: dom.window, player: { workspaceMode: 'browser' },
    browserTabState: () => ({ id: 'tab', generation: 1, mediaId: 'episode' }), setInterval: fn => intervals.push(fn),
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  try {
    await flush();
    const field = id => dom.window.document.getElementById(id);
    assert.equal(field('bfContextTerms').value, 'Captain = Kaptan');
    field('translateTo').value = 'de'; intervals[0](); await flush();
    assert.equal(calls.at(-1).targetLanguage, 'de');
    assert.equal(field('bfContextTerms').value, '');
    field('translateTo').value = 'tr'; intervals[0](); await flush();
    assert.equal(field('bfContextTerms').value, 'Captain = Kaptan');
    legacy = true;
    field('translateTo').value = 'de'; intervals[0](); await flush();
    assert.match(field('bfContextStatus').textContent, /hedef dili bilinmiyor/);
    assert.equal(field('bfContextTerms').value, 'Captain = Kaptan');
    const saves = () => calls.filter(row => row.action === 'series-context:save');
    field('bfContextSave').click(); await flush();
    assert.equal(confirmCalls, 1); assert.equal(saves().length, 0);
    confirmed = true; field('bfContextSave').click(); await flush();
    assert.equal(confirmCalls, 2); assert.equal(saves().length, 1);
    assert.equal(saves()[0].confirmLegacy, true); assert.equal(saves()[0].targetLanguage, 'de');
  } finally { dom.window.close(); }
});
