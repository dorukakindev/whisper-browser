/* V3-T13 + T14 — Kütüphane bakımı: önce SALT OKUNUR önizleme; kontrollü yeniden bağlama ayrı, günlüklü adım.
   Kurallar: erişilemeyen kök "kayıp" değildir; edition/part/extra yinelenen sayılmaz ve silinmez;
   bilinmeyen bölüm listesi kesin eksik değildir; varsayılan path/stat kanıtı (pahalı hash yok);
   yalnız 'relink-source' işlemi vardır — özgün medya yeniden adlandırılmaz/silinmez, not/beğeni dokunulmaz.
   Çok dosyalı işlem tek atomik transaction DEĞİLDİR: kayıt başına makbuz verilir. Dosya sistemi enjekte edilir. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatalogMaintenanceModel = api;
})(globalThis, () => {
  'use strict';

  const EDITIONS = ["director's cut", 'directors cut', 'extended cut', 'extended', 'theatrical', 'remastered', 'unrated', 'final cut', 'imax', 'uncut', 'special edition'];
  const EXTRA_SUFFIX = /[-_.](trailer|behindthescenes|deleted|featurette|interview|scene|short|other|sample)$/i;
  const NOISE = /\b(2160p|1080p|720p|480p|4k|uhd|hdr10?|dv|x26[45]|h\.?26[45]|hevc|avc|bluray|blu-ray|bdrip|brrip|web-?dl|webrip|dvdrip|remux|aac|ac3|dts|atmos|truehd|10bit)\b/gi;
  const fold = (v) => String(v == null ? '' : v).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  const baseName = (p) => String(p || '').replace(/\\/g, '/').split('/').pop();
  const stem = (p) => baseName(p).replace(/\.[A-Za-z0-9]{2,4}$/, '');

  /** Dosya adından kanıt: başlık, yıl, edition, part, extra. Tahmin değil, desen eşlemesi; hiçbir şey yazmaz. */
  function parseFileEvidence(path) {
    let s = stem(path);
    const evidence = { raw: baseName(path), title: '', year: null, edition: null, part: null, isExtra: false, ids: {} };
    if (EXTRA_SUFFIX.test(s)) { evidence.isExtra = true; s = s.replace(EXTRA_SUFFIX, ''); }
    s.replace(/\[(tmdb|imdb)id-([A-Za-z0-9]+)\]/gi, (_, k, v) => { evidence.ids[k.toLowerCase()] = v; return ''; });
    s = s.replace(/\[(?:tmdb|imdb)id-[A-Za-z0-9]+\]/gi, ' ');
    const ed = s.match(/\{edition-([^}]+)\}/i);
    if (ed) { evidence.edition = fold(ed[1]); s = s.replace(/\{edition-[^}]+\}/i, ' '); }
    s = s.replace(/[._]+/g, ' '); // nokta/alt çizgi ayracı: "Blade.Runner.1982" → kelimeler
    const part = s.match(/[ ._-](?:cd|disc|disk|dvd|part|pt)[ ._-]?(\d{1,2})$/i);
    if (part) { evidence.part = Number(part[1]); s = s.slice(0, part.index); }
    const year = s.match(/[(\[. _-]((?:19|20)\d{2})[)\]. _-]?/);
    if (year) { evidence.year = Number(year[1]); s = s.slice(0, year.index) + ' ' + s.slice(year.index + year[0].length); }
    const low = fold(s);
    if (!evidence.edition) { const hit = EDITIONS.find((e) => low.includes(e)); if (hit) { evidence.edition = hit.replace('directors cut', "director's cut"); s = s.replace(new RegExp(hit.replace(/'/g, "['’]?"), 'i'), ' '); } }
    evidence.title = fold(s.replace(NOISE, ' ').replace(/[._]+/g, ' ').replace(/[\s\-–]+$/g, '').replace(/^[\s\-–]+/g, '').replace(/\s*-\s*$/g, ''));
    return evidence;
  }

  /**
   * Önizleme (salt okunur). catalog: [{workId,type,title,year,sources:[{sourceId,path,rootId}],episodes?}]
   * roots: [{rootId,accessible:true|false|'unknown'}]; exists: {path:boolean}; inventory: [path] (yetkili köklerde bulunan dosyalar).
   */
  function buildMaintenancePreview({ catalog, roots, exists = {}, inventory = [], now = Date.now() }) {
    const rootState = new Map((roots || []).map((r) => [r.rootId, r.accessible === true ? 'accessible' : (r.accessible === false ? 'inaccessible' : 'unknown')]));
    const issues = []; const groups = []; const proposals = [];
    const claims = new Map();
    for (const work of catalog || []) for (const src of work.sources || []) {
      (claims.get(src.path) || claims.set(src.path, []).get(src.path)).push(work.workId);
      const rs = rootState.get(src.rootId) || 'unknown';
      if (rs !== 'accessible') { issues.push({ kind: 'root-unverified', workId: work.workId, sourceId: src.sourceId, rootId: src.rootId, rootState: rs }); continue; }
      if (exists[src.path] === false) issues.push({ kind: 'missing-file', workId: work.workId, sourceId: src.sourceId, path: src.path, rootId: src.rootId });
    }
    for (const [path, ids] of claims) if (new Set(ids).size > 1) issues.push({ kind: 'identity-conflict', path, workIds: Array.from(new Set(ids)) });

    // Yinelenen / edition / part / extra: aynı iş için kanıt gruplama
    const byWork = new Map();
    for (const work of catalog || []) {
      const files = (work.sources || []).map((s) => ({ ...s, ev: parseFileEvidence(s.path) }));
      byWork.set(work.workId, files);
      const mains = files.filter((f) => !f.ev.isExtra);
      const editions = new Set(mains.map((f) => f.ev.edition || '-'));
      const sig = new Map();
      mains.forEach((f) => { const k = [f.ev.edition || '', f.ev.part || 0].join('|'); (sig.get(k) || sig.set(k, []).get(k)).push(f); });
      if (editions.size > 1) groups.push({ kind: 'editions', workId: work.workId, editions: Array.from(editions).filter((e) => e !== '-'), note: 'silme önerilmez' });
      if (mains.some((f) => f.ev.part)) groups.push({ kind: 'multi-part', workId: work.workId, parts: mains.filter((f) => f.ev.part).map((f) => f.ev.part).sort((a, b) => a - b) });
      if (files.some((f) => f.ev.isExtra)) groups.push({ kind: 'extras', workId: work.workId, count: files.filter((f) => f.ev.isExtra).length });
      for (const [, same] of sig) if (same.length > 1) groups.push({ kind: 'duplicate-candidate', workId: work.workId, paths: same.map((f) => f.path), evidence: 'aynı edition/part; içerik karması hesaplanmadı' });
    }
    // Aynı başlık+yıl iki ayrı yapım kaydı
    const seen = new Map();
    for (const w of catalog || []) { const k = [w.type, fold(w.title), w.year || ''].join('|'); (seen.get(k) || seen.set(k, []).get(k)).push(w.workId); }
    for (const [, ids] of seen) if (ids.length > 1) issues.push({ kind: 'possible-duplicate-work', workIds: ids });

    // Diziler: bölüm listesi bilinmiyorsa kesin eksik yok; yayınlanmamış eksik sayılmaz
    for (const w of (catalog || []).filter((x) => x.type === 'series')) {
      if (!Array.isArray(w.episodes)) { issues.push({ kind: 'episode-list-unknown', workId: w.workId }); continue; }
      for (const ep of w.episodes) {
        if (ep.sourcePath) continue;
        const aired = ep.airedAt ? Date.parse(ep.airedAt) : NaN;
        if (!Number.isFinite(aired)) issues.push({ kind: 'episode-date-unknown', workId: w.workId, season: ep.season, episode: ep.episode });
        else if (aired > now) issues.push({ kind: 'episode-upcoming', workId: w.workId, season: ep.season, episode: ep.episode });
        else issues.push({ kind: 'episode-missing-aired', workId: w.workId, season: ep.season, episode: ep.episode });
      }
    }
    // Yeniden bağlama ADAYLARI (öneri; uygulama değil): kayıp dosya → envanterde aynı kanıt
    const inv = (inventory || []).map((p) => ({ path: p, ev: parseFileEvidence(p) }));
    for (const issue of issues.filter((i) => i.kind === 'missing-file')) {
      const missing = (byWork.get(issue.workId) || []).find((f) => f.sourceId === issue.sourceId); if (!missing) continue;
      const hits = inv.filter((c) => c.path !== issue.path && !claims.has(c.path) && c.ev.title === missing.ev.title && (missing.ev.year === null || c.ev.year === missing.ev.year)
        && (c.ev.edition || '') === (missing.ev.edition || '') && (c.ev.part || 0) === (missing.ev.part || 0) && c.ev.isExtra === missing.ev.isExtra);
      if (hits.length === 1) proposals.push({ opId: `relink:${issue.workId}:${issue.sourceId}`, op: 'relink-source', workId: issue.workId, sourceId: issue.sourceId, from: issue.path, to: hits[0].path, evidence: ['title', missing.ev.year ? 'year' : null, missing.ev.edition ? 'edition' : null, missing.ev.part ? 'part' : null].filter(Boolean) });
      else if (hits.length > 1) issues.push({ kind: 'relink-ambiguous', workId: issue.workId, sourceId: issue.sourceId, candidates: hits.map((h) => h.path) });
    }
    const states = Array.from(rootState.values());
    return { readOnly: true, roots: { total: states.length, accessible: states.filter((s) => s === 'accessible').length, unverified: states.filter((s) => s !== 'accessible').length }, issues, groups, proposals, hashed: false };
  }

  // ---- T14 -------------------------------------------------------------------------------------------
  const ALLOWED_OPS = new Set(['relink-source']);
  /** Çakışma uygulama ÖNCESİ reddedilir: önizlemeden beri kayıt/kök revizyonu değiştiyse hiçbir şey yazılmaz. */
  function planMaintenanceCommit({ preview, selectedOpIds, base = {}, current = {} }) {
    const byId = new Map((preview && preview.proposals || []).map((p) => [p.opId, p]));
    const ops = []; const rejected = [];
    for (const id of selectedOpIds || []) {
      const p = byId.get(id);
      if (!p) { rejected.push({ opId: id, code: 'unknown-op' }); continue; }
      if (!ALLOWED_OPS.has(p.op)) { rejected.push({ opId: id, code: 'op-not-allowed' }); continue; }
      ops.push(p);
    }
    if (rejected.length) return { ok: false, code: 'rejected-ops', rejected };
    const conflicts = [];
    for (const p of ops) {
      const b = (base.itemRevisions || {})[p.workId]; const c = (current.itemRevisions || {})[p.workId];
      if (b !== c) conflicts.push({ opId: p.opId, workId: p.workId, base: b, current: c });
    }
    if (conflicts.length) return { ok: false, code: 'conflict', conflicts };
    const targets = ops.map((p) => p.to);
    if (new Set(targets).size !== targets.length) return { ok: false, code: 'conflict', conflicts: [{ code: 'same-target-twice' }] };
    return { ok: true, ops, itemRevisions: current.itemRevisions || {} };
  }

  /** Sıralı uygulama; bir kaydın hatası öncekinin başarısını gizlemez, sonrakini durdurmaz. */
  async function applyMaintenance({ plan, relink, now = () => Date.now(), journalId = () => 'maint-' + now() }) {
    if (!plan || !plan.ok) return { ok: false, code: 'no-plan' };
    const receipts = []; const applied = [];
    for (const op of plan.ops) {
      try {
        const r = await relink({ workId: op.workId, sourceId: op.sourceId, from: op.from, to: op.to, expectedItemRevision: plan.itemRevisions[op.workId] });
        if (r && r.ok === true) { receipts.push({ opId: op.opId, status: 'applied', revision: r.revision }); applied.push({ opId: op.opId, workId: op.workId, sourceId: op.sourceId, before: op.from, after: op.to }); }
        else receipts.push({ opId: op.opId, status: 'failed', code: (r && r.code) || 'relink-failed' });
      } catch (error) { receipts.push({ opId: op.opId, status: 'failed', code: 'exception', message: String((error && error.message) || error) }); }
    }
    const failed = receipts.filter((r) => r.status === 'failed').length;
    return { ok: failed === 0, partial: failed > 0 && applied.length > 0, receipts, atomic: false, journalEntry: applied.length ? { id: journalId(), at: now(), ops: applied } : null, recovery: failed ? 'Başarısız kayıtlar için önizlemeyi yeniden açın; uygulanan kayıtlar günlükten geri alınabilir.' : null };
  }

  /** Geri alma: yalnız kaynak yolu hâlâ bizim yazdığımız değerse eski değere döner; arada değişmişse dokunmaz. Not/beğeni kapsam dışı. */
  async function undoMaintenance({ journalEntry, readCurrentPath, relink }) {
    const receipts = [];
    for (const op of (journalEntry && journalEntry.ops) || []) {
      const now = await readCurrentPath({ workId: op.workId, sourceId: op.sourceId });
      if (now !== op.after) { receipts.push({ opId: op.opId, status: 'skipped', code: 'changed-since' }); continue; }
      const r = await relink({ workId: op.workId, sourceId: op.sourceId, from: op.after, to: op.before });
      receipts.push(r && r.ok === true ? { opId: op.opId, status: 'undone' } : { opId: op.opId, status: 'failed', code: (r && r.code) || 'relink-failed' });
    }
    return { ok: receipts.every((r) => r.status !== 'failed'), receipts };
  }
  return Object.freeze({ parseFileEvidence, buildMaintenancePreview, planMaintenanceCommit, applyMaintenance, undoMaintenance, ALLOWED_OPS });
});
