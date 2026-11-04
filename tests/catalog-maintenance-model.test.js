// V3-T13/T14 — bakım önizlemesi (salt okunur) ve günlüklü yeniden bağlama.
const assert = require('node:assert');
const M = require('../src/catalog-maintenance-model.js');

(async () => {
  // 1) Dosya adı kanıtı: yıl, edition, part, extra, kimlik etiketi, gürültü
  {
    const a = M.parseFileEvidence('D:\\Filmler\\Blade.Runner.1982.Directors.Cut.1080p.BluRay.x264.mkv');
    assert.deepStrictEqual([a.title, a.year, a.edition, a.part, a.isExtra], ['blade runner', 1982, "director's cut", null, false]);
    const b = M.parseFileEvidence('/m/Heat (1995) {edition-Extended} [tmdbid-949].mkv'); assert.deepStrictEqual([b.title, b.year, b.edition, b.ids.tmdb], ['heat', 1995, 'extended', '949']);
    const c = M.parseFileEvidence('/m/Kill Bill (2003) - part2.mp4'); assert.deepStrictEqual([c.title, c.year, c.part], ['kill bill', 2003, 2]);
    assert.strictEqual(M.parseFileEvidence('/m/Heat (1995)-trailer.mp4').isExtra, true);
    assert.strictEqual(M.parseFileEvidence('/m/Sade Başlık.mkv').year, null);
  }
  // 2) Erişilemeyen kök kayıp DEĞİL; erişilebilir kökte olmayan dosya kayıp; envanterden tek eşleşmeli yeniden bağlama ADAYI
  const catalog = [
    { workId: 'w1', type: 'movie', title: 'Heat', year: 1995, sources: [{ sourceId: 's1', path: 'D:/Films/Heat (1995).mkv', rootId: 'D' }] },
    { workId: 'w2', type: 'movie', title: 'Alien', year: 1979, sources: [{ sourceId: 's2', path: 'E:/Films/Alien (1979).mkv', rootId: 'E' }] },
    { workId: 'w3', type: 'movie', title: 'Blade Runner', year: 1982, sources: [
      { sourceId: 's3a', path: 'D:/Films/Blade Runner (1982).mkv', rootId: 'D' }, { sourceId: 's3b', path: 'D:/Films/Blade Runner (1982) {edition-Final Cut}.mkv', rootId: 'D' }, { sourceId: 's3c', path: 'D:/Films/Blade Runner (1982)-trailer.mp4', rootId: 'D' }] },
  ];
  const roots = [{ rootId: 'D', accessible: true }, { rootId: 'E', accessible: false }];
  const exists = { 'D:/Films/Heat (1995).mkv': false, 'E:/Films/Alien (1979).mkv': false, 'D:/Films/Blade Runner (1982).mkv': true };
  const inventory = ['D:/Moved/Heat.1995.1080p.mkv', 'D:/Moved/Other (2001).mkv'];
  const p = M.buildMaintenancePreview({ catalog, roots, exists, inventory });
  {
    assert.strictEqual(p.readOnly, true); assert.strictEqual(p.hashed, false);
    const kinds = (k) => p.issues.filter((i) => i.kind === k);
    assert.deepStrictEqual(kinds('missing-file').map((i) => i.workId), ['w1'], 'yalnız erişilebilir kökteki eksik dosya');
    assert.deepStrictEqual(kinds('root-unverified').map((i) => i.workId), ['w2'], 'E: erişilemez → kayıp yazılmaz');
    assert.deepStrictEqual(p.roots, { total: 2, accessible: 1, unverified: 1 });
    assert.strictEqual(p.proposals.length, 1); assert.deepStrictEqual([p.proposals[0].op, p.proposals[0].to], ['relink-source', 'D:/Moved/Heat.1995.1080p.mkv']);
    // Director's/Final Cut edition ve extra yinelenen sayılmaz; silme önerisi yok
    assert.ok(p.groups.some((g) => g.kind === 'editions' && g.workId === 'w3' && g.note === 'silme önerilmez')); assert.ok(p.groups.some((g) => g.kind === 'extras' && g.count === 1));
    assert.ok(!p.groups.some((g) => g.kind === 'duplicate-candidate'));
  }
  // 3) Gerçek yinelenen aday: aynı edition/part ≥2 dosya; part ayrı sayılır
  {
    const cat = [{ workId: 'w9', type: 'movie', title: 'X', year: 2000, sources: [{ sourceId: 'a', path: '/m/X (2000).mkv', rootId: 'R' }, { sourceId: 'b', path: '/m/copy/X (2000).mp4', rootId: 'R' }, { sourceId: 'c', path: '/m/Y (2001) - part1.mkv', rootId: 'R' }, { sourceId: 'd', path: '/m/Y (2001) - part2.mkv', rootId: 'R' }] }];
    const r = M.buildMaintenancePreview({ catalog: cat, roots: [{ rootId: 'R', accessible: true }], exists: {} });
    assert.deepStrictEqual(r.groups.filter((g) => g.kind === 'duplicate-candidate').map((g) => g.paths.length), [2]); assert.ok(r.groups.some((g) => g.kind === 'multi-part' && g.parts.join() === '1,2'));
  }
  // 4) Kimlik çatışması ve olası yinelenen yapım kaydı; belirsiz yeniden bağlama öneri üretmez
  {
    const cat = [{ workId: 'a', type: 'movie', title: 'Dune', year: 2021, sources: [{ sourceId: '1', path: '/m/Dune (2021).mkv', rootId: 'R' }] }, { workId: 'b', type: 'movie', title: 'Dune', year: 2021, sources: [{ sourceId: '2', path: '/m/Dune (2021).mkv', rootId: 'R' }] }];
    const r = M.buildMaintenancePreview({ catalog: cat, roots: [{ rootId: 'R', accessible: true }], exists: { '/m/Dune (2021).mkv': false }, inventory: ['/n/Dune (2021).mkv', '/o/Dune.2021.mkv'] });
    assert.ok(r.issues.some((i) => i.kind === 'identity-conflict' && i.workIds.length === 2)); assert.ok(r.issues.some((i) => i.kind === 'possible-duplicate-work'));
    assert.strictEqual(r.proposals.length, 0); assert.ok(r.issues.some((i) => i.kind === 'relink-ambiguous'));
  }
  // 5) Diziler: bilinmeyen liste kesin eksik değil; yayınlanmamış eksik sayılmaz; tarihsiz bilinmiyor
  {
    const cat = [{ workId: 's', type: 'series', title: 'S', year: 2020, sources: [] }, { workId: 't', type: 'series', title: 'T', year: 2021, sources: [], episodes: [
      { season: 1, episode: 1, sourcePath: '/x.mkv' }, { season: 1, episode: 2, airedAt: '2026-01-01' }, { season: 1, episode: 3, airedAt: '2027-01-01' }, { season: 1, episode: 4 }] }];
    const r = M.buildMaintenancePreview({ catalog: cat, roots: [], now: Date.parse('2026-11-04') });
    const k = (x) => r.issues.filter((i) => i.kind === x).map((i) => i.episode || i.workId);
    assert.deepStrictEqual(k('episode-list-unknown'), ['s']); assert.deepStrictEqual(k('episode-missing-aired'), [2]); assert.deepStrictEqual(k('episode-upcoming'), [3]); assert.deepStrictEqual(k('episode-date-unknown'), [4]);
  }
  // 6) T14: çakışma uygulama öncesi reddedilir; yalnız relink-source; hiçbir şey yazılmaz
  {
    const base = { itemRevisions: { w1: 4 } };
    const bad = M.planMaintenanceCommit({ preview: p, selectedOpIds: ['relink:w1:s1'], base, current: { itemRevisions: { w1: 5 } } }); assert.deepStrictEqual([bad.ok, bad.code], [false, 'conflict']);
    assert.strictEqual(M.planMaintenanceCommit({ preview: p, selectedOpIds: ['rename:w1'], base, current: base }).code, 'rejected-ops');
    assert.deepStrictEqual(Array.from(M.ALLOWED_OPS), ['relink-source'], 'rename/delete işlemi yok');
    const twice = { proposals: [{ opId: 'a', op: 'relink-source', workId: 'x', to: '/t' }, { opId: 'b', op: 'relink-source', workId: 'y', to: '/t' }] };
    assert.strictEqual(M.planMaintenanceCommit({ preview: twice, selectedOpIds: ['a', 'b'], base: {}, current: {} }).code, 'conflict');
  }
  // 7) Uygulama: kayıt başına makbuz, ikinci hata ilk başarıyı gizlemez, atomik değil; günlük yalnız uygulananlar
  {
    const preview = { proposals: [{ opId: 'a', op: 'relink-source', workId: 'w1', sourceId: 's1', from: '/old1', to: '/new1' }, { opId: 'b', op: 'relink-source', workId: 'w2', sourceId: 's2', from: '/old2', to: '/new2' }, { opId: 'c', op: 'relink-source', workId: 'w3', sourceId: 's3', from: '/old3', to: '/new3' }] };
    const plan = M.planMaintenanceCommit({ preview, selectedOpIds: ['a', 'b', 'c'], base: { itemRevisions: { w1: 1, w2: 1, w3: 1 } }, current: { itemRevisions: { w1: 1, w2: 1, w3: 1 } } });
    const writes = [];
    const res = await M.applyMaintenance({ plan, now: () => 5, relink: async (o) => { writes.push(o.workId); if (o.workId === 'w2') return { ok: false, code: 'revision-conflict' }; if (o.workId === 'w3') throw new Error('disk'); return { ok: true, revision: 2 }; } });
    assert.deepStrictEqual(writes, ['w1', 'w2', 'w3'], 'hata sonrakini durdurmaz'); assert.deepStrictEqual(res.receipts.map((r) => r.status), ['applied', 'failed', 'failed']);
    assert.strictEqual(res.partial, true); assert.strictEqual(res.atomic, false); assert.strictEqual(res.ok, false); assert.deepStrictEqual(res.journalEntry.ops.map((o) => o.opId), ['a']); assert.ok(res.recovery);
    assert.strictEqual(res.receipts[2].message, 'disk');
    // 8) Geri alma: yalnız bizim yazdığımız değer; arada değişmişse atlanır
    const undoWrites = [];
    const entry = { ops: [{ opId: 'a', workId: 'w1', sourceId: 's1', before: '/old1', after: '/new1' }, { opId: 'z', workId: 'w9', sourceId: 's9', before: '/o', after: '/n' }] };
    const u = await M.undoMaintenance({ journalEntry: entry, readCurrentPath: async ({ workId }) => (workId === 'w1' ? '/new1' : '/kullanici-degistirdi'), relink: async (o) => { undoWrites.push(o); return { ok: true }; } });
    assert.deepStrictEqual(u.receipts.map((r) => r.status), ['undone', 'skipped']); assert.deepStrictEqual([undoWrites.length, undoWrites[0].to], [1, '/old1']);
    assert.strictEqual((await M.applyMaintenance({ plan: { ok: false } })).code, 'no-plan');
  }
  console.log('catalog-maintenance-model.test.js: OK');
})().catch((e) => { console.error(e); process.exit(1); });
