const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');

// Deterministik PRNG (ci-determinism ratchet: Math.random yasak).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-cache-fuzz-'));
const now = Date.now();
const HOUR = 3600_000;

// Bozuk günlük satır üreteci — geçerli JSON ama yanlış şekil, yarım JSON,
// ham bayt çöpü ve mezar taşı tuzağı (v dizge değil) dahil.
function corruptJournalLine(rnd) {
  const kinds = [
    () => '{"k":"x","v":"y"',                                    // kesik JSON
    () => JSON.stringify(rnd() * 1000),                          // sayı
    () => JSON.stringify('sadece dizge'),                        // dizge
    () => JSON.stringify(null),                                  // null
    () => JSON.stringify([1, 2, 3]),                             // dizi
    () => JSON.stringify({}),                                    // alansız nesne
    () => JSON.stringify({ k: 42, v: 'val', t: now }),           // k sayı
    () => JSON.stringify({ k: '', v: 'val', t: now }),           // k boş
    () => JSON.stringify({ k: 'live', v: 123, t: now }),         // v sayı → mezar taşı değil
    () => JSON.stringify({ k: 'live', v: null, t: now }),        // v null → mezar taşı değil
    () => JSON.stringify({ k: 'live', v: true, t: now }),        // v bool → mezar taşı değil
    () => JSON.stringify({ k: 'live', t: now }),                 // v yok → mezar taşı değil
    () => JSON.stringify({ k: 'live', v: '', t: now + 10 * HOUR }), // gelecekteki mezar taşı
    () => JSON.stringify({ k: 'ghost', v: 'yeni', t: -1 }),      // t negatif
    () => JSON.stringify({ k: 'ghost2', v: 'yeni', t: 1e15 }),   // t devasa (gelecek)
    () => JSON.stringify({ k: 'expired', v: 'eski', t: now - 90 * 24 * HOUR }), // TTL aşmış
    () => '\x00\x01\x02',                                        // NUL baytlar
    () => '   ',                                                 // boşluk
    () => '{]not json[}',
  ];
  return pick(rnd, kinds)();
}

function baseEntriesPayload(rnd, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const kind = i === 0 ? 0 : pick(rnd, [0, 0, 0, 1, 2, 3, 4, 5]);
    if (kind === 0) rows.push([`ok${i}`, { value: `değer${i}`, updatedAt: now - Math.floor(rnd() * HOUR) }]);
    else if (kind === 1) rows.push([`nostr${i}`, { value: 42, updatedAt: now }]);
    else if (kind === 2) rows.push([`notime${i}`, { value: 'v' }]);            // updatedAt yok → 0 → TTL düşer
    else if (kind === 3) rows.push('dizge-satır');                             // dizi değil
    else if (kind === 4) rows.push([`short${i}`]);                             // uzunluk≠2
    else if (kind === 5) rows.push([`old${i}`, { value: 'v', updatedAt: now - 90 * 24 * HOUR }]);
  }
  return JSON.stringify({ version: 2, entries: rows }) + '\n';
}

const invariantMap = (cache, label) => {
  assert(cache.map instanceof Map, label);
  assert(cache.map.size <= cache.limit, `${label}: limit aşımı`);
  for (const [k, r] of cache.map) {
    assert.equal(typeof k, 'string', `${label}: anahtar dizge`);
    assert.equal(typeof r.value, 'string', `${label}: değer dizge`);
    assert(r.value.length > 0, `${label}: boş değer kalıcılaşmamalı`);
  }
};

(async () => { try {
  let cases = 0;

  // 1) Bozuk günlük replay — geçerli temel + karışık satırlar.
  for (let seed = 1; seed <= 48; seed++) {
    const rnd = mulberry32(seed * 7919);
    const file = path.join(dir, `j-${seed}.json`);
    fs.writeFileSync(file, JSON.stringify({ version: 2, entries: [
      ['live', { value: 'canlı', updatedAt: now }],
      ['dead', { value: 'ölü', updatedAt: now - HOUR }],
    ] }) + '\n');
    const lines = [];
    const nCorrupt = 1 + Math.floor(rnd() * 8);
    for (let i = 0; i < nCorrupt; i++) lines.push(corruptJournalLine(rnd));
    if (rnd() < 0.7) lines.push(JSON.stringify({ k: 'added', v: 'eklendi', t: now }));
    if (rnd() < 0.4) lines.push(JSON.stringify({ k: 'dead', v: '', t: now })); // meşru mezar taşı
    fs.writeFileSync(`${file}.journal`, lines.join('\n') + '\n');
    const cache = new PersistentTranslationCache(file, { limit: 20 });
    invariantMap(cache, `journal seed=${seed}`);
    // İçerik çıktıları: günlükteki SON geçerli yazım kazanır. 'added' için son
    // rakip satır yoksa kayıt hayattadır; 'dead' için sonda mezar taşı varsa
    // temel kayıt silinir, yoksa canlı kalır; 'live' çekişmesiz kalmalı.
    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const last = (key) => { for (let i = parsed.length - 1; i >= 0; i--) if (parsed[i] && parsed[i].k === key) return parsed[i]; return null; };
    if (last('added')) assert.equal(cache.get('added'), 'eklendi', `journal seed=${seed}: eklenen kayıt hayatta`);
    const deadLast = last('dead');
    if (deadLast && deadLast.v === '') assert.equal(cache.map.has('dead'), false, `journal seed=${seed}: mezar taşı temel kaydı silmeli`);
    else if (!deadLast) assert.equal(cache.get('dead'), 'ölü', `journal seed=${seed}: dokunulmayan temel kayıt korunur`);
    if (!last('live')) assert.equal(cache.get('live'), 'canlı', `journal seed=${seed}: çekişmesiz canlı kayıt korunur`);
    cases++;
  }

  // 2) Bozuk temel dosya — şema geçerli JSON ama satırlar çarpık; .bak yok.
  for (let seed = 1; seed <= 48; seed++) {
    const rnd = mulberry32(seed * 104729);
    const file = path.join(dir, `b-${seed}.json`);
    fs.writeFileSync(file, baseEntriesPayload(rnd, 3 + Math.floor(rnd() * 10)));
    const cache = new PersistentTranslationCache(file, { limit: 10 });
    invariantMap(cache, `base seed=${seed}`);
    assert(cache.map.size >= 1, `base seed=${seed}: ok0 kaydı her zaman yüklenir`);
    assert.equal(cache.get('ok0'), 'değer0', `base seed=${seed}: canlı temel içerik korunur`);
    cases++;
  }

  // 3) Şema-geçersiz gövdeler + yedek zinciri davranışı.
  const invalidBodies = [
    '"dizge"', '42', 'null', '[]', '{}', '{"version":0,"entries":[]}',
    '{"version":3,"entries":[]}', '{"version":"2","entries":[]}',
    '{"version":2}', '{"version":2,"entries":{}}', '{"version":2,"entries":"x"}',
    '{yarım', '', '   ', '\x00\xfe',
  ];
  invalidBodies.forEach((body, i) => {
    const file = path.join(dir, `schema-${i}.json`);
    fs.writeFileSync(file, body);
    const withBackup = i % 2 === 0;
    if (withBackup) {
      fs.writeFileSync(`${file}.bak`, JSON.stringify({ version: 2, entries: [
        ['rescued', { value: 'yedek', updatedAt: now }],
      ] }) + '\n');
    }
    const cache = new PersistentTranslationCache(file);
    invariantMap(cache, `schema i=${i}`);
    const archives = fs.readdirSync(dir).filter((n) => n.startsWith(path.basename(file) + '.corrupt-'));
    assert(archives.length >= 1, `schema i=${i}: bozuk birincil .corrupt-* arşivine taşınmalı`);
    if (withBackup) assert.equal(cache.get('rescued'), 'yedek', `schema i=${i}: .bak kurtarması`);
    else assert.equal(cache.map.size, 0, `schema i=${i}: ikisi de bozuksa boş başlamalı`);
    cases++;
  });

  // 4) Sınır aşımı — günlük tekrarı + kapasite kesimi deterministik kalır.
  {
    const file = path.join(dir, 'limit.json');
    fs.writeFileSync(file, JSON.stringify({ version: 2, entries: [['b0', { value: 't', updatedAt: now }]] }) + '\n');
    const lines = [];
    for (let i = 0; i < 150; i++) lines.push(JSON.stringify({ k: `j${i}`, v: `v${i}`, t: now + i }));
    fs.writeFileSync(`${file}.journal`, lines.join('\n') + '\n');
    // Constructor limit'i en az 100'e çeker — 150 satır kesimi tetikler.
    const cache = new PersistentTranslationCache(file, { limit: 100 });
    invariantMap(cache, 'limit');
    assert.equal(cache.map.size, 100);
    assert.equal(cache.get('j149'), 'v149', 'en yeni günlük satırı yaşamalı');
    assert.equal(cache.map.get('b0'), undefined, 'en eski temel kayıt kesilmeli');
    cases++;
  }

  // 5) Roundtrip bütünlüğü — bozuk günlükten kurtarılanlar yeniden yazılabilir.
  {
    const file = path.join(dir, 'roundtrip.json');
    fs.writeFileSync(file, JSON.stringify({ version: 2, entries: [
      ['keep', { value: 'korunan', updatedAt: now }],
    ] }) + '\n');
    fs.writeFileSync(`${file}.journal`, [
      '{bozuk satır',
      JSON.stringify({ k: 'keep2', v: 'korunan2', t: now }),
      JSON.stringify({ k: 'x', v: 9, t: now }),
    ].join('\n') + '\n');
    const cache = new PersistentTranslationCache(file);
    assert.equal(cache.get('keep'), 'korunan');
    assert.equal(cache.get('keep2'), 'korunan2');
    const flushed = await cache.flush();
    assert(flushed.ok, 'bozuk günlük sonrası flush başarılı olmalı');
    const reloaded = new PersistentTranslationCache(file);
    assert.equal(reloaded.get('keep'), 'korunan');
    assert.equal(reloaded.get('keep2'), 'korunan2');
    const compacted = await reloaded.compact();
    assert(compacted.ok, 'compact başarılı olmalı');
    const again = new PersistentTranslationCache(file);
    assert.equal(again.get('keep'), 'korunan');
    assert.equal(again.get('keep2'), 'korunan2');
    cases++;
  }

  // 6) Yükleme sonrası set/flush/compact döngüsü bozuk kalıntılarla temiz kalır.
  {
    const file = path.join(dir, 'cycle.json');
    fs.writeFileSync(`${file}.journal`, '\x00{bozuk\n{"k":5}\n');
    const cache = new PersistentTranslationCache(file);
    for (let i = 0; i < 30; i++) assert(cache.set(`k${i}`, `v${i}`));
    assert((await cache.flush()).ok);
    assert((await cache.compact()).ok);
    const reloaded = new PersistentTranslationCache(file);
    assert.equal(reloaded.get('k29'), 'v29');
    invariantMap(reloaded, 'cycle');
    cases++;
  }

  console.log(`PASS: translation-cache-fuzz (${cases} senaryo)`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
} })().catch((error) => { console.error('FAIL:', error); process.exit(1); });
