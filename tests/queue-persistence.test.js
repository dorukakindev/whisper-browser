'use strict';

const assert = require('assert');
const {
  clonePublicOptions,
  MAX_QUEUE_OPTIONS_BYTES,
  validateQueueOptions,
  mergeQueueSnapshotForSave,
  normalizeQueueSnapshot,
  queueSnapshotForDisk,
  updateQueueSnapshotRunning,
  updateQueueSnapshotTerminal,
} = require('../src/queue-persistence');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

test('büyük ayarlar boş varsayılana dönüşmez, snapshot reddedilir', () => {
  const opts = { glossary: 'ğ'.repeat(MAX_QUEUE_OPTIONS_BYTES / 2) };
  assert.equal(clonePublicOptions(opts), null);
  assert.equal(validateQueueOptions({ items: [{ opts }] }).ok, false);
  assert.equal(normalizeQueueSnapshot({ items: [{ id: 9, type: 'file', input: 'video.mp4', opts }] }).items.length, 0);
  assert.equal(validateQueueOptions({ items: [{ opts: { model: 'small' } }] }).ok, true);
});

test('5000 öğeyi aşan seçenek dizisi sessizce kırpılmaz', () => {
  assert.equal(clonePublicOptions({ glossary: Array.from({ length: 5001 }, (_, i) => String(i)) }), null);
  const restored = normalizeQueueSnapshot({ items: [
    { id: 11, type: 'file', input: 'D:\\film.mp4', opts: { glossary: Array(5001).fill('x') } },
  ] });
  assert.equal(restored.items.length, 0);
  assert.equal(restored.invalidCount, 1);
});

test('mangaApiKey mevcut sonda eşleşen sır filtresiyle ayıklanır', () => {
  assert.deepEqual(clonePublicOptions({ mangaApiKey: 'fake-secret', nested: { mangaApiKey: 'fake' } }), { nested: {} });
});

test('API anahtarları ve geçici AI verisi kuyruk dosyasına girmez', () => {
  const opts = clonePublicOptions({ model: 'large-v3', hfToken: 'hf-x', translateApiKey: 'sk-x',
    llmApiKey: 'llm-x', chat: { question: 'gizli' }, explain: true, queueItemId: 8,
    input: 'D:\\gizli.mp4', youtube: 'https://secret.test' });
  assert.deepEqual(opts, { model: 'large-v3' });
});

test('iç içe sırlar ve kimlik bilgili sağlayıcı URLsi kalıcı kuyruğa girmez', () => {
  const opts = clonePublicOptions({
    translateBaseUrl: 'https://user:pass@example.test/v1?api_key=secret&region=eu',
    llmEndpoint: 'https://example.test/v1?client_secret=x&api-version=2026-01-01',
    nested: { accessToken: 'secret', safe: 'değer', deeper: { password: 'gizli' } },
  });
  assert.equal(opts.translateBaseUrl, undefined);
  assert.equal(opts.llmEndpoint, 'https://example.test/v1?api-version=2026-01-01');
  assert.deepEqual(opts.nested, { safe: 'değer', deeper: {} });
});

test('gecikmiş renderer snapshotı ana sürecin terminal sonucunu geri alamaz', () => {
  const disk = { items: [{ id: 4, type: 'file', input: 'D:\\a.mp4', status: 'done',
    files: ['D:\\a.srt'], warnings: ['uyarı'] }] };
  const stale = { queueRunning: true, currentQueueId: 4,
    items: [{ id: 4, type: 'file', input: 'D:\\a.mp4', status: 'running' }] };
  const merged = mergeQueueSnapshotForSave(disk, stale, 4, [4]);
  assert.equal(merged.items[0].status, 'done');
  assert.deepEqual(merged.items[0].files, ['D:\\a.srt']);
  assert.deepEqual(merged.items[0].warnings, ['uyarı']);

  const cancelledDisk = { items: [{ id: 4, type: 'file', input: 'D:\\a.mp4', status: 'pending' }] };
  const cancelledMerged = mergeQueueSnapshotForSave(cancelledDisk, stale, 4, [4]);
  assert.equal(cancelledMerged.items[0].status, 'pending',
    'iptalden önce zamanlanan running snapshotı yeniden denenebilir durumu geri alamamalı');
});

test('ana süreç eksik veya gecikmiş renderer kaydında çalışan öğeyi kurar', () => {
  const running = updateQueueSnapshotRunning({ items: [] }, 9, {
    type: 'file', input: 'D:\\film.mp4', label: 'film.mp4',
    opts: { model: 'small', translateApiKey: 'secret', input: 'D:\\film.mp4' },
  });
  assert.equal(running.currentQueueId, 9);
  assert.equal(running.items[0].status, 'running');
  assert.deepEqual(running.items[0].opts, { model: 'small' });
});

test('çökmeden kalan çalışan iş beklemeye alınır', () => {
  const restored = normalizeQueueSnapshot({ items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running' }] });
  assert.equal(restored.items[0].status, 'pending');
  assert.equal(restored.items[0].recovered, true);
  assert.equal(restored.recoveredCount, 1);
  assert.equal(restored.queueRunning, false);
});

test('izleme klasöründen gelen iş yeniden yüklemede kaynağını korur', () => {
  const restored = normalizeQueueSnapshot({ items: [{
    id: 12, type: 'file', input: 'D:\\izlenen\\film.mkv', status: 'pending', watchSource: true,
  }] });
  assert.equal(restored.items[0].watchSource, true);
});

test('renderer yenilenirken ana süreçte yaşayan işe yeniden bağlanılır', () => {
  const restored = normalizeQueueSnapshot({ items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running' }] }, 3);
  assert.equal(restored.items[0].status, 'running');
  assert.equal(restored.currentQueueId, 3);
  assert.equal(restored.queueRunning, true);
  const fs = require('fs');
  const path = require('path');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(main, /activeJobId:\s*activeQueueItemId\s*\?\s*activeTranscriptionJobId\s*:\s*null/);
  assert.match(renderer, /state\.activeJobId\s*=\s*typeof restored\.activeJobId/);
  const safeStart = renderer.slice(renderer.indexOf('async function startTranscribeSafe'),
    renderer.indexOf('\n}', renderer.indexOf('async function startTranscribeSafe')) + 2);
  assert.match(safeStart, /state\.awaitingExit\s*=\s*false/);
});

test('terminal olay renderer yokken kalıcı kuyruğu günceller', () => {
  const raw = { items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running' }] };
  const done = updateQueueSnapshotTerminal(raw, 3, { type: 'done', files: ['D:\\a.srt'], warnings: ['bak'] });
  assert.equal(done.items[0].status, 'done');
  assert.deepEqual(done.items[0].files, ['D:\\a.srt']);
  assert.deepEqual(done.items[0].warnings, ['bak']);
  const failed = updateQueueSnapshotTerminal(raw, 3, { type: 'exit' });
  assert.equal(failed.items[0].status, 'error');
  assert.equal(failed.items[0].error, 'Bilinmeyen hata');
  const failedWithMessage = updateQueueSnapshotTerminal(raw, 3, { type: 'error', message: 'model yüklenemedi' });
  assert.equal(failedWithMessage.items[0].error, 'model yüklenemedi');
  const cancelled = updateQueueSnapshotTerminal(raw, 3, { type: 'exit', code: 1, cancelled: true });
  assert.equal(cancelled.items[0].status, 'pending');
  assert.equal(cancelled.items[0].error, '');
  const recoveredDone = updateQueueSnapshotTerminal({ items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running', error: 'eski hata' }] }, 3, { type: 'done' });
  assert.equal(recoveredDone.items[0].error, '');
});

test('bozuk ve yinelenen öğeler atılır, kalıcı görüntü sınırlanır', () => {
  const disk = queueSnapshotForDisk({ queueRunning: true, currentQueueId: 1, items: [
    { id: 1, type: 'youtube', input: 'https://example.test/watch', status: 'running', opts: { translateApiKey: 'secret' } },
    { id: 1, type: 'file', input: 'D:\\duplicate.mp4' },
    { id: -2, type: 'file', input: '' },
  ] });
  assert.equal(disk.items.length, 1);
  assert.equal(disk.items[0].opts.translateApiKey, undefined);
});

test('kısa ve CamelCase oturum sırları iç içe seçeneklerden ayıklanır', () => {
  const secretKeys = ['bearerToken', 'csrfToken', 'xsrfToken', 'privateKey',
    'authToken', 'sessionId', 'sid', 'sig', 'signature', 'oauthBearerToken'];
  const nested = Object.fromEntries(secretKeys.map((key) => [key, 'secret']));
  assert.deepEqual(clonePublicOptions({ safe: 'kalır', nested }), { safe: 'kalır', nested: {} });
});

test('R217: disk queueRunning bayrağı terminal-sonrası bayat true kalamaz', () => {
  // Kuyruk son öğesinin 'done' olayı, renderer 80ms'lik persist'i
  // queueRunning:true gönderdiğinde (finalize henüz koşmadan) diske true
  // yazıyordu; finalizeQueue persist çağırmaz → bayat bayak kalırdı.
  const allDone = { queueRunning: true, currentQueueId: null, items: [
    { id: 1, type: 'file', input: 'D:\\a.mp4', status: 'done' },
    { id: 2, type: 'file', input: 'D:\\b.mp4', status: 'done' },
  ] };
  assert.equal(queueSnapshotForDisk(allDone).queueRunning, false,
    'Tüm öğeler terminalse bayrak false olmalı');
  const merged = mergeQueueSnapshotForSave(null, allDone);
  assert.equal(merged.queueRunning, false, 'Merge de bayat true taşıyamaz');
  // Devam niyeti korunur: bekleyen öğe varken true kalır (çökme sonrası devam).
  const withPending = queueSnapshotForDisk({ queueRunning: true, currentQueueId: null, items: [
    { id: 1, type: 'file', input: 'D:\\a.mp4', status: 'done' },
    { id: 2, type: 'file', input: 'D:\\b.mp4', status: 'pending' },
  ] });
  assert.equal(withPending.queueRunning, true, 'Bekleyen iş varken niyet korunur');
  const running = queueSnapshotForDisk({ queueRunning: true, currentQueueId: 1, items: [
    { id: 1, type: 'file', input: 'D:\\a.mp4', status: 'running' },
  ] });
  assert.equal(running.queueRunning, true, 'Çalışan işde true korunur');
  assert.equal(queueSnapshotForDisk({ queueRunning: false, items: [
    { id: 1, type: 'file', input: 'D:\\a.mp4', status: 'pending' },
  ] }).queueRunning, false, 'Açık false ezilmez');
});
test('repair completion and partial counts survive a restart and a stale renderer save', () => {
  const id = 41, path = 'D:/output/repaired.tr.partial.srt';
  const opts = { translateRetryOnly: true, translateTo: 'tr', subtitlePlayback: {
    mediaPath:'D:/movie.mp4',range:{start:2,end:6},mediaStat:{size:240,mtimeMs:123}
  } };
  const initial = updateQueueSnapshotRunning({}, id, {type:'file',input:'D:/temp/source.srt',opts});
  const output = {path,role:'translation',language:'tr',status:'partial',total:4,completed:3,failed:1,subtitleHash:'b'.repeat(64),
    sourceHash:'a'.repeat(64),text:'not part of the queue receipt'};
  const done = updateQueueSnapshotTerminal(initial, id, {type:'done',files:[path],outputs:[output]});
  const {sourceHash,text,...receipt}=output;
  const restored=normalizeQueueSnapshot(JSON.parse(JSON.stringify(done)));
  assert.deepEqual(restored.items[0].opts.subtitlePlayback,opts.subtitlePlayback);
  assert.deepEqual(restored.items[0].repairOutput,receipt);
  assert.deepEqual(mergeQueueSnapshotForSave(restored,initial,null,[id]).items[0].repairOutput,receipt);
  assert.equal(updateQueueSnapshotRunning(restored,id).items[0].repairOutput,undefined);
});

test('repair receipts reject filename guesses, mismatched files and ambiguous results', () => {
  const id = 42, path = 'D:/output/repaired.tr.srt', another = 'D:/output/other.tr.srt';
  const raw = {items:[{id,type:'file',input:'D:/temp/source.srt',status:'running',
    opts:{translateRetryOnly:true,translateTo:'tr'}}]};
  const output = {path,role:'translation',language:'tr',total:3,completed:3,failed:0};
  for (const event of [
    {files:[path]},
    {files:[another],outputs:[output]},
    {files:[path],outputs:[{...output,language:'en'}]},
    {files:[path,another],outputs:[output,{...output,path:another}]},
  ]) assert.equal(updateQueueSnapshotTerminal(raw,id,{type:'done',...event}).items[0].repairOutput,undefined);
});

console.log(`queue-persistence: ${passed} test`);
