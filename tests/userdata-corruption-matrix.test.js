'use strict';
// R325-1 — userData dosyaları tek-çatı bozulma simülasyonu.
// Her kalıcı store'a aynı hostile payload seti uygulanır; store'lar ya zarif
// boş değer döndürür ya da (watch-library) veri-koruma sözleşmesi gereği
// açıklı hata fırlatır. İki sözleşme de burada kilitlenir.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOSTILE = ['{', 'null', '[]', '"x"', '{"version":999,"items":"nope"}', '﻿{', ''];

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ud-corrupt-')); }

const PROBES = [
  ['browser-element-rules', (f) => {
    const { BrowserElementRules } = require('../src/browser-element-rules');
    const s = new BrowserElementRules(f);
    assert.equal(typeof s._read(), 'object');
  }],
  ['browser-note-store', (f) => {
    const { BrowserNoteStore } = require('../src/browser-note-store');
    const s = new BrowserNoteStore(f);
    if (typeof s.list === 'function') s.list();
  }],
  ['browser-translation-cache', (f) => {
    const { PersistentTranslationCache } = require('../src/browser-translation-cache');
    new PersistentTranslationCache(f, { limit: 8, ttlMs: 1000 });
  }],
  ['browser-series-context', (f) => {
    const { createBrowserSeriesContext } = require('../src/browser-series-context');
    createBrowserSeriesContext({ filePath: f });
  }],
  ['browser-session-store', (f) => {
    const { readBrowserSessionWithStatus } = require('../src/browser-session-store');
    readBrowserSessionWithStatus(f);
  }],
  ['media-catalog-store', (f) => {
    const { createMediaCatalogStore } = require('../src/media-catalog-store');
    const s = createMediaCatalogStore({ filePath: f });
    try { s.read?.(); } catch (_) { /* bozuk zarfta kapalı hata kabul */ }
  }],
  ['browser-sponsorblock', (f) => {
    const { SponsorBlockCache } = require('../src/browser-sponsorblock');
    new SponsorBlockCache({ filePath: f, ttlMs: 1000 });
  }],
];

describe('R325-1: userData bozulma matrisi', () => {
  for (const [name, fn] of PROBES) {
    it(`${name} hostile payload'da patlamaz`, () => {
      const dir = tmpdir();
      for (let i = 0; i < HOSTILE.length; i++) {
        const f = path.join(dir, `store-${i}.json`);
        fs.writeFileSync(f, HOSTILE[i]);
        try { fs.rmSync(`${f}.bak`, { force: true }); } catch (_) {}
        fn(f);
      }
    });
  }

  it('watch-library: bozuk dosyada veri-koruma hatası fırlatır (sözleşme)', () => {
    const dir = tmpdir();
    const { createWatchLibraryStore } = require('../src/watch-library-store');
    for (const payload of ['{', 'null', '"x"', '{"version":999}']) {
      const f = path.join(dir, 'wl.json');
      fs.writeFileSync(f, payload);
      try { fs.rmSync(`${f}.bak`, { force: true }); } catch (_) {}
      assert.throws(() => createWatchLibraryStore({ filePath: f }).load(), /okunamadı|şema|hata/i, `payload ${JSON.stringify(payload)}`);
    }
  });

  it('watch-library: birincil bozuksa .bak kurtarır', () => {
    const dir = tmpdir();
    const { createWatchLibraryStore } = require('../src/watch-library-store');
    const f = path.join(dir, 'wl.json');
    fs.writeFileSync(`${f}.bak`, JSON.stringify({ items: [{ key: 'k', url: 'https://x/', title: 't', addedAt: 1 }] }));
    fs.writeFileSync(f, '{');
    const out = createWatchLibraryStore({ filePath: f }).load();
    assert.ok(Array.isArray(out) && out.length === 1);
  });

  it('main.js: safeWatchLibraryEntryCount bozuk dosyada -1 döndürür (kaynak kilidi)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    assert.match(src, /function safeWatchLibraryEntryCount\(\)[\s\S]{0,200}catch[^\n]*return -1/);
    assert.match(src, /watchLibraryEntries: safeWatchLibraryEntryCount\(\)/);
  });

  it('R325-2: userData yollarına doğrudan writeFileSync yok (atomik-yazma envanteri)', () => {
    // Kural: app.getPath('userData') altındaki bir dosya yalnız tmp+rename
    // veya işlem günlüğü (settings-security ceremony) ile yazılır; doğrudan
    // writeFileSync çağrısı ilk argümanında userData yolu üretemez.
    for (const file of ['main.js', 'browser-note-store.js', 'watch-library-store.js',
      'media-catalog-store.js', 'browser-element-rules.js', 'browser-asset-store.js',
      'browser-translation-cache.js', 'browser-sponsorblock.js', 'browser-session-store.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
      const hits = [...src.matchAll(/writeFileSync\(([^,;\n]+)/g)]
        .map((m) => m[1].trim())
        .filter((arg) => /getPath\('userData'\)|userData\(\)/.test(arg));
      assert.deepEqual(hits, [], `${file}: userData yoluna doğrudan yazım: ${hits.join('; ')}`);
    }
  });
});
