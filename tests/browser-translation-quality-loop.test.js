'use strict';

// Rapor 403: tarayıcı canlı altyazı çevirisinde "hatalı cümle" döngüsü.
// Sayı kapısına takılan cümle her denemede yeniden ücretlendirilip sonsuza
// dek "hatalı" kalıyor, tek hatalı cümle bütün izin kaydını engelliyordu.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { BrowserTranslationScheduler, assembleCueSentences } = require('../src/browser-translation-scheduler');

const SOURCE = [{ id: 'n1', start: 0, end: 2, text: 'I have 3 apples.' }];
const BAD_STRICT = 'Elmalarım var.'; // sayı tamamen kayıp → number_mismatch

function makeScheduler(options) {
  const cache = new Map();
  const calls = [];
  const replies = options.replies.slice();
  const scheduler = new BrowserTranslationScheduler({
    cache, requireSentenceParts: false, retryBaseMs: 10, retryMaxMs: 20,
    context: { trackIdentity: 'track', targetLanguage: 'tr' },
    ...options.schedulerOptions,
    translate: async () => {
      calls.push(1);
      const next = replies.length > 1 ? replies.shift() : replies[0];
      if (next instanceof Error) throw next;
      return { text: next };
    },
  });
  scheduler.setSentences(assembleCueSentences(SOURCE, { sourceComplete: true }));
  return { scheduler, cache, calls };
}

test('sıkı mod: kalite kapısı en fazla 2 istek yakar ve tür "quality" olur', async () => {
  const { scheduler, calls } = makeScheduler({ replies: [BAD_STRICT] });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.equal(snap.completed, 0);
  assert.equal(calls.length, 2, 'aynı cümle için üçüncü ücretli istek açılmamalı');
  assert.equal(snap.failures[0].kind, 'quality');
  assert.equal(snap.failures[0].terminal, true);
});

test('elle yeniden deneme döngüyü bitirir: kapı yine itiraz ederse uyarıyla kabul, önbelleğe yazılmaz', async () => {
  const { scheduler, cache, calls } = makeScheduler({ replies: [BAD_STRICT] });
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(scheduler.retryFailed(), 1);
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.equal(snap.completed, 1, 'elle son deneme sonucu kabul edilmeli');
  assert.equal(snap.failures.length, 0);
  assert.equal(calls.length, 3, 'elle deneme tam bir istek yakar');
  assert.deepEqual(snap.results[0].qualityIssues, ['number_mismatch']);
  assert.equal(cache.size, 0, 'şüpheli çeviri kalıcı önbelleğe girmemeli');
  assert.equal(scheduler.stateSnapshot([]).qualityAccepted, 1);
});

test('elle yeniden denemede istek düşerse önceki aday kullanılır', async () => {
  const transient = Object.assign(new Error('bağlantı koptu'), { transportError: true });
  const { scheduler } = makeScheduler({ replies: [BAD_STRICT, BAD_STRICT, transient] });
  scheduler.completeAll();
  await scheduler.whenIdle();
  scheduler.retryFailed();
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.equal(snap.completed, 1);
  assert.equal(snap.results[0].text, BAD_STRICT);
  assert.equal(snap.failures.length, 0);
});

test('gevşek mod: kapıya takılan çeviri ilk istekte yazılır, önbelleğe girmez', async () => {
  const { scheduler, cache, calls } = makeScheduler({
    replies: [BAD_STRICT], schedulerOptions: { lenient: true },
  });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.equal(snap.completed, 1);
  assert.equal(calls.length, 1);
  assert.equal(cache.size, 0);
  assert.deepEqual(snap.results[0].qualityIssues, ['number_mismatch']);
});

test('gevşek mod: temiz çeviri önbelleğe yazılır ve uyarı taşımaz', async () => {
  const { scheduler, cache } = makeScheduler({
    replies: ['3 elmam var.'], schedulerOptions: { lenient: true },
  });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.snapshot();
  assert.equal(snap.completed, 1);
  assert.equal(cache.size, 1);
  assert.equal(snap.results[0].qualityIssues, undefined);
});

test('onlyTransient: ağ dönüşü kalite hatalarını yeniden ücretlendirmez', async () => {
  const { scheduler, calls } = makeScheduler({ replies: [BAD_STRICT] });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const before = calls.length;
  assert.equal(scheduler.retryFailed({ onlyTransient: true }), 0);
  await scheduler.whenIdle();
  assert.equal(calls.length, before);
  assert.equal(scheduler.snapshot().failures.length, 1, 'kalite hatası elle denemeye kalır');
});

test('onlyTransient: geçici hata yine yeniden denenir', async () => {
  const transient = Object.assign(new Error('HTTP 503'), { httpStatus: 503 });
  const { scheduler } = makeScheduler({
    replies: [transient, transient, transient, '3 elmam var.'],
    schedulerOptions: { maxAttempts: 3 },
  });
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().failures[0].kind, 'transient');
  assert.equal(scheduler.retryFailed({ onlyTransient: true }), 1);
  await scheduler.whenIdle();
  assert.equal(scheduler.snapshot().completed, 1);
});

test('main.js: gevşek ayar bağlı, kısmi kayıt yapılır, ağ dönüşü yalnız geçici hataları dener', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const config = main.slice(main.indexOf('function browserTranslationConfig('),
    main.indexOf('function browserMangaTranslationConfig('));
  assert.match(config, /lenient: ui\.translateLenient !== false/);
  const start = main.slice(main.indexOf('function startBrowserTranslation('),
    main.indexOf('function persistCompletedBrowserTranslation('));
  assert.match(start, /lenient: config\.lenient === true/);
  assert.match(start, /persistCompletedBrowserTranslation\(tab, scheduler, config, scheduler\.context, \{ partial: true \}\)/);
  const persist = main.slice(main.indexOf('function persistCompletedBrowserTranslation('),
    main.indexOf('function stopBrowserLiveAsr('));
  assert.match(persist, /partial\s*\?\s*\{[^}]*autoLoad: false, partial: true \}\s*:\s*\{[^}]*autoLoad: true \}/);
  const online = main.slice(main.indexOf("ipcMain.handle('browser:network:setOnline'"),
    main.indexOf("ipcMain.handle('browser:liveAsr:start'"));
  assert.equal((online.match(/retryFailed\(\{ onlyTransient: true \}\)/g) || []).length, 2);
  assert.doesNotMatch(online, /retryFailed\(\)/);
});

test('renderer: erken çıkan yeniden çeviri bayrakları sonraki "Çevir"e sızmaz', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const handler = renderer.slice(renderer.indexOf("$('makeTransBtn').addEventListener('click'"),
    renderer.indexOf('opts.translateOnly = true;'));
  const runningGuard = handler.slice(0, handler.indexOf('Zaten bir iş çalışıyor'));
  assert.match(runningGuard, /clearPendingRetranslateIntent\(\)/);
  const noSource = handler.slice(handler.indexOf('if (!sourcePath || !sourceCues.length)'));
  assert.match(noSource, /clearPendingRetranslateIntent\(\{ dropSnapshot: true \}\)[\s\S]*?Önce kaynak rolünde/);
  const range = renderer.slice(renderer.indexOf('async function startRangeRetranslate('),
    renderer.indexOf('let abRunning = false;'));
  assert.ok(range.indexOf('state.running') < range.indexOf('state.retranslateSnapshot'),
    'çalışan iş varken anlık görüntü ezilmemeli');
  // Davranış: yardımcı bayrakları ve A/B bekleyicisini sıfırlar.
  const fnSource = renderer.slice(renderer.indexOf('function clearPendingRetranslateIntent('),
    renderer.indexOf("if ($('makeTransBtn')) {"));
  const state = { forceRetranslate: true, translateCueRange: '1:2', translateModelOverride: 'x',
    translateVariantLabel: 'ab-a', retranslateSnapshot: { cues: [] }, abCollect: null };
  let resolved = 'no';
  state.abCollect = { resolve: (value) => { resolved = value; } };
  const clear = new Function('state', `${fnSource}; return clearPendingRetranslateIntent;`)(state);
  clear();
  assert.equal(state.forceRetranslate, false);
  assert.equal(state.translateCueRange, null);
  assert.equal(state.translateModelOverride, null);
  assert.equal(state.translateVariantLabel, null);
  assert.ok(state.retranslateSnapshot, 'varsayılan çağrı çalışan işin anlık görüntüsünü korur');
  assert.equal(resolved, null, 'A/B bekleyicisi asılı kalmamalı');
  clear({ dropSnapshot: true });
  assert.equal(state.retranslateSnapshot, null);
});

test('renderer: uyarıyla kabul edilen çeviri işaretlenir, temiz sonuç işareti kaldırır', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const take = (name, next) => renderer.slice(renderer.indexOf(`function ${name}(`), renderer.indexOf(next));
  const source = [
    take('browserTranslationCueKey', 'function browserTranslationMapFromCues('),
    take('mergeBrowserTranslationCues', 'function cueQualityWarningIcon('),
  ].join('\n');
  const { merge, flags } = new Function(`${source}; return { merge: mergeBrowserTranslationCues, flags: qualityWarningsForCues };`)();
  const map = new Map();
  merge(map, [{ cueId: 'a', start: 0, end: 2, text: 'Elmalarım var.' }], ['number_mismatch']);
  merge(map, [{ cueId: 'b', start: 3, end: 5, text: 'Temiz.' }], null);
  assert.equal(map.get('a').qualityWarning, true);
  assert.equal(map.get('b').qualityWarning, undefined);
  const cues = [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }];
  assert.deepEqual(flags(cues, [...map.values()]), [true, false, false]);
  merge(map, [{ cueId: 'a', start: 0, end: 2, text: '3 elmam var.' }], []);
  assert.equal(map.get('a').qualityWarning, undefined, 'yeni temiz çeviri uyarıyı kaldırmalı');
  assert.match(renderer, /player\.qualityOnly && !lowConfidence && !qualityFlags\[i\]/,
    'kalite süzgeci uyarılı satırları da göstermeli');
});

test('tasarım: browser yan paneli dört sekmeyi de gösterir, bölüm başlıkları amber değildir', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-chrome.css'), 'utf8');
  assert.match(css, /workspace-browser \.side-tab \.side-tab-icon \{ display: none; \}/, 'çift ikon (SVG + elmas) kalmamalı');
  assert.match(css, /\.side-tab:not\(\.active\) > span:not\(\.side-tab-ico\):not\(\.side-tab-icon\) \{[\s\S]*?clip-path: inset\(50%\)/,
    'etkin olmayan sekme etiketi görsel olarak gizlenip erişilebilir kalmalı');
  assert.match(css, /browser-subtitle-review > summary \{[\s\S]*?color: var\(--text-secondary\)/);
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.match(html, /id="sideTabTools"[^>]*title="Araçlar"/);
  assert.match(html, /id="sideTabSubs"[^>]*title="Altyazılar"/);
});

test('main.js: yalnız ertelenmiş hatalar varken yeniden deneme hata göstermez', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const handler = main.slice(main.indexOf("ipcMain.handle('browser:translation:retryFailed'"),
    main.indexOf("ipcMain.handle('browser:network:setOnline'"));
  assert.match(handler, /hadFailures[\s\S]*?\{ ok: true, retried: 0, deferred: true \}/);
});

// Kalite kesicisi: tek hatalı cümle döngü değildir, ama art arda kapıya takılan
// cümleler kapı–model uyumsuzluğudur; cümle başına iki ücretli istek yakmak
// yerine oturum uyarıyla kabul etmeye geçer.
function makeManyScheduler({ count, isBad, schedulerOptions = {} }) {
  const cache = new Map();
  const calls = [];
  const cues = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`, start: i * 4, end: i * 4 + 2, text: `I have ${i + 3} apples${isBad(i) ? ' bad' : ''}.`,
  }));
  const scheduler = new BrowserTranslationScheduler({
    cache, requireSentenceParts: false, retryBaseMs: 10, retryMaxMs: 20, maxConcurrent: 1,
    context: { trackIdentity: 'track', targetLanguage: 'tr' },
    ...schedulerOptions,
    translate: async (sentence) => {
      calls.push(sentence.id);
      const number = String(sentence.text).match(/\d+/)[0];
      return { text: /bad/.test(sentence.text) ? 'Elmalarım var.' : `Bende ${number} elma var.` };
    },
  });
  scheduler.setSentences(assembleCueSentences(cues, { sourceComplete: true }));
  return { scheduler, cache, calls };
}

test('kalite kesicisi: art arda kapı reddi oturumu uyarıyla kabule geçirir, istek fırtınası olmaz', async () => {
  const { scheduler, cache, calls } = makeManyScheduler({ count: 30, isBad: () => true });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.stateSnapshot([]);
  assert.equal(snap.qualityAutoLenient, true, 'kesici açılmalı');
  assert.equal(scheduler.snapshot().completed, 30, 'tüm cümleler uyarıyla kabul edilmeli');
  assert.equal(scheduler.snapshot().failures.length, 0);
  // Kesici olmadan 30 cümle × 2 istek = 60 istek yanardı.
  assert.ok(calls.length <= 4 * 2 + 30, `istek sayısı ${calls.length}: kesici yeterince erken açılmadı`);
  assert.ok(calls.length < 60, 'kesicisiz üst sınır olan 60 istek aşıldı');
  assert.equal(cache.size, 0, 'uyarıyla kabul edilen çeviriler önbelleğe girmemeli');
  assert.ok(scheduler.snapshot().results.every((r) => r.qualityIssues && r.qualityIssues.length));
});

test('kalite kesicisi: tek hatalı cümle kesiciyi açmaz, araya giren temiz çeviri sayacı sıfırlar', async () => {
  const { scheduler } = makeManyScheduler({ count: 24, isBad: (i) => i % 3 === 0 });
  scheduler.completeAll();
  await scheduler.whenIdle();
  const snap = scheduler.stateSnapshot([]);
  assert.equal(snap.qualityAutoLenient, false, 'dağınık tekil hatalar kesiciyi açmamalı');
  // Sıkı mod sözleşmesi korunur: hatalı cümleler terminal "quality" olarak kalır.
  assert.equal(scheduler.snapshot().failures.filter((f) => f.kind === 'quality').length, 8);
  assert.equal(scheduler.snapshot().completed, 16);
});

test('kalite kesicisi: gevşek modda gereksizdir ve sayaç tutulmaz', async () => {
  const { scheduler, calls } = makeManyScheduler({
    count: 10, isBad: () => true, schedulerOptions: { lenient: true } });
  scheduler.completeAll();
  await scheduler.whenIdle();
  assert.equal(calls.length, 10, 'gevşek mod cümle başına tek istek yakar');
  assert.equal(scheduler.stateSnapshot([]).qualityAutoLenient, false);
});

test('quality breaker accepts its triggering candidate even with one attempt', async () => {
  for (const maxConcurrent of [1, 4]) {
    const { scheduler, cache, calls } = makeManyScheduler({ count: 4, isBad: () => true,
      schedulerOptions: { maxAttempts: 1, maxConcurrent } });
    scheduler.completeAll();
    await scheduler.whenIdle();
    const snapshot = scheduler.snapshot();
    assert.equal(snapshot.completed, 4);
    assert.equal(snapshot.failures.length, 0);
    assert.equal(calls.length, 4);
    assert.equal(cache.size, 0);
    assert.ok(snapshot.results.every(result => result.qualityIssues.includes('number_mismatch')));
  }
});
