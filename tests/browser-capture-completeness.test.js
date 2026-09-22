'use strict';

// T2: tam yakalama eksiksizlik kanıtı — 30 dk'lık, varyant değiştiren ve
// büyüyen playlist'li defter simülasyonu. Üretim parser'ı
// (parseHlsSegments) ve defter fonksiyonları kullanılır; beklenen çıktı
// kopyalanmaz, adım adım hesaplanır.

const assert = require('assert');
const {
  ceaCaptureSegmentIdentity,
  mergeCeaCaptureSegments,
  normalizeCeaCaptureSegments,
  remapCeaCaptureSegments,
  runOrderedCeaCapture,
  summarizeCeaCaptureCompleteness,
} = require('../src/browser-cea-full-capture');
const { parseHlsSegments } = require('../src/browser-subtitles');

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log('  ✓', name);
};

const BASE = 'https://cdn.test/live.m3u8';

// 30 dk'lık VOD: 10 segment × 180 sn. Büyüyen liste: pencere başlangıçta
// açık (ENDLIST yok), yenilemelerde büyür; imzalı URL'ler yenilenir;
// EXT-X-GAP (seq 7), EXT-X-BYTERANGE (seq 2-4, tek bundle.ts) ve araya
// eklenen EXT-X-DISCONTINUITY içerir.
function playlist({ count, endlist, sig = 'a', discBefore = -1 }) {
  let out = '#EXTM3U\n#EXT-X-TARGETDURATION:180\n';
  for (let i = 0; i < count; i += 1) {
    if (i === discBefore) out += '#EXT-X-DISCONTINUITY\n';
    if (i === 7) out += '#EXT-X-GAP\n';
    out += '#EXTINF:180,\n';
    if (i >= 2 && i <= 4) {
      out += `#EXT-X-BYTERANGE:1048576@${(i - 2) * 1048576}\nbundle.ts?sig=${sig}\n`;
    } else {
      out += `seg-${i}.ts?sig=${sig}\n`;
    }
  }
  if (endlist) out += '#EXT-X-ENDLIST\n';
  return out;
}

(async () => {
  // F-T2-1: yenilemede araya eklenen EXT-X-DISCONTINUITY tamamlanmış
  // defteri sahipsiz bırakmamalı (eski disc:seq kimliği: 15 girdi + 10 eksik).
  await test('kesinti eklenince defter kararlı kalır', async () => {
    const v1 = parseHlsSegments(playlist({ count: 10, endlist: false }), BASE);
    const completed = new Set(v1.slice(0, 7).map(ceaCaptureSegmentIdentity));
    const v2 = parseHlsSegments(playlist({ count: 10, endlist: true, sig: 'b', discBefore: 5 }), BASE);
    assert.equal(v2[5].discontinuity, 1, 'eklenen kesinti sonrası parçaların disc değeri 1 olmalı');
    const merged = mergeCeaCaptureSegments(v1, v2);
    assert.equal(merged.length, 10,
      `aynı fiziksel parçalar yeniden numaralanamaz: merged=${merged.length} (eski kimlik 15 üretiyor)`);
    const summary = summarizeCeaCaptureCompleteness(merged, completed,
      { cueCount: 50, planComplete: true, expectedDuration: 1800 });
    assert.equal(summary.missing, 2,
      `tamamlanan 0..6 korunmalı; seq 7 GAP zorunlu iş değil → yalnız 8,9 eksik (gerçekte ${summary.missing})`);
    assert.deepEqual(summary.missingSegments.map((s) => s.sequence), [8, 9]);
  });

  await test('30 dk büyüyen playlist tam yaşam döngüsü defteri', async () => {
    // Aşama 1: açık liste, 4 parça görünür (720 sn plan; video 1800 sn).
    const v1 = parseHlsSegments(playlist({ count: 4, endlist: false }), BASE);
    assert.equal(v1.length, 4);
    const ledger1 = summarizeCeaCaptureCompleteness(v1, [],
      { cueCount: 0, planComplete: false, expectedDuration: 1800, requireExpectedDuration: true });
    assert.equal(ledger1.complete, false, 'açık liste asla complete olamaz');
    assert.equal(ledger1.planReason, 'open-playlist');

    const fetched = [];
    const run = await runOrderedCeaCapture({
      segments: v1, concurrency: 2,
      fetchSegment: async (s) => { fetched.push(s.sequence); return Buffer.from(`body-${s.sequence}`); },
      consumeSegment: async () => {},
    });
    assert.deepEqual(fetched, [0, 1, 2, 3], 'ilk turdaki tüm parçalar indirilir');
    assert.equal(run.remaining.length, 0);
    const done1 = new Set(run.completed.map(ceaCaptureSegmentIdentity));

    // Aşama 2: liste büyüdü (7 parça), imzalar yenilendi, seq 5 öncesi kesinti.
    const v2 = parseHlsSegments(playlist({ count: 7, endlist: false, sig: 'b', discBefore: 5 }), BASE);
    const merged2 = mergeCeaCaptureSegments(v1, v2);
    assert.equal(merged2.length, 7, 'büyüyen liste: 4 eski + 3 yeni = 7 defter girdisi');
    const pending2 = merged2.filter((s) => !done1.has(ceaCaptureSegmentIdentity(s)));
    assert.deepEqual(pending2.map((s) => s.sequence), [4, 5, 6],
      'kesinti eklenmesi tamamlanmış parçaları sahipsiz bırakmamalı');
    assert(pending2.every((s) => s.url.includes('sig=b')), 'yenilenen imzalı URL kazanmalı');

    // Aşama 3: kapanan liste — 10 parça (seq 7 GAP), seq 6 sunucuda 403.
    const v3 = parseHlsSegments(playlist({ count: 10, endlist: true, sig: 'c', discBefore: 5 }), BASE);
    assert.equal(v3.length, 10);
    assert.equal(v3[7].gap, true, 'GAP parçası işaretli');
    assert(v3[4].byteRange, 'EXT-X-BYTERANGE parçası range taşımalı');
    const merged3 = mergeCeaCaptureSegments(merged2, v3);
    assert.equal(merged3.length, 10, 'defter: 10 fiziksel parça (GAP dahil)');

    const seen = [];
    const ranges = [];
    const run3 = await runOrderedCeaCapture({
      segments: merged3.filter((s) => !done1.has(ceaCaptureSegmentIdentity(s))),
      concurrency: 2,
      shouldPause: () => true,
      fetchSegment: async (s) => {
        seen.push(s.sequence);
        if (s.byteRange) ranges.push(`${s.sequence}@${s.byteRange.start}`);
        if (s.sequence === 6) {
          const err = new Error('HTTP 403');
          err.code = 'EBROWSER_HTTP'; err.status = 403; err.retryable = false;
          throw err;
        }
        return Buffer.from(`body-${s.sequence}`);
      },
      consumeSegment: async () => {},
    });
    assert(!seen.includes(7), 'GAP parçası indirilmeye çalışılmamalı');
    assert(ranges.includes('4@2097152'), 'byte-range parçasına range iletilmeli');
    const done3 = new Set([...done1, ...run3.completed.map(ceaCaptureSegmentIdentity)]);
    assert(run3.failed.some((f) => f.segment.sequence === 6), '403 parça başarısız sayılmalı');
    // shouldPause: ilk hatada durur — 8,9 remaining'de kalır.
    const summary3 = summarizeCeaCaptureCompleteness(merged3, done3,
      { cueCount: 80, planComplete: true, expectedDuration: 1800, requireExpectedDuration: true });
    assert.equal(summary3.complete, false, '403 + duraklamış kuyruk complete üretemez');
    assert.equal(summary3.missing, 3, '6(403)+8+9 eksik; GAP zorunlu iş değil');
    assert.equal(summary3.total, 9, 'GAP zorunlu işten çıkar');
    assert.equal(summary3.plannedDuration, 1800, 'GAP süresi plan muhasebesinde kalır');
    assert.equal(summary3.planReason, '', 'süre açığı yok — tek sebep eksik parça');

    // Aşama 4: iptal ve kurtarma — kalanlar yalnız eksikler.
    let cancelNow = false;
    const cancelled = await runOrderedCeaCapture({
      segments: merged3.filter((s) => !done3.has(ceaCaptureSegmentIdentity(s))),
      concurrency: 1,
      isCancelled: () => cancelNow,
      fetchSegment: async (s) => {
        if (s.sequence === 8) cancelNow = true;
        return Buffer.from(`body-${s.sequence}`);
      },
      consumeSegment: async () => {},
    });
    assert.equal(cancelled.cancelled, true);
    assert(cancelled.remaining.length >= 1, 'iptalde kalanlar açıkça raporlanır');
    const done4 = new Set([...done3, ...cancelled.completed.map(ceaCaptureSegmentIdentity)]);

    // Kurtarma koşusu: 403 düzeldi, kalan 8/9 indirilir.
    const run5 = await runOrderedCeaCapture({
      segments: merged3.filter((s) => !done4.has(ceaCaptureSegmentIdentity(s))),
      concurrency: 2,
      fetchSegment: async (s) => Buffer.from(`body-${s.sequence}`),
      consumeSegment: async () => {},
    });
    const finalDone = new Set([...done4, ...run5.completed.map(ceaCaptureSegmentIdentity)]);
    const finalSummary = summarizeCeaCaptureCompleteness(merged3, finalDone,
      { cueCount: 90, planComplete: true, expectedDuration: 1800, requireExpectedDuration: true });
    assert.equal(finalSummary.missing, 0, 'kurtarma sonrası eksik kalmaz');
    assert.equal(finalSummary.complete, true, 'tüm zorunlu parçalar + cue + süre → complete');
    assert.equal(finalSummary.gapCount, 1);
    assert.equal(finalSummary.plannedDuration, 1800);
  });

  await test('byte-range parçaları aynı URL üzerinde ayrı kimlik alır', async () => {
    const ranged = parseHlsSegments(playlist({ count: 6, endlist: true }), BASE);
    const ids = ranged.map(ceaCaptureSegmentIdentity);
    assert.equal(new Set(ids).size, ranged.length,
      'aynı bundle URL parçaları tekilleşmemeli (byte-range ayrı iş)');
    const byteRanged = ranged.filter((s) => s.byteRange);
    assert.equal(byteRanged.length, 3, '3 byte-range parçası (seq 2,3,4)');
    assert.deepEqual(byteRanged.map((s) => s.byteRange.start), [0, 1048576, 2097152]);
    const run = await runOrderedCeaCapture({
      segments: ranged, concurrency: 3,
      fetchSegment: async (s) => Buffer.from(`part-${s.sequence}-${s.byteRange ? s.byteRange.start : 'x'}`),
      consumeSegment: async () => {},
    });
    assert.equal(run.completed.length, ranged.length, 'GAP olmayan tüm parçalar hesaplanır');
  });

  await test('varyant değişimi aynı seq kapsamını çoğaltmaz', async () => {
    const low = parseHlsSegments(playlist({ count: 5, endlist: true, sig: 'low' }),
      'https://cdn.test/v-low.m3u8');
    const high = parseHlsSegments(playlist({ count: 5, endlist: true, sig: 'high' }),
      'https://cdn.test/v-high.m3u8');
    const merged = mergeCeaCaptureSegments(low, high);
    assert.equal(merged.length, 5, 'varyant değişimi aynı seq kapsamını çoğaltmaz');
    assert(merged.every((s) => s.url.includes('sig=high')), 'son liste kazanır');
  });

  await test('değişmeyen liste (304) defteri değiştirmez', async () => {
    const v1 = parseHlsSegments(playlist({ count: 6, endlist: true }), BASE);
    const v1b = parseHlsSegments(playlist({ count: 6, endlist: true }), BASE);
    const merged = mergeCeaCaptureSegments(v1, v1b);
    assert.equal(merged.length, 6, 'değişmeyen liste sıfır büyüme üretir');
    const remapped = remapCeaCaptureSegments(v1, v1b);
    assert.deepEqual(remapped.map((s) => s.sequence), [0, 1, 2, 3, 4, 5]);
  });

  console.log(`browser-capture-completeness: ${passed} bölüm`);
  process.exitCode = 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
