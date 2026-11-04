/* Oynatıcı kaynak kataloğu — saf görünüm modeli (ağ yok, yan etki yok).
   Sözleşme: language-reactor-oynatici-2026-11-03/ETKILESIM §3 ve UYGULAMA_PLANI §8.4.
   Filtre mantığı: aynı alan içinde VEYA, farklı alanlar arasında VE. Boş dizi = kısıt yok.
   Bilinmeyen (null) alan doğrulanmış filtreyi karşılamaz. Zaman birimi saniyedir. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerSourceCatalog = api;
})(globalThis, () => {
  'use strict';

  const PAGE_SIZE = 40;
  const KINDS = ['youtube', 'podcast', 'local', 'network'];
  const SORTS = ['newest', 'oldest', 'shortest', 'longest', 'title'];
  const DURATION_KEYS = ['under10', '10to30', '30to60', '60plus', 'unknown'];
  const PERSONAL_KEYS = ['watched', 'unwatched', 'saved', 'later', 'liked'];
  const ORIGIN_KEYS = ['human', 'asr', 'machine-translation', 'user', 'unknown'];
  const collator = new Intl.Collator(['tr', 'en'], { sensitivity: 'base', numeric: true });

  const fold = (v) => String(v == null ? '' : v).normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');

  /** BCP47 benzeri etiketi normalize eder; geçersizse ''. UI dilinden türetilmez. */
  function normalizeLang(tag) {
    const t = String(tag == null ? '' : tag).trim().replace(/_/g, '-').toLowerCase();
    if(!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(t))return '';
    try{return Intl.getCanonicalLocales(t)[0].toLowerCase();}catch{return '';}
  }
  // Publisher plain text and conditional formats do not prove subtitle availability.
  // A timed transcript with an unknown language stays unknown in the language-based contract.
  function podcastSubtitleLanguages(descriptors) {
    const timed = (Array.isArray(descriptors) ? descriptors : []).filter(row => row?.timed === 'yes');
    if (!timed.length) return null;
    const languages = timed.map(row => normalizeLang(row.language));
    if (languages.some(language => !language || language === 'und')) return null;
    return [...new Set(languages)];
  }
  /** 'en' → en ve en-* ; 'en-us' → yalnız en-us. */
  function langMatches(selected, actual) {
    const s = normalizeLang(selected); const a = normalizeLang(actual);
    if(s==='und')return !a||a==='und';
    if (!s || !a) return false;
    if (s.includes('-')) return a === s;
    return a === s || a.startsWith(s + '-');
  }

  function durationSeconds(item) {
    if (!item || item.isLive) return null;
    const d = item.durationSeconds;
    return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null;
  }
  /** 0≤d<600 under10; 600≤d<1800 10to30; 1800≤d<3600 30to60; d≥3600 60plus; bilinmeyen unknown; canlı 'live'. */
  function durationBucket(item) {
    if (item && item.isLive) return 'live';
    const d = durationSeconds(item);
    if (d === null) return 'unknown';
    if (d < 600) return 'under10';
    if (d < 1800) return '10to30';
    if (d < 3600) return '30to60';
    return '60plus';
  }
  const publishedMs = (item) => {
    const v = item && item.publishedAt;
    if (typeof v !== 'string' || !v) return null;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  };

  const uniq = (arr) => Array.from(new Set(arr));
  const pickEnum = (arr, allowed) => uniq((Array.isArray(arr) ? arr : []).filter((v) => allowed.includes(v))).sort();

  function normalizeQuery(q) {
    const raw = q && typeof q === 'object' ? q : {};
    const langs = (arr) => uniq((Array.isArray(arr) ? arr : []).map(normalizeLang).filter(Boolean)).sort();
    return {
      kind: raw.kind === 'all' || KINDS.includes(raw.kind) ? raw.kind : 'all',
      sourceIds: uniq((Array.isArray(raw.sourceIds) ? raw.sourceIds : []).map(String).filter(Boolean)).sort(),
      text: String(raw.text == null ? '' : raw.text).slice(0, 200),
      searchDescription: raw.searchDescription === true,
      speechLanguages: langs(raw.speechLanguages),
      subtitleLanguages: langs(raw.subtitleLanguages),
      subtitleOrigins: pickEnum(raw.subtitleOrigins, ORIGIN_KEYS),
      subtitleAvailability: ['all', 'present', 'absent', 'unknown'].includes(raw.subtitleAvailability) ? raw.subtitleAvailability : 'all',
      live: ['all', 'live', 'vod'].includes(raw.live) ? raw.live : 'all',
      personalStates: pickEnum(raw.personalStates, PERSONAL_KEYS),
      durations: pickEnum(raw.durations, DURATION_KEYS),
      sort: SORTS.includes(raw.sort) ? raw.sort : 'newest',
      cursor: typeof raw.cursor === 'string' && raw.cursor ? raw.cursor : null,
      limit: PAGE_SIZE,
    };
  }

  function hash(str) { // FNV-1a 32 bit — parmak izi, güvenlik amaçlı değil
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  /** Cursor ve limit hariç normalize filtre/sıra/kapsam parmak izi. */
  function queryKey(query) {
    const n = normalizeQuery(query);
    const { cursor, limit, ...rest } = n; // eslint-disable-line no-unused-vars
    return 'qk1-' + hash(JSON.stringify(rest, Object.keys(rest).sort()));
  }

  function matchesText(item, n) {
    const q = fold(n.text).trim();
    if (!q) return true;
    const hay = [item.title, item.sourceTitle];
    if (n.searchDescription) hay.push(item.description);
    return hay.some((v) => fold(v).includes(q));
  }
  function matchesPersonal(item, states) {
    if (!states.length) return true;
    const p = item.personal || {};
    return states.some((s) => (s === 'unwatched' ? !p.watched : p[s] === true));
  }
  function matchesItem(item, n) {
    if (!item || typeof item !== 'object') return false;
    if (n.kind !== 'all' && item.kind !== n.kind) return false;
    if (n.sourceIds.length && !n.sourceIds.includes(String(item.sourceId))) return false;
    if (!matchesText(item, n)) return false;
    if (n.speechLanguages.length && !n.speechLanguages.some((l) => (Array.isArray(item.spokenLanguages)&&item.spokenLanguages.length?item.spokenLanguages:[item.language]).some(actual=>langMatches(l,actual)))) return false;
    const subs = Array.isArray(item.subtitleLanguages) ? item.subtitleLanguages : null;
    if (n.subtitleLanguages.length && !(subs===null?[null]:subs).some((a) => n.subtitleLanguages.some((l) => langMatches(l, a)))) return false;
    const origins = Array.isArray(item.subtitleOrigins) ? item.subtitleOrigins : null;
    if (n.subtitleOrigins.length && !(origins && origins.some((o) => n.subtitleOrigins.includes(o)))) return false;
    if (n.subtitleAvailability === 'present' && !(subs && subs.length > 0)) return false;
    if (n.subtitleAvailability === 'absent' && !(subs && subs.length === 0)) return false;
    if (n.subtitleAvailability === 'unknown' && subs !== null) return false;
    if (n.live === 'live' && !item.isLive) return false;
    if (n.live === 'vod' && item.isLive) return false;
    if (!matchesPersonal(item, n.personalStates)) return false;
    if (n.durations.length && !n.durations.includes(durationBucket(item))) return false;
    return true;
  }

  const cmpId = (a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0);
  // null her zaman sonda, yönden bağımsız.
  function cmpNullable(av, bv, dir) {
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av === bv ? 0 : (av < bv ? -1 : 1) * dir;
  }
  function sortItems(items, sort) {
    const arr = items.slice();
    const by = {
      newest: (a, b) => cmpNullable(publishedMs(a), publishedMs(b), -1),
      oldest: (a, b) => cmpNullable(publishedMs(a), publishedMs(b), 1),
      shortest: (a, b) => cmpNullable(durationSeconds(a), durationSeconds(b), 1),
      longest: (a, b) => cmpNullable(durationSeconds(a), durationSeconds(b), -1),
      title: (a, b) => collator.compare(String(a.title || ''), String(b.title || '')),
    }[sort] || (() => 0);
    return arr.sort((a, b) => by(a, b) || cmpId(a, b));
  }

  // pc1.<queryKey>.<revision>.<offset>.<anchorItemId> — yerel sayfa imleci; uzak token ile karışmaz.
  const enc = (s) => encodeURIComponent(String(s));
  function encodeCursor(key, revision, offset, anchor) { return ['pc1', key, enc(revision), String(offset), enc(anchor)].join('.'); }
  function decodeCursor(cursor) {
    if (typeof cursor !== 'string') return null;
    const p = cursor.split('.');
    if (p.length !== 5 || p[0] !== 'pc1') return null;
    const offset = Number(p[3]);
    if (!Number.isInteger(offset) || offset < 0) return null;
    try { return { queryKey: p[1], revision: decodeURIComponent(p[2]), offset, anchor: decodeURIComponent(p[4]) }; } catch (_) { return null; }
  }

  /**
   * Saf sorgu: ağ çağırmaz. total yalnız doğrulanmış olduğunda sayıdır; aksi halde null
   * ve arayüz "N yüklü eşleşme" yazar. cursorStatus: 'ok' | 'reset' | 'rebased'.
   */
  function queryPlayerItems({ batch, query }) {
    const b = batch && typeof batch === 'object' ? batch : {};
    const items = Array.isArray(b.items) ? b.items : [];
    const n = normalizeQuery(query);
    const key = queryKey(n);
    const sorted = sortItems(items.filter((it) => matchesItem(it, n)), n.sort);
    const remote = typeof b.remoteNextCursor === 'string' && b.remoteNextCursor ? b.remoteNextCursor : null;
    const complete = remote === null;
    const revision = String(b.revision == null ? '' : b.revision);

    let offset = 0; let cursorStatus = 'ok';
    if (n.cursor) {
      const c = decodeCursor(n.cursor);
      if (!c || c.queryKey !== key) { cursorStatus = 'reset'; }
      else if (c.revision === revision) { offset = Math.min(c.offset, sorted.length); }
      else {
        const at = sorted.findIndex((it) => it.itemId === c.anchor);
        if (at >= 0) { offset = at; cursorStatus = 'rebased'; } else { cursorStatus = 'reset'; }
      }
    }
    const page = sorted.slice(offset, offset + PAGE_SIZE);
    const end = offset + page.length;
    const nextCursor = end < sorted.length ? encodeCursor(key, revision, end, sorted[end].itemId) : null;

    let total = null;
    if (complete) total = sorted.length;
    else if (b.queryKey === key && Number.isInteger(b.sourceFilteredTotal) && b.sourceFilteredTotal >= 0) total = b.sourceFilteredTotal;

    return {
      items: page, total, loadedMatches: sorted.length, offset, nextCursor,
      remoteNextCursor: remote, needsMoreSourcePages: sorted.length === 0 && remote !== null,
      scope: complete ? 'source' : 'loaded', queryKey: key, cursorStatus,
    };
  }

  /** "40 / 236" (toplam doğrulanmış) veya "40 yüklendi" / "40 loaded". */
  function resultCountLabel(result, shown, locale) {
    const tr = String(locale || 'tr').toLowerCase().startsWith('tr');
    if (result && Number.isInteger(result.total)) return `${shown} / ${result.total}`;
    return tr ? `${shown} yüklendi` : `${shown} loaded`;
  }

  /** Etkin filtre çipleri: kısa kapsam + değer. Temizleme eylemi yalnız filtreleri etkiler. */
  function activeFilterChips(query) {
    const n = normalizeQuery(query);
    const chips = [];
    const add = (field, values) => values.forEach((value) => chips.push({ field, value }));
    add('sourceIds', n.sourceIds); add('speechLanguages', n.speechLanguages);
    add('subtitleLanguages', n.subtitleLanguages); add('subtitleOrigins', n.subtitleOrigins);
    add('durations', n.durations); add('personalStates', n.personalStates);
    if (n.subtitleAvailability !== 'all') chips.push({ field: 'subtitleAvailability', value: n.subtitleAvailability });
    if (n.live !== 'all') chips.push({ field: 'live', value: n.live });
    if (n.searchDescription && n.text) chips.push({ field: 'searchDescription', value: 'on' });
    return chips;
  }
  /** Filtreleri temizler; tür, sorgu metni, sıra ve kaynak ayrıntısı (tek sourceId kısıtı kaynak girişinden gelir) korunur. */
  function clearFilters(query, { keepSourceIds = true } = {}) {
    const n = normalizeQuery(query);
    return normalizeQuery({
      kind: n.kind, text: n.text, sort: n.sort, sourceIds: keepSourceIds ? n.sourceIds : [],
    });
  }
  function clearSearch(query) { return normalizeQuery({ ...normalizeQuery(query), text: '', searchDescription: false, cursor: null }); }

  /** Sabitlenenler sabitleme sırasında üstte; kalanlar yerel sırayla; eşitlikte kimlik. */
  function orderSources({ sources, pinned }) {
    const list = Array.isArray(sources) ? sources : [];
    const pins = Array.isArray(pinned) ? pinned : [];
    const byId = new Map(list.map((s) => [String(s.sourceId), s]));
    const top = pins.map(String).filter((id, i, a) => byId.has(id) && a.indexOf(id) === i).map((id) => byId.get(id));
    const topIds = new Set(top.map((s) => String(s.sourceId)));
    const rest = list.filter((s) => !topIds.has(String(s.sourceId)))
      .sort((a, b) => collator.compare(String(a.title || ''), String(b.title || '')) || (String(a.sourceId) < String(b.sourceId) ? -1 : 1));
    return { pinned: top, rest };
  }
  /** Klavye ile sıra değiştirme: delta -1 yukarı, +1 aşağı; sınır dışı değişmez. */
  function movePin(pinned, sourceId, delta) {
    const arr = (Array.isArray(pinned) ? pinned : []).map(String);
    const i = arr.indexOf(String(sourceId));
    const j = i + (delta < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= arr.length) return arr;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return arr;
  }
  function togglePin(pinned, sourceId) {
    const arr = (Array.isArray(pinned) ? pinned : []).map(String);
    const id = String(sourceId);
    return arr.includes(id) ? arr.filter((x) => x !== id) : arr.concat(id);
  }

  return Object.freeze({
    PAGE_SIZE, normalizeLang, podcastSubtitleLanguages, langMatches, durationBucket, normalizeQuery, queryKey,
    queryPlayerItems, resultCountLabel, activeFilterChips, clearFilters, clearSearch,
    orderSources, movePin, togglePin, encodeCursor, decodeCursor,
  });
});
