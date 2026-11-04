/* V3-T05 — Haber/yazı kimliği: aynı haberin KOPYASI ile aynı KONUdaki ayrı yazıyı ayırır.
   Kopya iki bağımsız kanıt değildir; zıt görüşlü yazı aynı metin sanılmaz (stance yalnız veriden gelir, çıkarım yok). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FeedStoryIdentity = api;
})(globalThis, () => {
  'use strict';

  const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$|yclid$|_hsenc$|_hsmi$)/i;
  const fold = (v) => String(v == null ? '' : v).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'is', 'at', 'bir', 've', 'ile', 'bu', 'de', 'da', 'icin', 'film', 'review']);

  /** İzleme parametreleri, parça, sondaki / ve varsayılan port atılır; http/https kimlikte aynıdır. */
  function canonicalizeUrl(value) {
    let u; try { u = new URL(String(value)); } catch (_) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const keep = [];
    u.searchParams.forEach((v, k) => { if (!TRACKING.test(k)) keep.push([k, v]); });
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
    const q = keep.length ? '?' + keep.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return host + path + q;
  }
  const tokens = (text) => Array.from(new Set(fold(text).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t))));
  const jaccard = (a, b) => { if (!a.length || !b.length) return 0; const s = new Set(a); const inter = b.filter((t) => s.has(t)).length; return inter / (a.length + b.length - inter); };

  function storyIdentity(entry) {
    const e = entry || {};
    const canon = canonicalizeUrl(e.canonicalUrl || e.url || e.link);
    const body = fold(e.summary || e.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const titleKey = fold(e.title).replace(/[^a-z0-9]+/g, ' ').trim();
    return {
      entryId: String(e.entryId || e.guid || canon || titleKey),
      publisherId: String(e.publisherId || ''), exactKeys: [canon && 'u:' + canon, e.guid && e.publisherId && 'g:' + e.publisherId + ':' + e.guid, body.length > 80 && 'c:' + hash(titleKey + '|' + body)].filter(Boolean),
      topicTokens: tokens((e.title || '') + ' ' + (e.summary || '')),
    };
  }

  /**
   * Önce birebir kopyalar birleşir (union-find, exactKeys paylaşımı); sonra kopya kümeleri konu benzerliği
   * (Jaccard ≥ 0.5) VEYA aynı workId ile konu grubuna alınır. independentPublishers: kopyalar sayıyı artırmaz.
   */
  function groupStories(entries, { topicThreshold = 0.5 } = {}) {
    const list = (Array.isArray(entries) ? entries : []).map((e) => ({ e, id: storyIdentity(e) }));
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    list.forEach((x, i) => x.id.exactKeys.forEach((k) => { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }));
    const clusters = new Map();
    list.forEach((x, i) => { const r = find(i); (clusters.get(r) || clusters.set(r, []).get(r)).push(x); });
    const stories = Array.from(clusters.values()).map((members) => {
      const first = members[0];
      return {
        storyId: 's1-' + hash(members.map((m) => m.id.entryId).sort().join('|')), title: String(first.e.title || ''), workId: first.e.workId || null,
        copies: members.length, entryIds: members.map((m) => m.id.entryId),
        publishers: Array.from(new Set(members.map((m) => m.id.publisherId).filter(Boolean))), tokens: Array.from(new Set(members.flatMap((m) => m.id.topicTokens))),
        stance: first.e.stance || null,
      };
    });
    // Konu grupları
    const tp = stories.map((_, i) => i);
    const tf = (i) => (tp[i] === i ? i : (tp[i] = tf(tp[i])));
    for (let i = 0; i < stories.length; i++) for (let j = i + 1; j < stories.length; j++) {
      const sameWork = stories[i].workId && stories[i].workId === stories[j].workId;
      if (sameWork || jaccard(stories[i].tokens, stories[j].tokens) >= topicThreshold) tp[tf(j)] = tf(i);
    }
    const topics = new Map();
    stories.forEach((s, i) => { const r = tf(i); (topics.get(r) || topics.set(r, []).get(r)).push(s); });
    return Array.from(topics.values()).map((group) => {
      const publishers = Array.from(new Set(group.flatMap((s) => s.publishers)));
      const stances = Array.from(new Set(group.map((s) => s.stance).filter(Boolean)));
      return {
        topicId: 't1-' + hash(group.map((s) => s.storyId).sort().join('|')), stories: group,
        independentPublishers: publishers.length, totalCopies: group.reduce((n, s) => n + s.copies, 0),
        opposingStances: stances.length > 1, stances, // yalnız veri varsa; metinden çıkarım yok
      };
    });
  }
  return Object.freeze({ canonicalizeUrl, storyIdentity, groupStories });
});
