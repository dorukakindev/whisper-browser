// player-source-catalog — süre grupları, VE/VEYA, dil etiketi, sıralama, imleç, toplam semantiği.
const assert = require('node:assert');
const C = require('../src/player-source-catalog.js');

const mk = (id, extra = {}) => ({
  itemId: id, sourceId: 's1', kind: 'youtube', title: id, sourceTitle: 'Kanal', description: '',
  durationSeconds: 100, publishedAt: '2026-01-01T00:00:00Z', language: 'en', subtitleLanguages: ['en'],
  subtitleOrigins: ['human'], personal: { watched: false, saved: false, later: false, liked: false },
  isLive: false, transcriptDescriptors: [], ...extra,
});
const run = (items, query, batch = {}) => C.queryPlayerItems({ batch: { items, revision: 'r1', remoteNextCursor: null, ...batch }, query });
const ids = (r) => r.items.map((i) => i.itemId);

// 1) Süre sınırları tam tanımlı
{
  const d = [599, 600, 1799, 1800, 3599, 3600].map((s) => mk('d' + s, { durationSeconds: s }));
  d.push(mk('dnull', { durationSeconds: null }), mk('dneg', { durationSeconds: -5 }), mk('dnan', { durationSeconds: NaN }),
    mk('dlive', { isLive: true, durationSeconds: Infinity }));
  const bucket = (q) => ids(run(d, { durations: [q], sort: 'title' })).sort();
  assert.deepStrictEqual(bucket('under10'), ['d599']);
  assert.deepStrictEqual(bucket('10to30'), ['d1799', 'd600']);
  assert.deepStrictEqual(bucket('30to60'), ['d1800', 'd3599']);
  assert.deepStrictEqual(bucket('60plus'), ['d3600']);
  assert.deepStrictEqual(bucket('unknown'), ['dnan', 'dneg', 'dnull'], 'bilinmeyen/negatif/NaN unknown; canlı değil');
  assert.deepStrictEqual(ids(run(d, { live: 'live' })), ['dlive']);
  assert.ok(!ids(run(d, { durations: ['unknown', 'under10', '10to30', '30to60', '60plus'] })).includes('dlive'), 'canlı süre grubuna girmez');
}

// 2) VEYA (aynı alan) / VE (farklı alan)
{
  const items = [
    mk('a', { sourceId: 's1', durationSeconds: 300 }), mk('b', { sourceId: 's2', durationSeconds: 300 }),
    mk('c', { sourceId: 's2', durationSeconds: 900 }), mk('d', { sourceId: 's3', durationSeconds: 300 }),
  ];
  assert.deepStrictEqual(ids(run(items, { sourceIds: ['s1', 's2'], sort: 'title' })), ['a', 'b', 'c']);
  assert.deepStrictEqual(ids(run(items, { sourceIds: ['s1', 's2'], durations: ['under10'], sort: 'title' })), ['a', 'b']);
  assert.deepStrictEqual(ids(run(items, { sourceIds: [], durations: [], sort: 'title' })), ['a', 'b', 'c', 'd'], 'boş dizi kısıt yok');
}

// 3) Dil etiketi: en → en-*, en-US yalnız tam; UI dili medya dili değil; bilinmeyen eşleşmez
{
  const items = [mk('en', { language: 'en' }), mk('enus', { language: 'en_US' }), mk('engb', { language: 'EN-gb' }),
    mk('tr', { language: 'tr' }), mk('nolang', { language: null })];
  assert.deepStrictEqual(ids(run(items, { speechLanguages: ['en'], sort: 'title' })), ['en', 'engb', 'enus']);
  assert.deepStrictEqual(ids(run(items, { speechLanguages: ['en-US'], sort: 'title' })), ['enus']);
  assert.strictEqual(ids(run(items, { speechLanguages: ['xx yy'] })).length, 5, 'geçersiz etiket normalize ile atılır; arayüz zaten geçersiz etiket sunmaz');
  assert.deepStrictEqual(ids(run(items, { speechLanguages: ['tr'], sort: 'title' })), ['tr']);
}

// 4) Altyazı: doğrulanmış yok ([]) ile bilinmiyor (null) ayrı; kaynak/dil birbirine karışmaz
{
  const items = [mk('has', { subtitleLanguages: ['tr'] }), mk('none', { subtitleLanguages: [] }), mk('unk', { subtitleLanguages: null, subtitleOrigins: null })];
  assert.deepStrictEqual(ids(run(items, { subtitleAvailability: 'present' })), ['has']);
  assert.deepStrictEqual(ids(run(items, { subtitleAvailability: 'absent' })), ['none']);
  assert.deepStrictEqual(ids(run(items, { subtitleAvailability: 'unknown' })), ['unk']);
  assert.deepStrictEqual(ids(run(items, { subtitleLanguages: ['tr'] })), ['has'], 'Türkçe altyazı ≠ Türkçe ses');
  assert.deepStrictEqual(ids(run(items, { speechLanguages: ['tr'] })), [], 'konuşma dili en olan öğe tr ses filtresine girmez');
  assert.deepStrictEqual(ids(run(items, { subtitleOrigins: ['asr'] })), [], 'bilinmeyen köken doğrulanmış filtreyi karşılamaz');
}

// 5) Arama: başlık+kaynak; açıklama yalnız açıkça; Türkçe katlama (İ/ı)
{
  const items = [mk('x1', { title: 'Işık ve Gölge', description: 'belgesel notu' }), mk('x2', { title: 'Baska', sourceTitle: 'İSTANBUL Kanalı' })];
  assert.deepStrictEqual(ids(run(items, { text: 'isik' })), ['x1']);
  assert.deepStrictEqual(ids(run(items, { text: 'istanbul' })), ['x2'], 'kanal adında arama');
  assert.deepStrictEqual(ids(run(items, { text: 'belgesel' })), [], 'açıklama varsayılan kapalı');
  assert.deepStrictEqual(ids(run(items, { text: 'belgesel', searchDescription: true })), ['x1']);
}

// 6) Sıralama: bilinmeyenler her yönde sonda; eşitlikte itemId artan
{
  const items = [
    mk('b', { publishedAt: '2026-03-01T00:00:00Z', durationSeconds: 200 }), mk('a', { publishedAt: '2026-03-01T00:00:00Z', durationSeconds: 200 }),
    mk('n', { publishedAt: null, durationSeconds: null }), mk('o', { publishedAt: '2025-01-01T00:00:00Z', durationSeconds: 50 }),
    mk('bad', { publishedAt: 'dün', durationSeconds: 10 }),
  ];
  assert.deepStrictEqual(ids(run(items, { sort: 'newest' })), ['a', 'b', 'o', 'bad', 'n'], 'newest: eşit tarihte itemId, bilinmeyen sonda');
  assert.deepStrictEqual(ids(run(items, { sort: 'oldest' })), ['o', 'a', 'b', 'bad', 'n']);
  assert.deepStrictEqual(ids(run(items, { sort: 'shortest' })), ['bad', 'o', 'a', 'b', 'n']);
  assert.deepStrictEqual(ids(run(items, { sort: 'longest' })), ['a', 'b', 'o', 'bad', 'n']);
  const t = [mk('t1', { title: 'Zeki' }), mk('t2', { title: 'Çay' }), mk('t3', { title: 'Ada' }), mk('t4', { title: 'ada' })];
  assert.deepStrictEqual(ids(run(t, { sort: 'title' })), ['t3', 't4', 't2', 't1'], 'yerel sıralama: Ada=ada, sonra Çay, Zeki');
}

// 7) Sayfalama: 40 + devam; imleç sorguya bağlı; yanlış imleç sessizce yanlış sayfa açmaz
{
  const items = Array.from({ length: 95 }, (_, i) => mk('i' + String(i).padStart(3, '0'), { publishedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
  const r1 = run(items, { sort: 'oldest' });
  assert.strictEqual(r1.items.length, 40);
  assert.strictEqual(r1.total, 95, 'tüm küme yüklü (uzak imleç yok) → doğrulanmış toplam');
  assert.ok(r1.nextCursor);
  const r2 = run(items, { sort: 'oldest', cursor: r1.nextCursor });
  assert.strictEqual(r2.items[0].itemId, 'i040');
  const r3 = run(items, { sort: 'oldest', cursor: r2.nextCursor });
  assert.strictEqual(r3.items.length, 15); assert.strictEqual(r3.nextCursor, null);
  const wrong = run(items, { sort: 'newest', cursor: r1.nextCursor });
  assert.strictEqual(wrong.cursorStatus, 'reset'); assert.strictEqual(wrong.offset, 0, 'başka sorgunun imleci ilk sayfaya döner');
  assert.strictEqual(run(items, { sort: 'oldest', cursor: 'çöp' }).cursorStatus, 'reset');
  // Yeni batch revizyonu: görünür anchor itemId ile yeniden hesaplanır
  const items2 = [mk('i000x', { publishedAt: '2025-12-31T00:00:00Z' }), ...items];
  const rb = run(items2, { sort: 'oldest', cursor: r1.nextCursor }, { revision: 'r2' });
  assert.strictEqual(rb.cursorStatus, 'rebased'); assert.strictEqual(rb.items[0].itemId, 'i040');
  const items3 = items.filter((i) => i.itemId !== 'i040');
  assert.strictEqual(run(items3, { sort: 'oldest', cursor: r1.nextCursor }, { revision: 'r3' }).cursorStatus, 'reset', 'anchor kayboldu → açık reset');
}

// 8) Kısmi batch: yerel eşleşme kaynak toplamı sayılmaz; 0 eşleşme + uzak imleç → daha fazla yükle
{
  const items = [mk('a'), mk('b')];
  const key = C.queryKey({ sort: 'newest' });
  const partial = run(items, { sort: 'newest' }, { remoteNextCursor: 'opaque-token-1' });
  assert.strictEqual(partial.total, null); assert.strictEqual(partial.scope, 'loaded'); assert.strictEqual(partial.loadedMatches, 2);
  assert.strictEqual(C.resultCountLabel(partial, 2, 'tr'), '2 yüklendi'); assert.strictEqual(C.resultCountLabel(partial, 2, 'en'), '2 loaded');
  const verified = run(items, { sort: 'newest' }, { remoteNextCursor: 'tok', queryKey: key, sourceFilteredTotal: 236 });
  assert.strictEqual(verified.total, 236); assert.strictEqual(C.resultCountLabel(verified, 40, 'tr'), '40 / 236');
  const otherKey = run(items, { sort: 'newest', text: 'a' }, { remoteNextCursor: 'tok', queryKey: key, sourceFilteredTotal: 236 });
  assert.strictEqual(otherKey.total, null, 'başka sorgu için doğrulanmış toplam kullanılmaz');
  const none = run(items, { text: 'olmayan' }, { remoteNextCursor: 'tok' });
  assert.strictEqual(none.needsMoreSourcePages, true); assert.strictEqual(none.remoteNextCursor, 'tok', 'uzak imleç opak, aynen taşınır');
  assert.strictEqual(run(items, { text: 'olmayan' }).needsMoreSourcePages, false, 'tamam küme: gerçek "sonuç yok"');
}

// 9) Çip/temizleme: filtre temizle sorguyu ve türü korur; aramayı temizle yalnız metni siler
{
  const q = { kind: 'podcast', text: 'abc', sourceIds: ['s9'], durations: ['under10'], live: 'vod', sort: 'title' };
  const cleared = C.clearFilters(q);
  assert.strictEqual(cleared.kind, 'podcast'); assert.strictEqual(cleared.text, 'abc');
  assert.deepStrictEqual(cleared.durations, []); assert.strictEqual(cleared.live, 'all'); assert.strictEqual(cleared.sort, 'title');
  assert.deepStrictEqual(cleared.sourceIds, ['s9'], 'kaynak ayrıntısı kısıtı korunur');
  const noText = C.clearSearch(q);
  assert.strictEqual(noText.text, ''); assert.deepStrictEqual(noText.durations, ['under10']); assert.strictEqual(noText.kind, 'podcast');
  assert.deepStrictEqual(C.activeFilterChips(q).map((c) => c.field).sort(), ['durations', 'live', 'sourceIds']);
  assert.strictEqual(C.queryKey({ sort: 'title', cursor: 'x' }), C.queryKey({ sort: 'title' }), 'imleç parmak izine girmez');
  assert.notStrictEqual(C.queryKey({ sort: 'title' }), C.queryKey({ sort: 'oldest' }));
}

// 10) Kaynak sırası: sabitlenenler sabitleme sırasında, kalanlar yerel sırada; pin ≠ takip; klavye taşıma
{
  const sources = [{ sourceId: 'c', title: 'Çay' }, { sourceId: 'a', title: 'Ada' }, { sourceId: 'z', title: 'Zeki' }, { sourceId: 'a2', title: 'ada' }];
  const o = C.orderSources({ sources, pinned: ['z', 'ghost', 'c', 'z'] });
  assert.deepStrictEqual(o.pinned.map((s) => s.sourceId), ['z', 'c'], 'var olmayan ve yinelenen pin atılır');
  assert.deepStrictEqual(o.rest.map((s) => s.sourceId), ['a', 'a2']);
  assert.deepStrictEqual(C.movePin(['z', 'c', 'a'], 'c', -1), ['c', 'z', 'a']);
  assert.deepStrictEqual(C.movePin(['z', 'c', 'a'], 'z', -1), ['z', 'c', 'a'], 'sınırda değişmez');
  assert.deepStrictEqual(C.togglePin(['a'], 'b'), ['a', 'b']); assert.deepStrictEqual(C.togglePin(['a', 'b'], 'a'), ['b']);
}

// 11) Saflık: girdi değişmez
{
  const items = [mk('a'), mk('b')]; const snap = JSON.stringify(items);
  run(items, { sort: 'title', text: 'a' }); assert.strictEqual(JSON.stringify(items), snap);
}
console.log('player-source-catalog.test.js: OK');
