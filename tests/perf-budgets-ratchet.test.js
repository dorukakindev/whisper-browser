'use strict';
// 100-kuyruk batch 7 (maddeler 61–70): performans bütçe ratchet'i.
// Sıcak yollar ölçüldü ve bütçeler mühürlendi; gelecekteki bir regresyon
// bütçe aşımıyla erken yakalanır. Eşikler ölçümün ~5-10 katıdır (CI
// dalgalanmasına karşı tolerans); amaç mutlak hız değil gerileme koruması.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { translate } = require('../src/renderer/ui-locale.js');
const sub = require('../src/browser-subtitles.js');
const qp = require('../src/queue-persistence.js');
const ql = require('../src/renderer/queue-lifecycle.js');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) throw new Error(`${name} — ${detail}`);
  console.log(`PASS ${name}${detail ? ` (${detail})` : ''}`);
}
function measure(fn, iters) {
  const t = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn(i);
  return Number(process.hrtime.bigint() - t) / 1e6;
}

// 61 — translatePattern memo: aynı miss ikinci turda memo'dan gelir.
// 72 regex'li lineer tarama ~2.6µs/miss idi; memo sonrası O(1).
{
  // cache'i doldur
  translate('3 indirme · benzersiz-metin-61');
  const t = measure(() => translate('3 indirme · benzersiz-metin-61'), 20000);
  check('translatePattern memo: tekrar miss 20k < 100ms', t < 100, `${t.toFixed(0)}ms`);
}

// 62 — translate hit/miss bütçesi
{
  const hit = measure(() => translate('Ayarlar'), 100000);
  const misses = ['3 indirme', 'worker-42 status', '5 dosya seçildi', '⌛ 12%'];
  const miss = measure((i) => translate(misses[i % 4]), 40000);
  check('translate hit 100k < 300ms', hit < 300, `${hit.toFixed(0)}ms`);
  check('translate tekrar-miss 40k < 200ms', miss < 200, `${miss.toFixed(0)}ms`);
  // doğruluk: memo anlamları değiştirmedi
  assert.equal(translate('Ayarlar'), 'Settings');
  assert.equal(translate('Sayfa yakınlaştırma %85'), 'Page zoom 85%');
}

// 63 — parseTimedBlocks throughput (10k cue)
{
  const lines = ['WEBVTT', ''];
  for (let i = 0; i < 10000; i++) {
    const s = i * 2;
    lines.push(String(i + 1),
      `00:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000 --> 00:${String(Math.floor((s + 1) / 60) % 60).padStart(2, '0')}:${String((s + 1) % 60).padStart(2, '0')}.000`,
      `cue metin ${i}`, '');
  }
  const payload = lines.join('\n');
  const t = measure(() => sub.parseTimedBlocks(payload), 3);
  const cues = sub.parseTimedBlocks(payload);
  check('parseTimedBlocks 10k cue < 500ms/tur', t / 3 < 500, `${(t / 3).toFixed(0)}ms`);
  assert.ok(cues && (cues.cues?.length ?? cues.length) >= 10000);
}

// 64 — browserActiveCuesAt 50k cue dizisi (index/binary-search beklentisi)
{
  const cues = Array.from({ length: 50000 }, (_, i) => ({ start: i * 2000, end: i * 2000 + 1800 }));
  const t = measure((i) => sub.browserActiveCuesAt(cues, i * 100000, { tail: true }), 1000);
  check('browserActiveCuesAt 50k ×1000 < 300ms', t < 300, `${t.toFixed(0)}ms`);
}

// 65 — normalizeQueueSnapshot(500 öğe) bütçesi
{
  const snap = {
    version: 1,
    items: Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, type: 'file', input: `/v/f${i}.mkv`, label: `f${i}`,
      status: i < 3 ? 'done' : 'pending', files: [], warnings: [], error: '',
      opts: { model: 'tiny', formats: 'srt', translate: true, language: 'en' },
    })),
  };
  const t = measure(() => qp.normalizeQueueSnapshot(snap), 100);
  check('normalizeQueueSnapshot(500) ×100 < 1000ms', t < 1000, `${t.toFixed(0)}ms`);
}

// 66 — mergeQueueSnapshotForSave(500↔500) bütçesi
{
  const mk = () => ({
    version: 1,
    items: Array.from({ length: 500 }, (_, i) => ({
      id: i + 1, type: 'file', input: `/v/f${i}.mkv`, label: `f${i}`,
      status: i < 3 ? 'done' : 'pending', files: [], warnings: [], error: '',
      opts: { model: 'tiny', formats: 'srt', translate: true, language: 'en' },
    })),
  });
  const disk = mk(); const snap = mk();
  const t = measure(() => qp.mergeQueueSnapshotForSave(disk, snap, null, new Set()), 50);
  check('mergeQueueSnapshotForSave(500v500) ×50 < 1500ms', t < 1500, `${t.toFixed(0)}ms`);
}

// 67 — renderer.js/main.js derleme bütçesi (açılış maliyeti göstergesi)
{
  const rsrc = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
  const msrc = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const t = measure(() => { new Function(rsrc); new Function(msrc); }, 5);
  check('renderer+main derleme ×5 < 1500ms', t < 1500, `${t.toFixed(0)}ms`);
}

// 68 — snapshotOptions (structuredClone + deepFreeze) bütçesi
{
  const opts = {
    model: 'tiny', formats: 'srt', language: 'en',
    nested: { list: [1, 2, { deep: 'x' }], map: { a: 'b' } },
    flags: [true, false, 'ç'], meta: { k: 'v' },
  };
  const t = measure(() => ql.snapshotOptions(opts), 20000);
  check('snapshotOptions ×20k < 1500ms', t < 1500, `${t.toFixed(0)}ms`);
}

// 69 — memo doğruluğu + sınır davranışı: 1024 dolunca clear, değerler bozulmaz
{
  // pattern-hit memoized: aynı metin iki kez aynı sonucu verir
  const a = translate('Sayfa yakınlaştırma %42');
  const b = translate('Sayfa yakınlaştırma %42');
  assert.equal(a, b);
  assert.equal(a, 'Page zoom 42%');
  // sınırı aşan farklı miss'ler sonrası davranış hâlâ doğru
  for (let i = 0; i < 1200; i++) translate(`benzersiz-miss-${i}`);
  assert.equal(translate('Ayarlar'), 'Settings');
  assert.equal(translate('Sayfa yakınlaştırma %7'), 'Page zoom 7%');
  check('memo doğruluğu + sınır: 1200 tekil miss sonrası doğru', true);
}

// 70 — bütçe ratchet'i bütünlüğü: tüm süreler kaydedildi, negatif yok
{
  const bad = results.filter((r) => !r.ok);
  assert.deepEqual(bad, []);
  check('bütçe ratchet bütünlüğü', results.length >= 10, `${results.length} kontrol`);
}

console.log(`perf-budgets-ratchet: ${results.length} kontrol geçti`);
