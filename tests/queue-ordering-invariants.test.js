// R301 — kuyruk öncelik/yeniden-sıralama invariant'ları (20'lik kuyruk madde 5).
// Kuyrukta kullanıcı-yeniden-sıralama yok; öncelik = dizi sırası (FIFO). Bu
// ratchet mutasyonlar (ekleme, silme, retry, clearQueue, restore, dedupe)
// sırasında sıranın, kimliklerin ve kapıların bozulmadığını vm çıkarımıyla
// GERÇEK renderer koduna karşı doğrular.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Windows CI checkout'ı CRLF üretir — fonksiyon-sonu taraması LF'e normalize edilir.
const rendererSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const helpersSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer-helpers.js'), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.then(() => { passed += 1; console.log(`  PASS  ${name}`); })
        .catch((error) => { console.error(`  FAIL  ${name}: ${error.stack || error.message}`); process.exitCode = 1; });
    }
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extractFn(src, name) {
  // 'async function name' veya 'function name' — async öneki korunur.
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert(start >= 0, `${name} kaynakta bulunamadı`);
  const rest = src.slice(start);
  const end = rest.indexOf('\n}\n');
  assert(end >= 0, `${name} gövdesi kesilemedi`);
  return rest.slice(0, end + 3);
}

// Gerçek fonksiyonlar + çağrı-yapılabilir minimum ortam.
function makeEnv({ optsProblem = null, persistOk = true, spawnResult = { ok: true } } = {}) {
  const calls = { renderQueue: 0, log: [], spawned: [] };
  const sandbox = {
    state: {
      queue: [], queueRunning: false, running: false, cancelled: false,
      stopAfterCurrent: false, currentQueueId: null, activeJobId: null,
      nextYoutubeAudioLang: '', lastJobVideo: null, lastJobInput: '',
      outputFiles: [], lastQualityReport: null, _speedEma: 0, _etaBase: null, startTime: 0,
    },
    _queueIdCounter: 0,
    _queueNextTimer: null,
    _queuePersistTimer: null,
    _queuePersistenceReady: false,
    _jobsTab: 'queue',
    window: { api: {} },
    document: {
      querySelectorAll: () => [],
      getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, textContent: '', disabled: false }),
    },
    $: () => ({ classList: { add: () => {}, remove: () => {} }, textContent: '', disabled: false }),
    $$: () => [],
    buildOptsFromUI: () => ({ model: 'tiny' }),
    optsProblemInfo: () => optsProblem,
    logLine: (msg, kind) => calls.log.push(`${kind || 'info'}:${String(msg).slice(0, 60)}`),
    renderQueue: () => { calls.renderQueue += 1; },
    syncJobsCenter: () => {},
    setJobsTab: () => {},
    updateStopAfterBtn: () => {},
    finalizeQueue: () => {
      sandbox.state.queueRunning = false;
      sandbox.state.stopAfterCurrent = false;
      sandbox.state.currentQueueId = null;
      sandbox.state.running = false;
    },
    showJobValidation: () => {},
    clearJobValidation: () => {},
    setStatus: () => {},
    setProgress: () => {},
    resetStages: () => {},
    clearPreview: () => {},
    offerOpenLastOutput: () => {},
    notifyDone: () => {},
    friendlySystemError: (e) => String(e),
    escapeHtml: (s) => String(s),
    mediaKeyFor: (type, value) => `${type}:${String(value).toLowerCase()}`,
    queueOutputNameSuffix: (id) => `-whisper-q${id}`,
    startTranscribeSafe: async (opts) => { calls.spawned.push(opts); return spawnResult; },
    persistQueueNow: async () => persistOk,
    currentGeneration: () => 'gen-test',
    player: { subPath: '', sub2Path: '' },
    historyCache: [],
    setTimeout: (fn, ms) => { const id = { fn, ms, cleared: false }; sandbox.__timers.push(id); return id; },
    clearTimeout: (id) => { if (id) id.cleared = true; },
    __timers: [],
    __calls: calls,
    console,
    JSON, Number, String, Array, Object, Math, Date, Promise, Boolean,
    parseInt, parseFloat, setImmediate, queueMicrotask,
  };
  sandbox.globalThis = sandbox;

  for (const name of ['queueInputKey', 'computeQueueCollisionSuffix', 'addToQueue',
    'reportWatchQueueResult', 'clearQueue', 'queueSecretsFromCurrentUi',
    'processNextQueueItem', 'restorePersistedQueue']) {
    vm.runInNewContext(`globalThis.${name} = ${extractFn(rendererSrc, name)}`, sandbox);
  }
  for (const name of ['startQueue', 'removeFromQueue', 'scheduleQueuePersist']) {
    vm.runInNewContext(`globalThis.${name} = ${extractFn(helpersSrc, name)}`, sandbox);
  }
  vm.runInNewContext('globalThis.QUEUE_UI_LIMIT = 500;', sandbox);
  return sandbox;
}

const pendingOrder = (env) => env.state.queue.filter((x) => x.status === 'pending').map((x) => x.id);
const item = (env, id) => env.state.queue.find((x) => x.id === id);

// =========================================================================
test('FIFO: processNextQueueItem daima ilk bekleyeni seçer (id değil sıra)', async () => {
  const env = makeEnv();
  // Karışık id sırası: disk'ten yüklenmiş gibi [9,3,7] — sıra FIFO'yu belirler.
  for (const id of [9, 3, 7]) {
    env.state.queue.push({ id, type: 'file', input: `D:\\\\v${id}.mp4`, label: `v${id}`, status: 'pending', files: [], opts: {} });
  }
  env.state.queueRunning = true;
  await env.processNextQueueItem();
  assert.strictEqual(item(env, 9).status, 'running', 'dizinin başı değil, başka öğe seçildi');
  assert.strictEqual(env.__calls.spawned.length, 1);
});

test('FIFO: art arda işlem ekleme sırasını izler', async () => {
  const env = makeEnv();
  for (const name of ['a', 'b', 'c', 'd']) {
    env.state.queue.push({ id: name.charCodeAt(0), type: 'file', input: `D:\\\\${name}.mp4`, label: name, status: 'pending', files: [], opts: {} });
  }
  env.state.queueRunning = true;
  for (let i = 0; i < 3; i++) {
    const current = env.state.queue.find((x) => x.status === 'pending');
    const currentId = current && current.id;
    await env.processNextQueueItem();
    assert.strictEqual(item(env, currentId).status, 'running');
    // Önceki çalışan done'a çevrilir (terminal sonrası bir sonraki çağrı)
    env.state.queue.filter((x) => x.status === 'running' && x.id !== currentId)
      .forEach((x) => { x.status = 'done'; });
  }
  assert.deepStrictEqual(env.__calls.spawned.map((o) => o.input), ['D:\\\\a.mp4', 'D:\\\\b.mp4', 'D:\\\\c.mp4']);
});

test('retry hatadan bekleyene döner ve yerini korur (sona atmaz)', async () => {
  const env = makeEnv();
  for (const [id, status] of [[1, 'done'], [2, 'error'], [3, 'pending']]) {
    env.state.queue.push({ id, type: 'file', input: `D:\\\\v${id}.mp4`, label: `v${id}`, status, files: [], opts: {} });
  }
  // UI retry yolu: item.status='pending'; renderQueue(); startQueue().
  item(env, 2).status = 'pending';
  env.state.queueRunning = true;
  await env.processNextQueueItem();
  assert.strictEqual(item(env, 2).status, 'running', 'retry konumu korunmadı');
  assert.strictEqual(item(env, 3).status, 'pending', 'sıradaki öne geçti');
});

test('addToQueue çalışma sırasında sona ekler; QUEUE_UI_LIMIT kapısı 500', () => {
  const env = makeEnv();
  env.state.queue.push({ id: 1, type: 'file', input: 'D:\\\\r.mp4', label: 'r', status: 'running', files: [], opts: {} });
  env._queueIdCounter = 1;
  assert.strictEqual(env.addToQueue('file', 'D:\\\\new.mp4'), true);
  const tail = env.state.queue[env.state.queue.length - 1];
  assert.strictEqual(tail.input, 'D:\\\\new.mp4');
  assert.strictEqual(tail.status, 'pending');
  assert.strictEqual(tail.id, 2);
  // Sınır: 500 dolu iken reddedilir (persist MAX_QUEUE_ITEMS ile aynı).
  env.state.queue = Array.from({ length: 500 }, (_, i) => ({ id: i + 100, status: 'pending', type: 'file', input: `D:\\\\f${i}`, label: `f${i}`, files: [], opts: {} }));
  assert.strictEqual(env.addToQueue('file', 'D:\\\\over.mp4'), false);
});

test('removeFromQueue running işi silemez; sıra korunur', async () => {
  const env = makeEnv();
  for (const [id, status] of [[1, 'running'], [2, 'pending'], [3, 'done'], [4, 'error'], [5, 'pending']]) {
    env.state.queue.push({ id, type: 'file', input: `D:\\\\v${id}.mp4`, label: `v${id}`, status, files: [], opts: {} });
  }
  env.removeFromQueue(1);
  assert.strictEqual(env.state.queue.length, 5, 'running silindi!');
  env.removeFromQueue(3);
  assert.deepStrictEqual(env.state.queue.map((x) => x.id), [1, 2, 4, 5], 'sıra değişti');
  env.removeFromQueue(99);
  assert.strictEqual(env.state.queue.length, 4);
});

test('clearQueue yalnız running korur; bayraklar sıfırlanır', () => {
  const env = makeEnv();
  for (const [id, status] of [[1, 'running'], [2, 'pending'], [3, 'done'], [4, 'error']]) {
    env.state.queue.push({ id, type: 'file', input: `D:\\\\v${id}.mp4`, label: `v${id}`, status, files: [], opts: {} });
  }
  env.state.queueRunning = true;
  env.state.stopAfterCurrent = true;
  env.clearQueue();
  assert.deepStrictEqual(env.state.queue.map((x) => x.id), [1]);
  assert.strictEqual(env.state.queueRunning, false);
  assert.strictEqual(env.state.stopAfterCurrent, false);
});

test('dedupe kapsamı: pending+running kilitli; done/error yeni iş olarak kabul', async () => {
  const env = makeEnv();
  env._queueIdCounter = 10;
  env.state.queue.push(
    { id: 1, type: 'file', input: 'D:\\\\a\\\\film.mp4', label: 'film', status: 'running', files: [], opts: {} },
    { id: 2, type: 'file', input: 'D:\\\\b\\\\film.mp4', label: 'film', status: 'done', files: [], opts: {} },
  );
  // aynı fiziksel dosya — .. / . / \\ / büyük-küçük harf varyasyonları da kilitli
  for (const variant of ['D:\\\\a\\\\film.mp4', 'D:/a/film.mp4', 'D:\\\\a\\\\x\\\\..\\\\film.mp4', 'd:\\\\a\\\\FILM.MP4', 'D:\\\\a\\\\.\\\\film.mp4\\\\']) {
    assert.strictEqual(env.addToQueue('file', variant), false, `dedupe atladı: ${variant}`);
    assert.strictEqual(env._queueRejectReason, 'duplicate');
  }
  // done öğesi aynı girdiyle yeniden eklenebilir (bilinçli: yeniden-koşu izni)
  env._queueRejectReason = '';
  assert.strictEqual(env.addToQueue('file', 'D:\\\\b\\\\film.mp4'), true);
  assert.strictEqual(env.state.queue.length, 3);
});

test('watchSource: error öğesi yerinde dirilir (id/sıra korunur)', () => {
  const env = makeEnv();
  env._queueIdCounter = 5;
  env.state.queue.push(
    { id: 1, type: 'file', input: 'E:\\\\w\\\\x.mp4', label: 'x', status: 'pending', files: [], opts: {} },
    { id: 2, type: 'file', input: 'E:\\\\w\\\\y.mp4', label: 'y', status: 'error', error: 'önceki hata', files: ['eski.srt'], opts: {}, watchSource: true, watchReported: 'error' },
  );
  assert.strictEqual(env.addToQueue('file', 'E:\\\\w\\\\y.mp4', { watchSource: true }), true);
  const y = item(env, 2);
  assert.strictEqual(y.status, 'pending');
  assert.strictEqual(y.error, '');
  assert.strictEqual(y.files.length, 0);
  assert.strictEqual(env.state.queue.length, 2, 'kopya eklendi');
  assert.strictEqual(y.id, 2, 'id değişti');
});

test('id sayacı restore sonrası max+1 devam eder; yeni id özgün', () => {
  const env = makeEnv();
  // Seyrek disk kimlikleri: [5, 99] → sayaç 99; yeni ekleme 100 olmalı.
  env.state.queue = [
    { id: 5, type: 'file', input: 'A', label: 'A', status: 'done', files: [], opts: {} },
    { id: 99, type: 'file', input: 'B', label: 'B', status: 'error', files: [], opts: {} },
  ];
  env._queueIdCounter = env.state.queue.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  env.addToQueue('file', 'D:\\\\taze.mp4');
  const tail = env.state.queue[env.state.queue.length - 1];
  assert.strictEqual(tail.id, 100, `sayaç max+1 değil: ${tail.id}`);
  const ids = env.state.queue.map((x) => x.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id çakışması');
});

test('queueInputKey kanonikleştirme matrisi', () => {
  const env = makeEnv();
  const K = env.queueInputKey;
  assert.strictEqual(K('file', 'D:\\\\a\\\\b\\\\film.mp4'), 'd:/a/b/film.mp4');
  assert.strictEqual(K('file', 'D:/a/./b/film.mp4'), 'd:/a/b/film.mp4');
  assert.strictEqual(K('file', 'D:\\\\a\\\\x\\\\..\\\\film.mp4'), 'd:/a/film.mp4');
  // Sürücü kökü aşılamaz: '..' C: üzerinde korunur.
  assert.strictEqual(K('file', 'D:\\\\..\\\\x\\\\f.mp4'), 'd:/../x/f.mp4');
  // Göreli '..': kök-öncesi '..' aynen kalır (leksikal, fs'siz güvenli taraf).
  assert.strictEqual(K('file', '..\\\\x\\\\f.mp4'), '../x/f.mp4');
  // Unicode küçük-harf: 'İ' → 'i̇' (i+birleşik nokta), 'i' ile birleşmez —
  // Windows da 'FİLM.MP4' ile 'film.mp4'ü farklı dosya sayar; dedupe'un
  // ayırması muhafazakar/doğru yön.
  assert.notStrictEqual(K('file', 'FİLM.MP4'), K('file', 'film.mp4'));
  assert.strictEqual(K('file', 'FILM.MP4'), K('file', 'film.mp4'));
  assert.strictEqual(K('youtube', ' HTTPS://youtu.be/Xx '), 'youtube:https://youtu.be/xx');
  assert.strictEqual(K('file', '   '), '');
});

test('çakışma soneki yalnız kuyruk üyeliği çakışınca (stem+dir)', () => {
  const env = makeEnv();
  env.state.queue.push(
    { id: 1, type: 'file', input: 'D:\\\\a\\\\film.mp4', label: 'a', status: 'pending', files: [], opts: { outputDir: 'E:\\\\out' } },
  );
  const opts = { outputDir: 'E:\\\\out' };
  // Aynı stem, aynı çıktı klasörü, FARKLI inputKey → sonek.
  const suffix = env.computeQueueCollisionSuffix('D:\\\\b\\\\film.mp4', opts, 2);
  assert.strictEqual(suffix, '-whisper-q2');
  // Aynı stem ama FARKLI çıktı klasörü → soneksiz.
  assert.strictEqual(env.computeQueueCollisionSuffix('D:\\\\b\\\\film.mp4', { outputDir: 'F:\\\\else' }, 2), '');
  // Aynı dosya (aynı inputKey) → yeniden-koşu, soneksiz.
  assert.strictEqual(env.computeQueueCollisionSuffix('D:\\\\a\\\\film.mp4', opts, 2), '');
  // Kendisiyle çakışmaz (excludeId).
  assert.strictEqual(env.computeQueueCollisionSuffix('D:\\\\b\\\\film.mp4', opts, 1), '');
});

test('startQueue kapıları: yok-pending/çalışır-durum reddeder', async () => {
  const env = makeEnv();
  await env.startQueue();
  assert.strictEqual(env.state.queueRunning, false);
  env.state.queue.push({ id: 1, type: 'file', input: 'D:\\\\x', label: 'x', status: 'done', files: [], opts: {} });
  await env.startQueue();
  assert.strictEqual(env.state.queueRunning, false, 'done öğesiyle başlatıldı');
  env.state.queue.push({ id: 2, type: 'file', input: 'D:\\\\y', label: 'y', status: 'pending', files: [], opts: {} });
  env.state.running = true;
  await env.startQueue();
  assert.strictEqual(env.state.queueRunning, false, 'tek iş çalışırken kuyruk başladı');
  env.state.running = false;
  await env.startQueue();
  assert.strictEqual(env.state.queueRunning, true);
  await env.startQueue(); // çift çağrı birleşir
  assert.strictEqual(env.state.queueRunning, true);
});

test('persistQueueNow reddedince öğe bekleyene döner, kuyruk kapanır', async () => {
  const env = makeEnv({ persistOk: false });
  env.state.queue.push({ id: 1, type: 'file', input: 'D:\\\\x.mp4', label: 'x', status: 'pending', files: [], opts: {} });
  env.state.queueRunning = true;
  await env.processNextQueueItem();
  assert.strictEqual(item(env, 1).status, 'pending', 'persist reddi öğeyi düşürdü');
  assert.strictEqual(env.state.queueRunning, false);
  assert.strictEqual(env.__calls.spawned.length, 0, 'sahipsiz süreç spawn edildi');
});

test('spawn başarısız olursa hata öğeye yazılır ve sıra devam eder', async () => {
  const env = makeEnv({ spawnResult: { ok: false, error: 'disk dolu' } });
  for (const id of [1, 2]) {
    env.state.queue.push({ id, type: 'file', input: `D:\\\\v${id}.mp4`, label: `v${id}`, status: 'pending', files: [], opts: {} });
  }
  env.state.queueRunning = true;
  await env.processNextQueueItem();
  assert.strictEqual(item(env, 1).status, 'error');
  assert.match(String(item(env, 1).error), /disk dolu/);
  // Bir sonraki tick (timer stub) ikinci öğeye geçer.
  const timer = env.__timers.find((t) => !t.cleared);
  assert(timer, 'sonraki öğe için timer kurulmadı');
  timer.fn();
  // İç processNextQueueItem async — mikro görev döngüsünü birkaç tur pompalayalım.
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
  // Sıra devam etti: stub yine hata döndürdü → ikinci öğe de error, iki spawn çağrısı.
  assert.strictEqual(item(env, 2).status, 'error', 'hatalı öğe sonrası sıra durdu');
  assert.strictEqual(env.__calls.spawned.length, 2);
});

test('iptal edilen spawn öğeyi bekleyene döndürür (hata değil)', async () => {
  const env = makeEnv({ spawnResult: { ok: false, cancelled: true } });
  env.state.queue.push({ id: 1, type: 'file', input: 'D:\\\\x.mp4', label: 'x', status: 'pending', files: [], opts: {} });
  env.state.queueRunning = true;
  await env.processNextQueueItem();
  assert.strictEqual(item(env, 1).status, 'pending', 'iptal edilen spawn öğeyi hatalı yaptı');
  assert.strictEqual(env.__calls.spawned.length, 1);
});

test('restore: aktif id+status çifti olmadan işe yeniden bağlanmaz; sayaç max+1', async () => {
  const env = makeEnv();
  env.window.api.loadQueueState = async () => ({
    ok: true,
    items: [
      { id: 7, type: 'file', input: 'A', label: 'A', status: 'pending', files: [], opts: {} },
      { id: 3, type: 'file', input: 'B', label: 'B', status: 'pending', files: [], opts: {} },
    ],
    activeQueueItemId: 7, // id var ama status pending → running yeniden bağlanmaz
    queueRunning: true,
    recoveredCount: 0, invalidCount: 0,
  });
  await env.restorePersistedQueue();
  assert.strictEqual(item(env, 7).status, 'pending');
  assert.strictEqual(env.state.currentQueueId, null);
  assert.strictEqual(env._queueIdCounter, 7);
});

test('fuzz: 300 rastgele mutasyonda FIFO + id-özgünlüğü + kapı invariant\'ları korunur', async () => {
  const env = makeEnv();
  const rand = mulberry32(301005);
  let nextFile = 0;
  for (let i = 0; i < 300; i++) {
    const op = rand();
    if (op < 0.45) {
      env.addToQueue('file', `D:\\\\pool\\\\f${Math.floor(rand() * 8)}.mp4`);
    } else if (op < 0.7 && env.state.queue.length) {
      const idx = Math.floor(rand() * env.state.queue.length);
      env.removeFromQueue(env.state.queue[idx].id);
    } else if (op < 0.85) {
      const err = env.state.queue.find((x) => x.status === 'error');
      if (err) { err.status = 'pending'; err.error = ''; }
    } else {
      env.clearQueue();
    }
    // Invariant 1: en fazla bir running
    assert(env.state.queue.filter((x) => x.status === 'running').length <= 1, `tohum ${i}: çift running`);
    // Invariant 2: id'ler özgün
    const ids = env.state.queue.map((x) => x.id);
    assert.strictEqual(new Set(ids).size, ids.length, `tohum ${i}: id çakışması`);
    // Invariant 3: status geçerli kümede
    for (const it of env.state.queue) {
      assert(['pending', 'running', 'done', 'error'].includes(it.status), `tohum ${i}: geçersiz status ${it.status}`);
    }
    // Invariant 4: sınır aşılmaz
    assert(env.state.queue.length <= 500, `tohum ${i}: sınır aşıldı`);
  }
  // Terminal invariant: FIFO — ilk pending'i işle, sıra korunur.
  env.state.queueRunning = true;
  const first = env.state.queue.find((x) => x.status === 'pending');
  if (first) {
    await env.processNextQueueItem();
    assert.strictEqual(item(env, first.id).status, 'running', 'fuzz sonu: ilk bekleyen seçilmedi');
  }
});

console.log(`queue-ordering-invariants: ${passed} kontrol geçti`);
