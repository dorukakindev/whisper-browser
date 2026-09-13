'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sync = require('../src/browser-subtitle-sync');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const nodes = new Map();
const $ = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', disabled: false, listeners: {},
    classes: new Set(), classList: { toggle(key, on) { const set = nodes.get(id).classes; on ? set.add(key) : set.delete(key); } },
    addEventListener(event, callback) { this.listeners[event] = callback; } });
  return nodes.get(id);
};
const cues = [{ start: 10, end: 12, text: 'İlk' }, { start: 100, end: 102, text: 'İkinci' }];
const tab = { subtitleSyncRecords: [] };
let overlays = 0, renders = 0;
const ctx = { $, document: { activeElement: null }, browserSubtitleSync: sync,
  player: { cues, cues2: cues, browserActiveTabId: 'a', activeIdx: 0, activeIdx2: 0, browserTime: 12, browserPaused: true },
  browserLoadedTrack: () => ({ id: 'source', label: 'Kaynak', language: 'tr' }),
  browserSyncTrack: () => ({ id: 'source', label: 'Kaynak', language: 'tr' }),
  browserTrackSourceIdentity: () => ({ mediaId: 'video', sourceTrackId: 'source', sourceHash: 'hash' }),
  browserSavedTransform: () => ({ scale: 1, offsetSeconds: 0 }), browserSavedSyncRecord: () => null,
  browserTabState: () => tab, saveActiveBrowserTabWorkspace() {},
  scheduleBrowserOverlaySync: () => overlays++, renderBrowserCueAt: () => renders++,
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function browserSyncSelection('), source.indexOf('function bestAvailableSubtitleMode(')), ctx);
vm.runInContext(source.slice(source.indexOf("if ($('browserSyncChannel'))"), source.indexOf('function setSettingsDrawer(')), ctx);

ctx.captureBrowserSyncPoint(0);
assert.equal(ctx.player.browserSyncPreview.dirty, true, 'İlk eşleşme kaydedilmemiş değişiklik sayılmalı');
assert.equal($('browserSyncDirty').classes.has('hidden'), false);
const before = JSON.stringify(ctx.player.browserSyncPreview);
ctx.captureBrowserSyncPoint(1); // Aynı blok ve zaman geçersizdir.
assert.match($('browserSyncWarning').textContent, /yakın/);
assert.equal(JSON.stringify(ctx.player.browserSyncPreview), before, 'Geçersiz eşleşme önizleme verisini değiştirmemeli');
ctx.player.activeIdx = 1; ctx.player.browserTime = 103;
ctx.captureBrowserSyncPoint(1);
const preview = ctx.player.browserSyncPreview;
assert.equal(preview.points.length, 2);
assert.ok(Math.abs(sync.sourceToVideoTime(100, preview.transform) - 103) < 1e-9);
ctx.saveBrowserSync();
assert.equal(tab.subtitleSyncRecords.length, 1);
assert.equal(preview.dirty, false);
ctx.document.activeElement = $('browserSyncOffset');
const priorOffset = preview.transform.offsetSeconds;
$('browserSyncOffset').value = '';
$('browserSyncOffset').listeners.input({ target: $('browserSyncOffset') });
assert.equal(preview.transform.offsetSeconds, priorOffset, 'Boşalan sayı alanı sıfır olarak uygulanmamalı');
$('browserSyncOffset').value = '-2.5';
$('browserSyncOffset').listeners.input({ target: $('browserSyncOffset') });
assert.equal(preview.transform.offsetSeconds, -2.5);
ctx.player.browserTime = 106;
$('browserSyncAlignCurrent').listeners.click();
assert.ok(Math.abs(sync.sourceToVideoTime(100, preview.transform) - 106) < 1e-9);
assert.equal(preview.points.length, 0, 'Tek noktalı hizalama eski iki noktalı kanıtı taşımamalı');
assert.equal(preview.dirty, true);
const overlayBefore = overlays, renderBefore = renders;
$('browserSyncChannel').value = 'secondary';
$('browserSyncChannel').listeners.change();
assert.ok(overlays > overlayBefore && renders > renderBefore, 'İz değişince iptal edilen önizleme video ve listeden kaldırılmalı');
assert.equal(ctx.player.browserSyncPreview.channel, 'secondary');
$('browserSyncClearPoints').listeners.click();
assert.equal(ctx.player.browserSyncPreview.dirty, false, 'Zaten boş eşleşmeleri temizlemek değişiklik oluşturmamalı');
ctx.player.activeIdx2 = -1;
const unselected = JSON.stringify(ctx.player.browserSyncPreview);
ctx.alignBrowserSyncCurrentCue();
assert.equal(JSON.stringify(ctx.player.browserSyncPreview), unselected);
assert.match($('browserSyncWarning').textContent, /bloğuna gidin/);
console.log('Senkron UI: atomik eşleşme, değişiklik durumu, boş giriş, hızlı hizalama ve iz değişimi geçti.');
