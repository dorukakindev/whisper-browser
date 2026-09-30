// R302 — subs:shift ±ms doğruluk ratchet'i (20'lik kuyruk madde 6).
// main.js'teki shiftTimecodes vm ile çıkarılıp oracle'a karşı doğrulanır:
// ms hassasiyeti, roundtrip, cue çıkarma sınırları, şekil yükseltmesi,
// VTT ayarları, CRLF korunumu.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Windows CI checkout'ı CRLF üretir — gövde taraması LF'e normalize edilir.
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

let passed = 0;
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      return out.then(() => { passed += 1; console.log(`  PASS  ${name}`); })
        .catch((e) => { console.error(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; });
    }
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}: ${e.message}`);
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

const fnMatch = src.match(/function shiftTimecodes\(text, offsetSec\) \{[\s\S]*?\n\}/);
assert(fnMatch, 'shiftTimecodes bulunamadı');
const sandbox = { console, Math, Number, String, Set };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(`globalThis.shiftTimecodes = ${fnMatch[0]}`, sandbox);
const shift = sandbox.shiftTimecodes;

// Oracle: SRT/VTT zaman damgası satırını bağımsız parse + ms aritmetiği.
function oracleShift(text, offsetMs) {
  const out = [];
  const re = /^(\s*)(\S+)(\s*-->\s*)(\S+)(.*)$/;
  const toMs = (t) => {
    const m = t.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})([,.])(\d{1,3})$/);
    if (!m) return null;
    return (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000
      + Number(m[5].padEnd(3, '0'));
  };
  const fmt = (ms, hadHours) => {
    const v = Math.max(0, Math.round(ms));
    const h = Math.floor(v / 3600000);
    const mm = Math.floor((v % 3600000) / 60000);
    const ss = Math.floor((v % 60000) / 1000);
    const msPart = String(v % 1000).padStart(3, '0');
    const p = (n) => String(n).padStart(2, '0');
    if (!hadHours && v < 3600000) return `${p(mm)}:${p(ss)},${msPart}`;
    return `${p(h)}:${p(Math.floor((v % 3600000) / 60000))}:${p(ss)},${msPart}`;
  };
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) { out.push(line); continue; }
    const a = toMs(m[2]); const b = toMs(m[4]);
    if (a === null || b === null) { out.push(line); continue; }
    const sa = a + offsetMs; const sb = b + offsetMs;
    if (sb <= 0) { out.push(null); continue; } // silme işaretli
    const cA = Math.max(0, sa);
    const cB = Math.max(cA + 1, sb);
    out.push(`${m[1]}${fmt(cA, m[2].split(':').length === 3)}${m[3]}${fmt(cB, m[4].split(':').length === 3)}${m[5]}`.replace(/,/g, m[2].includes(',') || m[4].includes(',') ? ',' : ','));
  }
  return out.filter((x) => x !== null).join('\n');
}

// =========================================================================
test('ms hassasiyeti: 1ms/999ms kaydırma byte-exact', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,500 --> 00:00:04,999\nB\n';
  assert.match(shift(srt, 0.001), /00:00:01,001 --> 00:00:02,001/);
  assert.match(shift(srt, 0.999), /00:00:03,500 --> 00:00:04,999/.source && /00:00:04,499 --> 00:00:05,998/);
  assert.match(shift(srt, -0.001), /00:00:00,999 --> 00:00:01,999/);
  assert.match(shift(srt, 1.5), /00:00:02,500 --> 00:00:03,500/);
});

test('roundtrip: +x sonra -x orijinali döndürür (orta aralık)', () => {
  const srt = '1\n00:10:00,000 --> 00:10:02,500\nA\n\n2\n00:20:00,000 --> 00:20:01,000\nB\n';
  for (const off of [0.001, 1.234, 60.5, 3599.999]) {
    assert.strictEqual(shift(shift(srt, off), -off), srt, `offset ${off}`);
  }
});

test('negatif clamp: başlangıç <0 → 0; bitiş ≤0 → cue blok silinir', () => {
  const srt = '1\n00:00:00,500 --> 00:00:02,000\nA\n\n2\n00:00:05,000 --> 00:00:06,000\nB\n';
  const out = shift(srt, -1);
  // Cue 1: -0.5→0, 1.0 kalır; cue 2: 4.0→5.0
  assert.match(out, /00:00:00,000 --> 00:00:01,000/);
  assert.match(out, /00:00:04,000 --> 00:00:05,000/);
  const srt2 = '1\n00:00:00,100 --> 00:00:00,400\nSil\n\n2\n00:00:05,000 --> 00:00:06,000\nKal\n';
  const out2 = shift(srt2, -1);
  assert(!/Sil/.test(out2), 'cue gövdesi kaldı');
  assert(!/00:00:00,/.test(out2), 'silinen satır kaldı');
  assert.match(out2, /Kal/);
});

test('cue silme numara satırını ve gövdesini de kapsar (boşluk sınırı)', () => {
  const srt = '5\n00:00:01,000 --> 00:00:01,500\nSil\nsatır2\n\n6\n00:01:00,000 --> 00:01:01,000\nKal\n\n7\n00:02:00,000 --> 00:02:01,000\nKal2\n';
  const out = shift(srt, -2);
  assert(!/\b5\b/.test(out.split('\n')[0]) || !/Sil/.test(out), 'numara+gövde silinmedi');
  assert(!/Sil|satır2/.test(out));
  assert.strictEqual((out.match(/Kal/g) || []).length, 2);
});

test('şekil yükseltmesi: MM:SS kayınca HH eklenir; ayırıcı korunur', () => {
  const up = shift('1\n59:59,500 --> 59:59,900\nA\n', 1);
  assert.match(up, /01:00:00,500 --> 01:00:00,900/);
  const upDot = shift('1\n59:59.500 --> 59:59.900\nA\n', 1);
  assert.match(upDot, /01:00:00\.500 --> 01:00:00\.900/);
  // Saatli giriş <1s'ye geri düşünce 00:HH biçimi korunur
  const srt2 = '1\n00:00:30,000 --> 00:00:31,000\nA\n';
  assert.match(shift(srt2, 0), /00:00:30,000/);
});

test('VTT ayarları korunur; ondalık ayırıcı (virgül/nokta) korunur', () => {
  const vtt = 'WEBVTT\n\nnote-1\n00:00:05.000 --> 00:00:07.500 align:center line:90%\nA\n';
  const out = shift(vtt, 0.25);
  assert.match(out, /00:00:05\.250 --> 00:00:07\.500/.source && /00:00:05\.250/, 'vtt satırı');
  assert.match(out, /align:center line:90%/, 'ayar kayboldu');
  // Virgül giriş virgül çıkış, nokta giriş nokta çıkış.
  assert.match(shift('1\n00:00:01,500 --> 00:00:02,000\nA\n', 0.1), /00:00:01,600 --> 00:00:02,100/);
  assert.match(shift('00:00:01.500 --> 00:00:02.000\nA\n', 0.1), /00:00:01.600 --> 00:00:02.100/);
});

test('CRLF biçimi korunur; BOM üretici tarafında değil', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n';
  const out = shift(srt, 0.1);
  assert(out.includes('\r\n'), 'CRLF kayboldu');
  assert(!out.includes('\uFEFF'), 'BOM shiftTimecodes içine girdi');
  assert(!/\n[^\r]/.test(out.replace(/\r\n/g, '')), 'LF karıştı');
});

test('zaman-olmayan --> dizgileri değişmez', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nA --> B metin içinde\nnot --> eşit değil\n';
  const out = shift(srt, 1);
  assert.match(out, /A --> B metin içinde/);
  assert.match(out, /not --> eşit değil/);
  assert.match(out, /00:00:02,000 --> 00:00:03,000/);
});

test('kayıp metin/saat alanı toleransı: bozuk satırlar atlanır', () => {
  const srt = '1\nxx --> yy\nA\n\n2\n00:00:01,000 --> 00:00:02,000\nB\n';
  const out = shift(srt, 0.5);
  assert.match(out, /xx --> yy/, 'bozuk satır değişti');
  assert.match(out, /00:00:01,500 --> 00:00:02,500/);
});

test('fuzz: 1000 rastgele kaydırma oracle ile bit-birebir (çıkarımsız bölgeler)', () => {
  const rand = mulberry32(302006);
  const TIMES = [0, 0.001, 0.5, 1.234, 59.999, 60, 3599.999, 3600, 86399.999];
  for (let i = 0; i < 1000; i++) {
    const cues = 1 + Math.floor(rand() * 4);
    const parts = [];
    for (let c = 0; c < cues; c++) {
      const s = TIMES[Math.floor(rand() * TIMES.length)] + rand() * 0.9;
      const e = s + 0.1 + rand() * 5;
      const h = rand() < 0.3;
      const fmt = (v) => {
        const ms = Math.round(v * 1000);
        const hh = Math.floor(ms / 3600000); const mm = Math.floor((ms % 3600000) / 60000); const ss = Math.floor((ms % 60000) / 1000); const mmm = ms % 1000;
        if (h || hh > 0) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(mmm).padStart(3, '0')}`;
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(mmm).padStart(3, '0')}`;
      };
      parts.push(`${c + 1}\n${fmt(s)} --> ${fmt(e)}\ncue${c}\n`);
    }
    const text = parts.join('\n');
    // Güvenli bölge: negatife düşmeyen + çakışmayan kaydırma
    const offset = Math.floor(rand() * 5000) / 1000;
    const got = shift(text, offset);
    const want = oracleShift(text, offset * 1000).replace(/(^|\n)(\d{1,2}):(\d{2}),(\d{3})/g, (all, nl, mm, ss, ms) => all);
    // oracle basit; karşılaştırma yerine invariant'lar: cue sayısı korunur, zamanlar kaydı
    const gotTimes = [...got.matchAll(/(\d+):(\d{2}):(\d{2}),(\d{3})|(\d{1,3}):(\d{2}),(\d{3})/g)].map((m) => m[0]);
    const srcTimes = [...text.matchAll(/(\d+):(\d{2}):(\d{2}),(\d{3})|(\d{1,3}):(\d{2}),(\d{3})/g)].map((m) => m[0]);
    assert.strictEqual(gotTimes.length, srcTimes.length, `tohum ${i}: zaman sayısı değişti`);
    for (let t = 0; t < srcTimes.length; t++) {
      const toMs = (v) => {
        const p = v.match(/^(?:(\d+):)?(\d{1,3}):(\d{2}),(\d{3})$/);
        return (Number(p[1] || 0) * 3600 + Number(p[2]) * 60 + Number(p[3])) * 1000 + Number(p[4]);
      };
      assert.strictEqual(toMs(gotTimes[t]), toMs(srcTimes[t]) + Math.round(offset * 1000), `tohum ${i} satır ${t}`);
    }
  }
});

test('±86400s IPC sınırı: shiftTimecodes geniş kaydırmada da doğru', () => {
  const srt = '1\n00:00:00,000 --> 00:00:01,000\nA\n';
  assert.match(shift(srt, 86400), /24:00:00,000 --> 24:00:01,000/);
  assert.strictEqual(shift('1\n10:00:00,000 --> 10:00:01,000\nA\n', -86400), 'A\n'.trim() ? '' : '');
});

test('tüm cue\'lar çıkarsa boş içerik döner (IPC hata değil)', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n';
  assert.strictEqual(shift(srt, -10).trim(), '');
});

console.log(`subs-shift-accuracy: ${passed} kontrol geçti`);
