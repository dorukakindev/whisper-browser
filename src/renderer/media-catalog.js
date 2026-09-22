(() => {
  'use strict';
  const dialog = document.getElementById('mediaCatalogDialog');
  const root = document.getElementById('mediaCatalogRoot');
  const openButtons = document.querySelectorAll('[data-media-catalog-open], #mediaCatalogOpen');
  if (!dialog || !root || !openButtons.length) return;

  const state = { items: [], watchItems: [], section: 'movie', search: '', status: 'all', favorite: false,
    selected: null, mode: 'list', draft: null, busy: false, message: '', error: false, importData: null, importIds: new Set(), removeId: null, visibleCount: 40, session: 0, opener: null };
  const posterCache = new Map();
  Object.assign(state, { credential: '', metadataQuery: '', metadataResults: [], metadata: null, metadataFields: new Set(), season: 1, seasonData: null, packageData: null });
  function loadPoster(target, id) {
    if (!posterCache.has(id)) posterCache.set(id, Promise.resolve(window.api?.mediaCatalog?.({ action: 'poster', id })).catch(() => null));
    posterCache.get(id).then(result => {
      if (!target.isConnected) return;
      const image = safePoster(result?.image);
      if (!image) return;
      target.replaceChildren(); const img = $('img'); img.src = image; img.alt = ''; img.loading = 'lazy'; target.append(img);
    });
  }
  const posterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      posterObserver.unobserve(entry.target);
      const id = entry.target.dataset.posterId;
      if (!id) continue;
      loadPoster(entry.target, id);
    }
  }, { root: dialog, rootMargin: '120px' });
  const statusLabels = { unspecified: 'Durum yok', planned: 'İzlenecek', watching: 'İzleniyor', completed: 'İzlendi' };
  const typeLabels = { movie: 'Film', series: 'Dizi' };
  const t = value => window.UiLocale?.t?.(value) ?? value;
  const english = () => window.UiLocale?.get?.() === 'en';
  const $ = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const button = (text, callback, className = '') => {
    const node = $('button', className, text); node.type = 'button'; node.disabled = state.busy;
    node.addEventListener('click', callback); return node;
  };
  const safePoster = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length < 8_000_000 ? value : '';
  const catalogType = item => item.kind === 'series' || item.type === 'series' ? 'series' : 'movie';
  const itemId = item => String(item?.id || '');
  const find = id => state.items.find(item => itemId(item) === String(id));
  function feedback(message, error = false) { state.message = message; state.error = error; render(); }
  async function api(action, payload = {}) {
    if (state.busy || !dialog.open) return null;
    if (typeof window.api?.mediaCatalog !== 'function') { feedback('Katalog hizmeti kullanılamıyor.', true); return null; }
    const sessionId = state.session;
    state.busy = true; state.message = 'İşleniyor…'; state.error = false; render();
    try {
      const result = await window.api.mediaCatalog({ action, ...payload });
      if (sessionId !== state.session || !dialog.open) {
        if (result?.token) void window.api.mediaCatalog({ action: action === 'import-preview' ? 'import-cancel' : 'extension-cancel', token: result.token }).catch(() => {});
        return null;
      }
      if (!result || result.ok === false) { state.message = result?.canceled ? '' : result?.error || 'İşlem tamamlanamadı.'; state.error = !result?.canceled; return null; }
      state.message = ''; return result;
    } catch (error) { if (sessionId === state.session && dialog.open) { state.message = error?.message || 'İşlem tamamlanamadı.'; state.error = true; } return null; }
    finally { if (sessionId === state.session && dialog.open) { state.busy = false; render(); } }
  }
  async function reload() {
    const result = await api('list');
    if (result) { state.items = Array.isArray(result.items) ? result.items : []; state.watchItems = Array.isArray(result.watchItems) ? result.watchItems : []; render(); }
    return !!result;
  }
  function cancelImport() {
    if (state.importData?.token) void window.api?.mediaCatalog?.({ action: state.importData.action === 'folder-preview' ? 'extension-cancel' : 'import-cancel', token: state.importData.token }).catch(() => {});
    state.importData = null; state.importIds.clear();
  }
  function cancelPreviewTokens() {
    for (const token of [state.metadata?.token, state.seasonData?.token, state.packageData?.token]) {
      if (token) void window.api?.mediaCatalog?.({ action: 'extension-cancel', token }).catch(() => {});
    }
    state.metadata = null; state.seasonData = null; state.packageData = null;
  }
  function close() { state.credential = ''; cancelImport(); cancelPreviewTokens(); dialog.close(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); state.mode = 'list'; state.selected = null; state.removeId = null; }
  function show(id) {
    state.removeId = null; state.selected = id; state.mode = 'detail';
    state.seasonData = null; state.metadata = null; state.metadataResults = []; state.packageData = null;
    render();
  }
  function formField(label, value, change, options = {}) {
    const wrap = $('label', 'mc-field'); wrap.append($('span', '', label));
    const input = options.multiline ? $('textarea') : $('input');
    if (!options.multiline) input.type = options.type || 'text';
    input.value = value ?? ''; input.required = !!options.required;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
    input.addEventListener('input', () => change(input.value));
    wrap.append(input); return wrap;
  }
  function selectField(label, value, choices, change) {
    const wrap = $('label', 'mc-field'); wrap.append($('span', '', label)); const input = $('select');
    for (const [key, text] of choices) { const option = $('option', '', text); option.value = key; input.append(option); }
    input.value = value; input.addEventListener('change', () => change(input.value)); wrap.append(input); return wrap;
  }
  function makeDraft(item, type = 'movie') {
    return item ? { id: item.id, type: catalogType(item), title: item.title || '', year: item.year || '', synopsis: item.synopsis || '',
      imdbId: item.imdbId || '', tmdbId: item.tmdbId || '', watchStatus: item.watchStatus || 'unspecified', favorite: !!item.favorite,
      ratings: { ...(item.ratings || {}) }, episodes: (item.episodes || []).map(episode => ({ ...episode })) }
      : { type, title: '', year: '', synopsis: '', imdbId: '', tmdbId: '', watchStatus: state.section === 'watchlist' ? 'planned' : 'unspecified', favorite: false, ratings: {}, episodes: [] };
  }
  function edit(item, type) { state.draft = makeDraft(item, type); state.mode = 'form'; render(); }
  function filtered() {
    const query = state.search.trim().toLocaleLowerCase('tr-TR');
    return state.items.filter(item => {
      if (state.section === 'watchlist'
        ? !(['planned', 'watching'].includes(item.watchStatus) || (item.episodes || []).some(episode => ['planned', 'watching'].includes(episode.watchStatus)))
        : catalogType(item) !== state.section) return false;
      if (state.status !== 'all' && item.watchStatus !== state.status &&
          !(state.section === 'watchlist' && (item.episodes || []).some(episode => episode.watchStatus === state.status))) return false;
      if (state.favorite && !item.favorite) return false;
      return !query || `${item.title || ''} ${item.year || ''} ${item.synopsis || ''}`.toLocaleLowerCase('tr-TR').includes(query);
    });
  }
  function poster(item, className) {
    const shell = $('div', className); const image = safePoster(item?.posterImage);
    if (image) { const img = $('img'); img.src = image; img.alt = ''; img.loading = 'lazy'; shell.append(img); }
    else {
      shell.append($('span', 'mc-poster-empty', catalogType(item) === 'series' ? 'DİZİ' : 'FİLM'));
      if (item?.hasPoster && itemId(item)) { shell.dataset.posterId = itemId(item); queueMicrotask(() => {
        if (!shell.isConnected) return;
        if (className === 'mc-detail-poster') loadPoster(shell, itemId(item));
        else posterObserver.observe(shell);
      }); }
    }
    return shell;
  }
  function renderHeader() {
    const header = $('header', 'mc-header');
    const brand = $('div', 'mc-brand'); brand.append($('span', 'mc-eyebrow', 'YEREL ARŞİV'), $('h2', '', 'Film ve dizi kataloğu'));
    header.append(brand, button('Kapat', close, 'mc-close'));
    return header;
  }
  function renderNav() {
    const nav = $('nav', 'mc-nav'); nav.setAttribute('aria-label', 'Katalog bölümleri');
    for (const [key, label] of [['movie', 'Filmler'], ['series', 'Diziler'], ['watchlist', 'İzlenecekler'], ['calendar', 'Takvim']]) {
      const control = button(label, () => { state.section = key; state.mode = 'list'; render(); });
      control.setAttribute('aria-current', state.section === key ? 'page' : 'false'); nav.append(control);
    }
    return nav;
  }
  function renderList() {
    if (state.section === 'calendar') return renderCalendar();
    const body = $('div', 'mc-content');
    const controls = $('div', 'mc-toolbar');
    const search = $('input'); search.type = 'search'; search.placeholder = 'Başlık, yıl veya konu ara'; search.setAttribute('aria-label', 'Katalogda ara'); search.value = state.search;
    search.addEventListener('input', () => { state.search = search.value; renderCards(); });
    const status = $('select'); status.setAttribute('aria-label', 'İzleme durumuna göre filtrele');
    for (const [key, label] of [['all', 'Tüm durumlar'], ...Object.entries(statusLabels)]) { const option = $('option', '', label); option.value = key; status.append(option); }
    status.value = state.status; status.addEventListener('change', () => { state.status = status.value; renderCards(); });
    const favorite = $('label', 'mc-favorite-filter'); const check = $('input'); check.type = 'checkbox'; check.checked = state.favorite;
    check.addEventListener('change', () => { state.favorite = check.checked; renderCards(); }); favorite.append(check, $('span', '', 'Yalnız favoriler'));
    controls.append(search, status, favorite); body.append(controls);
    const actions = $('div', 'mc-list-actions');
    actions.append(button('Film ekle', () => edit(null, 'movie'), 'mc-primary'), button('Dizi ekle', () => edit(null, 'series')),
      button('Eski arşivi içe aktar', () => previewImport()), button('Klasör tara', () => previewImport('folder-preview')),
      button('Çalışma paketi', () => { state.mode = 'package'; render(); })); body.append(actions);
    const grid = $('div', 'mc-grid'); grid.id = 'mcGrid'; body.append(grid); renderCards(grid);
    return body;
  }
  function renderCards(existing) {
    const grid = existing || document.getElementById('mcGrid'); if (!grid) return; grid.replaceChildren();
    const rows = filtered();
    if (!rows.length) { grid.append($('p', 'mc-empty', state.items.length ? 'Bu filtreye uyan yapım yok.' : 'Kataloğunuz boş. İlk filmi veya diziyi ekleyin.')); return; }
    for (const item of rows.slice(0, state.visibleCount)) {
      const card = button('', () => show(item.id), 'mc-card'); card.setAttribute('aria-label', `${item.title || t('Adsız yapım')} ${english() ? 'details' : 'ayrıntılarını aç'}`);
      card.append(poster(item, 'mc-card-poster'));
      const info = $('div', 'mc-card-info'); info.append($('strong', '', item.title || t('Adsız yapım')));
      info.append($('span', '', `${item.year || t('Yıl yok')} · ${t(typeLabels[catalogType(item)])} · ${t(statusLabels[item.watchStatus] || statusLabels.unspecified)}`));
      if (item.favorite) info.append($('span', 'mc-fav-mark', '★ Favori'));
      const ratings = item.ratings || {};
      if (ratings.imdb || ratings.letterboxd || ratings.personal) info.append($('span', 'mc-ratings', [
        ratings.imdb ? `IMDb ${ratings.imdb}/10` : '', ratings.letterboxd ? `Letterboxd ${ratings.letterboxd}/5` : '',
        ratings.personal ? `${english() ? 'Personal' : 'Kişisel'} ${ratings.personal}` : '',
      ].filter(Boolean).join(' · ')));
      if (item.progress?.position > 0 && !item.progress?.completed) info.append($('span', 'mc-progress', `${english() ? 'Resume' : 'Devam'} · ${Math.floor(item.progress.position / 60)} ${english() ? 'min' : 'dk'}`));
      card.append(info); grid.append(card);
    }
    if (rows.length > state.visibleCount) grid.append(button(`${t('Daha fazla göster')} (${state.visibleCount}/${rows.length})`, () => { state.visibleCount += 40; renderCards(); }, 'mc-more'));
  }
  async function play(item, episodeId) {
    const sessionId = state.session;
    const result = await api('play', { id: item.id, ...(episodeId ? { episodeId } : {}) });
    if (!result) return;
    const watchItem = result.watchItem;
    if (!watchItem || typeof window.openMediaCatalogPlayback !== 'function') { feedback('Oynatma köprüsü kullanılamıyor.', true); return; }
    try { await window.openMediaCatalogPlayback(watchItem); if (sessionId === state.session && dialog.open) close(); }
    catch (error) { if (sessionId === state.session && dialog.open) feedback(error?.message || 'Oynatma başlatılamadı.', true); }
  }
  async function source(item, episodeId, kind) {
    const payload = { id: item.id, ...(episodeId ? { episodeId } : {}) };
    if (kind === 'url') {
      const input = [...root.querySelectorAll('[data-source-url]')].find(node => node.dataset.sourceUrl === String(episodeId || 'item'));
      const url = input?.value.trim(); if (!url) { feedback('Kaynak adresini yazın.', true); return; }
      payload.url = url;
    }
    const result = await api(kind === 'file' ? 'source-file' : 'source-url', payload);
    if (result) { if (!await reload()) return; show(item.id); feedback('Oynatma kaynağı bağlandı.'); }
  }
  function sourceControls(item, episode) {
    const wrap = $('div', 'mc-source'); const id = episode?.id;
    const current = episode ? episode.source : item.source;
    wrap.append($('p', 'mc-muted', current ? `${english() ? 'Source' : 'Kaynak'}: ${t(current.type === 'local' ? 'Yerel dosya' : 'Tarayıcı adresi')}` : t('Oynatma kaynağı yok')));
    const controls = $('div', 'mc-source-actions');
    controls.append(button('Yerel dosya bağla', () => source(item, id, 'file')));
    const input = $('input'); input.type = 'url'; input.placeholder = 'https://…'; input.setAttribute('aria-label', 'Tarayıcı video adresi'); input.dataset.sourceUrl = id || 'item';
    controls.append(input, button('Adresi bağla', () => source(item, id, 'url'))); wrap.append(controls);
    return wrap;
  }
  function renderDetail() {
    const item = find(state.selected); if (!item) { state.mode = 'list'; return renderList(); }
    const body = $('div', 'mc-content mc-detail'); body.append(button('← Kataloğa dön', () => { state.mode = 'list'; render(); }, 'mc-back'));
    const hero = $('div', 'mc-detail-hero'); hero.append(poster(item, 'mc-detail-poster'));
    const text = $('div'); text.append($('span', 'mc-eyebrow', `${t(typeLabels[catalogType(item)])} · ${item.year || t('Yıl belirtilmedi')}`), $('h3', '', item.title || t('Adsız yapım')));
    text.append($('p', 'mc-muted', statusLabels[item.watchStatus] || statusLabels.unspecified));
    if (item.ratings) text.append($('p', 'mc-ratings', [item.ratings.imdb ? `IMDb ${item.ratings.imdb}/10` : '',
      item.ratings.letterboxd ? `Letterboxd ${item.ratings.letterboxd}/5` : '', item.ratings.personal ? `${english() ? 'Personal' : 'Kişisel'} ${item.ratings.personal}` : ''].filter(Boolean).join(' · ')));
    if (item.synopsis) text.append($('p', 'mc-synopsis', item.synopsis));
    if (item.genres?.length || item.runtime) text.append($('p', 'mc-muted', [...(item.genres || []), item.runtime ? `${item.runtime} ${english() ? 'min' : 'dk'}` : ''].filter(Boolean).join(' · ')));
    if (item.cast?.length) text.append($('p', 'mc-muted', item.cast.join(', ')));
    const actions = $('div', 'mc-detail-actions');
    actions.append(button('Bilgileri eşleştir', () => { state.metadataQuery = item.title; state.metadataResults = []; state.metadata = null; state.seasonData = null; state.mode = 'metadata'; render(); }));
    actions.append(button('Düzenle', () => edit(item)), button('Afiş seç', async () => { const result = await api('poster-file', { id: item.id }); if (result) { posterCache.delete(String(item.id)); if (!await reload()) return; show(item.id); } }));
    if (catalogType(item) === 'movie') actions.append(button(item.progress?.position > 0 && !item.progress?.completed ? 'Kaldığın yerden devam et' : 'Oynat', () => play(item), 'mc-primary'));
    else {
      const next = [...(item.episodes || [])].sort((a, b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number))
        .find(episode => episode.source && !episode.progress?.completed && episode.watchStatus !== 'completed');
      if (next) actions.append(button(`${english() ? 'Play next episode' : 'Sıradaki bölümü oynat'} · S${next.season} ${english() ? 'E' : 'B'}${next.number}`, () => play(item, next.id), 'mc-primary'));
      if (item.source) actions.append(button('Dizi kaynağını aç', () => play(item)));
    }
    actions.append(button(state.removeId === item.id ? 'Silme işlemini onayla' : 'Sil', () => {
      if (state.removeId !== item.id) { state.removeId = item.id; render(); return; }
      void api('remove', { id: item.id }).then(result => { if (result) { state.items = state.items.filter(row => itemId(row) !== itemId(item)); state.removeId = null; state.mode = 'list'; feedback('Yapım silindi.'); } });
    }, 'mc-danger'));
    if (state.removeId === item.id) actions.append(button('Vazgeç', () => { state.removeId = null; render(); }));
    text.append(actions); hero.append(text); body.append(hero);
    if (state.removeId === item.id) body.append($('p', 'mc-danger-note', 'Bu yapımı silmek üzeresiniz. Silme işlemini onaylayın veya vazgeçin.'));
    body.append(sourceControls(item));
    if (catalogType(item) === 'series') {
      const heading = $('div', 'mc-section-heading'); heading.append($('h4', '', 'Bölümler'), button('Bölüm ekle', () => editEpisode(item)));
      body.append(heading); const list = $('div', 'mc-episodes');
      const episodes = [...(item.episodes || [])].sort((a, b) => Number(a.season) - Number(b.season) || Number(a.number) - Number(b.number));
      if (!episodes.length) list.append($('p', 'mc-empty', 'Henüz bölüm eklenmedi.'));
      for (const episode of episodes) {
        const row = $('div', 'mc-episode');
        const top = $('div', 'mc-episode-head'); top.append($('strong', '', `S${episode.season ?? 1} ${english() ? 'E' : 'B'}${episode.number || 1} · ${episode.title || (english() ? 'Episode' : 'Bölüm')}`), $('span', 'mc-muted', episode.progress?.completed ? t('İzlendi') : episode.progress?.position > 0 ? (english() ? 'In progress' : 'Devam ediyor') : t(statusLabels[episode.watchStatus] || statusLabels.unspecified)));
        const controls = $('div', 'mc-episode-actions');
        controls.append(button('Oynat', () => play(item, episode.id), 'mc-primary'), button('Düzenle', () => editEpisode(item, episode)));
        row.append(top, controls, sourceControls(item, episode)); list.append(row);
      }
      body.append(list);
    }
    return body;
  }
  function editEpisode(item, episode) {
    state.removeId = null;
    state.selected = item.id;
    state.draft = { ...(episode || {}), season: episode?.season ?? 1, number: episode?.number || 1, title: episode?.title || '', watchStatus: episode?.watchStatus || 'unspecified' };
    state.mode = 'episode'; render();
  }
  function renderEpisodeForm() {
    const item = find(state.selected), draft = state.draft; const body = $('div', 'mc-content mc-form');
    body.append(button('← Diziye dön', () => show(item.id), 'mc-back'), $('h3', '', draft.id ? 'Bölümü düzenle' : 'Yeni bölüm'));
    const form = $('form'); form.noValidate = true; form.append(formField('Sezon', draft.season, value => { draft.season = Number(value); }, { type: 'number', min: 0, max: 1000, required: true }),
      formField('Bölüm no', draft.number, value => { draft.number = Number(value); }, { type: 'number', min: 1, max: 10000, required: true }),
      formField('Başlık', draft.title, value => { draft.title = value; }, { maxLength: 200 }),
      formField('Yayın tarihi (YYYY-AA-GG)', draft.airDate || '', value => { draft.airDate = value; }, { maxLength: 10 }),
      selectField('İzleme durumu', draft.watchStatus, Object.entries(statusLabels), value => { draft.watchStatus = value; }));
    const actions = $('div', 'mc-form-actions'); const save = $('button', 'mc-primary', 'Bölümü kaydet'); save.type = 'submit'; actions.append(save);
    if (draft.id) actions.append(button('Bölümü sil', async () => {
      if (state.removeId !== draft.id) { state.removeId = draft.id; feedback('Bölümü silmek için yeniden basın veya vazgeçin.'); return; }
      const next = makeDraft(item); next.episodes = next.episodes.filter(row => String(row.id) !== String(draft.id));
      const result = await api('save', { item: next }); if (result) { state.removeId = null; if (!await reload()) return; show(item.id); }
    }, 'mc-danger'), button('Vazgeç', () => { state.removeId = null; feedback('Silme iptal edildi.'); }));
    form.append(actions); form.addEventListener('submit', async event => {
      event.preventDefault(); if (!Number.isInteger(draft.season) || !Number.isInteger(draft.number) || draft.season < 0 || draft.season > 1000 || draft.number < 1 || draft.number > 10000 || (draft.airDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.airDate))) { feedback('Sezon, bölüm numarası ve tarihi kontrol edin.', true); return; }
      const next = makeDraft(item); next.episodes = next.episodes.filter(row => String(row.id) !== String(draft.id));
      next.episodes.push({ ...draft, id: draft.id || `episode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
      const result = await api('save', { item: next }); if (result) { if (!await reload()) return; show(item.id); feedback('Bölüm kaydedildi.'); }
    }); form.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = state.busy; }); body.append(form); return body;
  }
  function renderForm() {
    const draft = state.draft, body = $('div', 'mc-content mc-form');
    body.append(button('← Geri', () => { state.mode = draft.id ? 'detail' : 'list'; render(); }, 'mc-back'), $('h3', '', draft.id ? 'Yapımı düzenle' : 'Kataloğa yapım ekle'));
    const form = $('form'); form.noValidate = true; form.append(selectField('Tür', draft.type, Object.entries(typeLabels), value => { draft.type = value; }),
      formField('Başlık', draft.title, value => { draft.title = value; }, { required: true, maxLength: 200 }),
      formField('Yıl', draft.year, value => { draft.year = value; }, { type: 'number', min: 1888, max: 2100 }),
      formField('Konu', draft.synopsis, value => { draft.synopsis = value; }, { multiline: true, maxLength: 4000 }),
      formField('IMDb kimliği', draft.imdbId, value => { draft.imdbId = value; }, { maxLength: 24 }),
      formField('TMDb kimliği', draft.tmdbId, value => { draft.tmdbId = value; }, { maxLength: 24 }),
      formField('Kişisel puan / not', draft.ratings?.personal || '', value => { draft.ratings.personal = value; }, { maxLength: 24 }),
      selectField('İzleme durumu', draft.watchStatus, Object.entries(statusLabels), value => { draft.watchStatus = value; }));
    const favorite = $('label', 'mc-check'); const checkbox = $('input'); checkbox.type = 'checkbox'; checkbox.checked = draft.favorite;
    checkbox.addEventListener('change', () => { draft.favorite = checkbox.checked; }); favorite.append(checkbox, $('span', '', 'Favori')); form.append(favorite);
    const save = $('button', 'mc-primary', draft.id ? 'Değişiklikleri kaydet' : 'Kataloğa ekle'); save.type = 'submit'; form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!draft.title.trim()) { feedback('Başlık gerekli.', true); return; }
      const result = await api('save', { item: { ...draft, kind: draft.type === 'series' ? 'series' : 'film', title: draft.title.trim(), year: draft.year === '' ? null : Number(draft.year) } });
      if (result) { if (!await reload()) return; state.selected = result.item?.id || draft.id; state.mode = 'detail'; feedback('Yapım kaydedildi.'); }
    }); form.querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = state.busy; }); body.append(form); return body;
  }
  async function previewImport(action = 'import-preview') {
    const result = await api(action);
    if (!result) return;
    if (!dialog.open) { if (result.token) void window.api.mediaCatalog({ action: 'import-cancel', token: result.token }).catch(() => {}); return; }
    state.importData = { ...result, action }; state.importIds = new Set(); state.mode = 'import'; render();
  }
  function renderImport() {
    const body = $('div', 'mc-content mc-import'); body.append(button('← Kataloğa dön', () => { cancelImport(); state.mode = 'list'; render(); }, 'mc-back'), $('h3', '', state.importData?.action === 'folder-preview' ? 'Klasör tarama sonuçları' : 'Eski arşivi içe aktar'));
    const data = state.importData || {}; const rows = Array.isArray(data.items) ? data.items : [];
    body.append($('p', 'mc-muted', `${rows.length} kayıt önizlemede. Yalnız seçtikleriniz içe aktarılır; belirsiz eşleşmeleri kontrol edin.`));
    if (data.summary) body.append($('p', 'mc-muted', `Eklenecek: ${data.summary.added?.length || 0} · Güncellenecek: ${data.summary.updated?.length || 0} · Çakışma: ${data.summary.conflicts?.length || 0} · Atlanan: ${data.summary.skipped?.length || 0}`));
    if (Array.isArray(data.warnings) && data.warnings.length) {
      const warnings = $('details', 'mc-warnings'); warnings.append($('summary', '', `${data.warnings.length} içe aktarma uyarısını göster`));
      const list = $('ul'); for (const warning of data.warnings) list.append($('li', '', typeof warning === 'string' ? warning : warning?.reason || warning?.message || JSON.stringify(warning)));
      warnings.append(list); body.append(warnings);
    }
    const selection = $('div', 'mc-list-actions');
    selection.append(button('Tümünü seç', () => { state.importIds = new Set(rows.map(item => String(item.importRef || item.id || '')).filter(Boolean)); render(); }),
      button('Seçimi temizle', () => { state.importIds.clear(); render(); })); body.append(selection);
    const list = $('div', 'mc-import-list');
    for (const item of rows) {
      const id = String(item.importRef || item.id || ''); const row = $('label', 'mc-import-row'); const check = $('input'); check.type = 'checkbox'; check.checked = state.importIds.has(id); check.disabled = state.busy;
      check.addEventListener('change', () => { if (check.checked) state.importIds.add(id); else state.importIds.delete(id); });
      row.append(check, $('span', '', `${item.title || 'Adsız yapım'} · ${item.year || 'Yıl yok'}`));
      const conflict = (data.conflicts || []).find(entry => String(entry.id || entry.importId) === id);
      if (conflict) row.append($('small', 'mc-conflict', `Olası çakışma: ${conflict.reason || 'Kimlik ve başlığı kontrol edin.'}`));
      list.append(row);
    }
    if (!rows.length) list.append($('p', 'mc-empty', 'İçe aktarılabilecek kayıt bulunamadı.'));
    body.append(list);
    body.append(button('Seçilileri içe aktar', async () => {
      if (!state.importIds.size) { feedback('İçe aktarmak için en az bir kayıt seçin.', true); return; }
      const result = await api(data.action === 'folder-preview' ? 'folder-apply' : 'import-apply', { token: data.token, ids: [...state.importIds] });
      if (result) { state.mode = 'list'; state.importData = null; if (!await reload()) return; const report = result.summary || {}; feedback(`İçe aktarma tamamlandı: ${report.added?.length || 0} eklendi, ${report.updated?.length || 0} güncellendi, ${report.conflicts?.length || 0} çakışma, ${report.skipped?.length || 0} atlandı.`); }
    }, 'mc-primary'));
    return body;
  }
  function renderCalendar() {
    const body = $('div', 'mc-content'); body.append($('h3', '', 'Bölüm takvimi'), $('p', 'mc-muted', 'Tarihleri dizi ayrıntısındaki Bilgileri eşleştir alanından alabilir veya bölüm düzenlerken yazabilirsiniz.'));
    const rows = state.items.flatMap(item => (item.episodes || []).map(ep => ({ item, ep })));
    rows.sort((a, b) => (a.ep.airDate || '9999').localeCompare(b.ep.airDate || '9999'));
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const pending = rows.filter(({ ep }) => ep.watchStatus !== 'completed' && !ep.progress?.completed);
    if (!pending.length) body.append($('p', 'mc-empty', 'Tarihi bilinen, izlenmemiş bölüm yok.'));
    const groups = [['Yaklaşan bölümler', pending.filter(({ ep }) => ep.airDate > today)], ['Yayınlandı · izlenmedi', pending.filter(({ ep }) => ep.airDate && ep.airDate <= today && ep.source)], ['Kaynağı eksik', pending.filter(({ ep }) => !ep.source && (!ep.airDate || ep.airDate <= today))], ['Tarihi açıklanmamış', pending.filter(({ ep }) => !ep.airDate && ep.source)]];
    for (const [label, entries] of groups) {
      body.append($('h4', '', `${label} · ${entries.length}`));
      for (const { item, ep } of entries.slice(0, state.visibleCount)) {
      const row = $('div', 'mc-calendar-row');
      row.append($('time', '', ep.airDate ? ep.airDate.split('-').reverse().join('.') : 'Tarih yok'), $('strong', '', `${item.title} · S${ep.season} B${ep.number}`),
        $('span', 'mc-muted', ep.airDate > today ? 'Yaklaşıyor' : ep.source ? 'İzlemeye hazır' : 'Yayınlandı · kaynak yok'), button('Diziye git', () => show(item.id)));
      body.append(row);
    } }
    if (pending.length > state.visibleCount) body.append(button('Daha fazla göster', () => { state.visibleCount += 40; render(); }));
    return body;
  }
  function renderMetadata() {
    const item = find(state.selected), body = $('div', 'mc-content mc-form');
    if (!item) return renderList();
    body.append(button('← Eser ayrıntısına dön', () => show(item.id)), $('h3', '', 'Eser bilgilerini eşleştir'),
      $('p', 'mc-muted', 'TMDB başlık araması ve seçili sezon bilgileri çevrimiçi alınır. Erişim belirteci yalnız bu katalog oturumunda tutulur.'));
    body.append(formField('TMDB API okuma erişim belirteci', state.credential, value => { state.credential = value; }, { type: 'password', maxLength: 4096 }));
    const secret = body.querySelector('input[type=password]'); secret.autocomplete = 'off';
    body.append(button('Belirteci göster / gizle', () => { secret.type = secret.type === 'password' ? 'text' : 'password'; }));
    body.append(formField('Aranacak başlık', state.metadataQuery, value => { state.metadataQuery = value; }, { maxLength: 200 }),
      button('Aramayı temizle', () => { state.metadataQuery = ''; state.metadataResults = []; state.metadata = null; render(); }),
      button('TMDB’de ara', async () => { const result = await api('metadata-search', { id: item.id, query: state.metadataQuery, credential: state.credential }); if (result) { state.metadataResults = result.results; state.metadata = null; if (!result.results.length) state.message = 'Eşleşme bulunamadı; başka başlık deneyin.'; render(); } }));
    const results = $('div', 'mc-import-list');
    for (const row of state.metadataResults) results.append(button(`${row.title} · ${row.date || 'Tarih yok'}`, async () => {
      const result = await api('metadata-preview', { id: item.id, providerId: row.id, credential: state.credential });
      if (result) { state.metadata = result; state.metadataFields = new Set(['title', 'year', 'synopsis', 'genres', 'cast', 'runtime', 'imdbId', 'originalTitle', 'poster'].filter(key => key === 'poster' ? !item.hasPoster : Array.isArray(item[key]) ? !item[key].length : !item[key])); render(); }
    }));
    body.append(results);
    if (state.metadata) {
      const data = state.metadata; body.append($('h4', '', 'Uygulanacak alanları seçin'));
      const labels = { title: 'Başlık', originalTitle: 'Özgün başlık', year: 'Yıl', synopsis: 'Konu', imdbId: 'IMDb kimliği', genres: 'Türler', cast: 'Oyuncular', runtime: 'Süre', poster: 'Afiş' };
      for (const [key, label] of Object.entries(labels)) {
        const row = $('label', 'mc-check'); const check = $('input'); check.type = 'checkbox'; check.checked = state.metadataFields.has(key); check.disabled = state.busy;
        check.addEventListener('change', () => { if (check.checked) state.metadataFields.add(key); else state.metadataFields.delete(key); });
        row.append(check, $('span', '', `${label}: ${key === 'poster' ? data.poster ? 'Yeni afiş indirilecek' : 'Afiş yok' : Array.isArray(data.patch[key]) ? data.patch[key].join(', ') : data.patch[key] ?? 'Bilgi yok'}`)); body.append(row);
      }
      body.append($('p', 'mc-muted', 'Yalnız boş alanlar başlangıçta seçilidir. Dolu bir alanı seçerseniz mevcut değer değişir. TMDB kimliği bağlanır; kişisel puan, favori ve izleme durumu korunur.'), button('Seçili bilgileri uygula', async () => {
        const result = await api('metadata-apply', { token: data.token, fields: [...state.metadataFields] });
        if (result) { posterCache.delete(String(item.id)); state.metadata = null; if (await reload()) show(item.id); }
      }, 'mc-primary'));
    }
    if (item.kind === 'series') {
      body.append($('h4', '', 'Sezon ve bölüm tarihleri'), formField('Sezon numarası', state.season, value => { state.season = Number(value); }, { type: 'number', min: 0, max: 1000 }),
        button('Sezonu önizle', async () => { const result = await api('season-preview', { id: item.id, season: state.season, credential: state.credential }); if (result) { state.seasonData = result; render(); } }));
      if (state.seasonData) {
        const list = $('div', 'mc-import-list');
        for (const ep of state.seasonData.episodes) list.append($('p', '', `B${ep.number} · ${ep.title} · ${ep.airDate || 'Tarih açıklanmadı'}`));
        body.append(list, $('p', 'mc-muted', 'Eksik bölümler eklenir, yayın tarihleri güncellenir. Kaynak ve izleme durumu korunur.'), button('Bölümleri takvime aktar', async () => {
          const result = await api('season-apply', { token: state.seasonData.token }); if (result) { state.seasonData = null; if (await reload()) show(item.id); }
        }, 'mc-primary'));
      }
    }
    body.append($('p', 'mc-muted', 'This product uses the TMDB API but is not endorsed or certified by TMDB.'));
    return body;
  }
  function renderPackage() {
    state.includeVideos ??= false;
    const body = $('div', 'mc-content mc-form'); body.append(button('← Kataloğa dön', () => { state.mode = 'list'; render(); }), $('h3', '', 'Taşınabilir çalışma paketi'),
      $('p', 'mc-muted', 'Katalog, posterler, kayıtlı altyazılar, düzeltmeler, notlar, izleme geçmişi ve senkron tercihleri birlikte taşınır. Hesap oturumları ve anahtarlar dahil değildir. Videoları eklerseniz kopyalama uzun sürebilir (en fazla 100 GB).'),
      button('Paketi dışa aktar', async () => { const rendererValues = Object.fromEntries(['subtitleStyle', 'subtitlePos', 'browser-source-edits-v1', 'browser-source-edit-scopes-v1', 'browser-subtitle-drafts-v1'].map(key => [key, localStorage.getItem(key)])); const result = await api('package-export', { rendererValues, includeVideos: state.includeVideos }); if (result) feedback(`${result.count} çalışma dosyası, ${result.videos || 0} video ve kayıtlı düzenlemeler paketlendi.`); }),
      button('Geri yüklenecek paketi seç', async () => { const result = await api('package-preview'); if (result) { state.packageData = result; render(); } }));
    const include = $('label', 'mc-check'), checkbox = $('input'); checkbox.type = 'checkbox'; checkbox.checked = state.includeVideos; checkbox.disabled = state.busy;
    checkbox.addEventListener('change', () => { state.includeVideos = checkbox.checked; }); include.append(checkbox, $('span', '', 'Katalogdaki yerel videoları da pakete ekle')); body.insertBefore(include, body.children[3]);
    if (state.packageData) body.append($('p', 'mc-danger-note', `${state.packageData.count} çalışma dosyası ve ${state.packageData.videos || 0} video geri yüklenecek. Paketteki kayıtlar mevcut kayıtların yerini alır. Mevcut durum ayrıca yedeklenir. Uygulama yeniden başlayacak; açık işleri önce bitirin.`),
      button('Vazgeç', () => { state.packageData = null; render(); }), button('Geri yükle ve yeniden başlat', async () => { await api('package-apply', { token: state.packageData.token }); }, 'mc-danger'));
    return body;
  }
  function render() {
    if (!dialog.open) return;
    const viewKey = `${state.mode}:${state.mode === 'list' ? '' : state.selected || ''}:${state.section}`;
    const changedView = state.renderedView !== viewKey;
    state.listScroll ||= new Map();
    if (changedView && state.renderedView?.startsWith('list:')) state.listScroll.set(state.renderedView, dialog.scrollTop);
    state.renderedView = viewKey;
    // Yeniden çizim odaklı düğümü öldürmesin: sırasını kaydet, sonra aynı
    // konumdaki elemana geri ver (modal içinde odak BODY'ye düşüyordu).
    const FOCUSABLES = 'button, input, select, textarea, a[href], [tabindex]';
    const focusIdx = [...root.querySelectorAll(FOCUSABLES)].indexOf(document.activeElement);
    root.replaceChildren(renderHeader(), renderNav());
    if (state.message) { const message = $('p', state.error ? 'mc-feedback mc-error' : 'mc-feedback', state.message); message.setAttribute('role', state.error ? 'alert' : 'status'); root.append(message); }
    root.append(state.mode === 'metadata' ? renderMetadata() : state.mode === 'package' ? renderPackage() : state.mode === 'detail' ? renderDetail() : state.mode === 'form' ? renderForm() : state.mode === 'episode' ? renderEpisodeForm() : state.mode === 'import' ? renderImport() : renderList());
    if (focusIdx >= 0) {
      const next = root.querySelectorAll(FOCUSABLES)[focusIdx] || root.querySelector('.mc-close');
      next?.focus();
    } else if (!root.contains(document.activeElement)) {
      // Modal açıkken odak diyalog dışına kaçtıysa (BODY vb.) ilk odaklanabilir
      // elemana geri al — klavye kullanıcısı modal içinde kalmalı.
      root.querySelector('.mc-close')?.focus();
    }
    root.setAttribute('aria-busy', state.busy ? 'true' : 'false');
    if (changedView) dialog.scrollTop = state.mode === 'list' ? state.listScroll.get(viewKey) || 0 : 0;
  }
  for (const openButton of openButtons) openButton.addEventListener('click', async () => {
    if (dialog.open) return;
    state.session++; state.busy = false; state.opener = openButton;
    dialog.showModal(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion();
    state.mode = 'list'; state.message = ''; render(); root.querySelector('.mc-close')?.focus(); await reload();
  });
  document.addEventListener('ui-locale-change', () => { if (dialog.open) render(); });
  dialog.addEventListener('close', () => { if (dialog.open) return; state.session++; state.busy = false; if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); posterObserver.disconnect(); state.credential = ''; cancelImport(); cancelPreviewTokens(); state.mode = 'list'; state.selected = null; state.removeId = null; state.opener?.focus(); });
  dialog.addEventListener('keydown', event => { event.stopPropagation(); });
})();
