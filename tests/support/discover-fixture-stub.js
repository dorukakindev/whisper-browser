// Sayfa içi kontrollü window.api: Keşfet kataloğu, kütüphane ve yorum isteklerini geciktirilebilir
// kapılarla (window.__fx.hold) yönetir. Yalnız tests/ içindeki Chromium düzeneği için; ürün koduna girmez.
(() => {
  'use strict';
  const fx = window.__fx = { calls: [], holds: new Map(), gates: {}, library: [], pageSize: 24, personalRows: [], reviewRows: {}, ipcLatency: -1, observers: new Set(), timers: new Map() };
  // Yaşam döngüsü ölçümü: izleme yapan MutationObserver'lar ve ≥50 ms bekleyen zamanlayıcılar (sızıntı testi için).
  const NativeObserver = window.MutationObserver;
  window.MutationObserver = class extends NativeObserver {
    observe(...args) { fx.observers.add(this); return super.observe(...args); }
    disconnect() { fx.observers.delete(this); return super.disconnect(); }
  };
  const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => { const id = nativeSet(function (...inner) { fx.timers.delete(id); return typeof fn === 'function' ? fn.apply(this, inner) : undefined; }, ms, ...args); if ((ms || 0) >= 50) fx.timers.set(id, ms); return id; };
  window.clearTimeout = id => { fx.timers.delete(id); return nativeClear(id); };
  // Gerçek IPC yanıtı bir makro görevdir. ipcLatency >= 0 iken her yanıt setTimeout görevi olarak teslim edilir;
  // mikro görev döngüsü varsa bu yanıt hiç işlenemez (donma burada görünür).
  const viaTask = promise => fx.ipcLatency < 0 ? promise : promise.then(value => new Promise(resolve => nativeSet(() => resolve(value), fx.ipcLatency)));
  const art = (type, id, title, year) => `https://images.metahub.space/${type}/${type === 'poster' ? 'small' : 'medium'}/${id}/img?t=${encodeURIComponent(title)}&y=${year}`;
  const make = (id, title, year, extra = {}) => ({
    providerId: id, kind: extra.kind || 'film', title, year, genres: ['Drama'], rating: 7.2, runtime: 112,
    poster: art('poster', id, title, year), backdrop: art('background', id, title, year),
    synopsis: `${title} (${year}) için kontrollü konu özeti. Bu metin yalnız yerleşimi sınamak içindir.`,
    cast: ['Deniz Aras', 'Mina Ketel'], directors: ['Ela Varnal'], ...extra,
  });
  const base = [
    make('tt1000001', 'The Crossing', 2019, { genres: ['Drama', 'Mystery'], rating: 7.4, synopsis: 'Yıl 2019: Bir feribot kaptanı, sisli bir sabahta kaybolan yolcuyu arar. Bu sürümün konusu 2023 yapımından farklıdır.' }),
    make('tt1000002', 'The Crossing', 2023, { genres: ['Thriller'], rating: 6.8, synopsis: 'Yıl 2023: Sınır kasabasında geçen bu gerilimde iki kardeş aynı geceyi farklı anlatır. Bu sürümün konusu 2019 yapımından farklıdır.' }),
    make('tt1000003', 'Bir Deniz Fenerinin Bekçisi Olarak Geçirdiğim Upuzun ve Sessiz Kış Üzerine Bağımsız Bir Film', 2021, { rating: 8.1, genres: ['Drama'] }),
    make('tt1000004', 'Posteri Olmayan Film', 2018, { poster: '', backdrop: '', rating: null, genres: [] }),
    make('tt1000005', 'Gece Vardiyası', 2022, { rating: 7.9, genres: ['Crime'] }),
    make('tt1000006', 'Kuzey Işıkları', 2020, { rating: 7.1, genres: ['Adventure'] }),
    make('tt1000007', 'Kuzey Hattı', 2021, { kind: 'series', rating: 8.3, genres: ['Drama', 'Crime'], runtime: 48 }),
    ...Array.from({ length: 56 }, (_, index) => make('tt' + (1000010 + index), ['Sessiz Liman', 'Kırık Pusula', 'Son Tren', 'Mavi Saat', 'Taş Bahçe', 'Yarım Gün'][index % 6] + ' ' + (index + 1), 2000 + (index % 25), { rating: 5 + (index % 40) / 10, genres: [['Comedy', 'Horror', 'Romance', 'Sci-Fi'][index % 4]], backdrop: index < 4 ? art('background', 'tt' + (1000010 + index), 'Sessiz Liman ' + (index + 1), 2000 + index) : '' })),
  ];
  fx.catalog = base;
  const canvasPng = (w, h, hue) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, `hsl(${hue} 46% 24%)`); g.addColorStop(1, `hsl(${hue + 50} 50% 10%)`); x.fillStyle = g; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
  const libraryItem = (row, extra = {}) => ({
    id: 'cat-' + row.providerId.slice(2), kind: row.kind, title: row.title, originalTitle: '', year: row.year, synopsis: row.synopsis, synopsisTr: '',
    imdbId: row.providerId, tmdbId: '', genres: row.genres, cast: row.cast, directors: row.directors, runtime: row.runtime,
    ratings: { imdb: row.rating ? String(row.rating) : '', personal: '' }, watchStatus: 'planned', favorite: false, hasPoster: !!row.poster,
    source: null, editions: [], extras: [], episodes: [], progress: null, personalMedia: {}, fieldLocks: [], ...extra,
  });
  // 2019: yerel dosya + web kopyası + erişilemeyen kaynak; devam konumu. Dizi: iki sezon, kısmen bağlı bölümler.
  fx.library.push(libraryItem(base[0], { watchStatus: 'planned', source: { type: 'local', value: 'C:/Filmler/The Crossing (2019).mkv' }, editions: [{ id: 'e1', label: 'Yönetmen kurgusu', source: { type: 'browser', value: 'https://sinema.example/the-crossing' }, parts: [] }] }));
  const seriesRow = base.find(row => row.providerId === 'tt1000007');
  fx.library.push(libraryItem(seriesRow, { watchStatus: 'watching', episodes: [1, 2, 3, 4, 5, 6].map(number => ({ id: 's' + (number > 3 ? 2 : 1) + 'e' + (number > 3 ? number - 3 : number), season: number > 3 ? 2 : 1, number: number > 3 ? number - 3 : number, title: 'Bölüm ' + number, source: number <= 4 ? { type: 'local', value: 'D:/Diziler/Kuzey/S' + (number > 3 ? 2 : 1) + 'E' + number + '.mkv' } : null })) }));
  fx.resume = { tt1000001: { positionSeconds: 2530 }, tt1000007: { season: 2, number: 1, positionSeconds: 750 } };
  fx.sourcesFor = {
    'cat-1000001': [{ id: 's1', type: 'local', label: 'The Crossing (2019).mkv', available: true, needsRelink: false, position: 2530, lastWatched: 5 }, { id: 's2', type: 'browser', label: 'sinema.example', available: true, needsRelink: false, position: 0, lastWatched: 0 }, { id: 's3', type: 'local', label: 'Yönetmen kurgusu.mkv', available: false, needsRelink: true, position: 0, lastWatched: 0 }],
    'cat-1000007': [1, 2, 3, 4].map(n => ({ id: 'e' + n, type: 'local', label: 'S' + (n > 3 ? 2 : 1) + 'E' + n, available: true, needsRelink: false, position: n === 4 ? 750 : 0, lastWatched: n })),
  };
  const reviewRow = (id, text, extra = {}) => ({ id, author: 'kullanici' + id, text, spoiler: false, rating: 4, ...extra });
  fx.reviewRows.tt1000001 = { ok: true, reviews: [reviewRow('a1', 'The 2019 ferry mystery is quiet and haunting, a slow burn with a superb final image.'), reviewRow('a2', 'Beautiful 2019 drama but the second act drags; the captain performance carries it.')], match: { state: 'matched' }, url: 'https://letterboxd.com/film/the-crossing-2019/', identity: { title: 'The Crossing', year: 2019 }, pageTitle: 'The Crossing (2019)', sampling: { requested: 40 }, sources: [{ url: 'https://letterboxd.com/film/the-crossing-2019/reviews/' }], pages: 1 };
  fx.reviewRows.tt1000002 = { ok: true, reviews: [reviewRow('b1', 'The 2023 border thriller keeps you guessing; two siblings tell the same night differently.'), reviewRow('b2', 'Tense 2023 thriller with a clever structure, though the ending feels rushed to me.')], match: { state: 'matched' }, url: 'https://letterboxd.com/film/the-crossing-2023/', identity: { title: 'The Crossing', year: 2023 }, pageTitle: 'The Crossing (2023)', sampling: { requested: 40 }, sources: [{ url: 'https://letterboxd.com/film/the-crossing-2023/reviews/' }], pages: 1 };
  fx.setLocale = value => window.UiLocale?.set?.(value, false);
  const note = entry => { fx.calls.push({ at: Math.round(performance.now()), ...entry }); };
  fx.hold = key => {
    let release, reject, calledResolve;
    const gate = new Promise((res, rej) => { release = res; reject = rej; });
    const called = new Promise(res => { calledResolve = res; });
    fx.holds.set(key, { gate, calledResolve });
    const handle = { key, called, release: value => release(value), fail: message => reject(Error(message || 'Kontrollü hata')) };
    fx.gates[key] = handle; return handle;
  };
  const gated = async key => { const hold = fx.holds.get(key); if (!hold) return null; fx.holds.delete(key); hold.calledResolve(true); await hold.gate; return null; };
  const catalogIdFor = row => fx.library.find(item => item.imdbId === row.providerId && item.kind === row.kind)?.id || null;
  const withCatalog = row => ({ ...row, catalogId: catalogIdFor(row) });
  const fail = error => ({ ok: false, error: error.message || String(error) });
  const handlers = {
    async mediaDiscovery(input) {
      note({ api: 'mediaDiscovery', action: input.action, id: input.id, kind: input.kind, query: input.query, view: input.view, skip: input.skip });
      try {
        if (input.action === 'list') {
          await gated(`list:${input.view || 'unwatched'}:${input.skip || 0}`);
          const watchlist = input.view === 'watchlist';
          const wanted = input.kind === 'series' ? 'series' : 'film';
          let rows = (watchlist ? fx.library.filter(item => item.watchStatus === 'planned').map(item => make(item.imdbId, item.title, item.year, { genres: item.genres, kind: item.kind })) : fx.catalog.slice()).filter(row => row.kind === wanted);
          const query = String(input.query || '').toLowerCase();
          if (query) rows = rows.filter(row => row.title.toLowerCase().includes(query));
          if (input.view === 'unwatched') rows = rows.filter(row => fx.library.find(item => item.imdbId === row.providerId)?.watchStatus !== 'completed');
          const skip = Number(input.skip || 0);
          return { ok: true, rows: rows.slice(skip, skip + fx.pageSize).map(withCatalog), nextSkip: skip + fx.pageSize < rows.length ? skip + fx.pageSize : null, genres: [], scope: watchlist ? 'saved-library-viewing' : '' };
        }
        if (input.action === 'personal') return { ok: true, rows: fx.personalRows.map(withCatalog), nextSkip: null };
        if (input.action === 'feedback-list') return { ok: true, rows: [], nextSkip: null };
        if (input.action === 'detail' || input.action === 'ensure-record') {
          await gated(`detail:${input.id}`);
          const row = base.find(item => item.providerId === input.id); if (!row) throw Error('Title metadata is unavailable.');
          const lib = fx.library.find(item => item.imdbId === input.id);
          return { ok: true, item: { ...row, ...(lib ? { watchStatus: lib.watchStatus, personalMedia: { watchStatus: lib.watchStatus, effectiveResume: fx.resume?.[input.id] || null } } : {}) }, catalogId: lib?.id || null, catalogTarget: lib ? { id: lib.id, title: lib.title, signature: JSON.stringify([lib.id, lib.kind, lib.imdbId, lib.title, lib.year]) } : null };
        }
        if (input.action === 'add') {
          await gated(`add:${input.id}`);
          const row = base.find(item => item.providerId === input.id); if (!row) throw Error('Title metadata is unavailable.');
          let lib = fx.library.find(item => item.imdbId === input.id);
          if (!lib) { lib = libraryItem(row); fx.library.push(lib); }
          return { ok: true, item: lib, existing: false };
        }
        if (input.action === 'synopsis-translate') { await gated(`translate:${input.id}`); return { ok: true, item: { synopsisTr: 'Kontrollü Türkçe konu özeti.' } }; }
        return { ok: true };
      } catch (error) { return fail(error); }
    },
    async mediaCatalog(input) {
      note({ api: 'mediaCatalog', action: input.action, id: input.id });
      try {
        if (input.action === 'list') { await gated('catalog-list'); return { ok: true, items: fx.library.map(item => ({ ...item })) }; }
        if (input.action === 'poster' || input.action === 'detail-artwork') { await gated(`artwork:${input.id}`); const hue = (input.id || 'x').length * 37 % 360; return input.action === 'poster' ? { ok: true, image: canvasPng(200, 300, hue) } : { ok: true, poster: canvasPng(200, 300, hue), backdrop: canvasPng(640, 360, hue) }; }
        if (input.action === 'backdrop') return { ok: true, image: canvasPng(640, 360, 200) };
        if (input.action === 'save') {
          const patch = input.item || {}; const lib = fx.library.find(item => item.id === patch.id); if (!lib) throw Error('Title not found.');
          if (patch.watchStatus) lib.watchStatus = patch.watchStatus;
          if (patch.favorite !== undefined) lib.favorite = !!patch.favorite;
          if (patch.ratings) lib.ratings = { ...lib.ratings, ...patch.ratings };
          return { ok: true, item: { ...lib } };
        }
        if (input.action === 'metadata-film-extras') return { ok: true, videos: [], images: [], cast: [], crew: [], people: [], director: [], credits: [], directorWarning: '', sameDirector: [], similar: [], recommendations: [], related: [] };
        if (input.action === 'remove' || input.action === 'delete') { fx.library = fx.library.filter(item => item.id !== input.id); return { ok: true }; }
        return { ok: true };
      } catch (error) { return fail(error); }
    },
    async mediaTools(input) {
      note({ api: 'mediaTools', action: input.action, id: input.itemId || input.discovery?.id, discovery: input.discovery?.id });
      try {
        if (input.action === 'decision-get') return { ok: true, decision: null };
        if (input.action === 'film-watch-overview' && fx.sourcesFor?.[input.itemId]) return { ok: true, sources: fx.sourcesFor[input.itemId].map(entry => ({ ...entry })), items: [], selection: null, description: '', catalogId: input.itemId, revision: 0, completed: false, assets: {}, journal: [], watchItem: null, entries: [] };
        if (['film-watch-overview', 'daily-title', 'film-watch-reflection-state'].includes(input.action)) return { ok: true, sources: [], items: [], selection: null, description: '', catalogId: null, revision: 0, completed: false, assets: {}, journal: [], watchItem: null, entries: [] };
        if (input.action === 'reviews-auto') { const key = input.discovery?.id || input.itemId; await gated(`reviews:${key}`); return fx.reviewRows[key] || { ok: false, error: 'Kontrollsüz yorum isteği' }; }
        return { ok: true };
      } catch (error) { return fail(error); }
    },
    async mediaShelf(input) { note({ api: 'mediaShelf', action: input.action }); return { ok: true, taste: {}, rows: [] }; },
    async personalMedia(input) {
      note({ api: 'personalMedia', action: input.action, id: input.identity?.imdbId });
      try {
        const lib = () => fx.library.find(item => item.imdbId === input.identity?.imdbId && item.kind === input.identity?.kind);
        const view = status => ({ kind: input.identity?.kind || 'film', identity: input.identity, catalogId: lib()?.id || null, watchStatus: status ?? lib()?.watchStatus ?? 'unspecified', title: lib()?.title || '' });
        if (input.action === 'get') return { ok: true, item: view() };
        if (input.action === 'preview') { fx.previews = fx.previews || new Map(); const token = 'tok-' + fx.previews.size; fx.previews.set(token, input); return { ok: true, token, preview: { title: lib()?.title || '', changes: input.changes, createPersonalRecord: !lib() } }; }
        if (input.action === 'apply') {
          await gated('personal-apply');
          if (fx.applyError) { const message = fx.applyError; fx.applyError = null; throw Error(message); }
          const staged = fx.previews?.get(input.token); if (!staged) throw Error('Preview expired.');
          const target = fx.library.find(item => item.imdbId === staged.identity?.imdbId && item.kind === staged.identity?.kind);
          if (target && staged.changes.watchStatus) target.watchStatus = staged.changes.watchStatus;
          return { ok: true, item: view(target?.watchStatus) };
        }
        return { ok: true };
      } catch (error) { return fail(error); }
    },
    async feedsRequest(input) { note({ api: 'feedsRequest', action: input.action }); return { ok: true, rows: [] }; },
    async getSettings() { return {}; },
    async listWatchLibrary() { return []; },
    async copyText() { return true; },
    async openExternal(url) { note({ api: 'openExternal', url }); return true; },
  };
  window.api = new Proxy({}, { get(_, key) {
    if (key === 'then') return undefined;
    if (typeof key === 'string' && /^on[A-Z]/.test(key)) return () => () => {};
    if (handlers[key]) return (...args) => viaTask(Promise.resolve(handlers[key](...args)));
    return (...args) => { note({ api: String(key) }); return Promise.resolve(null); };
  } });
  window.__fxErrors = [];
  addEventListener('error', event => window.__fxErrors.push(String(event.message)));
  addEventListener('unhandledrejection', event => window.__fxErrors.push('promise: ' + String(event.reason?.message || event.reason)));
})();
