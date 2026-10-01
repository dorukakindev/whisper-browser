'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sync = require('../src/browser-subtitle-sync');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const nodes = new Map();
const makeNode = () => {
  const node = { value: '', disabled: false, listeners: {}, children: [],
    classes: new Set(), classList: { toggle(key, on) { this.classes ??= new Set(); on ? this.classes.add(key) : this.classes.delete(key); } },
    setAttribute() {}, append(...kids) { this.children.push(...kids); },
    appendChild(kid) { this.children.push(kid); return kid; },
    addEventListener(event, callback) { this.listeners[event] = callback; } };
  Object.defineProperty(node, 'textContent', {
    get() { return node._text || ''; },
    set(value) { node._text = String(value ?? ''); node.children.length = 0; },
  });
  return node;
};
const $ = id => {
  if (!nodes.has(id)) nodes.set(id, makeNode());
  return nodes.get(id);
};
const cues = [{ start: 10, end: 12, text: 'İlk' }, { start: 100, end: 102, text: 'İkinci' }];
const tab = { subtitleSyncRecords: [] };
let overlays = 0, renders = 0;
const ctx = { $, document: { activeElement: null, createElement: () => makeNode() }, browserSubtitleSync: sync,
  player: { cues, cues2: cues, browserActiveTabId: 'a', activeIdx: 0, activeIdx2: 0, browserTime: 12, browserPaused: true },
  friendlySystemError: (message) => String(message || ''),
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

// --- kuyruk-50/6: çok noktalı senkron UI ---
$('browserSyncChannel').value = 'primary';
$('browserSyncChannel').listeners.change();
ctx.player.activeIdx = 0; ctx.player.browserTime = 12;
ctx.player.cues = [{ start: 10, end: 12, text: 'İlk' }, { start: 100, end: 102, text: 'İkinci' }, { start: 200, end: 202, text: 'Üçüncü' }];
ctx.player.cues2 = ctx.player.cues;
ctx.resetBrowserSync();
ctx.player.browserSyncPreview = null;
ctx.captureBrowserSyncPoint(0);
ctx.player.activeIdx = 1; ctx.player.browserTime = 103;
ctx.captureBrowserSyncPoint(1);
// 3. nokta: yeni ekleme düğmesi listeye ekler ve fit'i tazeler.
ctx.player.activeIdx = 2; ctx.player.browserTime = 203.2;
ctx.addBrowserSyncPoint();
const preview3 = ctx.player.browserSyncPreview;
assert.equal(preview3.points.length, 3);
assert.match($('browserSyncConfidence').textContent, /Güven|Confidence/);
assert.match($('browserSyncConfidence').textContent, /yüksek|high|Tam uyum|Exact/);
assert.equal($('browserSyncPointList').children.length, 3);
// Sapan nokta: video zamanı çok uzak → düşük güven + outlier işareti.
ctx.player.activeIdx = 2; ctx.player.browserTime = 260;
ctx.addBrowserSyncPoint();
assert.match($('browserSyncConfidence').textContent + $('browserSyncWarning').textContent, /düşük|low|sapıyor|deviates/);
// Nokta silme: satır × düğmesi kaldırır ve refit eder.
const delBtn = $('browserSyncPointList').children[2].children[1];
delBtn.listeners.click();
assert.equal(ctx.player.browserSyncPreview.points.length, 2);
// Aynı cue'yu tekrar eşleştirmek kopya üretmez, günceller.
ctx.player.activeIdx = 1; ctx.player.browserTime = 104;
ctx.addBrowserSyncPoint();
assert.equal(ctx.player.browserSyncPreview.points.length, 2);
assert.ok(Math.abs(ctx.player.browserSyncPreview.points[1].videoTime - 104) < 1e-9);

console.log('Senkron UI: atomik eşleşme, değişiklik durumu, boş giriş, hızlı hizalama ve iz değişimi geçti.');
