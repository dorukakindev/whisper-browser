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
