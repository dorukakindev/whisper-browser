const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const queueFactoryStart = main.indexOf('function browserCaptureDrainScript(');
const queueFactoryEnd = main.indexOf('function browserFrames(', queueFactoryStart);
assert(queueFactoryStart >= 0 && queueFactoryEnd > queueFactoryStart, 'Yakalama kuyruğu script fabrikaları bulunamadı');
const factories = vm.runInNewContext(`(() => {
  ${main.slice(queueFactoryStart, queueFactoryEnd)}
  return { browserCaptureDrainScript, browserCaptureAckScript, browserCaptureReleaseScript };
})()`);

function createHarness(frameId = 'frame-a') {
  const context = vm.createContext({ window: {}, __clock: { now: 0 } });
  vm.runInContext(`
    Date.now = () => __clock.now;
    window.__whisperCaptureQueue = [];
    window.__whisperCaptureInFlight = new Map();
    window.__whisperCaptureFrameId = ${JSON.stringify(frameId)};
    window.__whisperCaptureDeliverySeq = 0;
    window.__whisperCaptureDropped = 0;
  `, context);
  return {
    context,
    set now(value) { context.__clock.now = value; },
    get now() { return context.__clock.now; },
    enqueue(captureId) {
      context.window.__whisperCaptureQueue.push({ captureId, body: `cue-${captureId}` });
    },
    drain() { return vm.runInContext(factories.browserCaptureDrainScript(), context); },
    ack(receipts) { return vm.runInContext(factories.browserCaptureAckScript(receipts), context); },
    release(receipts) { return vm.runInContext(factories.browserCaptureReleaseScript(receipts), context); },
    queueIds() { return context.window.__whisperCaptureQueue.map((item) => item.captureId); },
    lease(captureId) { return context.window.__whisperCaptureInFlight.get(captureId); },
  };
}

function receipt(entry) {
  return { captureId: entry.captureId, deliveryId: entry.deliveryId };
}

test('drain yalnız kiralar; doğru ACK gelmeden öğeyi silmez', () => {
  const h = createHarness();
  h.enqueue('a'); h.enqueue('b');
  const first = h.drain().entries;
  assert.deepEqual(h.queueIds(), ['a', 'b']);
  assert.equal(first.length, 2);
  assert.equal(h.drain().frameId, 'frame-a');
  assert.equal(h.drain().entries.length, 0, 'aktif kira ikinci kez teslim edildi');
  assert.equal(h.ack([receipt(first[0])]), 1);
  assert.deepEqual(h.queueIds(), ['b']);
});

test('timeout sonrası yeni teslimat eski ACK ve RELEASE tarafından değiştirilemez', () => {
  const h = createHarness();
  h.enqueue('a');
  const oldReceipt = receipt(h.drain().entries[0]);
  h.now = 15001;
  const newReceipt = receipt(h.drain().entries[0]);
  assert.notEqual(newReceipt.deliveryId, oldReceipt.deliveryId);
  assert.equal(h.ack([oldReceipt]), 0, 'eski ACK yeni teslimatı sildi');
  assert.deepEqual(h.queueIds(), ['a']);
  assert.equal(h.release([oldReceipt]), 0, 'eski RELEASE yeni kirayı açtı');
  assert.equal(h.drain().entries.length, 0, 'yeni kira eski RELEASE ile bozuldu');
  assert.equal(h.ack([newReceipt]), 1);
  assert.deepEqual(h.queueIds(), []);
});

test('RELEASE yalnız kendi teslimatını iade eder ve yeni teslimat kimliği üretir', () => {
  const h = createHarness();
  h.enqueue('a');
  const first = receipt(h.drain().entries[0]);
  assert.equal(h.release([first]), 1);
  h.now += 900;
  const second = receipt(h.drain().entries[0]);
  assert.notEqual(second.deliveryId, first.deliveryId);
  assert.equal(h.ack([second]), 1);
});

test('tekrarlanan RELEASE sonsuz döngü yerine sınırlı denemeden sonra öğeyi bırakır', () => {
  const h = createHarness();
  h.enqueue('a');
  for (const delay of [900, 1800, 3600]) {
    const current = receipt(h.drain().entries[0]);
    assert.equal(h.release([current]), 1);
    h.now += delay;
  }
  const last = receipt(h.drain().entries[0]);
  assert.equal(h.release([last]), 1);
  assert.deepEqual(h.queueIds(), []);
  assert.equal(h.drain().entries.length, 0);
});

test('renderer/frame yenilenmesinden kalan onay yeni frame kuyruğuna dokunmaz', () => {
  const oldFrame = createHarness('frame-old');
  oldFrame.enqueue('same-id');
  const stale = receipt(oldFrame.drain().entries[0]);
  const newFrame = createHarness('frame-new');
  newFrame.enqueue('same-id');
  const current = receipt(newFrame.drain().entries[0]);
  assert.equal(newFrame.ack([stale]), 0);
  assert.deepEqual(newFrame.queueIds(), ['same-id']);
  assert.equal(newFrame.ack([current]), 1);
});

test('kapanış draini 128 öğeyi dört batchte birer kez onaylayabilir', () => {
  const h = createHarness();
  for (let i = 0; i < 128; i++) h.enqueue(`q-${i}`);
  const seen = new Set();
  for (let batchNo = 0; batchNo < 4; batchNo++) {
    const entries = h.drain().entries;
    assert.equal(entries.length, 32);
    for (const entry of entries) {
      assert(!seen.has(entry.captureId), `${entry.captureId} iki kez işlendi`);
      seen.add(entry.captureId);
    }
    assert.equal(h.ack(entries.map(receipt)), 32);
  }
  assert.equal(seen.size, 128);
  assert.deepEqual(h.queueIds(), []);
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('20.000 rastgele interleaving kuyruk ve kira invariantlarını korur', () => {
  for (const seed of [1, 0x12345678, 0x9e3779b9, 0xffffffff]) {
    const random = seededRandom(seed);
    const h = createHarness(`frame-${seed}`);
    const historical = [];
    const acknowledged = new Set();
    let sequence = 0;
    for (let step = 0; step < 5000; step++) {
      const choice = Math.floor(random() * 6);
      if (choice <= 1 && h.queueIds().length < 128) {
        h.enqueue(`s${seed}-${++sequence}`);
      } else if (choice === 2) {
        for (const entry of h.drain().entries) historical.push(receipt(entry));
      } else if (choice === 3 && historical.length) {
        const selected = historical[Math.floor(random() * historical.length)];
        const lease = h.lease(selected.captureId);
        const wasCurrent = !!lease && lease.deliveryId === selected.deliveryId;
        const before = h.queueIds().includes(selected.captureId);
        const count = h.ack([selected]);
        assert.equal(count, wasCurrent && before ? 1 : 0);
        if (count) {
          assert(!acknowledged.has(selected.captureId), `${selected.captureId} iki kez onaylandı`);
          acknowledged.add(selected.captureId);
        }
      } else if (choice === 4 && historical.length) {
        const selected = historical[Math.floor(random() * historical.length)];
        const lease = h.lease(selected.captureId);
        const wasCurrent = !!lease && lease.deliveryId === selected.deliveryId;
        assert.equal(h.release([selected]), wasCurrent ? 1 : 0);
      } else {
        h.now += 1 + Math.floor(random() * 20000);
      }

      const ids = h.queueIds();
      assert.equal(new Set(ids).size, ids.length, 'kuyrukta yinelenen captureId var');
      for (const [id, lease] of h.context.window.__whisperCaptureInFlight) {
        assert(ids.includes(id), 'kuyrukta olmayan öğenin kirası kaldı');
        assert(lease && typeof lease.deliveryId === 'string' && Number.isFinite(lease.at));
      }
      for (const id of acknowledged) assert(!ids.includes(id), 'onaylanan öğe kuyruğa geri döndü');
    }
  }
});

  test('ana süreç generation değişiminde paralel flush başlatmaz', () => {
  const functionBody = (name, nextName) => {
    const start = main.indexOf(`function ${name}(`);
    const end = main.indexOf(`function ${nextName}(`, start + 1);
    assert(start >= 0 && end > start, `${name} bulunamadı`);
    return main.slice(start, end);
  };
  assert.doesNotMatch(functionBody('resetBrowserCaptureState', 'browserCaptureToggleScript'), /browserCaptureBusy\s*=\s*false/);
  assert.doesNotMatch(functionBody('stopBrowserPolling', 'browserOverlayScript'), /browserCaptureBusy\s*=\s*false/);
  const captureHandlerStart = main.indexOf("ipcMain.handle('browser:capture:setEnabled'");
  const captureHandlerEnd = main.indexOf("ipcMain.handle('browser:getState'", captureHandlerStart);
  assert.doesNotMatch(main.slice(captureHandlerStart, captureHandlerEnd), /browserCaptureBusy\s*=\s*false/);
  const flushBody = functionBody('flushBrowserCaptureQueue', 'startBrowserPolling');
  assert.match(flushBody, /browserCaptureFlushPromise/);
  assert.match(flushBody, /finally\(\(\) => \{[\s\S]*?browserCaptureBusy = false/);
  const pollingBody = functionBody('startBrowserPolling', 'stopBrowserPolling');
  assert.match(pollingBody,
    /setInterval\(\(\) => \{[\s\S]{0,560}flushBrowserCaptureQueue\(\{ installHook: true \}\)[\s\S]{0,80}\}, BROWSER_POLL_INTERVALS\.capture\)/);
  assert.match(main, /: \{ track: 6500, capture: 900, media: 1000 \}/);
  assert.match(main, /browserCaptureHookFrames = new WeakSet\(\)/);
  assert.match(functionBody('ensureBrowserCaptureHooks', 'performBrowserCaptureFlush'),
    /frames\.filter\(\(frame\) => !browserCaptureHookFrames\.has\(frame\)\)[\s\S]{0,420}browserCaptureHookFrames\.add\(frame\)/);
  const processAt = main.indexOf('const outcome = await processBrowserCapturedPayload');
  const generationCheckAt = main.indexOf('if (!isCurrentBrowserContext(context)) return', processAt);
  const receiptAt = main.indexOf('(outcome === CAPTURE_RETRY ? releaseReceipts : ackReceipts).push', processAt);
  assert(processAt >= 0 && generationCheckAt > processAt && receiptAt > generationCheckAt,
    'gecikmiş işleme generation kontrolünden önce ACK/RELEASE üretiyor');
  assert.match(main, /responseType === 'json'[\s\S]{0,120}JSON\.stringify\(this\.response/);
  assert.match(main, /const browserLastCaptureDropped = new Map\(\)/);
  });

  test('ana süreç ACK ve RELEASE öncesi bağlamı son kez doğrular', () => {
    const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    assert.match(main,
      /retried = releaseReceipts\.length;[\s\S]{0,420}if \(!isCurrentBrowserContext\(context\)\)[\s\S]{0,260}browserCaptureAckScript/);
  });

test('pencere kapanışı yalnız bekleyen parçayı, sekme kapanışı ölçülemeyen kuyruğu da uyarır', () => {
  const drainBodyStart = main.indexOf('async function drainBrowserCaptureBeforeClose(');
  const drainBodyEnd = main.indexOf('async function flushBrowserSession(', drainBodyStart);
  const drainBody = main.slice(drainBodyStart, drainBodyEnd);
  assert.match(drainBody, /executeBrowserFrames\(browserCapturePauseScript\(\)\)/);
  assert.match(drainBody, /pass < 4/);
  assert.match(drainBody, /flushBrowserCaptureQueue\(\{ allowHidden: true, force: true, installHook: false \}\)/);
  assert.match(main, /captureStatus = await withTimeout\(drainBrowserCaptureBeforeClose\(\), BROWSER_CLOSE_DRAIN_TIMEOUT/);
  assert.match(main, /function browserCaptureCloseNeedsWarning\(status, includeUnverified = false\)[\s\S]*?Number\(status && status\.pending\) > 0/);
  assert.match(main, /if \(browserCaptureCloseNeedsWarning\(captureStatus\)/);
  assert.match(main, /captureStatus\.pending \+= await backgroundBrowserCapturePending\(browserActiveTabId\)/,
    'arka plan sekmelerindeki doğrulanmış kuyruk kapanış hesabına katılmıyor');
  assert.match(main, /browser:tab:close[\s\S]{0,2200}browserTabCapturePending\(tab, true\)[\s\S]{0,360}browserCaptureCloseNeedsWarning\(captureStatus, true\)[\s\S]{0,180}confirmBrowserCaptureDiscard\(captureStatus\.pending, 'sekme', captureStatus\.unverified\)/,
    'sekme kapanışı bekleyen veya ölçülemeyen yakalama kuyruğunu korumuyor');
  assert.match(main, /else if \(tab\.view && !tab\.view\.webContents\.isDestroyed\(\)\)[\s\S]{0,260}executeBrowserViewFrames\(tab\.view, tab\.captureEnabled !== false[\s\S]{0,120}browserCaptureHookScript\(\) : browserCaptureToggleScript\(false\)\)/,
    'arka plan sekmesi kapanışı iptal edilince yakalama yeniden başlatılmıyor');
  assert.doesNotMatch(main, /captureStatus\.pending !== 0/,
    'ölçüm zaman aşımı gerçek bekleyen parça gibi uyarı açıyor');
  assert.match(main, /pending:\s*0,[\s\S]{0,100}unverified:\s*true/,
    'ölçülemeyen kuyruk gerçek bekleyen parça olarak işaretleniyor');
  assert.match(main, /buttons: \['Kapatmayı iptal et', 'Yine de kapat'\]/);
  assert.ok(main.indexOf('captureStatus = await withTimeout(drainBrowserCaptureBeforeClose()')
    < main.indexOf('destroyBrowserView();', main.indexOf("mainWindow.on('close'")),
  'browser görünümü drain tamamlanmadan yok ediliyor');
});

if (!process.exitCode) console.log(`\n${passed} yakalama kuyruğu testi geçti (20.000 rastgele interleaving).`);
