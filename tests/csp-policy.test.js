'use strict';
// R326-1 — CSP/permission policy denetimi ratchet'i.
// index.html connect-src daralır: renderer'da https: bağlantısı yapan tek
// yüzey whisper-pdf: fetch'idir; https: ölü izin olarak kalırsa gelecekteki
// bir XSS vektörüne exfil yolu bırakır.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const mini = fs.readFileSync(path.join(__dirname, '../src/renderer/browser-mini.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

function cspOf(doc) {
  const m = doc.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'CSP meta yok');
  const out = {};
  for (const part of m[1].split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const [d, ...vals] = seg.split(/\s+/);
    out[d] = vals;
  }
  return out;
}

describe('R326-1: CSP politikası denetimi', () => {
  const csp = cspOf(html);
  it('connect-src yalnız self + whisper-pdf (https: ölü izin yok)', () => {
    assert.deepEqual(csp['connect-src'], ["'self'", 'whisper-pdf:']);
  });
  it('script-src katı self (unsafe-inline/eval yok)', () => {
    assert.deepEqual(csp['script-src'], ["'self'"]);
    assert.ok(!html.includes("'unsafe-eval'") && !csp['script-src'].includes("'unsafe-inline'"));
  });
  it('object-src/base-uri/form-action none; default-src self', () => {
    assert.deepEqual(csp['object-src'], ["'none'"]);
    assert.deepEqual(csp['base-uri'], ["'none'"]);
    assert.deepEqual(csp['form-action'], ["'none'"]);
    assert.deepEqual(csp['default-src'], ["'self'"]);
  });
  it('browser-mini CSP ana politikanın katı alt kümesi', () => {
    const m = cspOf(mini);
    assert.deepEqual(m['default-src'], ["'self'"]);
    assert.deepEqual(m['script-src'], ["'self'"]);
    assert.deepEqual(m['style-src'], ["'self'"]);
  });
  it('renderer: uzak bağlantı yüzeyi kanıtı — tek fetch whisper-pdf/file tabanlı', () => {
    const fetches = [...renderer.matchAll(/\bfetch\(([^)\n]+)/g)]
      .map((x) => x[1].trim())
      .filter((a) => !/vendor|worker/i.test(a));
    assert.deepEqual(fetches, ['opened.fileUrl, { cache: \'no-store\' }']);
    assert.ok(!/new WebSocket|EventSource|XMLHttpRequest|sendBeacon/.test(renderer.replace(/vendor[\s\S]*/, '')));
  });
});
