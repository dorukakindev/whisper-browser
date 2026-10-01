// R334 kapanış — src/ altında export edilmiş fonksiyon adı hâlâ kilitsiz kalan
// son grup (sabitler hariç — sabitler davranış üzerinden zaten dolaylı kilitli).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const adblock = require('../src/browser-adblock');
const adapters = require('../src/browser-adapters');
const noteStore = require('../src/browser-note-store');
const privacy = require('../src/browser-session-privacy');
const archive = require('../src/browser-translation-archive');
const modelMgr = require('../src/model-manager');
const layout = require('../src/subtitle-sentence-layout');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, 'PASS']); }
  catch (e) { results.push([name, `FAIL ${e.message}`]); console.log('FAIL', name, e); }
}

async function t_adblock_helpers() {
  // safeBlockedUrl: userinfo/query/hash sıyrılır, sadece http/https
  assert.strictEqual(adblock.safeBlockedUrl('https://u:p@x.com/a?k=v#h'), 'https://x.com/a');
  assert.strictEqual(adblock.safeBlockedUrl('javascript:alert(1)'), '');
  assert.strictEqual(adblock.safeBlockedUrl('değil url'), '');
  // blockedRequestEntry: subtitleLike sınıflandırması
  const e1 = adblock.blockedRequestEntry({ url: 'https://x.com/captions.vtt?sig=1', type: 'texttrack' }, { filter: { getFilter: () => '||x.com^' } }, 1000);
  assert.strictEqual(e1.subtitleLike, true);
  assert.strictEqual(e1.at, 1000);
  assert.strictEqual(e1.url.includes('sig'), false);
  const e2 = adblock.blockedRequestEntry({ url: 'https://x.com/ad.js', type: 'script' }, null, 1000);
  assert.strictEqual(e2.subtitleLike, false);
  assert.strictEqual(e2.rule, '');
  // safeErrorMessage
  assert.strictEqual(adblock.safeErrorMessage(new Error('a\nb')), 'a b');
  assert.strictEqual(adblock.safeErrorMessage(null), 'Bilinmeyen hata');
  // fetchWithTimeout: abort sinyali sağlanır
  let gotSignal;
  // gerçek fetch gibi sinyali dinleyen stub
  const slow = adblock.fetchWithTimeout((url, opts) => {
    gotSignal = opts.signal;
    return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(opts.signal.reason)));
  }, 20);
  await assert.rejects(() => slow('https://x'), /zaman aşımı/);
  assert.strictEqual(gotSignal.aborted, true);
  // sinyal gelmeden çözülen hızlı fetch sonucu geçer
  const fast = adblock.fetchWithTimeout(async () => 'ok', 1000);
  assert.strictEqual(await fast('https://x'), 'ok');
  // read/writeEngineCache gerçek disk
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-adb-'));
  const cache = path.join(dir, 'nested', 'engine.bin');
  const fsP = fs.promises;
  await adblock.writeEngineCache(cache, Buffer.from([1, 2, 3]), fsP);
  const got = await adblock.readEngineCache(cache, fsP, Date.now());
  assert.deepStrictEqual([...got.buffer], [1, 2, 3]);
  assert.strictEqual(typeof got.ageMs, 'number');
  assert.strictEqual(await adblock.readEngineCache(path.join(dir, 'yok'), fsP), null);
  assert.strictEqual(await adblock.readEngineCache(dir, fsP), null, 'dizin → null');
  const big = path.join(dir, 'big');
  fs.writeFileSync(big, Buffer.alloc(adblock.MAX_CACHE_BYTES + 1));
  assert.strictEqual(await adblock.readEngineCache(big, fsP), null, 'MAX_CACHE_BYTES üstü → null');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function t_adapter_hostname() {
  assert.strictEqual(adapters.hostnameOf('https://WWW.X.com:443/a'), 'www.x.com');
  assert.strictEqual(adapters.hostnameOf('not-a-url'), '');
  assert.strictEqual(adapters.hostnameOf(''), '');
}

async function t_note_store_alias() {
  const n = noteStore.normalizeStoredAnnotation({
    media_id: 'm1', screenshot_ref: 's.png', audio_ref: 'a.wav',
    created_at: 100, updated_at: 200,
    mediaTitle: ' Başlık ', service: 'youtube', url: 'https://x/v',
  });
  assert.strictEqual(n.mediaId, 'm1');
  assert.strictEqual(n.screenshotRef, 's.png');
  assert.strictEqual(n.audioRef, 'a.wav');
  assert.strictEqual(n.mediaType, 'youtube');
  assert.strictEqual(n.mediaUrl, 'https://x/v');
  const over = noteStore.normalizeStoredAnnotation({ mediaTitle: 'x'.repeat(600) });
  assert.strictEqual(over.mediaTitle.length, 500);
}

async function t_session_privacy_close() {
  await assert.rejects(() => privacy.closeBrowserSessionConnections(null), /kapatılamıyor/);
  await assert.rejects(() => privacy.closeBrowserSessionConnections({}), /kapatılamıyor/);
  let called = 0;
  await privacy.closeBrowserSessionConnections({ closeAllConnections: async () => { called++; } });
  assert.strictEqual(called, 1);
}

async function t_archive_rows() {
  const rows = archive.normalizePageRows(
    [{ id: 'b2', text: ' ikinci ', order: 5 }, { id: 'b1', text: 'birinci', order: 1 }, { id: '', text: 'id yok', order: 0 }],
    { b1: 'bir', b2: 'iki' });
  assert.strictEqual(rows.length, 2, 'çeviri/eksik alan elenir');
  assert.strictEqual(rows[0].id, 'b1', 'order sıralaması');
  assert.strictEqual(rows[0].translation, 'bir');
  // Map benzeri blocks + translations
  const rows2 = archive.normalizePageRows(new Map([['x', { id: 'x', text: 't' }]]), new Map([['x', 'çev']]));
  assert.strictEqual(rows2.length, 1);
}

async function t_model_manager() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-mm2-'));
  // hasModelFiles: config.json + model.bin + (tokenizer|vocabulary)
  const repo = path.join(dir, 'models--x--large-v3');
  fs.mkdirSync(repo, { recursive: true });
  assert.strictEqual(modelMgr.hasModelFiles(repo), false);
  fs.writeFileSync(path.join(repo, 'config.json'), '{}');
  fs.writeFileSync(path.join(repo, 'model.bin'), 'x');
  assert.strictEqual(modelMgr.hasModelFiles(repo), false, 'tokenizer/vocabulary eksik');
  fs.writeFileSync(path.join(repo, 'vocabulary.txt'), 'x');
  assert.strictEqual(modelMgr.hasModelFiles(repo), true);
  // snapshots/ içi de sayılır
  const repo2 = path.join(dir, 'models--y--tiny');
  const snap = path.join(repo2, 'snapshots', 'abc');
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(path.join(snap, 'config.json'), '{}');
  fs.writeFileSync(path.join(snap, 'model.bin'), 'x');
  fs.writeFileSync(path.join(snap, 'tokenizer.json'), '{}');
  assert.strictEqual(modelMgr.hasModelFiles(repo2), false, 'doğrudan dosya yok');
  assert.strictEqual(modelMgr.repositoryHasUsableSnapshot(repo2), true, 'snapshot içi sayılır');
  assert.strictEqual(modelMgr.repositoryHasUsableSnapshot(path.join(dir, 'yok')), false);
  // findModelRepository: bilinmeyen model → null; bilinen + kök → repo
  assert.strictEqual(modelMgr.findModelRepository('/x', 'unknown-model', {}), null);
  const found = modelMgr.findModelRepository(dir, 'large-v3', { HUGGINGFACE_HUB_CACHE: dir });
  assert.ok(found && found.repo.path === repo, 'large-v3 kökten bulunur');
  assert.strictEqual(modelMgr.findModelRepository(dir, 'tiny', { HUGGINGFACE_HUB_CACHE: dir }).repo.path, repo2);
  assert.strictEqual(modelMgr.findModelRepository(dir, 'large-v3-turbo', { HUGGINGFACE_HUB_CACHE: dir }), null,
    'turbo adı large-v3 ile eşleşmez');
  fs.rmSync(dir, { recursive: true, force: true });
}

async function t_speaker_label() {
  assert.strictEqual(layout.hasSpeakerLabel('NARRATOR: Merhaba'), true);
  assert.strictEqual(layout.hasSpeakerLabel('John: Ne diyorsun?'), true);
  assert.strictEqual(layout.hasSpeakerLabel('Not: bu bir not'), false, 'yapısal etiket konuşmacı değil');
  assert.strictEqual(layout.hasSpeakerLabel('Soru 3: cevap'), false);
  assert.strictEqual(layout.hasSpeakerLabel('Nokta. İkinci cümle: x'), false);
  assert.strictEqual(layout.hasSpeakerLabel('plain sentence without colon'), false);
  assert.strictEqual(layout.hasSpeakerLabel(''), false);
}

async function main() {
  await t('t_adblock_helpers', t_adblock_helpers);
  await t('t_adapter_hostname', t_adapter_hostname);
  await t('t_note_store_alias', t_note_store_alias);
  await t('t_session_privacy_close', t_session_privacy_close);
  await t('t_archive_rows', t_archive_rows);
  await t('t_model_manager', t_model_manager);
  await t('t_speaker_label', t_speaker_label);
  const failed = results.filter(([, s]) => s !== 'PASS');
  console.log(`export-closure-deadzone: ${results.length - failed.length} senaryo geçti`);
  if (failed.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
