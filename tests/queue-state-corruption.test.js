'use strict';
// R157: kuyruk durumu bozulma simülasyonu — normalizeQueueSnapshot /
// mergeQueueSnapshotForSave / updateQueueSnapshotTerminal /
// updateQueueSnapshotRunning adversaryal yükler altında değişmezlikleri korur.
const assert = require('node:assert');
const {
  MAX_QUEUE_ITEMS, clonePublicOptions, mergeQueueSnapshotForSave,
  normalizeQueueSnapshot, updateQueueSnapshotRunning, updateQueueSnapshotTerminal,
} = require('../src/queue-persistence');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };
const item = (o = {}) => ({ id: 1, type: 'file', input: 'a.mp4', ...o });

// --- normalizeQueueItem kenarları (snapshot üzerinden) ---
{
  const s = normalizeQueueSnapshot({ items: [
    item({ id: 0 }), item({ id: -3 }), item({ id: 1.5 }), item({ id: '7' }),
    item({ id: NaN }), item({ id: 2 ** 60 }), item({ id: 5, input: '' }),
    item({ id: 8, type: 'link' }),
  ] });
  // '7' Number coercion ile geçerli — belgelenmiş tolerans; gerisi atılır.
  ok(s.items.length === 1 && s.items[0].id === 7,
    `geçersiz kimlik/tip/girdi atılır (kalan ${s.items.length})`);
}
{
  const s = normalizeQueueSnapshot({ items: [item({ id: 1 }), item({ id: 1 })] });
  ok(s.items.length === 1 && s.invalidCount >= 1, 'kopya kimlik atılır');
}
{
  const s = normalizeQueueSnapshot({
    items: [item({ id: 2, status: 'running' }), item({ id: 3, status: 'running' })],
  });
  ok(s.items.every((i) => i.status === 'pending' && i.recovered), 'aktif olmayan running→pending+recovered');
  ok(s.queueRunning === false && s.currentQueueId === null, 'queueRunning yanlış kalmaz');
}
{
  const s = normalizeQueueSnapshot({ items: Array.from({ length: MAX_QUEUE_ITEMS + 7 },
    (_, i) => item({ id: i + 1 })) });
  ok(s.items.length === MAX_QUEUE_ITEMS && s.invalidCount >= 7, 'MAX_QUEUE_ITEMS tavanı');
}
{
  const s = normalizeQueueSnapshot({ items: [item({ id: 4, input: 'x'.repeat(10000) })] });
  ok(s.items[0].input.length === 8000, 'input 8000 kapak');
}

// --- clonePublicOptions güvenlik ---
{
  const circular = {}; circular.self = circular;
  const circ = clonePublicOptions({ ok: 1, bad: circular });
  // Derinlik tavanı (8) döngüyü güvenle budar — throw/askı yok, null değil.
  ok(circ && circ.ok === 1 && typeof circ.bad === 'object', 'döngüsel opts derinlikle budanır');
  const polluted = JSON.parse('{"a":1,"__proto__":{"evil":true}}');
  const out = clonePublicOptions({ opts: polluted });
  ok(!out || out.opts === undefined || out.opts.__proto__ === undefined || ({}).evil === undefined,
    'proto anahtarı kirliliği yok');
  ok(({}).evil === undefined, 'global proto dokunulmamış');
}

// --- mergeQueueSnapshotForSave: gecikmiş renderer snapshot'ı terminali ezemez ---
{
  const disk = normalizeQueueSnapshot({ items: [item({ id: 9, status: 'done',
    files: ['o.srt'], warnings: ['w'] })] });
  const incoming = { items: [item({ id: 9, status: 'running', files: [], warnings: [] })], queueRunning: true };
  const merged = mergeQueueSnapshotForSave(disk, incoming, null, [9]);
  ok(merged.items[0].status === 'done' && merged.items[0].files[0] === 'o.srt',
    'korumalı terminal durum ezilmez');
}
{
  const disk = normalizeQueueSnapshot({ items: [item({ id: 9, status: 'running' })] }, 9);
  const incoming = { items: [item({ id: 9, status: 'error', error: 'x' })], queueRunning: false };
  const merged = mergeQueueSnapshotForSave(disk, incoming, 9, []);
  ok(merged.items[0].status === 'error', 'koruma listesiz gecikmiş yazı serbest');
}

// --- terminal güncelleme ---
{
  const snap = normalizeQueueSnapshot({ items: [item({ id: 5, status: 'running' })] }, 5);
  const weird = updateQueueSnapshotTerminal(snap, 5, { type: 'error', message: { weird: 1 } });
  ok(weird.items[0].status === 'error' && typeof weird.items[0].error === 'string',
    'nesne hata metni güvenle stringlenir');
  const missing = updateQueueSnapshotTerminal(snap, 999, { type: 'error' });
  ok(missing.items.length === 1, 'bulunamayan id güvenli no-op');
  const badId = updateQueueSnapshotTerminal(snap, 'x', { type: 'done' });
  ok(badId.items.length === 1, 'geçersiz id güvenli no-op');
}
{
  const snap = normalizeQueueSnapshot({ items: [item({ id: 5 })] });
  const run = updateQueueSnapshotRunning(snap, 5, { type: 'file', input: 'f.mp4' });
  ok(run.items[0].status === 'running' && run.currentQueueId === 5, 'running geçişi');
}

// --- Fuzz: rastgele bozuk snapshot → değişmezlikler ---
{
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const junk = () => [null, undefined, NaN, '', [], {}, { a: 1 }, -1, 'x', true,
    { id: Math.floor(rnd() * 20), type: 'file', input: 'f', status: 'running' },
    { id: Math.floor(rnd() * 20), type: 'youtube', input: 'https://y', status: 'done' },
    { id: -Math.floor(rnd() * 5), type: 'file', input: 'g' }][Math.floor(rnd() * 12)];
  for (let i = 0; i < 5000; i++) {
    const snap = { items: Array.from({ length: Math.floor(rnd() * 8) }, junk),
      queueRunning: rnd() > 0.5, currentQueueId: Math.floor(rnd() * 20), updatedAt: junk() };
    const out = normalizeQueueSnapshot(snap, Math.floor(rnd() * 20));
    const ids = out.items.map((x) => x.id);
    ok(new Set(ids).size === ids.length, `tekrarsız kimlik @${i}`);
    ok(out.items.every((x) => ['pending', 'running', 'done', 'error'].includes(x.status)), `durum kümesi @${i}`);
    const running = out.items.filter((x) => x.status === 'running');
    ok(running.length <= 1, `tek running @${i}`);
    ok(out.queueRunning === (running.length === 1 && out.currentQueueId === running[0].id),
      `queueRunning tutarlılığı @${i}`);
    ok(Number.isFinite(out.updatedAt), `updatedAt sonlu @${i}`);
  }
}

console.log(`queue-state-corruption: ${n} kontrol geçti`);
