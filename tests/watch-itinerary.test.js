// V3-T03/T04 — süreli rota taslağı ve kontrollü uygulama.
const assert = require('node:assert');
const W = require('../src/watch-itinerary.js');

const c = (id, min, extra = {}) => ({ itemId: id, title: id, runtimeMinutes: min, sourceReady: 'ready', ...extra });
(async () => {
  // 1) 89 + 100 toplamı 180'e sığmaz (mola dahil değil bile: 189 > 180)
  {
    const r = W.buildWatchItinerary({ candidates: [c('a', 89), c('b', 100)], budgetMinutes: 180, breakMinutes: 0 });
    assert.deepStrictEqual(r.items.map((i) => i.itemId), ['a']); assert.deepStrictEqual(r.skipped.map((s) => [s.itemId, s.reason]), [['b', 'exceeds-budget']]);
    assert.strictEqual(r.fits, true); assert.strictEqual(r.totalMinutes, 89);
  }
  // 2) Mola toplama dahil: 80 + 10 + 90 = 180 sığar; 81 + 10 + 90 sığmaz
  {
    assert.strictEqual(W.buildWatchItinerary({ candidates: [c('a', 80), c('b', 90)], budgetMinutes: 180, breakMinutes: 10 }).items.length, 2);
    const r = W.buildWatchItinerary({ candidates: [c('a', 81), c('b', 90)], budgetMinutes: 180, breakMinutes: 10 });
    assert.strictEqual(r.items.length, 1); assert.strictEqual(r.skipped[0].needsMinutes, 181);
  }
  // 3) Bilinmeyen süre uydurulmaz; fits 'unknown'; hazır olmayan kaynak playable sayılmaz
  {
    const r = W.buildWatchItinerary({ candidates: [c('a', 60), c('u', null, { sourceReady: 'unknown' }), c('n', 30, { sourceReady: 'needs-source' })], budgetMinutes: 240 });
    assert.strictEqual(r.fits, 'unknown'); assert.strictEqual(r.unknownRuntimeCount, 1); assert.strictEqual(r.notReadyCount, 2);
    assert.strictEqual(r.items[1].runtimeKnown, false); assert.strictEqual(r.items[1].endOffsetMinutes, null);
    assert.deepStrictEqual(r.items.map((i) => i.sourceReady), ['ready', 'unknown', 'needs-source']);
  }
  // 4) Salt okunur, yan etki yok, kopya elenir, en kısa-önce sıralama deterministik, revizyon sıraya duyarlı
  {
    const input = [c('b', 100), c('a', 50), c('a', 50), c('z', 100)]; const snap = JSON.stringify(input);
    const r = W.buildWatchItinerary({ candidates: input, budgetMinutes: 500, order: 'shortest-first' });
    assert.strictEqual(JSON.stringify(input), snap); assert.deepStrictEqual(r.items.map((i) => i.itemId), ['a', 'b', 'z']);
    assert.ok(r.skipped.some((s) => s.reason === 'duplicate')); assert.strictEqual(r.readOnly, true);
    assert.deepStrictEqual(r.effects, { writesLikes: false, writesNotes: false, marksCompleted: false });
    assert.notStrictEqual(r.draftRevision, W.buildWatchItinerary({ candidates: input, budgetMinutes: 500 }).draftRevision);
    assert.strictEqual(W.buildWatchItinerary({ candidates: [c('a', 10), c('b', 10), c('c', 10)], budgetMinutes: 500, maxItems: 2 }).skipped[0].reason, 'max-items');
  }
  // 5) T04: taslak sonrası üye/revizyon değişirse çakışma; apply yalnız önizleme farkını yazar; undo yalnız kendi farkını geri alır
  {
    const draft = W.buildWatchItinerary({ candidates: [c('a', 60), c('b', 60), c('c', 60)], budgetMinutes: 500 });
    const col = { revision: 7, members: ['b', 'x'] };
    assert.deepStrictEqual(W.planItineraryApply({ draft, collection: { ...col, revision: 8 }, expectedRevision: 7 }).reason, 'revision-changed');
    assert.strictEqual(W.planItineraryApply({ draft, collection: col, expectedRevision: 7, baseMembers: ['b'] }).reason, 'members-changed');
    const plan = W.planItineraryApply({ draft, collection: col, expectedRevision: 7, baseMembers: ['b', 'x'] });
    assert.deepStrictEqual([plan.preview.add, plan.preview.keep], [['a', 'c'], ['b']]);
    assert.deepStrictEqual([plan.preview.writesNotes, plan.preview.writesLikes], [false, false]);
    let written = null;
    const applied = await W.applyItineraryPlan({ plan, writeMembers: async (w) => { written = w; return { ok: true, revision: 8 }; } });
    assert.deepStrictEqual(written.members, ['b', 'x', 'a', 'c']); assert.strictEqual(written.expectedRevision, 7); assert.deepStrictEqual(applied.undo.remove, ['a', 'c']);
    // Arada kullanıcı 'y' ekledi ve 'c'yi sildi: undo yalnız hâlâ var olan 'a'yı çıkarır, 'y' korunur
    let after = null;
    const undone = await W.undoItineraryApply({ undo: applied.undo, collection: { revision: 9, members: ['b', 'x', 'a', 'y'] }, writeMembers: async (w) => { after = w; return { ok: true }; } });
    assert.deepStrictEqual(after.members, ['b', 'x', 'y']); assert.deepStrictEqual(undone.removed, ['a']);
    assert.strictEqual((await W.undoItineraryApply({ undo: applied.undo, collection: { revision: 9, members: ['b'] }, writeMembers: async () => { throw new Error('çağrılmamalı'); } })).noop, true);
    assert.strictEqual((await W.applyItineraryPlan({ plan: { ok: false } })).code, 'no-plan');
    assert.strictEqual((await W.applyItineraryPlan({ plan, writeMembers: async () => ({ ok: false, code: 'conflict' }) })).code, 'conflict');
  }
  console.log('watch-itinerary.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
