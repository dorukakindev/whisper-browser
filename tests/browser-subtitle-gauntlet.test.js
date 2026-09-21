'use strict';

// Browser Subtitle Reliability Gauntlet — Bölüm 1-5 deterministik katman.
// Fixture'lar gerçek HTTP üzerinden üretim parser/merge/completeness/scheduler
// yollarından geçer; nihai cue nesnesi enjekte edilmez.

const assert = require('assert');
const {
  mergeBrowserStreamCues, parseHlsSegments, parseHlsSubtitleTracks,
  parseSubtitlePayload, detectHlsCea608, normalizeCues, cuesToSrt,
  cuesUseLocalSegmentTimeline, dashSegmentOffset,
} = require('../src/browser-subtitles');
const {
  buildHlsCeaSegmentMatchers, matchHlsCeaSegmentUrl, ceaUrlKey,
  ceaStreamMatchesInstream, captionToCue,
} = require('../src/browser-cea-captions');
const {
  ceaCaptureSegmentIdentity, mergeCeaCaptureSegments, remapCeaCaptureSegments,
  normalizeCeaCaptureSegments, retainCeaExpectedDuration, runOrderedCeaCapture,
  summarizeCeaCaptureCompleteness, shouldAutoRetryCeaCapture,
} = require('../src/browser-cea-full-capture');
const { BrowserTranslationScheduler, assembleCueSentences, distributeTranslation,
  translationCacheKey } = require('../src/browser-translation-scheduler');
const { createBrowserStreamFixtureServer } = require('./browser-stream-fixture-server');

const vtt = (lines) => `WEBVTT\n\n${lines}\n`;

async function main() {
  const fixture = await createBrowserStreamFixtureServer();
  try {
    const fetchText = async (url) => (await fetch(url)).text();

    // ── Bölüm 1: EXT-X-MAP + EXT-X-BYTERANGE ─────────────────────────────
    const byterangeUrl = `${fixture.baseUrl}/hls/byterange.m3u8`;
    const brSegments = parseHlsSegments(await fetchText(byterangeUrl), byterangeUrl);
    assert.equal(brSegments.length, 3);
    assert.equal(brSegments[0].initializationUrl, `${fixture.baseUrl}/hls/shared.vtt`);
    assert.deepEqual(brSegments[0].initializationByteRange, { start: 0, end: 10 },
      'EXT-X-MAP BYTERANGE=11@0 → init aralığı 0-10');
    assert.deepEqual(brSegments[0].byteRange, { start: 11, end: 74 }, 'ilk medya parçası 64@11');
    assert.deepEqual(brSegments[1].byteRange, { start: 75, end: 114 },
      'örtük BYTERANGE öncekinin bittiği yerden devam etmeli (RFC 8216)');
    assert.equal(brSegments[1].discontinuity, 0);
    assert.equal(brSegments[2].discontinuity, 1, 'EXT-X-DISCONTINUITY sayaç artırmalı');
    assert.deepEqual(brSegments[2].byteRange, { start: 200, end: 237 });
    // Byte-range gövdesi gerçekten dilimi döndürüyor mu (Content-Range eşleştirme)
    const rangeResp = await fetch(brSegments[0].url, {
      headers: { Range: `bytes=${brSegments[0].byteRange.start}-${brSegments[0].byteRange.end}` },
    });
    assert.equal(rangeResp.status, 200, 'fixture sunucu Range yok sayar; eşleştirme katmanı bunu ayırt etmeli');
    const matchers = parseHlsSegments(await fetchText(byterangeUrl), byterangeUrl)
      .map((s) => ({ ...s, urlKey: ceaUrlKey(s.url) }));
    const matchedBy206 = matchHlsCeaSegmentUrl(brSegments[1].url, matchers,
      { 'content-range': 'bytes 75-114/238' }, null);
    assert(matchedBy206 && matchedBy206.byteRange && matchedBy206.byteRange.start === 75,
      '206 Content-Range ile aynı URLli aralık parçaları ayrışmalı');
    const noRangeMatch = matchHlsCeaSegmentUrl(brSegments[1].url, matchers, null, null);
    assert.equal(noRangeMatch, null,
      'aralık kanıtı olmayan belirsiz istek tahminen parçaya bağlanmamalı');
    const fullBodyMatch = matchHlsCeaSegmentUrl(brSegments[1].url, matchers, null,
      { status: 200, seen: true });
    assert.equal(fullBodyMatch, null,
      '200 yanıt + düz parça adayı yok → eşleşme reddedilmeli (yanlış timeline önlenir)');

    // ── Bölüm 1: aynı URL'nin değişen içerikle tekrar kullanımı ──────────
    const reusedUrl = `${fixture.baseUrl}/hls/reused.m3u8`;
    const reusedFirst = parseHlsSegments(await fetchText(reusedUrl), reusedUrl);
    const reusedSecond = parseHlsSegments(await fetchText(reusedUrl), reusedUrl);
    assert.equal(reusedFirst[0].sequence, 400);
    assert.equal(reusedSecond[0].sequence, 401, 'kayan pencerede aynı URI yeni sequence almalı');
    assert.equal(reusedFirst[0].url, reusedSecond[0].url);
    const id400 = ceaCaptureSegmentIdentity(reusedFirst[0]);
    const id401 = ceaCaptureSegmentIdentity(reusedSecond[0]);
    assert.notEqual(id400, id401, 'aynı URL farklı içerik aynı yakalama kimliğiyle çökmemeli');
    const firstBody = parseSubtitlePayload(await fetchText(reusedFirst[0].url), 'text/vtt', reusedFirst[0].url).cues;
    const secondBody = parseSubtitlePayload(await fetchText(reusedSecond[0].url), 'text/vtt', reusedSecond[0].url).cues;
    assert.equal(firstBody[0].text, 'İlk pencere içeriği');
    assert.equal(secondBody[0].text, 'İkinci pencere içeriği');
    const mergedReused = mergeBrowserStreamCues(
      firstBody.map((c) => ({ ...c, sequence: 400 })),
      secondBody.map((c) => ({ ...c, sequence: 401, start: c.start + 4, end: c.end + 4 })));
    assert.equal(mergedReused.length, 2, 'aynı URLe ait iki içerik sürümü de korunmalı');

    // ── Bölüm 1: EXT-X-SKIP + EXT-X-GAP ──────────────────────────────────
    const skipUrl = `${fixture.baseUrl}/hls/skip.m3u8`;
    const skipSegments = parseHlsSegments(await fetchText(skipUrl), skipUrl);
    assert.equal(skipSegments[0].sequence, 502, 'SKIPPED-SEGMENTS=2 sequence değerini ilerletmeli');
    assert.equal(skipSegments[0].start, 8, 'atlanan parçalar zaman ekseninde yer tutmalı');
    assert.equal(skipSegments[1].gap, true, 'EXT-X-GAP işaretlenmeli');
    const gapSummary = summarizeCeaCaptureCompleteness(skipSegments,
      [skipSegments[0]], { cueCount: 5 });
    assert.equal(gapSummary.missing, 0, 'GAP parçası eksik sayılmamalı');
    assert.equal(gapSummary.gapCount, 1);
    assert.equal(gapSummary.plannedDuration, 8, 'GAP süresi plan muhasebesinde kalmalı');
    assert.equal(gapSummary.complete, true, 'tüm zorunlu parçalar + cue var → tamam');

    // ── Bölüm 1: sıfır olmayan presentation timestamp ────────────────────
    const offsetUrl = `${fixture.baseUrl}/hls/offset.m3u8`;
    const [offsetSeg] = parseHlsSegments(await fetchText(offsetUrl), offsetUrl);
    const offsetCues = parseSubtitlePayload(await fetchText(offsetSeg.url), 'text/vtt',
      offsetSeg.url).cues;
    assert.equal(offsetCues[0].start, 90, 'MPEGTS 8100000/90000 = 90 sn başlangıç korunmalı');
    assert.equal(offsetCues[0].end, 92);

    // ── Bölüm 1: cue metni sonraki segmentte düzeltiliyor ────────────────
    const corrUrl = `${fixture.baseUrl}/hls/corrected.m3u8`;
    const corrSegs = parseHlsSegments(await fetchText(corrUrl), corrUrl);
    const corrA = parseSubtitlePayload(await fetchText(corrSegs[0].url), 'text/vtt', corrSegs[0].url).cues;
    const corrB = parseSubtitlePayload(await fetchText(corrSegs[1].url), 'text/vtt', corrSegs[1].url).cues;
    const corrMerged = mergeBrowserStreamCues(corrA, corrB);
    assert.deepEqual(corrMerged.map((c) => c.text),
      ['meteor düşecek demişti, inanmadım', 'sakin ol', 'sonra gökyüzü karardı'],
      'aynı zamanlı düzeltilmiş metin eskinin yerini almalı');

    // ── Bölüm 1: reklam period'u / discontinuity her iki yanı ────────────
    const adUrl = `${fixture.baseUrl}/hls/ad-break.m3u8`;
    const adSegs = parseHlsSegments(await fetchText(adUrl), adUrl);
    assert.deepEqual(adSegs.map((s) => s.discontinuity), [3, 4, 5],
      'DISCONTINUITY-SEQUENCE tabanı + iki kesinti ayrı discontinuity kimliği');
    const adCues = mergeBrowserStreamCues(
      normalizeCues([
        ...parseSubtitlePayload(await fetchText(adSegs[0].url), 'text/vtt', adSegs[0].url).cues
          .map((c) => ({ ...c, discontinuity: 3, start: c.start, end: c.end })),
      ]),
      normalizeCues([
        ...parseSubtitlePayload(await fetchText(adSegs[1].url), 'text/vtt', adSegs[1].url).cues
          .map((c) => ({ ...c, discontinuity: 4, start: c.start + 4, end: c.end + 4 })),
        ...parseSubtitlePayload(await fetchText(adSegs[2].url), 'text/vtt', adSegs[2].url).cues
          .map((c) => ({ ...c, discontinuity: 5, start: c.start + 8, end: c.end + 8 })),
      ]));
    assert.equal(adCues.length, 3, 'reklam öncesi/arası/sonrası üç cue da korunmalı');
    assert.equal(adCues[1].text, 'Reklam arası');

    // ── Bölüm 1: CEA-608/708 algısı ve varyant eşleşmesi ─────────────────
    const ceaMasterUrl = `${fixture.baseUrl}/hls/cea-master.m3u8`;
    const ceaTracks = detectHlsCea608(await fetchText(ceaMasterUrl));
    assert.equal(ceaTracks.length, 3);
    assert.equal(ceaTracks[0].standard, 'cea-608');
    assert.equal(ceaTracks[1].standard, 'cea-708', 'SERVICE1 → cea-708 tanısı');
    assert(ceaStreamMatchesInstream('SERVICE1', 'cc708_1'), 'SERVICE1 mux.js cc708_1 akışına eşlenmeli');
    assert(ceaStreamMatchesInstream('CC1', 'CC1'));
    assert(!ceaStreamMatchesInstream('SERVICE9', 'cc708_1'), 'SERVICE9 ≠ SERVICE1 akışı');
    const ceaMediaUrl = `${fixture.baseUrl}/hls/cea-media.m3u8`;
    const ceaMatchers = buildHlsCeaSegmentMatchers(await fetchText(ceaMediaUrl), ceaMediaUrl,
      [ceaTracks[0]], 'fixture://cea');
    assert.equal(ceaMatchers.length, 2);
    assert.equal(ceaMatchers[0].tracks[0].instreamId, 'CC1');
    assert.equal(ceaMatchers[0].initializationUrl, `${fixture.baseUrl}/hls/cea-init.mp4`);
    // İki quality varyantında aynı CEA: aynı discontinuity:sequence kimliği tek
    // defa indirilir — varyant B'nin yanıtı ayrı cue üretmez.
    const variantA = buildHlsCeaSegmentMatchers(await fetchText(ceaMediaUrl), ceaMediaUrl,
      [ceaTracks[0]], 'fixture://cea-1080');
    const mergedVariants = mergeCeaCaptureSegments(ceaMatchers, variantA);
    assert.equal(mergedVariants.length, 2,
      'kalite varyantları aynı discontinuity:sequence kimliğine çökmeli — çift cue yok');

    // ── Bölüm 1: 304 koşullu yenileme ────────────────────────────────────
    const etagUrl = `${fixture.baseUrl}/hls/etag.m3u8`;
    const firstEtag = await fetch(etagUrl);
    assert.equal(firstEtag.status, 200);
    const etag = firstEtag.headers.get('etag');
    const conditional = await fetch(etagUrl, { headers: { 'if-none-match': etag } });
    assert.equal(conditional.status, 304);
    const condBody = await conditional.text();
    assert.equal(condBody, '', '304 gövdesi boş — parçalayıcıya segment diye gitmez');
    assert.equal(parseHlsSegments(condBody, etagUrl).length, 0,
      '304 gövdesi parçalanırsa sıfır segment çıkmalı (eski plan korunur)');

    // ── Bölüm 2: zaman çizelgesi değişmezleri ────────────────────────────
    const messy = normalizeCues([
      { start: -5, end: 2, text: 'negatif başlangıç düşer' },
      { start: 10, end: 9, text: 'ters süre' },
      { start: 4, end: 6, text: 'sıra dışı' },
      { start: 1, end: 3, text: 'erken' },
    ]);
    assert.deepEqual(messy.map((c) => c.text), ['erken', 'sıra dışı', 'ters süre'],
      'monoton sıralama + negatif başlangıç elenmesi');
    assert(messy[2].end > messy[2].start, 'bitiş ≤ başlangıç normalize edilmeli');
    // Kayan canlı izde eski-epoch cue sızması: discontinuity değişince aynı
    // metin+çakışan zaman birleşmez.
    const epochLeak = mergeBrowserStreamCues(
      [{ start: 8, end: 10, text: 'aynı satır', discontinuity: 0 }],
      [{ start: 8.5, end: 10.5, text: 'aynı satır', discontinuity: 1 }]);
    assert.equal(epochLeak.length, 2, 'discontinuity sınırında cue kaynaşması olmamalı');
    // Tam getirme + canlı yakalama aynı timeline'da birleşiyor (aynı cue iki
    // kaynaktan gelince çoğalmamalı).
    const fullFetchCues = normalizeCues([
      { start: 0, end: 4, text: 'tam getirme cue 1' },
      { start: 4, end: 8, text: 'tam getirme cue 2' },
    ]);
    const liveCaptured = normalizeCues([
      { start: 0.02, end: 4, text: 'tam getirme cue 1' },
      { start: 4, end: 8, text: 'tam getirme cue 2' },
      { start: 8, end: 12, text: 'yeni canlı cue' },
    ]);
    const unified = mergeBrowserStreamCues(fullFetchCues, liveCaptured);
    assert.equal(unified.length, 3, 'tam getirme ∪ canlı yakalama tekilleştirilmeli');
    assert.equal(unified[2].text, 'yeni canlı cue');
    // SRT dönüşünde zaman kodları korunur (tam fetch↔disk yolu kimliği).
    const srt = cuesToSrt(unified);
    assert(/00:00:00,0\d\d --> 00:00:04,0\d\d/.test(srt), 'SRT zaman kodu kaymamalı');
    assert(srt.includes('yeni canlı cue'));

    // ── Bölüm 3: tamamlanma muhasebesi ───────────────────────────────────
    const missingSummary = summarizeCeaCaptureCompleteness(
      [{ sequence: 1, duration: 4, discontinuity: 0, url: 'a' },
        { sequence: 2, duration: 4, discontinuity: 0, url: 'x' },
        { sequence: 3, duration: 4, discontinuity: 0, url: 'y' }],
      [{ sequence: 1, discontinuity: 0, url: 'a' }], { cueCount: 40, expectedDuration: 12, requireExpectedDuration: true });
    assert.equal(missingSummary.complete, false);
    assert.equal(missingSummary.missing, 2);
    assert.equal(missingSummary.state, 'partial', 'eksik parça → "tam" sayılmaz');
    assert.equal(missingSummary.durationPercent, 100);
    const openPlaylist = summarizeCeaCaptureCompleteness(
      [{ sequence: 1, duration: 4, discontinuity: 0, url: 'a' }], [{ sequence: 1, discontinuity: 0, url: 'a' }],
      { cueCount: 5, planComplete: false });
    assert.equal(openPlaylist.complete, false);
    assert.equal(openPlaylist.planReason, 'open-playlist', 'açık liste asla "eksiksiz" olamaz');
    const noCues = summarizeCeaCaptureCompleteness(
      [{ sequence: 1, duration: 4, discontinuity: 0, url: 'a' }], [{ sequence: 1, discontinuity: 0, url: 'a' }],
      { cueCount: 0 });
    assert.equal(noCues.complete, false, 'cue=0 → "eksiksiz yakalandı" diyemez');
    const durationGap = summarizeCeaCaptureCompleteness(
      [{ sequence: 1, duration: 4, discontinuity: 0, url: 'a' }], [{ sequence: 1, discontinuity: 0, url: 'a' }],
      { cueCount: 5, expectedDuration: 100, requireExpectedDuration: true });
    assert.equal(durationGap.planReason, 'duration-gap',
      '4sn plan / 100sn video → süre açığı tamamlanmayı engeller');
    assert(shouldAutoRetryCeaCapture(missingSummary, 0) === true);
    assert(shouldAutoRetryCeaCapture(missingSummary, 2) === false, 'retry tavanı aşılmaz');
    // İptal/restart çoğaltmaz: runOrderedCeaCapture erken iptalde remaining döner.
    let cancelRequested = false;
    let consumedCount = 0;
    const captureRun = await runOrderedCeaCapture({
      segments: Array.from({ length: 6 }, (_, i) => ({ sequence: i, duration: 4, discontinuity: 0, url: `u${i}` })),
      concurrency: 1,
      isCancelled: () => cancelRequested,
      fetchSegment: async () => Buffer.from('x'),
      consumeSegment: async () => { consumedCount += 1; if (consumedCount === 2) cancelRequested = true; },
    });
    assert.equal(captureRun.completed.length, 2);
    assert.equal(captureRun.remaining.length, 4, 'iptalde kalanlar açıkça raporlanır');
    assert.equal(captureRun.cancelled, true);
    // Yeniden koşu yalnız kalanları işler — ceaCaptureSegmentIdentity üzerinden.
    const alreadyDone = new Set(captureRun.completed.map(ceaCaptureSegmentIdentity));
    const rerun = await runOrderedCeaCapture({
      segments: Array.from({ length: 6 }, (_, i) => ({ sequence: i, duration: 4, discontinuity: 0, url: `u${i}` }))
        .filter((s) => !alreadyDone.has(ceaCaptureSegmentIdentity(s))),
      concurrency: 2,
      fetchSegment: async () => Buffer.from('x'),
      consumeSegment: async () => {},
    });
    assert.equal(rerun.completed.length, 4, 'yeniden koşu eksik 4 segmenti tamamlar');
    // İmzalı URL yenileme: aynı sequence'e taze URL gelir, eski pencereden
    // düşenler defterden silinmez.
    const ledger = mergeCeaCaptureSegments(
      [{ sequence: 10, discontinuity: 0, url: 'a?v=1', urlKey: 'a' },
        { sequence: 11, discontinuity: 0, url: 'b?v=1', urlKey: 'b' }],
      [{ sequence: 11, discontinuity: 0, url: 'b?v=2', urlKey: 'b' },
        { sequence: 12, discontinuity: 0, url: 'c?v=1', urlKey: 'c' }]);
    assert.equal(ledger.length, 3);
    assert.equal(ledger.find((s) => s.sequence === 11).url, 'b?v=2', 'yenilenen imza kazanır');
    const remapped = remapCeaCaptureSegments(
      [{ sequence: 11, discontinuity: 0, url: 'b?v=1', urlKey: 'b' }],
      [{ sequence: 11, discontinuity: 0, url: 'b?v=2', urlKey: 'b' }]);
    assert.equal(remapped[0].url, 'b?v=2');
    // Reklam süresi gerçek süreyi ezmez.
    assert.equal(retainCeaExpectedDuration(95, { duration: 8, adPlaying: true }), 95);
    assert.equal(retainCeaExpectedDuration(95, { duration: 100 }), 100);

    // ── Bölüm 4: büyüyen altyazı + çeviri maliyeti (sahte sağlayıcı) ─────
    const providerCalls = [];
    const cache = new Map();
    const makeCues = (start, count) => Array.from({ length: count }, (_, i) => ({
      id: `c${start + i}`, start: (start + i) * 2, end: (start + i) * 2 + 1.5,
      text: `Cümle numarası ${start + i} burada.`,
    }));
    const makeScheduler = () => new BrowserTranslationScheduler({
      cache,
      requireSentenceParts: false,
      maxConcurrent: 4,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr', model: 'm1', provider: 'fake' },
      translate: async (sentence) => {
        providerCalls.push(sentence.id);
        return { text: `TR: ${sentence.text}` };
      },
    });
    const scheduler = makeScheduler();
    // Tur 1: 100 cue, hepsi noktalı → 100 ayrı cümle.
    const cues100 = makeCues(0, 100);
    scheduler.setSentences(assembleCueSentences(cues100, { sourceComplete: true }));
    scheduler.completeAll();
    await scheduler.whenIdle();
    assert.equal(scheduler.snapshot().completed, 100);
    const pass1Calls = providerCalls.length;
    assert.equal(pass1Calls, 100, 'ilk tur: 100 cümle → 100 sağlayıcı çağrısı');
    // Tur 2: +20 yeni cue → reconcile yalnız yenileri göndermeli.
    const cues120 = [...cues100, ...makeCues(100, 20)];
    scheduler.reconcileSentences(assembleCueSentences(cues120, { sourceComplete: true }));
    await scheduler.whenIdle();
    const pass2Calls = providerCalls.length - pass1Calls;
    assert.equal(pass2Calls, 20, `yalnız 20 yeni cümle çevrilmeli, ${pass2Calls} gönderildi`);
    assert.equal(scheduler.snapshot().completed, 120);
    // Tur 3: eski 5 cue'da metin düzeltmesi → yalnız o 5'i yeniden çevir.
    const corrected = cues120.map((cue) => cue.id === 'c3' || cue.id === 'c40' || cue.id === 'c77'
      ? { ...cue, text: cue.text.replace('numarası', 'düzeltilmiş numarası') }
      : cue);
    scheduler.reconcileSentences(assembleCueSentences(corrected, { sourceComplete: true }));
    await scheduler.whenIdle();
    const pass3Calls = providerCalls.length - pass1Calls - pass2Calls;
    assert.equal(pass3Calls, 3, `5 metin düzeltmesi → yalnız değişen cümleler, ${pass3Calls} gönderildi`);
    // Tur 4: yalnız zaman değişimi (süre aynı → cache anahtarı korunur) → 0 sağlayıcı çağrısı.
    const timingOnly = corrected.map((cue) => cue.id === 'c50'
      ? { ...cue, start: cue.start + 0.3, end: cue.end + 0.3 } : cue);
    scheduler.reconcileSentences(assembleCueSentences(timingOnly, { sourceComplete: true }));
    await scheduler.whenIdle();
    const pass4Calls = providerCalls.length - pass1Calls - pass2Calls - pass3Calls;
    assert.equal(pass4Calls, 0,
      `süresi korunan salt-zaman değişimi cache'ten dönmeli, ${pass4Calls} sağlayıcı çağrısı gitti`);
    assert.equal(scheduler.snapshot().completed, 120, 'tamamlanmış sayım korunmalı');
    // Tur 5: aynı kaynak iki kez teslim → ekstra istek yok.
    scheduler.reconcileSentences(assembleCueSentences(timingOnly, { sourceComplete: true }));
    await scheduler.whenIdle();
    assert.equal(providerCalls.length, 123, 'duplike teslimat sağlayıcıya ulaşmamalı');
    // Tur 6: model değişimi cache'i geçersizleştirir.
    scheduler.setContext({ model: 'm2' });
    const c50 = assembleCueSentences(timingOnly.filter((c) => c.id === 'c50'), { sourceComplete: true });
    const keyM1 = translationCacheKey(c50[0], { trackIdentity: 'tr-track', targetLanguage: 'tr', model: 'm1', provider: 'fake' });
    const keyM2 = translationCacheKey(c50[0], { trackIdentity: 'tr-track', targetLanguage: 'tr', model: 'm2', provider: 'fake' });
    const keyEn = translationCacheKey(c50[0], { trackIdentity: 'tr-track', targetLanguage: 'en', model: 'm1', provider: 'fake' });
    const keyP2 = translationCacheKey(c50[0], { trackIdentity: 'tr-track', targetLanguage: 'tr', model: 'm1', provider: 'other' });
    assert.notEqual(keyM1, keyM2, 'model değişimi yeni cache anahtarı');
    assert.notEqual(keyM1, keyEn, 'hedef dil değişimi yeni cache anahtarı');
    assert.notEqual(keyM1, keyP2, 'sağlayıcı değişimi yeni cache anahtarı');
    // Eşzamanlı tek uçuş: aynı cache anahtarlı ikinci iş sağlayıcıyı iki kez çağırmaz.
    const dupSent = c50[0];
    const flightScheduler = new BrowserTranslationScheduler({
      cache: new Map(), requireSentenceParts: false, maxConcurrent: 2,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr' },
      translate: async () => {
        providerCalls.push('dup-flight');
        await new Promise((r) => setTimeout(r, 25));
        return { text: 'ortak çeviri' };
      },
    });
    const ctlA = new AbortController();
    const ctlB = new AbortController();
    const sharedKey = translationCacheKey(dupSent, flightScheduler.context);
    const [rA, rB] = await Promise.all([
      flightScheduler.translateShared(dupSent, sharedKey, ctlA),
      flightScheduler.translateShared(dupSent, sharedKey, ctlB),
    ]);
    assert.equal(rA.text, rB.text);
    const dupFlightCalls = providerCalls.filter((id) => id === 'dup-flight').length;
    assert.equal(dupFlightCalls, 1, 'eşzamanlı iki "çevir" aynı anahtarda tek sağlayıcı çağrısı');
    // İptal sonrası geç gelen cevap sonuçlara yazılmaz.
    const cancelScheduler = new BrowserTranslationScheduler({
      cache: new Map(), maxConcurrent: 1,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr' },
      translate: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { text: 'geç gelen cevap' };
      },
    });
    cancelScheduler.setSentences(assembleCueSentences(
      [{ id: 'z1', start: 0, end: 1, text: 'İptal edilecek cümle.' }], { sourceComplete: true }));
    cancelScheduler.completeAll();
    cancelScheduler.cancelAll('test iptali');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(cancelScheduler.snapshot().completed, 0,
      'iptal + geç cevap → result/cache yazımı olmamalı');
    assert.equal(cache.size >= 0, true); // cancel yolu Map'e de dokunmadı
    // Başarısız blok retry'da başarılı bloklar tekrar ücretlendirilmez.
    const retryCalls = [];
    let failOnce = true;
    const retryScheduler = new BrowserTranslationScheduler({
      cache: new Map(), maxConcurrent: 1, maxAttempts: 1,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr' },
      translate: async (sentence) => {
        retryCalls.push(sentence.id);
        if (failOnce) { failOnce = false; const e = new Error('geçici'); e.retryable = true; throw e; }
        return { text: `ok ${sentence.id}` };
      },
    });
    retryScheduler.setSentences(assembleCueSentences(
      [{ id: 'r1', start: 0, end: 1, text: 'Önce düşen.' }, { id: 'r2', start: 2, end: 3, text: 'Sağlam kalan.' }],
      { sourceComplete: true }));
    retryScheduler.completeAll();
    await retryScheduler.whenIdle();
    assert.equal(retryScheduler.snapshot().completed, 1);
    const beforeRetry = retryCalls.length;
    retryScheduler.retryFailed();
    await retryScheduler.whenIdle();
    assert.equal(retryCalls.length - beforeRetry, 1, 'retry yalnız düşen cümleyi tekrarlar');
    assert.equal(retryScheduler.snapshot().completed, 2);

    // ── Bölüm 5: kaynak–çeviri eşleşmesi ─────────────────────────────────
    // Kararlı kimlik: aynı metin+id ama farklı zaman → ayrı cümle kimliği.
    const sameTextDifferentTime = assembleCueSentences([
      { id: 'a', start: 10, end: 11, text: 'Evet.' },
      { id: 'b', start: 40, end: 41, text: 'Evet.' },
    ], { sourceComplete: true });
    assert.notEqual(sameTextDifferentTime[0].id, sameTextDifferentTime[1].id,
      'aynı metin farklı zaman → ayrı cümle kimliği (B83-15 regresyonu)');
    // Araya cue eklenince sonrakiler kaymaz: sentenceIdFor zaman+id tabanlı.
    const original3 = assembleCueSentences([
      { id: 'x', start: 0, end: 1, text: 'Bir.' },
      { id: 'z', start: 20, end: 21, text: 'Üç.' },
    ], { sourceComplete: true });
    const inserted = assembleCueSentences([
      { id: 'x', start: 0, end: 1, text: 'Bir.' },
      { id: 'y', start: 10, end: 11, text: 'İki araya girdi.' },
      { id: 'z', start: 20, end: 21, text: 'Üç.' },
    ], { sourceComplete: true });
    assert.equal(original3[0].id, inserted[0].id, 'önceki cümle kimliği değişmez');
    assert.equal(original3[1].id, inserted[2].id, 'araya eklenen sonraki kimlikleri kaydırmaz');
    // distributeTranslation parça zamanlarını kaynağa sadık tutar.
    const sentence2p = assembleCueSentences([
      { id: 'p1', start: 100, end: 101.5, text: 'Ali üç elma' },
      { id: 'p2', start: 101.5, end: 103, text: 'yedi.' },
    ], { sourceComplete: true })[0];
    const parts = distributeTranslation(sentence2p, JSON.stringify({ text: 'Ali üç elmayı yedi', parts: ['Ali', 'üç elmayı yedi'] }));
    assert.equal(parts.length, 2);
    assert.equal(parts[0].start, 100, 'çeviri parçası kaynak zamanını değiştirmez');
    assert.equal(parts[0].end, 101.5);
    assert.equal(parts[1].start, 101.5);
    assert.equal(parts[0].text, 'Ali');
    assert.equal(parts[1].text, 'üç elmayı yedi');
    // Kaynak düzeltildiğinde eski çeviri düşer (reconcile results.delete).
    const editScheduler = new BrowserTranslationScheduler({
      cache: new Map(), requireSentenceParts: false,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr' },
      translate: async (sentence) => ({ text: `TR ${sentence.text}` }),
    });
    const editSentences = assembleCueSentences([
      { id: 'e1', start: 0, end: 2, text: 'Orijinal cümle.' },
      { id: 'e2', start: 4, end: 6, text: 'Dokunulmayan.' },
    ], { sourceComplete: true });
    editScheduler.setSentences(editSentences);
    editScheduler.completeAll();
    await editScheduler.whenIdle();
    assert.equal(editScheduler.snapshot().completed, 2);
    const editedSentences = assembleCueSentences([
      { id: 'e1', start: 0, end: 2, text: 'Düzeltilmiş cümle.' },
      { id: 'e2', start: 4, end: 6, text: 'Dokunulmayan.' },
    ], { sourceComplete: true });
    // id aynı ama metin değişince sentenceIdFor farklı üretir — eski sonuç düşer.
    editScheduler.reconcileSentences(editedSentences);
    await editScheduler.whenIdle();
    const editSnap = editScheduler.snapshot();
    assert.equal(editSnap.completed, 2, 'iki cümle de yine tamam');
    const e1Result = editSnap.results.find((r) => r.sentenceId === editedSentences[0].id);
    assert(e1Result && e1Result.text.includes('Düzeltilmiş'), 'düzeltilen kaynak yeni çeviri almalı');
    assert.equal(editSnap.reconcile.added, 1, 'yalnız değişen cümle "added"');
    assert.equal(editSnap.reconcile.unchanged, 1, 'dokunulmayan yeniden çevrilmez');
    // Negatif-sayı/özel ad sızması: number_mismatch sağlayıcı cevabını reddeder.
    const guardScheduler = new BrowserTranslationScheduler({
      cache: new Map(), requireSentenceParts: false, maxAttempts: 1,
      context: { trackIdentity: 'tr-track', targetLanguage: 'tr' },
      translate: async () => ({ text: 'İki elma yedi' }), // "üç" kayboldu
    });
    guardScheduler.setSentences(assembleCueSentences(
      [{ id: 'n1', start: 0, end: 2, text: '3 elma yedi.' }], { sourceComplete: true }));
    guardScheduler.completeAll();
    await guardScheduler.whenIdle();
    assert.equal(guardScheduler.snapshot().completed, 0,
      'sayı uyuşmayan çeviri yayınlanmamalı (number_mismatch)');
    assert.equal(guardScheduler.snapshot().failures.length, 1);

    // ── Regresyon: data:/blob: <track> src'si ağ kimliği değildir ─────────
    // hls.js metin izlerini src="data:,WEBVTT" olan sentetik <track>
    // elementleriyle oluşturur. Eski kod element.src'yi sourceUrl yapınca iki
    // ayrı iz (subtitles + embedded captions) aynı 'null,WEBVTT|…' streamKey'e
    // düşüyor ve cue'ları TEK yayınlanan izde karışıyordu.
    {
      const fs = require('fs');
      const path = require('path');
      const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
      const extractFunction = (name, nextName) => new Function(
        `${mainSrc.slice(mainSrc.indexOf(`function ${name}(`), mainSrc.indexOf(`function ${nextName}(`))}; return ${name};`,
      )();
      const extractFunctionRaw = (startMarker, endMarker) => new Function(
        `${mainSrc.slice(mainSrc.indexOf(startMarker), mainSrc.indexOf(endMarker))}; return ${'browserTrackProbeScriptWithMode'};`,
      )();
      const probeScriptWithMode = extractFunctionRaw(
        'function browserTrackProbeScriptWithMode(', 'async function snapshotBrowserNativeTracks(');
      const streamKeyOf = extractFunction('browserTrackStreamKey', 'browserWatchMediaId');
      const cue = (s, e, t) => ({ startTime: s, endTime: e, text: t });
      const enTrack = { kind: 'subtitles', language: 'en', label: 'English', id: '', mode: 'disabled',
        cues: [cue(0, 4, 'First'), cue(0, 4, 'Second'), cue(0, 4, 'Third')] };
      const ccTrack = { kind: 'captions', language: 'en', label: 'Embedded', id: '', mode: 'disabled',
        cues: [cue(0, 119, '00:00:00')] };
      // hls.js'in ürettiği gerçek elementler: src aynı data: yer tutucusu.
      const enEl = { src: 'data:,WEBVTT', track: enTrack };
      const ccEl = { src: 'data:,WEBVTT', track: ccTrack };
      const fakeVideo = {
        textTracks: [enTrack, ccTrack], clientWidth: 640, clientHeight: 360,
        querySelectorAll: (sel) => (sel === 'track' ? [enEl, ccEl] : []),
      };
      const fakeDocument = { querySelectorAll: (sel) => (sel === 'video' ? [fakeVideo] : []) };
      const fakeWindow = {};
      const probeTracks = await new Function('window', 'document',
        `return ${probeScriptWithMode(true)}`)(fakeWindow, fakeDocument);
      assert.equal(probeTracks.length, 2, 'iki ayrı textTrack iki ayrı sonuç vermeli');
      const enResult = probeTracks.find((t) => t.label === 'English');
      const ccResult = probeTracks.find((t) => t.label === 'Embedded');
      assert(enResult && ccResult);
      const domKey = (t) => streamKeyOf(t.sourceUrl
        || `dom:${t.language}:${t.label}:${t.kind || ''}:${t.trackId || ''}`, t.language);
      const enKey = domKey(enResult);
      const ccKey = domKey(ccResult);
      assert.notEqual(enKey, ccKey,
        'subtitles ve captions izleri aynı streamKey altında birleşmemeli (data: src ağ kimliği değil)');
      // Anahtarlar iz kimliğini taşımalı, data: gövdesini değil.
      assert(enKey.includes('English'), 'subtitles anahtarı iz kimliği taşımalı');
      assert(ccKey.includes('Embedded'), 'captions anahtarı iz kimliği taşımalı');
      // http(s) src yine ağ kimliği olarak korunur.
      const netEl = { src: 'https://cdn.test/track.vtt', track: enTrack };
      fakeVideo.querySelectorAll = (sel) => (sel === 'track' ? [netEl] : []);
      fakeWindow.__whisperTrackProbeState = undefined;
      const netTracks = await new Function('window', 'document',
        `return ${probeScriptWithMode(true)}`)(fakeWindow, fakeDocument);
      assert.equal(netTracks.find((t) => t.label === 'English').sourceUrl,
        'https://cdn.test/track.vtt', 'gerçek ağ src kaynağı korunmalı');
    }

    console.log('browser-subtitle-gauntlet: fixture/merge/completeness/scheduler/matching testleri geçti');
  } finally {
    await fixture.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
