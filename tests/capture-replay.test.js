// Kuyruk-50 madde 23 — capture tekrar oynatma düzeneği davranış kilitleri.
const { readFileSync } = require('fs');
const path = require('path');
const assert = require('assert');

async function load() {
  return import('../tools/capture-replay.mjs');
}

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const {
    loadCaptureRecording, replayCaptureRecording, compareReplayRuns, replaySuite, sanitizeCaptureEvent,
  } = await load();

  const hls = loadCaptureRecording(readFileSync(
    path.join(__dirname, 'fixtures', 'capture', 'hls-session.jsonl'), 'utf8'));
  const dashCea = loadCaptureRecording(readFileSync(
    path.join(__dirname, 'fixtures', 'capture', 'dash-ttml-session.jsonl'), 'utf8'));

  // ---- Mahremiyet kapısı ----
  check('fixture-dışı alan reddedilir', (() => {
    try { sanitizeCaptureEvent({ type: 'segment', url: 'https://netflix.com/x.vtt', body: 'x' }, 0); return false; }
    catch (e) { return /anonimleştirilmemiş/.test(e.message); }
  })());
  check('userinfo reddedilir', (() => {
    try { sanitizeCaptureEvent({ type: 'segment', url: 'https://u:p@capture-fixture.local/x', body: 'x' }, 0); return false; }
    catch (e) { return /userinfo/.test(e.message); }
  })());
  check('query parametresi reddedilir (token sızıntısı önlemi)', (() => {
    try { sanitizeCaptureEvent({ type: 'segment', url: 'https://capture-fixture.local/x?t=secret', body: 'x' }, 0); return false; }
    catch (e) { return /query\/fragment/.test(e.message); }
  })());
  check('bozuk JSON satırı konumlu hata', (() => {
    try { loadCaptureRecording('{"type":"segment"}\n{bozuk'); return false; }
    catch (e) { return /satır 2/.test(e.message); }
  })());
  check('bilinmeyen type reddedilir', (() => {
    try { sanitizeCaptureEvent({ type: 'cookie', body: 'x' }, 0); return false; }
    catch (e) { return /bilinmeyen type/.test(e.message); }
  })());
  check('http şeması kabul (fixture host)', (() => {
    const e = sanitizeCaptureEvent({ type: 'segment', url: 'http://capture-fixture.local/x', body: 'x' }, 0);
    return e.url.startsWith('http://');
  })());

  // ---- Temel oynatma ----
  const baseHls = replayCaptureRecording(hls, { mode: 'inorder' });
  check('HLS: 3 segment → 6 cue', baseHls.cues.length === 6, String(baseHls.cues.length));
  check('HLS: playlist 3 segment bildirir', baseHls.playlistSegments.get('hls|en').length === 3);
  check('HLS: kanonik sıra zamanla artar', baseHls.cues.every((c, i, a) => i === 0 || a[i - 1].start <= c.start));
  check('HLS: digest 64-hex', /^[0-9a-f]{64}$/.test(baseHls.digest));
  check('HLS: aynı kayıt aynı digest', replayCaptureRecording(hls).digest === baseHls.digest);

  const baseDc = replayCaptureRecording(dashCea, { mode: 'inorder' });
  check('DASH/TTML+CEA: 8 cue', baseDc.cues.length === 8, String(baseDc.cues.length));
  check('iki akış ayrı merge edilir', baseDc.streams.length === 2, baseDc.streams.join());

  // ---- Sıra bozulması: tamamlanmış kayıtta deterministik sonuç ----
  for (const seed of [1, 7, 42, 2026]) {
    const shuffled = replayCaptureRecording(hls, { mode: 'shuffle', seed });
    const diff = compareReplayRuns(baseHls, shuffled);
    check(`HLS shuffle seed=${seed} → aynı cue çok-kümesi`, diff.identical,
      JSON.stringify({ missing: diff.missing, extra: diff.extra }));
  }
  const shuffledDc = replayCaptureRecording(dashCea, { mode: 'shuffle', seed: 9 });
  check('DASH shuffle → aynı çok-küme', compareReplayRuns(baseDc, shuffledDc).identical);

  // ---- Eksik segment: tam delta ----
  const dropped = replayCaptureRecording(hls, { mode: 'inorder', drop: [2] });
  const dropDiff = compareReplayRuns(baseHls, dropped);
  check('segment-1 düşürülünce 4 cue kalır', dropped.cues.length === 4, String(dropped.cues.length));
  check('eksik delta tam 2 cue', dropDiff.missing.length === 2 && dropDiff.extra.length === 0,
    JSON.stringify(dropDiff));
  check('eksik cue\'lar seg1 zamanları', dropDiff.missing.every((k) => k.startsWith('4|') || k.startsWith('6|')), dropDiff.missing.join(';'));

  // ---- Tekrar teslim: dedupe ----
  const dup = replayCaptureRecording(hls, { mode: 'dup' });
  check('çift teslim → aynı sonuç', compareReplayRuns(baseHls, dup).identical);
  const dupDc = replayCaptureRecording(dashCea, { mode: 'dup' });
  check('DASH çift teslim → aynı sonuç', compareReplayRuns(baseDc, dupDc).identical);

  // ---- Suite çıktısı ----
  const suite = replaySuite(hls, { seeds: [3] });
  check('suite: base digest + dup stable + shuffle raporu', /^[0-9a-f]{64}$/.test(suite.base.digest)
    && suite.dup.diff.identical === true && suite.shuffles.length === 1);
  check('suite: playlistCoverage bildirir', suite.playlistCoverage[0].declared === 3);

  // ---- Kenar: parse-empty segment atlanır, kayıt sürer ----
  const withEmpty = hls.concat([{ type: 'segment', streamKey: 'hls|en',
    url: 'https://capture-fixture.local/hls/seg9.vtt', mimeType: 'text/vtt', body: 'WEBVTT\n\nX NOTE yorum', index: 4 }]);
  const withEmptyRun = replayCaptureRecording(withEmpty);
  check('boş segment atlanır', withEmptyRun.skipped.length === 1 && withEmptyRun.cues.length === 6,
    JSON.stringify(withEmptyRun.skipped));

  console.log(`capture-replay: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error('capture-replay harness hatası:', error); process.exit(1); });
