'use strict';
// R324-5 — kalan listener-çifti süpürme: kalıcı emitter'lar (ipcMain, app,
// session.webRequest, protocol) üzerinde tekil-kayıt invariant'ları.
// Geçici emitter'lar (proc, webContents, worker) sahibiyle GC olur; sızıntı
// kalıbı kalıcı nesneye per-job kayıt yığmaktır.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const main = src('main.js');

describe('R324-5: kalıcı-emitter listener envanteri', () => {
  it('ipcMain.on/handle kanal adları tekil (çift kayıt = çift işleyici)', () => {
    const channels = [...main.matchAll(/ipcMain\.(?:on|handle)\('([^']+)'/g)].map((m) => m[1]);
    const dup = channels.filter((c, i) => channels.indexOf(c) !== i);
    assert.deepEqual([...new Set(dup)], []);
    assert.ok(channels.length > 50, `kanal envanteri küçüldü: ${channels.length}`);
  });

  it('app.on olay adları tekil', () => {
    const events = [...main.matchAll(/\bapp\.on\('([^']+)'/g)].map((m) => m[1]);
    const dup = events.filter((e, i) => events.indexOf(e) !== i);
    assert.deepEqual([...new Set(dup)], []);
  });

  it('webRequest hook kurulumları birer init çağrısı (yığma yok)', () => {
    for (const hook of ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived']) {
      const count = (main.match(new RegExp(`webRequest\\.${hook}\\(`, 'g')) || []).length;
      assert.ok(count <= 2, `${hook} ${count} çağrı — yığma riski`);
    }
    // installYoutubeStreamHeaders tek init çağrısına indirgenmeli
    const calls = (main.match(/installYoutubeStreamHeaders\(\)/g) || []).length;
    assert.equal(calls, 2, 'tanım + tek çağrı'); // function decl + 1 call site
  });

  it('ipcMain.handle kanalları preload yüzeyiyle sınırlı kalır (genel gevşek üst sınır)', () => {
    const handles = (main.match(/ipcMain\.handle\(/g) || []).length;
    assert.ok(handles <= 260, `handle sayısı ${handles} — kontrolsüz büyüme`);
  });

  it('transient emitter dinleyicileri kalıcı nesnelere değil sahibine bağlı (statik kokusu)', () => {
    // Per-job kodda kalıcı emitere .on eklenmez: function gövdelerinde
    // app.on/ipcMain.on/mainWindow.on görülmemeli (init-bölge dışında).
    // mainWindow.on kayıtları createWindow/init bölgesindedir (satır >10000):
    const windowOns = [...main.matchAll(/\bmainWindow\.on\('([^']+)'/g)].map((m) => ({ e: m[1], idx: m.index }));
    const names = windowOns.map((w) => w.e);
    const windowDups = names.filter((e, i) => names.indexOf(e) !== i);
    assert.deepEqual([...new Set(windowDups)], [],
      'mainWindow olayı tekrar kaydedilmiş — çift işleyici');
    for (const { e } of windowOns) {
      assert.ok(['close', 'closed', 'focus', 'app-command'].includes(e), `mainWindow.on('${e}') yeni kayıt — init envanterine eklemeli`);
    }
  });
});
