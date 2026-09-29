'use strict';

// Kuyruk öğesi seçenek-serileştirme roundtrip fuzz'ı (R284 / plan-2 madde 2).
// Üretilen hostile opts -> queueSnapshotForDisk -> JSON.stringify -> normalizeQueueSnapshot
// -> sahadan geri okunan item.opts; sadakat, sır-dışarısı ve sınır invariant'ları.

const assert = require('assert');
const {
  clonePublicOptions,
  normalizeQueueSnapshot,
  queueSnapshotForDisk,
} = require('../src/queue-persistence');

let seed = 0x9e3779b9;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

let checks = 0;
const ok = (name, cond) => { if (!cond) throw new Error(name); checks += 1; };

const STRINGS = [
  '', 'x', 'çğıİşöü', 'مترجم ←', '🎬 emoji', 'a'.repeat(300),
  'line\nbreak\ttab', 'https://ok.test/path?a=1',
  'https://user:pass@evil.test/x', 'https://api.test/?token=t&ok=1&sig=s',
  'D:\\film yeni.mp4', '\\\\unc\\share\\v.mkv',
];
const NORMAL_KEYS = ['model', 'splitMode', 'formats', 'maxCps', 'wrapMode',
  'mergeContinuation', 'refine', 'register', 'profanity', 'glossary',
  'contextSize', 'engine', 'device'];
const SECRET_KEYS = ['hfToken', 'translateApiKey', 'llmApiKey', 'bearerToken',
  'csrfToken', 'privateKey', 'authToken', 'sessionId', 'mangaApiKey',
  'x-access-token', 'oauthBearerToken', 'my_client_secret', 'key_password'];
const SKIP_KEYS = ['chat', 'explain', 'queueItemId', 'input', 'youtube'];
const URL_KEYS = ['customEndpoint', 'metadataUrl', 'proxyUri'];

function randValue(depth) {
  const r = rnd();
  if (depth > 7 || r < 0.22) return pick(STRINGS); // string
  if (r < 0.38) {
    const n = [0, 1, -3, 3.14, 1e9, -0, 42.5, NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER, Number.EPSILON][Math.floor(rnd() * 12)];
    return n;
  }
  if (r < 0.5) return rnd() < 0.5;
  if (r < 0.58) return null;
  if (r < 0.8) {
    const len = Math.floor(rnd() * 6);
    return Array.from({ length: len }, () => randValue(depth + 1));
  }
  const obj = {};
  const keys = Math.floor(rnd() * 6);
  for (let i = 0; i < keys; i++) {
    const k = pick([...NORMAL_KEYS, ...SECRET_KEYS, ...URL_KEYS]);
    obj[k + (rnd() < 0.3 ? '_' + i : '')] = randValue(depth + 1);
  }
  return obj;
}

function randOpts() {
  const opts = {};
  const n = 4 + Math.floor(rnd() * 14);
  for (let i = 0; i < n; i++) {
    const roll = rnd();
    if (roll < 0.45) opts[pick(NORMAL_KEYS)] = randValue(0);
    else if (roll < 0.65) opts[pick(SECRET_KEYS)] = pick(STRINGS) || 'S3CR3T-' + i;
    else if (roll < 0.75) opts[pick(SKIP_KEYS)] = randValue(0);
    else if (roll < 0.9) opts[pick(URL_KEYS)] = pick(STRINGS);
    else opts['deep' + i] = randValue(0);
  }
  // ara sıra dev/sınır aşıcılar
  if (rnd() < 0.04) opts.huge = 'ğ'.repeat(600 * 1024);
  if (rnd() < 0.04) opts.arr = Array.from({ length: 5001 }, (_, i) => i);
  return opts;
}

function depthOf(v, d = 0) {
  if (!v || typeof v !== 'object' || d > 12) return d;
  let max = d;
  for (const c of Object.values(v)) max = Math.max(max, depthOf(c, d + 1));
  return max;
}

function randItem(id) {
  return {
    id,
    type: pick(['file', 'youtube']),
    input: pick(STRINGS) || `in-${id}.mp4`,
    label: pick(STRINGS),
    status: pick(['pending', 'running', 'done', 'error', 'garbage']),
    files: [pick(STRINGS), pick(STRINGS)].slice(0, Math.floor(rnd() * 3)),
    warnings: rnd() < 0.3 ? [pick(STRINGS)] : [],
    error: rnd() < 0.3 ? pick(STRINGS) : '',
    opts: randOpts(),
    watchSource: rnd() < 0.2,
    watchReported: rnd() < 0.2 ? 'x'.repeat(40) : '',
    recovered: rnd() < 0.2,
    bogusField: { ignored: true },
  };
}

const SECRET_LITERAL = 'S3CR3T-';
let dropped = 0, kept = 0, oversizedDropped = 0;

for (let i = 0; i < 3000; i++) {
  const items = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => randItem(i * 10 + k));
  const disk = queueSnapshotForDisk({ items, queueRunning: rnd() < 0.5 });
  const json = JSON.stringify(disk);
  ok(`iter${i}: sır literal diske sızmaz`, !json.includes(SECRET_LITERAL));
  const loaded = normalizeQueueSnapshot(JSON.parse(json));

  // Yükleme yolu idempotent: normalizeQueueSnapshot(normalizeQueueSnapshot(x)) ≡ x
  // (queueRunning "devam niyeti" disk yazımında, "aktif koşu" yüklemede — iki
  // ayrı anlamı olan alan; idempotans yüklemenin kendisinde aranır).
  const a = normalizeQueueSnapshot(JSON.parse(JSON.stringify(loaded)));
  ok(`iter${i}: yükleme idempotent`, JSON.stringify(a) === JSON.stringify(loaded));

  for (const src of items) {
    const valid = clonePublicOptions(src.opts) !== null
      && Number.isSafeInteger(Number(src.id)) && Number(src.id) > 0
      && ['file', 'youtube'].includes(src.type)
      && String(src.input || '').trim().length > 0;
    const got = loaded.items.find((it) => it.id === Number(src.id));
    // huge/arr aşımı clone'u reddettirir → öğe düşer; bu gözlenmeli
    if (src.opts && (src.opts.huge || src.opts.arr) && !got) oversizedDropped += 1;
    if (valid && !got) { dropped += 1; continue; }
    if (!got) continue;
    kept += 1;
    const expect = clonePublicOptions(src.opts);
    ok(`iter${i}: opts sadakati`, JSON.stringify(got.opts) === JSON.stringify(expect));
    ok(`iter${i}: skip-anahtar yok`, !['chat', 'explain', 'queueItemId', 'input', 'youtube']
      .some((k) => k in got.opts));
    ok(`iter${i}: derinlik budanı`, depthOf(got.opts) <= 10);
    ok(`iter${i}: sır anahtar yok`, !Object.keys(got.opts).some((k) =>
      /token|apikey|secret|password|credential|session|bearer|csrf|xsrf|auth/i.test(k)));
    for (const [k, v] of Object.entries(got.opts)) {
      if (typeof v === 'string' && /^https?:\/\//.test(v) && /(?:url|uri|endpoint)$/i.test(k)) {
        const u = new URL(v);
        ok(`iter${i}: userinfo sıyırma`, !u.username && !u.password);
        for (const p of u.searchParams.keys()) {
          ok(`iter${i}: sır-param sıyırma`, !/token|key|sig|auth|secret|jwt|credential|session|sid/i.test(p));
        }
      }
    }
    ok(`iter${i}: status normalize`, ['pending', 'running', 'done', 'error'].includes(got.status));
  }
}

ok('en az 800 öğe tutuldu', kept > 800);
ok('boyut/dizi aşımı düşürme gözlendi', oversizedDropped > 10);
// Geçerli öğe kaybı sadakat ihlalidir: sayaç sıfır olmalı (yalnız
// sınır-aşımı/sır taşıyan öğelerin düşmesi beklenir).
ok('geçerli öğe kaybı yok', dropped === 0);

// Disk yolu: üretilen snapshot'ı gerçek dosyaya yazıp main.js'teki
// readQueueStateRaw deseniyle (birincil → .bak) geri oku. Saf fonksiyon
// roundtrip'inin üstüne dosya kodlaması/bayakılık kanıtı ekler.
{
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-roundtrip-'));
  const target = path.join(dir, 'queue-state.json');
  const items = Array.from({ length: 12 }, (_, k) => randItem(9000 + k));
  const disk = queueSnapshotForDisk({ items, queueRunning: false });
  fs.writeFileSync(target, JSON.stringify(disk, null, 2));
  // readQueueStateRaw: birincil varsa onu oku, bozuksa .bak'a düş.
  const primaryParsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  ok('disk: bayt-bayt roundtrip', JSON.stringify(primaryParsed) === JSON.stringify(disk));
  const loaded = normalizeQueueSnapshot(primaryParsed);
  ok('disk: yüklenen öğe sayısı', loaded.items.length === disk.items.length);
  // .bak yolu: birincili boz, yedeği geçerli tut.
  fs.writeFileSync(`${target}.bak`, JSON.stringify(disk));
  fs.writeFileSync(target, '{bozuk');
  const raw = (() => {
    for (const candidate of [target, `${target}.bak`]) {
      try {
        if (!fs.existsSync(candidate) || fs.statSync(candidate).size > 8 * 1024 * 1024) continue;
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
    return { version: 1, items: [] };
  })();
  const recovered = normalizeQueueSnapshot(raw);
  ok('disk: bozuk birincilde .bak kurtarır', recovered.items.length === disk.items.length);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`queue-opts-roundtrip: ${checks} kontrol geçti (${kept} öğe, ${dropped} geçersiz, ${oversizedDropped} sınır-aşımı)`);
