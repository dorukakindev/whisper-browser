const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// R337: derin okuma temiz çıkan tarayıcı düzeltme/geri-alma iç mantığının
// davranış kilidi. Fonksiyonlar renderer.js'ten kesilip vm'de çalıştırılır —
// metin-temelli kilitleme DEĞİL, gerçek çalışma doğrulaması.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const reviewApi = require('../src/browser-subtitle-review');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'başlangıç bulunamadı: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitiş bulunamadı: ' + to);
  return renderer.slice(start, end);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Kesitler -------------------------------------------------------------
const cueSlice = slice('function browserTranslationCueKey(', 'function applyLoadedBrowserTranslation(');
const trackSlice = slice('function browserLoadedTrack(', 'const browserFileSyncTracks');
const bulkSlice = slice('function browserBulkStateStillMatches(', 'function applySubtitleBulkMemory(');
const editsReadSlice = slice('function readSourceEdits(', 'function renderBrowserWatchStyle');
const editsWriteSlice = slice('function writeSourceEdits(', 'function reviewSourceCues(');
const snapshotSlice = slice('function sourceEditSnapshot(', 'function applySourceSnapshot(');
const alternativesSlice = slice('function appendTranslationAlternatives(', "$('browserQuickSyncSave')");

// --- Ortak bağlam kurucular ------------------------------------------------
function bulkCtx(tabEdits = [], tracks = []) {
  const player = {
    browserBaseCues: new Map(), browserTracks: tracks,
    browserLoadedTrackId: '', browserLoadedTrackId2: '',
    subPath: '', sub2Path: '', subRaw: '', sub2Raw: '', mediaKey: 'browser:m1',
    cues: [], cues2: [], cuesRaw: [], cues2Raw: [],
  };
  const ctx = {
    player,
    browserTabState: () => ({ mediaId: 'media-1', subtitleEdits: tabEdits }),
    browserSubtitleSync: {
      hashText: (v) => 'h:' + String(v),
      editRecordMatches: (record, context) => record.sourceCueHash === context.sourceCueHash,
      applyEditRecord: (cue) => cue,
    },
  };
  vm.createContext(ctx);
  vm.runInContext(cueSlice + '\n' + trackSlice + '\n' + bulkSlice
    + '\nthis.attach = attachBrowserCueIdentities; this.still = browserBulkStateStillMatches;'
    + 'this.loaded = browserLoadedTrack; this.record = browserEditRecord;'
    + 'this.baseMap = browserBaseCueMap;', ctx);
  return ctx;
}
const editIdentity = { sourceCueHash: 'src|1', cueId: 'cue-1', trackId: 'tr' };

// --- browserBulkStateStillMatches doğruluk tablosu -------------------------
test('still: iz kaybolunca false', () => {
  const ctx = bulkCtx([], []);
  assert.equal(ctx.still([{ trackId: 'tr', identity: editIdentity, before: null }]), false);
});

test('still: kayıt yok + beklenen yok → true; beklenen var → false', () => {
  const ctx = bulkCtx([], [{ id: 'tr', role: 'translation' }]);
  ctx.player.browserLoadedTrackId = 'tr';
  const edits = [{ trackId: 'tr', identity: editIdentity, before: null, expectedBase: '' }];
  assert.equal(ctx.still(edits, 'before', false), true);
  edits[0].before = { revision: 1, hasOverride: true, timingOverride: null, userOverride: 'x' };
  assert.equal(ctx.still(edits, 'before', false), false);
});

test('still: revision/hasOverride/userOverride/timingOverride uyuşmazlıkları tek tek false', () => {
  const live = { sourceCueHash: 'src|1', revision: 3, hasOverride: true, timingOverride: null, userOverride: 'fix' };
  const ctx = bulkCtx([live], [{ id: 'tr', role: 'translation' }]);
  ctx.player.browserLoadedTrackId = 'tr';
  const mk = (over) => [{ trackId: 'tr', identity: editIdentity, before: { revision: 3, hasOverride: true, timingOverride: null, userOverride: 'fix', ...over }, expectedBase: '' }];
  assert.equal(ctx.still(mk({}), 'before', false), true, 'eş kayıt eşleşmeli');
  assert.equal(ctx.still(mk({ revision: 4 }), 'before', false), false, 'revision');
  assert.equal(ctx.still(mk({ hasOverride: false }), 'before', false), false, 'hasOverride');
  assert.equal(ctx.still(mk({ userOverride: 'other' }), 'before', false), false, 'userOverride');
  assert.equal(ctx.still(mk({ timingOverride: { start: 1 } }), 'before', false), false, 'timingOverride');
});

test('still: side=after karşılaştırması after alanını kullanır', () => {
  const live = { sourceCueHash: 'src|1', revision: 2, hasOverride: false, timingOverride: null, userOverride: '' };
  const ctx = bulkCtx([live], [{ id: 'tr', role: 'translation' }]);
  ctx.player.browserLoadedTrackId = 'tr';
  const edits = [{ trackId: 'tr', identity: editIdentity,
    before: { revision: 1, hasOverride: true, timingOverride: null, userOverride: 'old' },
    after: { revision: 2, hasOverride: false, timingOverride: null, userOverride: '' }, expectedBase: '' }];
  assert.equal(ctx.still(edits, 'before', false), false, 'before tarafı uyuşmamalı');
  assert.equal(ctx.still(edits, 'after', false), true, 'after tarafı eşleşmeli');
});

test('still: checkBase=true temel metni de doğrular', () => {
  const ctx = bulkCtx([], [{ id: 'tr', role: 'translation' }]);
  ctx.player.browserLoadedTrackId = 'tr';
  ctx.baseMap('tr').set('cue-1', { text: 'Temel metin' });
  const mk = (expectedBase) => [{ trackId: 'tr', identity: editIdentity, before: null, expectedBase }];
  assert.equal(ctx.still(mk('Temel metin'), 'before', true), true);
  assert.equal(ctx.still(mk('Temel metin'), 'before', false), true);
  assert.equal(ctx.still(mk('değişen temel'), 'before', true), false);
  assert.equal(ctx.still(mk('değişen temel'), 'before', false), true, 'checkBase=false temel kaymasını yok sayar');
});

test('still: tek bozuk edit bütün diziyi false yapar (every)', () => {
  const ctx = bulkCtx([], [{ id: 'tr', role: 'translation' }]);
  ctx.player.browserLoadedTrackId = 'tr';
  const good = { trackId: 'tr', identity: { ...editIdentity, cueId: 'a' }, before: null, expectedBase: '' };
  const bad = { ...good, identity: { ...editIdentity, cueId: 'b' },
    before: { revision: 1, hasOverride: true, timingOverride: null, userOverride: 'y' } };
  assert.equal(ctx.still([good, bad], 'before', false), false);
});

// --- attachBrowserCueIdentities kenarları ---------------------------------
test('attach: translation dışı rol ve boş identities passthrough', () => {
  const ctx = bulkCtx();
  const cues = [{ start: 0, end: 1, text: 'a' }];
  assert.equal(ctx.attach({ role: 'source', cueIdentities: [{ cueId: 'x', start: 0, end: 1 }] }, cues), cues);
  assert.equal(ctx.attach({ role: 'translation', cueIdentities: [] }, cues), cues);
  assert.equal(ctx.attach(null, cues), cues);
});

test('attach: 2ms tolerans — .0019 eşleşir, .0021 eşleşmez', () => {
  const ctx = bulkCtx();
  const track = { role: 'translation', cueIdentities: [{ cueId: 'id-1', start: 5, end: 6, sourceCueHash: 'H' }] };
  const near = ctx.attach(track, [{ start: 5.0019, end: 6.0019, text: 'x' }]);
  const far = ctx.attach(track, [{ start: 5.0021, end: 6.0021, text: 'x' }]);
  assert.equal(near[0].cueId, 'id-1');
  assert.equal(near[0].sourceCueHash, 'H');
  assert.equal(far[0].cueId, undefined);
  assert.equal(far[0].sourceCueHash, undefined);
});

test('attach: sıra kaymasında zamana göre eşleşir; cue yoksa [] döner', () => {
  const ctx = bulkCtx();
  const track = { role: 'translation', cueIdentities: [
    { cueId: 'A', start: 10, end: 11 }, { cueId: 'B', start: 20, end: 21 }] };
  const reordered = ctx.attach(track, [{ start: 20, end: 21, text: 't2' }, { start: 10, end: 11, text: 't1' }]);
  assert.equal(reordered[0].cueId, 'B');
  assert.equal(reordered[1].cueId, 'A');
  assert.equal(ctx.attach(track, null).length, 0, 'dizi-olmayan cue listesi boş döner');
});

// --- appendTranslationAlternatives sözleşmesi ------------------------------
function altCtx() {
  const nodes = [];
  const ctx = {
    document: { createElement: (tag) => { const n = { tag, className: '', textContent: '', type: '',
      children: [], append(...c) { this.children.push(...c); },
      addEventListener() {}, scrollIntoView() {} }; nodes.push(n); return n; } },
    translationTargetCurrent: () => true,
    quickEditorStillCurrent: () => true,
  };
  vm.createContext(ctx);
  vm.runInContext(alternativesSlice + '\nthis.appendAlts = appendTranslationAlternatives;', ctx);
  const bubble = { children: [], replaceChildren() { this.children = []; }, append(...c) { this.children.push(...c); } };
  return { ctx, bubble };
}

test('alternatives: json çiti soyulur, dedupe + en fazla 3 öneri', () => {
  const { ctx, bubble } = altCtx();
  ctx.appendAlts(bubble, '```json\n{"alternatives":["bir","iki","bir","üç","dört"]}\n```', {});
  assert.equal(bubble.children.length, 1 + 3, 'başlık + 3 öneri');
  assert.equal(bubble.children[1].children[0].textContent, 'bir');
});

test('alternatives: boş olmayan dizi / parse hatası bubble\'ı boş bırakır', () => {
  const { ctx, bubble } = altCtx();
  ctx.appendAlts(bubble, '{"alternatives":"dizi değil"}', {});
  ctx.appendAlts(bubble, 'not-json', {});
  ctx.appendAlts(bubble, '{"alternatives":[]}', {});
  assert.equal(bubble.children.length, 0);
});

test('alternatives: 12000 karakter üstü ve boş girdiler elenir', () => {
  const { ctx, bubble } = altCtx();
  const big = 'x'.repeat(12001), ok = 'kısa';
  ctx.appendAlts(bubble, JSON.stringify({ alternatives: [big, ok, ' ', 5, null] }), {});
  assert.equal(bubble.children.length, 2, 'yalnız geçerli öneri');
  assert.equal(bubble.children[1].children[0].textContent, ok);
});

// --- sourceEditSnapshot -----------------------------------------------------
function snapCtx(stored) {
  const ctx = {
    localStorage: { getItem: (k) => (k === 'browser-source-edits-v1' ? JSON.stringify(stored) : null), setItem() {} },
    browserReviewRecordsKey: 'browser-source-edits-v1',
    player: { mediaKey: 'browser:m1' },
    browserSubtitleSync: { hashText: (v) => 'H:' + String(v) },
    window: { BrowserSubtitleReview: reviewApi },
  };
  vm.createContext(ctx);
  vm.runInContext(editsReadSlice + '\n' + editsWriteSlice + '\n' + snapshotSlice
    + '\nthis.snap = sourceEditSnapshot; this.scope = reviewSourceScope;', ctx);
  return ctx;
}

test('snapshot: plan satırından kayıt üretir, mevcut base korunur', () => {
  const scope = 'H:browser:m1|tr';
  const existing = { cueId: 'c1', base: { text: 'eski temel', start: 0, end: 1 },
    edited: { text: 'a', start: 0, end: 1 }, at: 1 };
  const ctx = snapCtx({ [scope]: [existing] });
  const row = { channel: 'primary', path: '', track: { id: 'tr' },
    before: { cueId: 'c1', text: 'a', start: 0, end: 1 }, browserOverride: false };
  const out = ctx.snap({ rows: [row] }, [{ channel: 'primary', after: 'yeni', timing: { start: 0, end: 2 } }]);
  assert.equal(out.before[scope].length, 1);
  assert.equal(out.after[scope].length, 1);
  assert.equal(out.after[scope][0].base.text, 'eski temel', 'önceki temel korunur');
  assert.equal(out.after[scope][0].edited.text, 'yeni');
  assert.equal(out.after[scope][0].edited.end, 2);
});

test('snapshot: browserOverride satırı kayıt üretmez', () => {
  const ctx = snapCtx({});
  const row = { channel: 'primary', path: '', track: { id: 'tr' },
    before: { cueId: 'c1', text: 'a', start: 0, end: 1 }, browserOverride: true };
  const out = ctx.snap({ rows: [row] }, [{ channel: 'primary', after: 'x' }]);
  const scope = 'H:browser:m1|tr';
  assert.deepEqual(out.after[scope] || [], [], 'override satırı source-edits kaydına girmez');
});

test('snapshot: remap kaydı bulunamazsa anlaşılır hata atar', () => {
  const ctx = snapCtx({ 'H:browser:m1|tr': [] });
  assert.throws(() => ctx.snap({ rows: [], remap: { scope: 'H:browser:m1|tr', record: { cueId: 'yok' } } }, []),
    /Eski düzeltme değişti/);
});

test('snapshot: 1000 kayıt sınırı throw eder', () => {
  const scope = 'H:browser:m1|tr';
  const rows = Array.from({ length: 1000 }, (_, i) => ({ cueId: 'c' + i,
    base: { text: 'b' + i, start: i, end: i + 1 }, edited: { text: 'e' + i, start: i, end: i + 1 }, at: i }));
  const ctx = snapCtx({ [scope]: rows });
  const row = { channel: 'primary', path: '', track: { id: 'tr' },
    before: { cueId: 'yeni', text: 'benzersiz', start: 9000, end: 9001 }, browserOverride: false };
  assert.throws(() => ctx.snap({ rows: [row] }, [{ channel: 'primary', after: 'x' }]), /1\.000 kaynak düzeltmesi/);
});

process.exitCode = failed ? 1 : 0;
console.log(failed ? `\n${failed} başarısız, ${passed} geçti` : `\n${passed} testin tümü geçti`);
