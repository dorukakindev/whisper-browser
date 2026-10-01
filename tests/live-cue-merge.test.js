'use strict';
// R399 (kuyruk-g12): canli HLS — mergeLiveCues/replaceLiveCuesForRefresh
// invariant'lari. playlist kaymasi/rolling refresh senaryolarinin mukerrer
// cue davranisi kilitlenir.
const assert = require('node:assert');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');

function slice(from, to) {
  const a = renderer.indexOf(from), b = renderer.indexOf(to);
  assert(a >= 0 && b > a, `slice ${from}`);
  return renderer.slice(a, b);
}
const ctx = vm.createContext({ console, window: {} });
vm.runInContext(slice('function cueKey', 'function applyCueQuality'), ctx);
vm.runInContext(slice('function applyCueQuality', 'function progressiveRanges'), ctx);

const { mergeLiveCues, replaceLiveCuesForRefresh } = ctx;
const cue = (start, end, text, extra = {}) => ({ start, end, text, ...extra });
const t = (name, fn) => { fn(); console.log(`ok ${name}`); };

t('mukerrer: ayni zamanli cue tek kalir (rolling playlist re-emit)', () => {
  const existing = [cue(0, 4, 'a'), cue(4, 8, 'b')];
  const again = [cue(4, 8, 'b'), cue(8, 12, 'c')];
  const merged = mergeLiveCues(existing, again);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((c) => c.text), ['a', 'b', 'c']);
});

t('idempotent: merge(merge(x,y),y) JSON-esit (seri haliyle mukerrer yok)', () => {
  const a = [cue(0, 2, 'x'), cue(2, 4, 'y')];
  const b = [cue(2, 4, 'y2', { confidence: 0.5 }), cue(4, 6, 'z')];
  const once = mergeLiveCues(a, b);
  const twice = mergeLiveCues(once, b);
  assert.equal(JSON.stringify(once), JSON.stringify(twice));
  assert.equal(twice.length, once.length);
});

t('guncellenen cue confidence tazelenir, tanimlanmayan alan korunur', () => {
  const merged = mergeLiveCues(
    [cue(0, 4, 'a', { confidence: 0.9, lowConfidenceWords: 3 })],
    [cue(0, 4, 'a', { confidence: 0.4 })]);
  assert.equal(merged[0].confidence, 0.4);
  assert.equal(merged[0].lowConfidenceWords, 3);
});

t('playlist kaymasi: ayni metin yeni zamanda ayri cue (zaman-cizgisi gercegi)', () => {
  const merged = mergeLiveCues([cue(0, 4, 'reklam')], [cue(30, 34, 'reklam')]);
  assert.equal(merged.length, 2, 'kaymis zaman = ayri cue girdisi');
});

t('refresh tam liste degisimi: aralik yoksa eski tum cue yerini alir', () => {
  const out = replaceLiveCuesForRefresh(
    [cue(0, 4, 'eski-a'), cue(4, 8, 'eski-b')],
    [cue(0, 4, 'yeni-a'), cue(10, 14, 'yeni-c')]);
  assert.deepEqual(out.map((c) => c.text), ['yeni-a', 'yeni-c']);
});

t('refresh aralikla: aralik disi cue korunur, icdekiler degisir', () => {
  const previous = [cue(0, 4, 'p1'), cue(10, 14, 'ic-degisecek'), cue(50, 54, 'p3')];
  const fresh = [cue(10, 12, 'ic-yeni-1'), cue(12, 14, 'ic-yeni-2')];
  const out = replaceLiveCuesForRefresh(previous, fresh, { start: 10, end: 14 });
  assert.deepEqual(out.map((c) => c.text), ['p1', 'ic-yeni-1', 'ic-yeni-2', 'p3']);
});

t('refresh acik uclu aralik: end bos ise sonsuz kabul', () => {
  const previous = [cue(0, 4, 'p1'), cue(20, 24, 'ic')];
  const out = replaceLiveCuesForRefresh(previous, [cue(20, 22, 'yeni')], { start: 20, end: '' });
  assert.deepEqual(out.map((c) => c.text), ['p1', 'yeni']);
});

t('sirali cikis garantisi (kaynak karisik gelse bile)', () => {
  const out = mergeLiveCues([cue(8, 10, 'c')], [cue(0, 2, 'a'), cue(4, 6, 'b')]);
  assert.deepEqual(out.map((c) => c.start), [0, 4, 8]);
});

t('bozuk aralik (end<=start) tam-yenilemeye duser, cokmez', () => {
  const out = replaceLiveCuesForRefresh([cue(0, 4, 'a')], [cue(1, 3, 'b')], { start: 5, end: 2 });
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'b');
});

// seek sirasinda aktif cue hesabinin kilit noktasi: dizide mukerrer yok
t('seek sonrasi dedupe: yeniden gelen kisim mukerrer cue uretmez', () => {
  // seek ile ayni bolum segmenti ikinci kez gelir (player geriye sarip
  // tekrar oynatir); zaman damgalari ayniysa tek cue kalir.
  const merged = mergeLiveCues(
    [cue(0, 4, 'a'), cue(4, 8, 'b'), cue(8, 12, 'c')],
    [cue(4, 8, 'b'), cue(8, 12, 'c')]);
  assert.equal(merged.length, 3);
});

console.log('live-cue-merge: 10 kontrol gecti');
