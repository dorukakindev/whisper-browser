'use strict';
// R324-3 — timer/interval envanter ratchet'i: src/ + src/renderer/ altındaki
// her `setInterval` ya bir handle'a atanır ve aynı dosyada `clearInterval(handle)`
// eşi bulunur, ya da bilinen uygulama-ömürlü singleton listesindedir.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src');

// Handle'siz, ömür boyu yaşayan tekil interval'ler (modül-init IIFE içinde,
// kendi signature-guard'larıyla çalışır). Yeni bir tanesi eklenirse bu liste
// bilinçli güncellenmeli.
const BARE_SINGLETON_WHITELIST = new Map([
  ['renderer/browser-analysis-tools.js', 1],
  ['renderer/browser-dialogue.js', 1],
  ['renderer/browser-features.js', 1],
  ['renderer/browser-series-context.js', 1],
  ['renderer/browser-video-analysis.js', 1],
  // checkPlayerSleepTimer — renderer yaşamı boyunca tek çağrı
  ['renderer/renderer.js', 1],
  // soak probu setInterval'i wrap eder (envanter aracı, üretim timer'ı değil)
  ['renderer/resource-soak-probe.js', 0],
]);

function listJsFiles(dir, relBase = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const rel = path.relative(relBase, p);
    if (entry.isDirectory()) {
      if (rel === 'renderer/vendor' || rel === 'node_modules') continue; // vendored/minified
      out.push(...listJsFiles(p, relBase));
    } else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Bir setInterval çağrısından handle adını çıkar: `X = setInterval(` / `x.y = setInterval(`
// → 'X' / 'x.y'; nesne-literal `prop: setInterval(` → 'prop'. Bare çağrı → null.
function handleFor(prefix) {
  const assign = prefix.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*$/);
  if (assign) return assign[1];
  const prop = prefix.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  if (prop) return prop[1];
  return null;
}

describe('R324-3: interval envanteri — her setInterval ya eşli ya whitelist', () => {
  it('handle\'lı interval\'ler aynı dosyada clearInterval eşi taşır', () => {
    const violations = [];
    const files = listJsFiles(SRC);
    for (const file of files) {
      const rel = path.relative(SRC, file);
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n');
      const bare = [];
      const handled = new Set();
      for (const line of lines) {
        for (const m of line.matchAll(/\bsetInterval\s*\(/g)) {
          const h = handleFor(line.slice(0, m.index));
          if (h) handled.add(h); else bare.push(line.trim().slice(0, 120));
        }
      }
      for (const h of handled) {
        const ident = h.split('.').pop();
        const clearRe = new RegExp(`clearInterval\\s*\\([^)]*\\b${ident}\\b`);
        if (!clearRe.test(text)) {
          violations.push(`${rel}: '${h}' handle'lı interval için clearInterval eşi yok`);
        }
      }
      const expected = BARE_SINGLETON_WHITELIST.get(rel);
      if (bare.length) {
        if (expected === undefined) {
          violations.push(`${rel}: ${bare.length} handle'siz interval (whitelist'te yok): ${bare[0]}`);
        } else if (bare.length > expected) {
          violations.push(`${rel}: ${bare.length} handle'siz interval > whitelist ${expected}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it('whitelist dosyaları gerçekten bare interval içerir (bayat whitelist koruması)', () => {
    for (const [rel, expected] of BARE_SINGLETON_WHITELIST) {
      const file = path.join(SRC, rel);
      assert.ok(fs.existsSync(file), `${rel} yok — whitelist bayat`);
      const text = fs.readFileSync(file, 'utf8');
      const total = (text.match(/\bsetInterval\s*\(/g) || []).length;
      const assigned = (text.match(/[=:]\s*setInterval\s*\(/g) || []).length;
      const bareCount = total - assigned;
      assert.ok(bareCount >= expected, `${rel}: ${bareCount} bare < whitelist ${expected} — whitelist bayat`);
    }
  });
});
