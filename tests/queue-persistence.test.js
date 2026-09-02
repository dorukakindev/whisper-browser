'use strict';

const assert = require('assert');
const {
  clonePublicOptions,
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

test('renderer yenilenirken ana süreçte yaşayan işe yeniden bağlanılır', () => {
  const restored = normalizeQueueSnapshot({ items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running' }] }, 3);
  assert.equal(restored.items[0].status, 'running');
  assert.equal(restored.currentQueueId, 3);
  assert.equal(restored.queueRunning, true);
});

test('terminal olay renderer yokken kalıcı kuyruğu günceller', () => {
  const raw = { items: [{ id: 3, type: 'file', input: 'D:\\a.mp4', status: 'running' }] };
  const done = updateQueueSnapshotTerminal(raw, 3, { type: 'done', files: ['D:\\a.srt'], warnings: ['bak'] });
  assert.equal(done.items[0].status, 'done');
  assert.deepEqual(done.items[0].files, ['D:\\a.srt']);
  assert.deepEqual(done.items[0].warnings, ['bak']);
  const failed = updateQueueSnapshotTerminal(raw, 3, { type: 'exit' });
  assert.equal(failed.items[0].status, 'error');
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

console.log(`queue-persistence: ${passed} test`);
