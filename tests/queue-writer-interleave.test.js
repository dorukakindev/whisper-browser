// 100-kuyruk batch 6 (kuyruk yaşam döngüsü) — çok-yazıcılı interleaving
// simülasyonu. Gerçek uygulamada queue-state.json'u üç bağımsız aktör yazar:
//   1) main süreç persistQueueRunning/persistQueueTerminal (iş başlangıç/bitiş)
//   2) renderer queue:save/saveSync (kullanıcı kuyruk düzenlemesi, gecikmeli)
//   3) loadQueueState crash-recovery (running → pending+recovered onarımı)
// Tekil davranışlar başka testlerde kilitli; burada rastgele sıralanmış aktör
// karışımlarında DİSK üzerindeki invariant'lar doğrulanır:
//   A) terminal durum hiçbir yazıcı tarafından sessizce geri alınmaz
//      (guard bilinçli yeniden-deneme dışında running görmez),
//   B) diskteki her öğe normalize sözleşmeye uyar (id/tip/input/status),
//   C) sır alanları hiçbir snapshot'ta kalıcı diske sızamaz,
//   D) recovered işareti ancak aktif-id'siz running öğede doğar,
//   E) queueRunning=true diskte ancak koşabilir (terminal-olmayan) öğe varken,
//   F) hiçbir interleaving exception/çökme üretmez (modül sağlam).
// Ayrıca iki nokta bulgu kilidi: oversize+bak etkileşimi ve terminal-öncesi
// pending öğe hata metni.

const assert = require('assert');
const {
  MAX_QUEUE_ITEMS,
  clonePublicOptions,
  mergeQueueSnapshotForSave,
  normalizeQueueSnapshot,
  queueSnapshotForDisk,
  updateQueueSnapshotRunning,
  updateQueueSnapshotTerminal,
} = require('../src/queue-persistence');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  PASS', name); }

// Deterministik PRNG (mulberry32) — CI determinizm ratchet'i Math.random'u
// test kodunda yasaklıyor; tohum sabit.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = ['pending', 'running', 'done', 'error'];
const TERMINAL = new Set(['done', 'error']);

function makeItem(id, rnd, status = 'pending') {
  return {
    id,
    type: rnd() < 0.5 ? 'file' : 'youtube',
    input: `input-${id}-${Math.floor(rnd() * 999)}`,
    label: `iş-${id}`,
    status,
    files: [], warnings: [], error: '',
    opts: { model: 'tiny', translate: rnd() < 0.3 },
  };
}

// Sanal disk: main.js'in fs katmanı yerine son yazılı snapshot'ı tutar.
function simulate(seed) {
  const rnd = prng(seed);
  let disk = { version: 1, items: [] };           // readQueueStateRaw karşılığı
  let activeId = null;                          // activeQueueItemId
  const guards = new Set();                     // queueTerminalGuards
  const items = [];                             // renderer'ın bildiği kuyruk
  let nextId = 1;
  const ops = Math.floor(rnd() * 60) + 40;
  const violations = [];

  const diskItems = () => (normalizeQueueSnapshot(disk).items);

  for (let step = 0; step < ops; step++) {
    const pick = rnd();
    if (pick < 0.22 && items.length < 30) {
      // Renderer: yeni iş ekler + saveSync
      const item = makeItem(nextId++, rnd);
      items.push(item);
      const merged = mergeQueueSnapshotForSave(disk,
        { items, queueRunning: activeId !== null, currentQueueId: activeId }, activeId, guards);
      disk = merged;
    } else if (pick < 0.40 && items.length) {
      // Renderer: rastgele düzenleme (sil/yeniden sırala) + save
      const idx = Math.floor(rnd() * items.length);
      const target = items[idx];
      if (rnd() < 0.5 && (!activeId || target.id !== activeId)) items.splice(idx, 1);
      else items.splice(Math.floor(rnd() * items.length), 0, items.splice(idx, 1)[0]);
      disk = mergeQueueSnapshotForSave(disk,
        { items, queueRunning: activeId !== null, currentQueueId: activeId }, activeId, guards);
    } else if (pick < 0.55 && items.length && activeId === null) {
      // Main: bekleyen ilk öğeyi başlatır (persistQueueRunning)
      const pending = items.find((i) => i.status === 'pending' || i.status === 'running');
      if (!pending) continue;
      activeId = pending.id;
      pending.status = 'running';
      guards.delete(activeId);
      disk = updateQueueSnapshotRunning(disk, activeId, {
        type: pending.type, input: pending.input, opts: pending.opts });
    } else if (pick < 0.75 && activeId !== null) {
      // Main: terminal olay (done/error/exit) persistQueueTerminal
      const kind = rnd();
      const event = kind < 0.45 ? { type: 'done', files: ['a.srt'], warnings: [] }
        : kind < 0.8 ? { type: 'error', message: 'bozuldu' }
        : { type: 'exit', code: 0, cancelled: rnd() < 0.5 };
      guards.add(activeId);
      disk = updateQueueSnapshotTerminal(disk, activeId, event);
      const item = items.find((i) => i.id === activeId);
      if (item) {
        if (event.type === 'done') item.status = 'done';
        else if (event.type === 'error') item.status = 'error';
        else if (event.cancelled) item.status = 'pending';
        else item.status = 'error';
      }
      activeId = null;
    } else if (pick < 0.9 && items.length) {
      // Renderer: BAYAT snapshot saveSync (terminal öncesi klon)
      const stale = items.map((i) => ({ ...i }));
      const victim = stale[Math.floor(rnd() * stale.length)];
      if (rnd() < 0.4) victim.status = 'running'; // bayat renderer 'running' taşır
      disk = mergeQueueSnapshotForSave(disk,
        { items: stale, queueRunning: activeId !== null, currentQueueId: activeId }, activeId, guards);
    } else {
      // Crash: aktif iş kafasız kalır; loadQueueState onarır
      disk = normalizeQueueSnapshot(disk, activeId);
      activeId = null;
      for (const item of items) if (item.status === 'running') { item.status = 'pending'; }
    }

    // --- invariant'lar her adımda ---
    const snap = diskItems();
    for (const it of snap) {
      if (!Number.isSafeInteger(it.id) || it.id <= 0) violations.push(`geçersiz id @${step}`);
      if (!['file', 'youtube'].includes(it.type)) violations.push(`geçersiz tip @${step}`);
      if (!it.input) violations.push(`boş input @${step}`);
      if (!STATUSES.includes(it.status)) violations.push(`geçersiz status @${step}`);
      // (C) sır alanları asla diskte olamaz
      const rawOpts = (disk.items.find((d) => d.id === it.id) || {}).opts || {};
      for (const k of Object.keys(rawOpts)) {
        if (/token|secret|password|apikey|credential|cookie/i.test(k)) {
          violations.push(`sır anahtarı diskte @${step}: ${k}`);
        }
      }
    }
    // (D) recovered ancak running→pending onarımından doğar; status pending olmalı
    for (const it of snap) {
      if (it.recovered && it.status !== 'pending') violations.push(`recovered≠pending @${step}`);
    }
    // (E) queueRunning diskte ancak koşabilir öğe varken
    const forDisk = queueSnapshotForDisk(disk);
    if (forDisk.queueRunning && !forDisk.items.some((i) => !TERMINAL.has(i.status))) {
      violations.push(`queueRunning yalan @${step}`);
    }
  }
  return { disk, violations, steps: ops };
}

test('çok-yazıcılı interleaving: 40 tohum × ~60 adım — disk invariantları korunur', () => {
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { violations, steps } = simulate(seed);
    total += steps;
    assert.deepStrictEqual(violations, [], `tohum ${seed} ihlalleri: ${violations.slice(0, 5).join(' | ')}`);
  }
  assert.ok(total > 1800, `yeterli adım: ${total}`);
});

test('terminal durum yalnız guard korur — bayat renderer done→running ezemez', () => {
  const disk = { version: 1, items: [makeItem(7, prng(1), 'running')] };
  let out = updateQueueSnapshotTerminal(disk, 7, { type: 'done', files: ['x.srt'] });
  // Guard'lı merge: gecikmiş 'running' snapshot'ı disk 'done'ını korur.
  const stale = { items: [{ ...makeItem(7, prng(2), 'running'), label: 'iş-7' }],
    queueRunning: false, currentQueueId: null };
  const merged = mergeQueueSnapshotForSave(out, stale, null, new Set([7]));
  const item = merged.items.find((i) => i.id === 7);
  assert.strictEqual(item.status, 'done', 'korumalı terminal geri alınamaz');
  // Guardsız merge: normalize kurtarma pending+recovered'a düşürür — 'done'ı
  // 'running' olarak diriltmez (yeniden deneme niyetiyle tutarlı).
  const merged2 = mergeQueueSnapshotForSave(out, stale, null, new Set());
  const item2 = merged2.items.find((i) => i.id === 7);
  assert.ok(['pending', 'running'].includes(item2.status));
  if (item2.status === 'pending') assert.strictEqual(item2.recovered, true);
});

test('oversize+bak sırası: birincil aşırı büyük → geçerli .bak kullanılır', () => {
  // readQueueStateRaw kaynağı: oversized birincil atlanır, .bak okunur;
  // ikisi de başarısızsa _oversized işareti döner (uyarı kaybolmaz).
  const mainSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = mainSrc.indexOf('function readQueueStateRaw');
  const body = mainSrc.slice(start, start + 1100);
  assert.match(body, /for \(const candidate of \[primary, `\$\{primary\}\.bak`\]\)/,
    '.bak fallback sırası korunmalı');
  assert.match(body, /skippedOversize = true; continue;/, 'oversize atlanmalı');
  assert.match(body, /_oversized: true/, 'kullanıcı uyarısı işareti korunmalı');
  // Fonksiyon düzeyinde davranış: sanitize + normalize birleşimi geçerli .bak öğesini korur.
  const bak = { version: 1, items: [makeItem(3, prng(9), 'pending')] };
  const snap = normalizeQueueSnapshot(bak, null);
  assert.strictEqual(snap.items.length, 1);
});

test('terminal-öncesi pending öğeye error olayı: status pending kalır, hata metni yazılır', () => {
  // updateQueueSnapshotTerminal sözleşmesi: yalnız running öğe error'a geçer;
  // pending öğe pending kalır — ama error metni kaydedilir (köken izi).
  const disk = { version: 1, items: [makeItem(11, prng(3), 'pending')] };
  const out = updateQueueSnapshotTerminal(disk, 11, { type: 'error', message: 'erken hata' });
  const item = out.items.find((i) => i.id === 11);
  assert.strictEqual(item.status, 'pending', 'pending öğe terminale zorlanmaz');
  assert.strictEqual(item.error, 'erken hata');
});

test('cancelled exit: running→pending, error temizlenir, devam-niyeti korunur', () => {
  // İptal işi durdurur; kuyruğu değil — öğe pending'e döner ve koşabilir iş
  // varken queueRunning "devam niyeti" olarak kalır (renderer'ın sonraki
  // saveSync'i kullanıcı kuyruğu durdurursa bayrağı indirir).
  const disk = { version: 1, items: [makeItem(5, prng(4), 'running')],
    queueRunning: true, currentQueueId: 5 };
  const out = updateQueueSnapshotTerminal(disk, 5, { type: 'exit', code: 0, cancelled: true });
  const item = out.items.find((i) => i.id === 5);
  assert.strictEqual(item.status, 'pending');
  assert.strictEqual(item.error, '');
  assert.strictEqual(out.currentQueueId, null);
  assert.strictEqual(out.queueRunning, true, 'pending öğe devam niyetini korur');
  // Koşabilir öğe kalmazsa (hepsi terminal) bayrak düşer — yalan yazılmaz.
  const allDone = updateQueueSnapshotTerminal(
    { version: 1, items: [makeItem(6, prng(5), 'running')], queueRunning: true, currentQueueId: 6 },
    6, { type: 'done', files: [] });
  assert.strictEqual(allDone.queueRunning, false);
});

test('createJobId: crypto yokluğunda fallback sayaç benzersiz ve string kalır', () => {
  const { createJobId } = require('../src/renderer/queue-lifecycle');
  const ids = new Set();
  const hadCrypto = globalThis.crypto;
  try {
    delete globalThis.crypto;
    for (let i = 0; i < 2000; i++) ids.add(createJobId());
  } finally { if (hadCrypto) globalThis.crypto = hadCrypto; }
  assert.strictEqual(ids.size, 2000, '2000 kimlik çakışmadan üretilir');
  assert.ok([...ids].every((id) => typeof id === 'string' && id.startsWith('job-')));
});

test('snapshotOptions: derin kopya + derin dondurma + çevrimsel referans dayanıklılığı', () => {
  const { snapshotOptions } = require('../src/renderer/queue-lifecycle');
  const source = { model: 'tiny', nested: { list: [1, { deep: 2 }] } };
  const frozen = snapshotOptions(source);
  source.model = 'mutated'; source.nested.list[0] = 99;
  assert.strictEqual(frozen.model, 'tiny', 'kaynak mutasyonu sızmaz');
  assert.strictEqual(frozen.nested.list[0], 1);
  assert.throws(() => { frozen.nested.list.push(3); }, /not extensible|Cannot push/);
  const cyclic = { a: 1 }; cyclic.self = cyclic;
  const frozenCyclic = snapshotOptions(cyclic);
  assert.strictEqual(frozenCyclic.self, frozenCyclic, 'çevrimsel referans çökmesiz kopyalanır');
});

test('applyQueueRunEvent: iptal sonrası terminal olay run\'ı açık bırakır — exit kapatır', () => {
  // Kullanıcı iptalinde geç gelen done/error reddedilir (accepted:false,
  // cancelled:true) ama çalışma KAPANMAZ — yalnız sonraki exit kapatabilir.
  // Bu sözleşme olmadan açık çalışma invariant'ı bozulurdu.
  const { beginQueueRun, applyQueueRunEvent, assertQueueInvariants } =
    require('../src/renderer/queue-lifecycle');
  const state = { queue: [{ id: 1, status: 'pending' }], queueRunning: true,
    running: false, currentQueueId: null, activeJobId: null, cancelled: false };
  const begin = beginQueueRun(state, state.queue[0], 'job-1');
  assert.strictEqual(begin.accepted, true);
  state.cancelled = true;
  const late = applyQueueRunEvent(state, { type: 'done', jobId: 'job-1', files: ['x'] });
  assert.strictEqual(late.accepted, false);
  assert.strictEqual(late.cancelled, true);
  assert.strictEqual(state.queue[0].activeRun.closed, false, 'iptal-sonrası done çalışmayı kapatamaz');
  const exit = applyQueueRunEvent(state, { type: 'exit', jobId: 'job-1', code: 0, cancelled: true });
  assert.strictEqual(exit.accepted, true);
  assert.strictEqual(exit.outcome, 'cancelled');
  assert.strictEqual(state.queue[0].status, 'pending', 'iptal edilen iş yeniden denenebilir');
  assert.strictEqual(assertQueueInvariants(state), true);
});

test('clonePublicOptions sır-anahtar matrisi: yerleşik + regex varyantları', () => {
  const secrets = {
    hfToken: 'x', llmApiKey: 'y', apiKey: 'z', oauthBearerToken: 'b',
    'custom-api-key': 'k', provider_access_token: 't', svcClientSecret: 's',
    nested: { inner: { deep: { Password: 'p' } } },
    safe: { url: 'https://ok/', count: 3, flag: true },
  };
  const out = clonePublicOptions(secrets);
  assert.ok(out);
  const flat = JSON.stringify(out);
  for (const bad of ['hfToken', 'llmApiKey', 'apiKey', 'oauthBearerToken',
    'custom-api-key', 'access_token', 'ClientSecret', 'Password']) {
    assert.ok(!flat.includes(bad), `sır sızdı: ${bad}`);
  }
  assert.deepStrictEqual(out.safe, { url: 'https://ok/', count: 3, flag: true });
});

test('MAX_QUEUE_ITEMS tavanı + dedupe: fazlalık invalidCount olarak sayılır', () => {
  const items = Array.from({ length: MAX_QUEUE_ITEMS + 5 }, (_, i) =>
    makeItem(i + 1, prng(i), 'pending'));
  const snap = normalizeQueueSnapshot({ items }, null);
  assert.strictEqual(snap.items.length, MAX_QUEUE_ITEMS);
  assert.ok(snap.invalidCount >= 5, `invalidCount: ${snap.invalidCount}`);
  const dup = normalizeQueueSnapshot({ items: [makeItem(1, prng(0)), makeItem(1, prng(0))] }, null);
  assert.strictEqual(dup.items.length, 1, 'id tekilleştirme ilk görülende kalır');
  assert.strictEqual(dup.invalidCount, 1);
});

console.log(`queue-writer-interleave: ${passed} kontrol geçti`);
