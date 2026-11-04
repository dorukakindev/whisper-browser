// Oynatıcı/katalog/V3 arayüzleri (jsdom): XSS güvenliği, erişilebilir durumlar, davranış sözleşmeleri.
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
window.matchMedia=()=>({matches:true});window.HTMLElement.prototype.showPopover=function(){this.hidden=false;};window.HTMLElement.prototype.hidePopover=function(){this.hidden=true;};
Object.defineProperty(globalThis, 'getSelection', { value: () => dom.window.getSelection(), configurable: true });
const Catalog = require('../src/player-source-catalog.js');
const CUI = require('../src/renderer/player-source-catalog-ui.js');
const WUI = require('../src/renderer/player-workspace-ui.js');
const TM = require('../src/renderer/player-transcript-model.js');
const V3 = require('../src/renderer/v3-surfaces-ui.js');
const Builders = require('../src/assistant-artifact-builders.js');
const Bulletin = require('../src/cinema-bulletin-model.js');

const root = () => { const el = document.createElement('div'); document.body.append(el); return el; };
const item = (id, extra = {}) => ({ itemId: id, sourceId: 's1', kind: 'youtube', title: id, sourceTitle: 'Kanal', description: '', durationSeconds: 300, publishedAt: '2026-01-01T00:00:00Z', language: 'en', subtitleLanguages: ['en'], subtitleOrigins: ['human'], personal: {}, isLive: false, transcriptDescriptors: [], ...extra });
const vmFor = (items, over = {}) => {
  const query = Catalog.normalizeQuery(over.query || { sort: 'newest' });
  const result = Catalog.queryPlayerItems({ batch: { items, revision: 'r', remoteNextCursor: over.remote || null }, query: { ...query, kind: (over.vm && over.vm.kind) || 'youtube' } });
  return { locale: 'tr', kind: 'youtube', sources: over.sources || [{ sourceId: 's1', kind: (over.vm && over.vm.kind) || 'youtube', title: 'Kanal', itemCount: 3, followed: false }], pinned: [], selectedSourceId: over.selected || null, query, result, shown: result.items.length, drawerOpen: false, filtersOpen: false, now: Date.parse('2026-11-04T09:00:00Z'), ...over.vm };
};

// 1) Kullanıcı metni HTML olarak yorumlanmaz (XSS)
{
  const r = root(); const evil = '<img src=x onerror="window.__pwned=1">';
  CUI.renderCatalog(r, vmFor([item('a', { title: evil, sourceTitle: evil })], { sources: [{ sourceId: 's1', kind: 'youtube', title: evil, description: evil }], selected: 's1' }), {});
  assert.strictEqual(r.querySelectorAll('img').length, 0); assert.ok(r.textContent.includes(evil)); assert.strictEqual(window.__pwned, undefined);
  const unsafe = /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\(/;
  for (const f of ['player-source-catalog-ui', 'player-workspace-ui', 'v3-surfaces-ui', 'player-ui-kit']) assert.ok(!unsafe.test(require('fs').readFileSync(`${__dirname}/../src/renderer/${f}.js`, 'utf8')), f + ': HTML enjeksiyon API kullanımı yok');
}
// 2) Satır başlığı ayrıntıyı, küçük görsel oynatmayı açar (ayrı hedefler); ham dosya adı kartta temizlenir
{
  const r = root(); const calls = [];
  CUI.renderCatalog(r, vmFor([item('v1', { title: 'Bir başlık' })]), { onOpenItem: (it, how) => calls.push(how) });
  r.querySelector('.pw-thumb').click(); r.querySelector('.pw-row__title button').click(); assert.deepStrictEqual(calls, ['play', 'detail']);
  const l = root(); CUI.renderCatalog(l, vmFor([item('l1', { kind: 'local', title: 'Blade.Runner.1982.1080p.BluRay.x264.mkv' })], { vm: { kind: 'local' } }), {});
  assert.strictEqual(l.querySelector('.pw-row__title').textContent, 'Blade Runner 1982', 'uzantı/nokta/çözünürlük gürültüsü atılır');
}
// 3) Arama kutusu yeniden çizimde AYNI düğüm kalır (IME/odak korunur); sıralama ve sayım etiketi
{
  const r = root(); const seen = []; const vm = vmFor([item('a'), item('b')], { remote: 'tok' });
  CUI.renderCatalog(r, vm, { onQuery: (p) => seen.push(p) }); const first = r.querySelector('.pw-search__input');
  CUI.renderCatalog(r, { ...vm, shown: 2 }, { onQuery: (p) => seen.push(p) }); assert.strictEqual(r.querySelector('.pw-search__input'), first);
  assert.strictEqual(r.querySelector('.pw-count').textContent, '2 video', 'YouTube toolbar labels shown rows without asserting an unknown total');
  const picker=r.querySelector('.pw-toolbar .mk-picker');picker.querySelector('.mk-picker-trigger').click();
  const titleOption=[...picker.querySelectorAll('[role=option]')].find(node=>node.textContent.includes('Başlık'));assert.ok(titleOption,'custom sort offers title choice');titleOption.click();assert.deepStrictEqual(seen[0],{sort:'title',cursor:null});
  assert.equal(r.querySelectorAll('select').length,0,'source sort uses custom menu');
  assert.ok([...r.querySelectorAll('button')].some((b) => b.textContent === 'Kaynaktan daha fazla yükle'), 'uzak imleç varsa kaynaktan yükle');
}
// 4) Boş durumlar: kaynak yok / yüklü içerikte eşleşme yok (uzak imleç) / filtre sonucu yok
{
  const none = root(); CUI.renderCatalog(none, vmFor([], { sources: [] }), { onAddSource: () => {} }); assert.ok(none.querySelector('.pw-empty h3').textContent.includes('Henüz kaynak')); assert.strictEqual(none.querySelector('.pw-search'), null, 'kaynak yokken arama çubuğu yok');
  const more = root(); let loaded = null; CUI.renderCatalog(more, vmFor([item('a')], { query: { text: 'yok' }, remote: 'tok' }), { onLoadRemote: (c) => { loaded = c; } });
  assert.ok(more.querySelector('.pw-empty h3').textContent.includes('Yüklü içeriklerde eşleşme yok')); more.querySelector('.pw-empty .pw-btn--primary').click(); assert.strictEqual(loaded, 'tok');
  const filt = root(); CUI.renderCatalog(filt, vmFor([item('a')], { query: { text: 'yok' } }), {}); assert.ok(filt.querySelector('.pw-empty h3').textContent.includes('sonuç yok'));
}
// 5) Çip + sabitleme erişilebilirliği
{
  const r = root(); const vm = vmFor([item('a')], { query: { durations: ['under10'] }, vm: { pinned: ['s1'],drawerOpen:true } });
  CUI.renderCatalog(r, vm, {}); assert.strictEqual(r.querySelectorAll('.pw-chip').length, 1); assert.strictEqual(r.querySelector('.pw-source__pin').getAttribute('aria-pressed'), 'true');
  assert.ok(r.querySelector('.pw-source__pin').getAttribute('aria-label').startsWith('Sabitlemeyi kaldır'));
  assert.ok([...r.querySelectorAll('button')].some((b) => b.textContent === 'Filtreler (1)'));
}
// 5b) Known language names, removable chips and unknown-only filter groups.
{
 const r=root(),seen=[];const vm=vmFor([item('a')],{query:{speechLanguages:['tr']},vm:{filtersOpen:true,speechLanguagesAvailable:['en','tr'],subtitleLanguagesAvailable:['en'],durationsAvailable:true}});
 CUI.renderCatalog(r,vm,{onQuery:patch=>seen.push(patch),onRemoveChip:chip=>seen.push(chip)});
 assert.ok(r.textContent.includes('Türkçe'),'languages are full localized names');
 assert.equal(r.querySelectorAll('input[type=checkbox],input[type=radio]').length,0,'filters use accessible pressed segments');
 const en=r.querySelector('[data-filter="speechLanguages:en"]');en.click();assert.deepEqual(seen[0].speechLanguages,['tr','en']);
 r.querySelector('.pw-chip button').click();assert.deepEqual(seen[1],{field:'speechLanguages',value:'tr'});
 const unknown=root();CUI.renderCatalog(unknown,vmFor([item('u',{durationSeconds:null,subtitleLanguages:null})],{vm:{filtersOpen:true,speechLanguagesAvailable:['und'],subtitleLanguagesAvailable:['und'],durationsAvailable:false}}),{});
 assert.ok(!unknown.querySelector('[data-filter^="speechLanguages:"]'));assert.ok(!unknown.querySelector('[data-filter^="durations:"]'));assert.equal(unknown.querySelectorAll('.pw-row__badges .pw-badge').length,0,'unknown subtitle claims do not become badges');
 const missing=root();let located=false;CUI.renderCatalog(missing,vmFor([item('m',{kind:'local',fileMissing:true})],{vm:{kind:'local'}}),{onLocate:()=>{located=true;}});missing.querySelector('.pw-row__actions button').click();assert.equal(located,true,'missing-file action reaches integration owner');
}
// 6) Transkript: etkin satır, zaman düğmesi seek, Türkçe katlamalı vurgu, belirsiz eşleşme, çeviri yok
{
  const cue = (id, s, e, t) => ({ id, start: s, end: e, text: t });
  const src = { id: 'S', revision: 'r1', role: 'source', offsetSeconds: 0, cues: [cue('a', 0, 4, 'Işık yanıyor'), cue('b', 4, 8, 'Kapı açık'), cue('c', 8, 12, 'Son söz')] };
  const sec = { id: 'T', revision: 'r1', role: 'translation', offsetSeconds: 0, cues: [cue('t1', 0, 4, 'The light is on'), cue('t2', 8, 12, 'x'), cue('t3', 9, 12, 'y')] };
  const rows = TM.buildTranscriptRows({ sourceTrack: src, secondaryTrack: sec, mediaKey: 'm', generation: 1 });
  const seeks = []; const r = root();
  const vm = (o) => ({ locale: 'tr', media: { title: 'T', kind: 'video' }, snapshot: { time: 5, duration: 12, paused: true, rate: 1 }, rows, activeKey: rows[1].key, tab: 'transcript', query: '', subtitleMode: 'both', stageMode: 'slot', follow: true, followScroll: false, hasSecondary: true, ...o });
  const h = { onSeekRow: (row, how) => seeks.push([row.cueId, how]) };
  WUI.renderPlayerWorkspace(r, vm(), h);
  assert.strictEqual(r.querySelector('.pw-cue[aria-current="true"]').dataset.cueId, 'b'); assert.strictEqual(r.querySelectorAll('.pw-cue').length, 3);
  r.querySelectorAll('.pw-cue__time')[2].click(); assert.deepStrictEqual(seeks, [['c', 'preserve']]);
  assert.ok(r.textContent.includes('Çeviri yok'), 'eşleşmeyen satır açıkça işaretlenir'); assert.ok(r.textContent.includes('Belirsiz eşleşme'));
  WUI.renderPlayerWorkspace(r, vm({ query: 'isik' }), h);
  assert.strictEqual(r.querySelectorAll('.pw-cue').length, 1); assert.strictEqual(r.querySelector('mark').textContent, 'Işık', 'ı/I katlaması: "isik" → "Işık"');
  assert.ok(r.querySelector('.pw-follow'), 'aktif satır filtre dışında: filtre silinmez, "aktif satıra dön" eylemi var');
  assert.strictEqual(r.querySelector('[data-slot="stage"]').children.length, 0, 'slot modunda video yüzeyi çizilmez');
  WUI.renderPlayerWorkspace(r, vm({ transcriptState: 'untimed' }), h); assert.strictEqual(r.querySelectorAll('.pw-cue__time').length, 0, 'zamansız transkriptte seek düğmesi yok');
  // Kanıt uyarısı: kapsam değiştir eylemi
  let switched = 0; WUI.renderPlayerWorkspace(r, vm({ selection: { text: 'Son', cueId: 'c' }, evidence: { ok: false, code: 'requires-scope-change', message: 'ilerisinde' } }), { onSwitchScope: () => { switched++; } });
  r.querySelector('[role="alert"] .pw-btn').click(); assert.strictEqual(switched, 1);
  assert.ok(r.querySelector('.pw-inspector') && r.querySelector('.pw-inspector [aria-label="Sözlük (dış site)"]'), 'harici sözlük açıkça etiketli');
}
// 6b) Vurgu yardımcıları
{
  const el = document.createElement('p'); WUI.appendHighlighted(el, 'Çay ve ÇAY', 'cay'); assert.deepStrictEqual([...el.querySelectorAll('mark')].map((m) => m.textContent), ['Çay', 'ÇAY']);
  assert.ok(WUI.rowMatches({ sourceText: 'Işık', secondaryText: '' }, 'ISIK'));
}
// 7) V3: kapalı spoiler DOM'da yok; bülten eksik uyarısı; sağlık fişi bilinmeyeni "ölçülemedi" yazar
{
  const known = new Set(['s']); const m = Builders.buildComparisonMatrix({ title: 'M', columns: [{ id: 'a', label: 'A' }], rows: [{ id: 'r', label: 'R' }], cells: [{ rowId: 'r', colId: 'a', value: 'GİZLİ SONUÇ', claims: [{ sourceId: 's' }], spoiler: 'closed' }], knownSourceIds: known }).body;
  const r = root(); V3.renderMatrix(r, { revision: 1 }, m, { locale: 'tr', handlers: {} });
  assert.ok(!r.textContent.includes('GİZLİ SONUÇ')); assert.ok(r.textContent.includes('Spoiler kapalı'));
  const b = Bulletin.buildBulletin({ entries: [], library: [], feedResults: [{ feedId: 'f1', status: 'forbidden' }], allFeedIds: ['f1'], capturedAt: 'x' });
  const r2 = root(); V3.renderBulletin(r2, b, { locale: 'tr', handlers: {} }); assert.ok(r2.querySelector('[role="status"]').textContent.includes('Bülten eksik'));
  const r3 = root(); V3.renderHealth(r3, { status: 'ok', windowSeconds: 5, decode: { requested: 'auto', current: { state: 'unknown' } }, hdr: { fileIsHdr: true, outputIsHdr: 'unknown' }, audio: { fileChannels: 6, outputChannels: null, downmixed: false }, stalls: { droppedFrames: null, bufferingSamples: 0 } }, { locale: 'en' });
  assert.ok(r3.textContent.includes('Not measurable')); r3.remove();
  const r4 = root(); V3.renderHealth(r4, { status: 'stale' }, { locale: 'tr' }); assert.ok(r4.textContent.includes('bayat'));
}
console.log('player-ui-dom.test.js: OK');
