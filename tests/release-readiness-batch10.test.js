'use strict';
// 50-kuyruk batch 10 (46–50) — kurulum/sürüm hazırlığı sözleşme testleri.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf-8');
const PRELOAD = fs.readFileSync(path.join(ROOT, 'src/preload.js'), 'utf-8');
const RENDERER = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf-8');
const INDEX = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf-8');

describe('M46 — yükseltme öncesi kullanıcı verisi yedeği', () => {
  it('sürüm değişiminde userData JSON dosyaları anlık görüntülenir', () => {
    assert.match(MAIN, /function snapshotUserDataBeforeUpgrade\(\)/);
    assert.match(MAIN, /app-version\.json/);
    assert.match(MAIN, /preupgrade-backup/);
    assert.match(MAIN, /copyFileSync/);
  });
  it('yedek herhangi bir migration yazımından önce alınır ve kullanıcıya bildirilir', () => {
    const loadIdx = MAIN.indexOf('function loadSettings()');
    const snapshotIdx = MAIN.indexOf('snapshotUserDataBeforeUpgrade();', loadIdx);
    const recoverIdx = MAIN.indexOf('recoverJsonTransaction', loadIdx);
    assert.ok(loadIdx > -1 && snapshotIdx > -1 && recoverIdx > -1);
    assert.ok(snapshotIdx < recoverIdx, 'snapshot migration/recovery öncesinde çalışmalı');
    assert.match(MAIN, /Yükseltme öncesi .* veri dosyası yedeklendi/);
  });
  it('bir defaya mahsus ve ilk kurulumda yedeksiz', () => {
    assert.match(MAIN, /if \(preupgradeSnapshotDone\) return/);
    assert.match(MAIN, /if \(!previous \|\| previous === current\)/);
  });
});

describe('M47 — çevrimdışı kurulum manifesti', () => {
  const TOOL = path.join(ROOT, 'tools', 'offline-manifest.js');
  const MD = path.join(ROOT, 'docs', 'OFFLINE-MANIFEST.md');
  it('manifest aracı tüm bileşen sınıflarını üretir', () => {
    const out = spawnSync(process.execPath, [TOOL, '--json'], { encoding: 'utf-8' });
    assert.equal(out.status, 0, out.stderr);
    const m = JSON.parse(out.stdout);
    assert.ok(m.python.lockfiles.some((l) => l.present && l.pins.length > 0));
    assert.ok(Object.keys(m.npm.direct).length > 0);
    assert.ok(m.binaries.length >= 2 && m.models.length >= 3);
    assert.ok(m.offlineInstall.steps.length >= 3);
  });
  it('markdown manifesti diskte ve güncel kategorilerle', () => {
    assert.ok(fs.existsSync(MD));
    const text = fs.readFileSync(MD, 'utf-8');
    for (const section of ['pip', 'npm', 'binary', 'Model kaynakları', 'Çevrimdışı kurulum']) {
      assert.ok(text.includes(section), `eksik bölüm: ${section}`);
    }
  });
});

describe('M48 — güncelleme ön kontrolü', () => {
  it('IPC handler açık iş + bağımlılık + disk + bağlantı döndürür', () => {
    const idx = MAIN.indexOf("ipcMain.handle('maintenance:updatePrecheck'");
    assert.ok(idx > -1);
    const slice = MAIN.slice(idx, idx + 1600);
    for (const key of ['transcribeActive', 'burninRecoverable', 'browserJobs', 'offline', 'tmpFreeBytes']) {
      assert.ok(slice.includes(key), `eksik alan: ${key}`);
    }
  });
  it('preload köprüsü ve UI akışı bağlı', () => {
    assert.match(PRELOAD, /updatePrecheck:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('maintenance:updatePrecheck'\)/);
    assert.match(INDEX, /id="updatePrecheckBtn"/);
    assert.match(INDEX, /id="updatePrecheckResults"/);
    assert.match(RENDERER, /async function openUpdatePrecheck\(\)/);
    assert.match(RENDERER, /\$\('updatePrecheckBtn'\)\?\.addEventListener\('click'/);
  });
  it('yedek eylemi akış içinde ve onaylı', () => {
    const idx = RENDERER.indexOf('function openUpdatePrecheck');
    const slice = RENDERER.slice(idx, RENDERER.indexOf('// ===== Madde 33', idx));
    assert.ok(slice.includes('exportSettings'), 'yedek eylemi eksik');
    assert.ok(slice.includes('Güncellemeye hazır'), 'karar satırı eksik');
  });
});

describe('M49 — Windows sorun giderme rehberi', () => {
  it('gerçek Windows bulgularına dayanan bölümler içerir', () => {
    const p = path.join(ROOT, 'docs', 'WINDOWS-SORUN-GIDERME.md');
    assert.ok(fs.existsSync(p));
    const text = fs.readFileSync(p, 'utf-8');
    for (const topic of ['cuDNN', 'cuBLAS', 'CUDA OOM', 'MAX_PATH|260', 'Defender|EBUSY|ACCESS_DENIED', 'start\\.bat', 'Whisper Local']) {
      assert.match(text, new RegExp(topic), `eksik konu: ${topic}`);
    }
  });
});

describe('M50 — sürüm adayı teslimi', () => {
  it('teslim notu mevcut ve etiket kararı kullanıcıya bırakılmış', () => {
    const p = path.join(ROOT, 'docs', 'SURUM-NOTU-RC.md');
    assert.ok(fs.existsSync(p));
    const text = fs.readFileSync(p, 'utf-8');
    assert.match(text, /Bilinen sınırlar/);
    assert.match(text, /kullanıcı|Etiketleme/i);
    assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'release-acceptance.js')));
  });
});
