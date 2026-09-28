'use strict';
// R161: NaN/Number normalizasyon süpürmesi — sonlu-olmayan sayılar kalıcı kuyruğa
// sızmaz + kaynak-kod ratchet'ları.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  clonePublicOptions, normalizeQueueSnapshot, queueSnapshotForDisk,
} = require('../src/queue-persistence');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };

// --- clonePublicOptions: NaN/Infinity düşürülür ---
{
  const out = clonePublicOptions({ maxCps: NaN, vadThreshold: Infinity,
    batchSize: -Infinity, temperature: 0.7, model: 'small' });
  ok(out !== null, 'opts klonu döner');
  ok(!('maxCps' in out) && !('vadThreshold' in out) && !('batchSize' in out),
    'sonlu olmayan sayı anahtarları düşürülür');
  ok(out.temperature === 0.7 && out.model === 'small', 'geçerli değerler korunur');
}
{
  // Dizi içindeki NaN da süzülür (belgelenmiş küçülme davranışı)
  const out = clonePublicOptions({ values: [1, NaN, 3, Infinity, 5] });
  assert.deepStrictEqual(out.values, [1, 3, 5]);
}

// --- normalizeQueueSnapshot üzerinden uçtan-uca ---
{
  const s = normalizeQueueSnapshot({ items: [{ id: 1, type: 'file', input: 'a.mp4',
    opts: { vadThreshold: NaN, batchSize: 8 } }] });
  ok(s.items.length === 1, 'öğe korunur');
  ok(!('vadThreshold' in s.items[0].opts) && s.items[0].opts.batchSize === 8,
    'snapshot içinde NaN düşürüldü');
}

// --- Diskte JSON: NaN yerine artık anahtar yok (null sızması bitti) ---
{
  const snap = queueSnapshotForDisk({ items: [{ id: 1, type: 'file', input: 'a.mp4',
    opts: { noSpeechThreshold: NaN } }] });
  const raw = JSON.stringify(snap);
  ok(!/"noSpeechThreshold"/.test(raw), 'disk JSON\'unda NaN anahtarı yok');
  ok(!/:null/.test(raw) || !raw.includes('noSpeechThreshold'), 'null sızması yok');
}

// --- Kaynak ratchet'ları ---
{
  const qp = fs.readFileSync(path.join(__dirname, '../src/queue-persistence.js'), 'utf8');
  ok(/Number\.isFinite\(value\) \? value : undefined/.test(qp),
    'sanitizePublicValue sonlu-sayı kapısı mevcut');
}

// parseInt radix'siz kalmasın (src ağacı süpürmesi — derinlik-sayar, iç içe parantez güvenli)
{
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'vendor') walk(p);
      else if (entry.name.endsWith('.js') && !p.includes('vendor')) files.push(p);
    }
  };
  walk(path.join(__dirname, '../src'));
  const missing = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/parseInt\(/g)) {
      let depth = 1, i = m.index + 'parseInt('.length, comma = false;
      while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        else if (ch === ',' && depth === 1) comma = true;
        i += 1;
      }
      if (!comma) {
        const line = text.slice(0, m.index).split('\n').length;
        missing.push(`${path.basename(file)}:${line}`);
      }
    }
  }
  ok(missing.length === 0, `radix'siz parseInt: ${missing.join(', ')}`);
}

// NaN opts → argv falsy-kapısıyla atlanır (main.js davranış ratchet'ı)
{
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const guarded = (main.match(/if \(options\.\w+\) args\.push\('--/g) || []).length;
  ok(guarded >= 8, `sayısal opts truthy-kapılı (${guarded} ≥ 8)`);
}

console.log(`number-normalization: ${n} kontrol geçti`);
