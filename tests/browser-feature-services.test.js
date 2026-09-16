'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-feature-service-'));
const mediaToolsPath = require.resolve('../src/browser-media-tools');
const originalTools = require.cache[mediaToolsPath];
let aborted = false;
require.cache[mediaToolsPath] = { id: mediaToolsPath, filename: mediaToolsPath, loaded: true,
  exports: { createBrowserMediaTools: () => ({ semanticSearch: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('İptal edildi.')); }, { once: true });
  }) }) } };
const { registerBrowserFeatureServices } = require('../src/browser-feature-services');

const handlers = new Map();
const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };
const wc = { isDestroyed: () => false, getURL: () => 'https://video.test/watch/one' };
const tab = { id: 'tab-1', view: { webContents: wc }, mediaId: 'media-1', closing: false,
  assFrame: { executeJavaScript() { throw new Error('ASS temizlenmemeliydi.'); } } };
const encodingFixture = path.join(temp, 'encoding.srt');
fs.writeFileSync(encodingFixture, '1\n00:00:00,000 --> 00:00:01,000\nMerhaba\n', 'utf8');
let generation = 1;
const service = registerBrowserFeatureServices({
  app: { getPath: kind => kind === 'userData' ? temp : os.tmpdir() }, ipcMain,
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [encodingFixture] }) },
  BrowserWindow: class {}, owner: () => ({ isDestroyed: () => false }),
  getTab: id => id === tab.id ? tab : null, activeTab: () => tab,
  context: () => ({ generation, mediaId: tab.mediaId }),
  authorized: event => event.sender === 'trusted',
  frames: () => [], probeScript: () => '', rankCandidates: () => [], commandScript: () => '',
  pythonPath: () => '', ffmpegPath: () => '', ffprobePath: () => '',
  grantSubtitle: () => true,
});
const handler = handlers.get('browser:extras');
const request = (action, extra = {}, event = { sender: 'trusted' }) => handler(event,
  { action, tabId: tab.id, generation, mediaId: tab.mediaId, ...extra });

async function run() {
  const unauthorized = await request('skip-list', {}, { sender: 'other' });
  assert.equal(unauthorized.ok, false);
  assert.equal(fs.existsSync(path.join(temp, 'browser-skip-segments.json')), false);
  assert.equal((await request('skip-list', { generation: 0 })).stale, true);
  assert.equal((await request('skip-list', { mediaId: 'old-media' })).stale, true);
  assert.equal((await request('skip-list', { tabId: 'wrong-tab' })).stale, true);

  const saved = await request('skip-save', { record: { id: 'intro-1', kind: 'intro',
    start: 10, end: 40 } });
  assert.equal(saved.ok, true);
  assert.equal(saved.records[0].autoSkip, false);
  const onDisk = JSON.parse(fs.readFileSync(path.join(temp, 'browser-skip-segments.json'), 'utf8'));
  assert.equal(onDisk.records[0].autoSkip, false);
  const invalid = await request('skip-save', { seriesName: 'Yeni Dizi',
    record: { kind: 'intro', scope: 'series', start: 40, end: 10 } });
  assert.equal(invalid.ok, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp, 'browser-skip-segments.json'), 'utf8')).series,
    {}, 'Geçersiz kayıt dizi eşlemesini kalıcılaştırmamalı.');
  service.cancel(tab, false);
  assert.notEqual(tab.assFrame, null, 'Kullanıcı iptali ASS görünümünü korumalı.');
  const running = request('semantic-search', { query: 'test', cues: [] });
  await Promise.resolve();
  assert.equal((await request('cancel')).ok, true);
  assert.equal((await running).ok, false);
  assert.equal(aborted, true);
  assert.notEqual(tab.assFrame, null, 'İptal ASS görünümünü silmemeli.');

  tab.mediaId = 'media-2';
  wc.getURL = () => 'https://video.test/watch/two';
  const otherList = await request('skip-list');
  assert.equal(otherList.ok, true);
  assert.deepEqual(otherList.records, [], 'Başka medyanın kayıtları listelenmemeli.');
  const overwrite = await request('skip-save', { record: { id: 'intro-1', kind: 'recap',
    start: 1, end: 5 } });
  assert.equal(overwrite.ok, false, 'Başka medya kaydı aynı id ile ezilememeli.');
  const deniedDelete = await request('skip-delete', { id: 'intro-1' });
  assert.equal(deniedDelete.ok, false);
  const encoding = await request('encoding-preview');
  assert.equal(encoding.ok, true, encoding.error);
  assert.equal((await request('encoding-apply', {
    token: 'yanlis-token', encoding: 'utf-8',
  })).ok, false);
  const appliedEncoding = await request('encoding-apply', {
    token: encoding.token, encoding: 'utf-8',
  });
  assert.equal(appliedEncoding.ok, true, appliedEncoding.error);
  assert.equal((await request('encoding-apply', {
    token: encoding.token, encoding: 'utf-8',
  })).ok, false, 'Tüketilmiş kodlama önizlemesi yeniden uygulandı');
  const realNow = Date.now;
  try {
    let now = 2_000_000;
    Date.now = () => now;
    const expiring = await request('encoding-preview');
    now += 900001;
    assert.equal((await request('encoding-apply', {
      token: expiring.token, encoding: 'utf-8',
    })).ok, false, 'Süresi dolmuş kodlama önizlemesi uygulandı');
  } finally { Date.now = realNow; }
  console.log('browser-feature-services: ok');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (originalTools) require.cache[mediaToolsPath] = originalTools;
  else delete require.cache[mediaToolsPath];
  fs.rmSync(temp, { recursive: true, force: true });
});
