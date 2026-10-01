'use strict';
// Madde 33 — taşınabilir paket gizlilik ratchet'i: hesap/anahtar/sır verisi
// taşıyan dosyalar pakete ASLA giremez; kapsam özeti meta düzeyinde kalır.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gunzipSync } = require('zlib');
const { exportPackage, readPackage, allowed, describePackage } = require('../src/workspace-package');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  PASS  ${name}`); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-privacy-'));
const out = path.join(dir, 'paket.wbp');

// Gerçekçi userData simülasyonu: izinli kökler + yasaklı dosyalar.
fs.writeFileSync(path.join(dir, 'watch-library.json'),
  JSON.stringify({ version: 1, items: [{ key: 'file:/v.mp4', title: 'Film', position: 12 }] }));
fs.writeFileSync(path.join(dir, 'browser-notes.json'),
  JSON.stringify({ version: 1, updatedAt: 1, annotations: [{ id: 'n1', mediaId: 'file:/v.mp4', note: 'güzel sahne' }] }));
fs.writeFileSync(path.join(dir, 'browser-session.json'),
  JSON.stringify({ tabs: [{ id: 't1', subtitleSyncRecords: [{ offsetMs: 400 }, { offsetMs: -120 }] }] }));
fs.writeFileSync(path.join(dir, 'media-catalog.json'),
  JSON.stringify({ version: 1, items: [{ id: 'i1', kind: 'series', title: 'Eser',
    episodes: [{ id: 'e1', season: 1, number: 1 }, { id: 'e2', season: 1, number: 2 }] }] }));
fs.mkdirSync(path.join(dir, 'browser-subtitles'));
fs.writeFileSync(path.join(dir, 'browser-subtitles', 't1.srt'), '1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n');
// Yasaklı dosyalar — hesap ve sır taşıyıcıları.
const SECRETS = {
  'settings.json': { hfToken: 'hf_SECRET_TOKEN_12345', llmApiKey: 'sk-SECRET', youtubeAccount: 'ahmet@example.com' },
  'youtube-accounts.json': { accounts: [{ refreshToken: 'rt-SECRET' }] },
  'secrets.json': { key: 'supersecret' },
  '.env': 'API_KEY=abc123',
  'cookies.dat': 'session-cookie-value',
  'watch-index.db': 'SQLite format 3\0fake',
};
for (const [name, value] of Object.entries(SECRETS)) {
  fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
}

test('izinli kökler dışa aktarılır, hesap/sır dosyaları pakete giremez', () => {
  const report = exportPackage(dir, out, { subtitleStyle: JSON.stringify({ fontSize: 20 }) });
  assert.ok(report.count >= 5);
  const raw = gunzipSync(fs.readFileSync(out)).toString('utf8');
  for (const name of Object.keys(SECRETS)) {
    assert.ok(!raw.includes(`"name":"${name}"`), `${name} pakete sızdı`);
  }
  for (const leak of ['hf_SECRET_TOKEN_12345', 'sk-SECRET', 'rt-SECRET',
      'ahmet@example.com', 'abc123', 'session-cookie-value']) {
    assert.ok(!raw.includes(leak), `sır değeri pakete sızdı: ${leak}`);
  }
});

test('allowed(): hesap/anahtar dosya adları açıkça reddedilir', () => {
  for (const name of ['settings.json', 'youtube-accounts.json', 'secrets.json',
      '.env', 'cookies.dat', 'watch-index.db', 'window-state.json']) {
    assert.equal(allowed(name), false, `allowed(${name}) true olmamalı`);
  }
  assert.equal(allowed('watch-library.json'), true);
  assert.equal(allowed('browser-subtitles/x.srt'), true);
});

test('paket okunur ve kapsam özeti doğru sayıları verir', () => {
  const data = readPackage(out);
  const scope = describePackage(data);
  assert.equal(scope.files, data.files.length);
  assert.equal(scope.mediaItems, 1);
  assert.equal(scope.mediaEpisodes, 2);
  assert.equal(scope.watchItems, 1);
  assert.equal(scope.notes, 1);
  assert.equal(scope.tabs, 1);
  assert.equal(scope.syncRecords, 2);
  assert.equal(scope.subtitleFiles, 1);
  // Meta sınırı: özet içinde dosya içeriği veya yol yok.
  const json = JSON.stringify(scope);
  assert.ok(!json.includes('güzel sahne') && !json.includes('/v.mp4'),
    'kapsam özeti içerik sızdırıyor');
});

test('bozuk/eksik köklerle describePackage çökmez', () => {
  assert.deepEqual(describePackage(null).files, 0);
  assert.equal(describePackage({ files: [{ name: 'x', data: '!!' }] }).files, 1);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`workspace-privacy: ${passed} test`);
