'use strict';
// R181: Windows paketleyicisinin ignore listesi iç geliştirme yüzeylerini
// (docs/raporlar ~22MB, benchmarks, quality, design-system, .agents,
// premium-ui.json, oturum/devir belgeleri) dışarıda tutmalı; çalışma
// zamanında gereken girişler (tools/install-orchestrator.js, install.bat,
// kullanıcı belgeleri) pakette kalmalı.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// R317: ignore listesi tek kaynak olarak tools/package-manifest.js'te tutulur;
// paketleyici oradan okur. Paket betiğine geri kopyalanmasın.
const { PACKAGER_IGNORE } = require('../tools/package-manifest');
const packagerSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'package-windows.js'), 'utf8');
assert.ok(packagerSource.includes('ignore: PACKAGER_IGNORE'),
  'package-windows.js ignore listesini manifest modülünden okumalı');
assert.ok(!packagerSource.includes('ignore: ['), 'ignore dizisi paket betiğine geri kopyalanmış');
const ignore = PACKAGER_IGNORE;
// vm bağlamı ayrı realm'dir; instanceof yerine etiket kontrolü yapılır.
assert.ok(ignore.every((rule) => Object.prototype.toString.call(rule) === '[object RegExp]'),
  'ignore girdileri RegExp olmalı');

const excluded = [
  '/docs/raporlar/BROWSER_BUG_REPORT_160.md',
  '/docs/raporlar/alt/eski.md',
  '/docs/devir/2026-09-27-2355.md',
  '/benchmarks/browser-library-benchmark.js',
  '/quality/subtitle-quality-golden.json',
  '/design-system/whisper-local-theme.css',
  '/.agents/skills/testing-whisper-browser/SKILL.md',
  '/premium-ui.json',
  '/tests/browser-dash-capture.test.js',
  '/AGENTS.md', '/CLAUDE.md', '/DEVIR-NOTU.md', '/DESIGN.md',
  '/UX-CONTRACT.md', '/UI-DESIGN-SYSTEM.md', '/CONTRIBUTING.md',
  '/CODE_OF_CONDUCT.md', '/YENI-BILGISAYAR.md', '/DRM-KURULUM.md',
  '/backend/venv/Scripts/python.exe', '/backend/.venv-installing-123/x',
  '/backend/.venv-backup-9/x', '/backend/bin/ffmpeg.exe',
];
const shipped = [
  '/tools/install-orchestrator.js',
  '/install.bat', '/start.bat', '/install-diarize.bat', '/drm-kur.bat',
  '/README.md', '/CHANGELOG.md', '/SECURITY.md', '/SUPPORT.md',
  '/THIRD_PARTY_NOTICES.md', '/package.json', '/package-lock.json',
  '/src/main.js', '/src/renderer/index.html',
  '/docs/PRIVACY.md', '/docs/INSTALLATION.md', '/docs/KURULUM_TEDARIK_ZINCIRI.md',
  '/backend/requirements-core.lock', '/backend/transcribe.py',
];
for (const file of excluded) {
  assert.ok(ignore.some((rule) => rule.test(file)), `iç yüzey pakete sızıyor: ${file}`);
}
for (const file of shipped) {
  assert.ok(!ignore.some((rule) => rule.test(file)), `çalışma girişi yanlışlıkla atıldı: ${file}`);
}

console.log(`Windows paket ignore ratchet'i: ${excluded.length} iç + ${shipped.length} dış yol doğru.`);
