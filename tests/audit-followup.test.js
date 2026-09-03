'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { SafeSecretStore, setPath, getPath } = require('../src/secret-store');
const { cueFingerprint, parseHlsSubtitleTracks } = require('../src/browser-subtitles');
const { CaptionAcquisitionPlan } = require('../src/browser-acquisition');
const { normalizeBrowserSession, readBrowserSession, writeBrowserSessionAtomic } = require('../src/browser-session-store');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test('silinen anahtar kasa kapalı/açık döngüsünde dirilmez; yeni anahtar başarıyla değişir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secret-regression-'));
  try {
    let available = true;
    const safeStorage = { isEncryptionAvailable: () => available,
      encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() };
    const store = new SafeSecretStore({ safeStorage, filePath: path.join(dir, 'vault.json') });
    assert(store.saveFromSettings({ translate: { apiKey: 'old-test-value' } }).ok);
    available = false;
    const cleared = store.saveFromSettings({ translate: { apiKey: '' } });
    assert(cleared.unavailable);
    const unrelated = store.saveFromSettings({ ...cleared.publicSettings, theme: 'dark' });
    assert(unrelated.ok);
    const failedReplacement = store.saveFromSettings({ ...unrelated.publicSettings, translate: { apiKey: 'new-test-value' } });
    available = true;
    assert.equal(store.withSecrets(failedReplacement.publicSettings).settings.translate.apiKey, undefined);
    const replacement = store.saveFromSettings({ ...failedReplacement.publicSettings, translate: { apiKey: 'new-test-value' } });
    assert(replacement.ok);
    assert.equal(store.withSecrets(replacement.publicSettings).settings.translate.apiKey, 'new-test-value');
    const exported = store.forExport({ ui: { translateApiKey: 'hidden', HF_TOKEN: 'hidden', theme: 'dark' }, nested: [{ client_secret: 'hidden' }] });
    assert(!JSON.stringify(exported).includes('hidden'));
    assert.equal(exported.ui.theme, 'dark');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('ayar yolu prototipi değiştirmez', () => {
  const obj = {};
  setPath(obj, '__proto__.polluted', true);
  setPath(obj, 'constructor.prototype.polluted', true);
  assert.equal({}.polluted, undefined);
  assert.equal(getPath(obj, '__proto__'), undefined);
});
test('boş ama dokunulmamış anahtar silme isteği sayılmaz', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const control = { value: '', dataset: {} };
  const context = { $: () => control };
  vm.createContext(context);
  const start = source.indexOf('function secretSettingValue(');
  vm.runInContext(source.slice(start, source.indexOf("document.addEventListener('change'", start)), context);
  assert.equal(context.secretSettingValue('key'), undefined);
  control.dataset.secretEdited = 'true';
  assert.equal(context.secretSettingValue('key'), '');
  control.value = ' test-value ';
  assert.equal(context.secretSettingValue('key'), 'test-value');
});
test('parmak izi ortadaki metni, bitişi ve milisaniyeyi kapsar', () => {
  const cues = Array.from({ length: 300 }, (_, i) => ({ start: i, end: i + .9, text: `satır ${i}` }));
  const original = cueFingerprint(cues);
  for (const change of [{ text: 'değişti' }, { end: 150.85 }, { start: 150.001 }]) {
    const changed = cues.map((cue) => ({ ...cue }));
    Object.assign(changed[150], change);
    assert.notEqual(cueFingerprint(changed), original);
  }
  assert.equal(cueFingerprint(JSON.parse(JSON.stringify(cues))), original);
});
test('edinme planı onay iptalini ve diğer çalışan yolların sonucunu yansıtır', () => {
  const plan = new CaptionAcquisitionPlan({ capabilities: { liveAsr: true, nativeTextTrack: true }, consent: { liveAsr: true } });
  assert(plan.start('live-asr'));
  plan.updateConsent({ liveAsr: false });
  assert.equal(plan.stage('live-asr').status, 'blocked');
  assert.equal(plan.finish('live-asr', { success: true }), false);
  plan.updateConsent({ liveAsr: true });
  assert(plan.start('live-asr'));
  assert(plan.start('native-text-track'));
  plan.finish('native-text-track', { success: true });
  assert.equal(plan.stage('live-asr').status, 'skipped');
  assert.equal(plan.finish('live-asr', { success: true }), false);
});
test('oturum sınırı aktif sekmeyi korur; bozuk şema yedeği, boş oturum kendini kullanır', () => {
  const tabs = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, url: `https://example.com/${i}` }));
  const normalized = normalizeBrowserSession({ tabs, activeTabId: 't29' });
  assert.equal(normalized.tabs.length, 24);
  assert.equal(normalized.activeTabId, 't29');
  for (const invalid of [null, [], {}, { tabs: {} }, { tabs: [{ url: 'javascript:evil()' }] }]) {
    const fakeFs = { readFileSync: (p) => JSON.stringify(p.endsWith('.bak') ? { tabs: tabs.slice(0, 1) } : invalid) };
    assert.equal(readBrowserSession('session.json', fakeFs).tabs[0].id, 't0');
  }
  assert.equal(readBrowserSession('session.json', { readFileSync: () => '{"tabs":[]}' }).tabs.length, 0);
});
test('yer imleri ve modal birlikte görünürken birini kapatmak webi açmaz', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const start = source.indexOf('function syncBrowserOcclusion()');
  let placesOpen = false;
  const calls = [];
  const context = { _activeModal: null,
    $: () => ({ classList: { contains: () => !placesOpen } }),
    window: { api: { setBrowserOccluded: (value) => { calls.push(value); return Promise.resolve(); } } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, source.indexOf('function openManagedModal(', start)), context);
  context.syncBrowserOcclusion();
  placesOpen = true; context.syncBrowserOcclusion();
  context._activeModal = {}; context.syncBrowserOcclusion();
  placesOpen = false; context.syncBrowserOcclusion();
  context._activeModal = null; context.syncBrowserOcclusion();
  assert.deepEqual(calls, [false, true, true, true, false]);
});
test('bozuk oturum üzerine yazma sağlam yedeği bozmaz', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-session-regression-'));
  try {
    const file = path.join(dir, 'session.json');
    fs.writeFileSync(file, '{}');
    const backup = JSON.stringify({ tabs: [{ id: 'old', url: 'https://example.com/old' }] });
    fs.writeFileSync(file + '.bak', backup);
    assert(writeBrowserSessionAtomic(file, { tabs: [] }).ok);
    assert.equal(fs.readFileSync(file + '.bak', 'utf8'), backup);
    assert.deepEqual(readBrowserSession(file).tabs, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('HLS zorunlu iz etiketi normal izden ayrılır ve imzalı URL değişmez', () => {
  const tracks = parseHlsSubtitleTracks('#EXTM3U\n'
    + '#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",LANGUAGE="en",FORCED=YES,URI="forced.m3u8?sig=keep"\n'
    + '#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",LANGUAGE="en",FORCED=NO,URI="full.m3u8"', 'https://example.com/master.m3u8');
  assert.equal(tracks[0].label, 'English (zorunlu)');
  assert.equal(tracks[0].forced, true);
  assert.equal(tracks[1].label, 'English');
  assert.equal(tracks[0].url, 'https://example.com/forced.m3u8?sig=keep');
});
console.log(`audit-followup: ${passed} test`);
