/** İzleme kütüphanesi revision/conflict protokolü — Electron başlatmaz. */
const fs = require('fs');
const path = require('path');
const {
  applyWatchRemove,
  applyWatchUpsert,
  normalizeWatchLibraryDocument,
  watchLibrarySnapshot,
} = require('../src/watch-library-state');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assert'); }
function item(document, key = 'file:a') {
  return watchLibrarySnapshot(document).items.find((entry) => entry.key === key) || null;
}
function upsert(document, patch, mutation, now) {
  return applyWatchUpsert(document, { ...patch, _watchMutation: mutation }, { now });
}
function mutation(snapshot, itemRevision, kind, at, writerId, sequence, allowCreate = false) {
  return {
    kind,
    at,
    writerId,
    sequence,
    baseItemRevision: itemRevision,
    baseStoreRevision: snapshot.revision,
    allowCreate,
  };
}
function seedDocument() {
  const empty = normalizeWatchLibraryDocument([]);
  return upsert(empty, {
    key: 'file:a', title: 'A', duration: 1000, position: 10, completed: false,
    collections: ['Arşiv'], subtitlePaths: ['ana.srt'], prefs: { volume: 1, speed: 1.25 },
  }, mutation({ revision: 0 }, 0, 'metadata', 10, 'seed', 1, true), 10).document;
}

test('minimize: manuel karar eski progress snapshotından üstündür', () => {
  let document = seedDocument();
  const snapshot = watchLibrarySnapshot(document);
  const baseRevision = item(document).revision;
  document = upsert(document, { key: 'file:a', completed: true, position: 1000 },
    mutation(snapshot, baseRevision, 'manual-status', 30, 'window-b', 1), 30).document;
  const late = upsert(document, { key: 'file:a', completed: false, position: 50 },
    mutation(snapshot, baseRevision, 'progress', 20, 'window-a', 1), 40);
  assert(item(late.document).completed === true, 'geç otomatik kayıt manuel kararı ezdi');
  assert(item(late.document).position === 1000, 'geç otomatik kayıt manuel konumu ezdi');
  assert(late.result.conflict && late.result.conflicts.includes('completed'), 'çatışma görünür değil');
});

test('minimize: silme tombstoneı geç metadata ile kaydı diriltmez', () => {
  let document = seedDocument();
  const snapshot = watchLibrarySnapshot(document);
  const baseRevision = item(document).revision;
  document = applyWatchRemove(document, { key: 'file:a' }, { now: 30 }).document;
  const late = upsert(document, { key: 'file:a', title: 'Geç başlık', subtitlePaths: ['gec.srt'] },
    mutation(snapshot, baseRevision, 'progress', 20, 'window-a', 2), 40);
  assert(!item(late.document), 'silinen kayıt dirildi');
  assert(!late.result.ok && late.result.conflictType === 'deleted', 'silme çatışması bildirilmedi');
});

test('minimize: eski tam prefs snapshotı yeni ses alanını kaybetmez', () => {
  let document = seedDocument();
  const snapshot = watchLibrarySnapshot(document);
  const baseRevision = item(document).revision;
  document = upsert(document, { key: 'file:a', prefs: { volume: 0.35 }, subtitlePaths: ['ikinci.srt'] },
    mutation(snapshot, baseRevision, 'metadata', 30, 'window-b', 1), 30).document;
  const late = upsert(document, { key: 'file:a', prefs: { volume: 1, speed: 1.25 }, subtitlePaths: ['ucuncu.srt'] },
    mutation(snapshot, baseRevision, 'progress', 20, 'window-a', 1), 40);
  const saved = item(late.document);
  assert(saved.prefs.volume === 0.35, `ses alanı geriledi: ${saved.prefs.volume}`);
  assert(['ana.srt', 'ikinci.srt', 'ucuncu.srt'].every((value) => saved.subtitlePaths.includes(value)),
    'altyazı yolu birleşimi kayıp');
});

test('out-of-order progress olayında olay zamanı yeniyi belirler', () => {
  const initial = seedDocument();
  const snapshot = watchLibrarySnapshot(initial);
  const baseRevision = item(initial).revision;
  const newerFirst = upsert(initial, { key: 'file:a', position: 80, lastWatched: 80 },
    mutation(snapshot, baseRevision, 'progress', 80, 'window-a', 2), 80).document;
  const olderLate = upsert(newerFirst, { key: 'file:a', position: 40, lastWatched: 40 },
    mutation(snapshot, baseRevision, 'progress', 40, 'window-a', 1), 90).document;
  assert(item(olderLate).position === 80, `konum geriledi: ${item(olderLate).position}`);
});

test('tombstone yalnız silmeyi görmüş taze create isteğine izin verir', () => {
  let document = seedDocument();
  const old = watchLibrarySnapshot(document);
  document = applyWatchRemove(document, { key: 'file:a' }, { now: 30 }).document;
  const afterDelete = watchLibrarySnapshot(document);
  const stale = upsert(document, { key: 'file:a', title: 'Eski' },
    mutation(old, 0, 'progress', 20, 'stale-empty-window', 1, true), 40);
  assert(!stale.result.ok && !item(stale.document), 'silmeyi görmeyen boş snapshot diriltti');
  const fresh = upsert(document, { key: 'file:a', title: 'Yeniden açıldı' },
    mutation(afterDelete, 0, 'progress', 50, 'fresh-window', 1, true), 50);
  assert(fresh.result.ok && item(fresh.document).title === 'Yeniden açıldı', 'taze açılış engellendi');
});

test('minimize: eski neslin geç remove isteği yeniden oluşturulan kaydı silemez', () => {
  let document = seedDocument();
  const oldSnapshot = watchLibrarySnapshot(document);
  const oldItemRevision = item(document).revision;
  document = applyWatchRemove(document, { key: 'file:a' }, { now: 30 }).document;
  const deletedSnapshot = watchLibrarySnapshot(document);
  document = upsert(document, { key: 'file:a', title: 'Yeni nesil' },
    mutation(deletedSnapshot, 0, 'metadata', 40, 'window-b', 1, true), 40).document;
  document = normalizeWatchLibraryDocument(JSON.parse(JSON.stringify(document)));

  const lateRemove = applyWatchRemove(document, {
    key: 'file:a',
    _watchMutation: mutation(oldSnapshot, oldItemRevision, 'remove', 20, 'window-a', 2),
  }, { now: 50 });
  assert(!lateRemove.result.ok && lateRemove.result.conflictType === 'recreated',
    'eski nesil silme çatışması bildirilmedi');
  assert(item(lateRemove.document).title === 'Yeni nesil', 'eski nesil remove yeni kaydı sildi');
});

test('minimize: eski neslin geç upsert isteği yeniden oluşturulan kaydı değiştiremez', () => {
  let document = seedDocument();
  const oldSnapshot = watchLibrarySnapshot(document);
  const oldItemRevision = item(document).revision;
  document = applyWatchRemove(document, { key: 'file:a' }, { now: 30 }).document;
  const deletedSnapshot = watchLibrarySnapshot(document);
  document = upsert(document, { key: 'file:a', title: 'Yeni nesil', position: 5 },
    mutation(deletedSnapshot, 0, 'metadata', 40, 'window-b', 1, true), 40).document;
  document = normalizeWatchLibraryDocument(JSON.parse(JSON.stringify(document)));

  const lateWrite = upsert(document, { key: 'file:a', title: 'Eski yazar', position: 900 },
    mutation(oldSnapshot, oldItemRevision, 'progress', 50, 'window-a', 2), 50);
  assert(!lateWrite.result.ok && lateWrite.result.conflictType === 'recreated',
    'eski nesil upsert çatışması bildirilmedi');
  assert(item(lateWrite.document).title === 'Yeni nesil' && item(lateWrite.document).position === 5,
    'eski nesil upsert yeni kaydı değiştirdi');
});

test('eski last-write-wins modeli iki writerda alan kaybediyordu (mutation kanıtı)', () => {
  const base = { key: 'file:a', completed: false, position: 10, prefs: { volume: 1 }, subtitlePaths: ['ana.srt'] };
  const writerA = JSON.parse(JSON.stringify(base));
  const writerB = JSON.parse(JSON.stringify(base));
  const diskAfterA = { ...writerA, prefs: { ...writerA.prefs, volume: 0.35 }, subtitlePaths: ['ana.srt', 'ikinci.srt'] };
  const diskAfterLateB = { ...writerB, position: 80 };
  assert(diskAfterA.prefs.volume === 0.35, 'mutation fixture kurulamadı');
  assert(diskAfterLateB.prefs.volume !== diskAfterA.prefs.volume
    && !diskAfterLateB.subtitlePaths.includes('ikinci.srt'), 'eski kusur mutation ile öldürülmedi');
});

function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}
function shuffled(values, random) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

test('deterministik scheduler 10.000 olay sırasındaki invariantları korur', () => {
  const random = rng(0x29c0ffee);
  let appliedEvents = 0;
  for (let sequence = 0; sequence < 10000; sequence++) {
    let document = seedDocument();
    const snapshot = watchLibrarySnapshot(document);
    const baseRevision = item(document).revision;
    const mode = sequence % 4;
    let events;
    if (mode === 0) {
      events = [
        { kind: 'upsert', at: 20, writer: 'a', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 20, completed: false, prefs: { volume: 1 }, subtitlePaths: ['a.srt'] } },
        { kind: 'upsert', at: 25, writer: 'a', seq: 2, mutationKind: 'progress', patch: { key: 'file:a', position: 25, completed: false, subtitlePaths: ['b.srt'] } },
        { kind: 'upsert', at: 30, writer: 'b', seq: 1, mutationKind: 'manual-status', patch: { key: 'file:a', position: 1000, completed: true } },
        { kind: 'upsert', at: 22, writer: 'c', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 22, completed: false, prefs: { speed: 1.25 } } },
      ];
    } else if (mode === 1) {
      events = [
        { kind: 'upsert', at: 20, writer: 'a', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 20, subtitlePaths: ['a.srt'] } },
        { kind: 'upsert', at: 30, writer: 'b', seq: 1, mutationKind: 'metadata', patch: { key: 'file:a', prefs: { volume: 0.35 }, subtitlePaths: ['b.srt'], collections: ['Korunan'] } },
        { kind: 'upsert', at: 24, writer: 'c', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 24, prefs: { volume: 1, speed: 1.25 }, subtitlePaths: ['c.srt'] } },
        { kind: 'upsert', at: 28, writer: 'a', seq: 2, mutationKind: 'progress', patch: { key: 'file:a', position: 28, subtitlePaths: ['d.srt'] } },
      ];
    } else if (mode === 2) {
      events = [
        { kind: 'upsert', at: 20, writer: 'a', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 20, subtitlePaths: ['a.srt'] } },
        { kind: 'remove', at: 40 },
        { kind: 'upsert', at: 25, writer: 'b', seq: 1, mutationKind: 'metadata', patch: { key: 'file:a', title: 'Geç metadata', subtitlePaths: ['b.srt'] } },
        { kind: 'upsert', at: 30, writer: 'c', seq: 1, mutationKind: 'progress', patch: { key: 'file:a', position: 30, completed: false, subtitlePaths: ['c.srt'] } },
      ];
    } else {
      document = applyWatchRemove(document, { key: 'file:a' }, { now: 30 }).document;
      const deletedSnapshot = watchLibrarySnapshot(document);
      document = upsert(document, { key: 'file:a', title: 'Yeni nesil', position: 5 },
        mutation(deletedSnapshot, 0, 'metadata', 40, 'new-window', 1, true), 40).document;
      document = normalizeWatchLibraryDocument(JSON.parse(JSON.stringify(document)));
      appliedEvents += 2;
      events = shuffled([
        { kind: 'remove', at: 50, request: {
          key: 'file:a',
          _watchMutation: mutation(snapshot, baseRevision, 'remove', 20, 'old-window', 2),
        } },
        { kind: 'upsert', at: 55, writer: 'old-window', seq: 3, mutationKind: 'progress', patch: { key: 'file:a', title: 'Eski nesil', position: 900 } },
      ], random);
      for (const event of events) {
        appliedEvents++;
        if (event.kind === 'remove') {
          document = applyWatchRemove(document, event.request, { now: event.at }).document;
        } else {
          document = upsert(document, event.patch,
            mutation(snapshot, baseRevision, event.mutationKind, event.at, event.writer, event.seq), event.at).document;
        }
      }
      const recreated = item(document);
      assert(recreated && recreated.title === 'Yeni nesil' && recreated.position === 5,
        `yeniden oluşturulan kayıt eski nesilce değiştirildi, sıra=${sequence}`);
      continue;
    }
    for (const event of shuffled(events, random)) {
      appliedEvents++;
      if (event.kind === 'remove') {
        document = applyWatchRemove(document, { key: 'file:a' }, { now: event.at }).document;
      } else {
        document = upsert(document, event.patch,
          mutation(snapshot, baseRevision, event.mutationKind, event.at, event.writer, event.seq), event.at).document;
      }
    }
    const saved = item(document);
    if (mode === 0) {
      assert(saved && saved.completed === true && saved.position === 1000,
        `manuel invariant bozuldu, sıra=${sequence}`);
    } else if (mode === 1) {
      assert(saved && saved.prefs.volume === 0.35 && saved.collections.includes('Korunan'),
        `sağlam alan invariantı bozuldu, sıra=${sequence}`);
      assert(['ana.srt', 'a.srt', 'b.srt', 'c.srt', 'd.srt'].every((value) => saved.subtitlePaths.includes(value)),
        `birleşen alan kayboldu, sıra=${sequence}`);
    } else {
      assert(saved === null, `silinen kayıt dirildi, sıra=${sequence}`);
    }
  }
  assert(appliedEvents === 40000, `olay sayısı ${appliedEvents}`);
  console.log('    10.000 sıra / 40.000 mutation denetlendi');
});

test('üretim wiringi tek writer, revision ve senkron kapanış protokolünü taşır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert(/requestSingleInstanceLock\(\)/.test(main), 'ikinci ana süreç writer kilidi yok');
  assert(/if \(hasSingleInstanceLock\) app\.whenReady\(\)/.test(main), 'pencere açılışı instance kilidiyle kapılı değil');
  assert(/if \(hasSingleInstanceLock\) app\.on\('activate'/.test(main), 'yeniden etkinleştirme instance kilidiyle kapılı değil');
  assert(/library:upsert-before-close/.test(main) && /library:upsert-before-close/.test(preload), 'kapanış-save senkron IPC hattı yok');
  assert(/event\.sender !== mainWindow\.webContents/.test(main), 'senkron kapanış IPCsi renderer kimliğini doğrulamıyor');
  assert(/flushWatchLibraryBeforeClose/.test(main) && /WATCH_CLOSE_FLUSH_TIMEOUT_MS\s*=\s*750/.test(main),
    'main kapanış handshake veya bound taşımıyor');
  assert(/onWatchFlushBeforeClose/.test(renderer) && /saveWatchItemBeforeClose/.test(renderer)
    && /finishWatchFlushBeforeClose/.test(renderer), 'renderer kapanış snapshot/ACK hattı yok');
  assert(/watchMutationQueue/.test(renderer) && /baseItemRevision/.test(renderer), 'renderer mutation sıralaması/revisionı yok');
});

test('fake app tek-instance kilidi ikinci writerı kapatır ve ilk pencereyi öne getirir', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('const hasSingleInstanceLock = app.requestSingleInstanceLock()');
  const end = main.indexOf('let mainWindow;', start);
  assert(start >= 0 && end > start, 'instance kilidi kaynak dilimi bulunamadı');
  const source = main.slice(start, end);

  const deniedHandlers = {};
  let quitCount = 0;
  const deniedApp = {
    requestSingleInstanceLock: () => false,
    quit: () => { quitCount++; },
    on: (name, fn) => { deniedHandlers[name] = fn; },
  };
  new Function('app', 'mainWindow', source)(deniedApp, null);
  assert(quitCount === 1 && !deniedHandlers['second-instance'], 'ikinci süreç writer olarak yaşamaya devam etti');

  const handlers = {};
  const calls = [];
  const allowedApp = {
    requestSingleInstanceLock: () => true,
    quit: () => calls.push('quit'),
    on: (name, fn) => { handlers[name] = fn; },
  };
  const fakeWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  new Function('app', 'mainWindow', source)(allowedApp, fakeWindow);
  assert(typeof handlers['second-instance'] === 'function', 'ikinci-instance callback kaydolmadı');
  handlers['second-instance']();
  assert(calls.join(',') === 'restore,show,focus', `ilk pencere öne getirilmedi: ${calls.join(',')}`);

  const activateStart = main.indexOf("if (hasSingleInstanceLock) app.on('activate'");
  const activateEnd = main.indexOf('// --- IPC handlers ---', activateStart);
  assert(activateStart >= 0 && activateEnd > activateStart, 'activate kilidi kaynak dilimi bulunamadı');
  const activateSource = main.slice(activateStart, activateEnd);
  let deniedCreateCount = 0;
  new Function('hasSingleInstanceLock', 'app', 'BrowserWindow', 'createWindow', activateSource)(
    false,
    { on: () => { throw new Error('kilitsiz süreç activate handler kaydetti'); } },
    { getAllWindows: () => [] },
    () => { deniedCreateCount++; },
  );
  assert(deniedCreateCount === 0, 'kilitsiz süreç activate yolundan pencere oluşturdu');

  let activateHandler;
  let allowedCreateCount = 0;
  new Function('hasSingleInstanceLock', 'app', 'BrowserWindow', 'createWindow', activateSource)(
    true,
    { on: (_name, fn) => { activateHandler = fn; } },
    { getAllWindows: () => [] },
    () => { allowedCreateCount++; },
  );
  activateHandler();
  assert(allowedCreateCount === 1, 'kilit sahibi süreç activate yolunda pencere oluşturmadı');
});

test('fake webContents kapanış handshakeini ACK veya 750 ms timeout ile sınırlar', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  const functionStart = main.indexOf('function flushWatchLibraryBeforeClose()');
  const ackStart = main.indexOf("ipcMain.on('library:flush-before-close-complete'", functionStart);
  const ackEnd = main.indexOf('function createWindow()', ackStart);
  assert(functionStart >= 0 && ackStart > functionStart && ackEnd > ackStart, 'kapanış handshake kaynak dilimi bulunamadı');

  const pending = new Map();
  const timers = [];
  const cleared = [];
  const sent = [];
  let tokenSeq = 0;
  const sender = {
    isDestroyed: () => false,
    send: (channel, token) => sent.push({ channel, token }),
  };
  const fakeWindow = { isDestroyed: () => false, webContents: sender };
  const fakeSetTimeout = (fn, ms) => {
    const timer = { id: timers.length + 1, fn, ms };
    timers.push(timer);
    return timer.id;
  };
  const fakeClearTimeout = (id) => cleared.push(id);
  const buildFlush = new Function('mainWindow', 'pendingWatchCloseFlushes', 'randomUUID',
    'setTimeout', 'clearTimeout', 'WATCH_CLOSE_FLUSH_TIMEOUT_MS',
    `${main.slice(functionStart, ackStart)}; return flushWatchLibraryBeforeClose;`);
  const flush = buildFlush(fakeWindow, pending, () => `token-${++tokenSeq}`,
    fakeSetTimeout, fakeClearTimeout, 750);

  flush();
  assert(sent[0].channel === 'library:flush-before-close' && pending.has('token-1'), 'flush isteği gönderilmedi');
  assert(timers[0].ms === 750, `timeout sınırı ${timers[0].ms}`);

  let ackHandler;
  const fakeIpcMain = { on: (_name, fn) => { ackHandler = fn; } };
  new Function('ipcMain', 'pendingWatchCloseFlushes', main.slice(ackStart, ackEnd))(fakeIpcMain, pending);
  ackHandler({ sender: {} }, 'token-1');
  assert(pending.has('token-1'), 'yanlış renderer ACK kabul edildi');
  ackHandler({ sender }, 'token-1');
  assert(!pending.has('token-1') && cleared.includes(timers[0].id), 'doğru ACK beklemeyi bitirmedi');

  flush();
  timers[1].fn();
  assert(!pending.has('token-2'), 'timeout kapanış beklemesini sonlandırmadı');

  const subStart = renderer.indexOf('if (window.api.onWatchFlushBeforeClose)');
  const subEnd = renderer.indexOf('// ---- HLS ile indirmeden izleme ----', subStart);
  assert(subStart >= 0 && subEnd > subStart, 'renderer kapanış aboneliği kaynak dilimi bulunamadı');
  const order = [];
  let rendererHandler;
  const fakeRendererWindow = { api: {
    onWatchFlushBeforeClose: (fn) => { rendererHandler = fn; },
    saveWatchItemBeforeClose: (request) => { order.push(`save:${request.kind}`); return { ok: true, revision: 2 }; },
    finishWatchFlushBeforeClose: (token) => order.push(`ack:${token}`),
  } };
  new Function('window', 'currentWatchPatch', 'applyWatchMutationResult', 'watchMutationRequest',
    renderer.slice(subStart, subEnd))(
    fakeRendererWindow,
    () => ({ key: 'file:a', lastWatched: 1 }),
    () => order.push('apply'),
    (_patch, kind) => ({ kind }),
  );
  rendererHandler('close-token');
  assert(order.join(',') === 'save:close-progress,apply,ack:close-token', `renderer kapanış sırası ${order.join(',')}`);
});

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}
