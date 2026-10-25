(() => {
  'use strict';
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = String(text); return node; };
  const state = { root: null, tab: 'browse', kind: 'film', mode: 'top', genre: '', year: new Date().getFullYear(), query: '', rows: [], skip: 0, next: null, request: 0, busy: false };
  const btn = (label, callback, cls = 'mh-action') => {
    const node = el('button', cls, label); node.type = 'button';
    node.addEventListener('click', () => Promise.resolve().then(callback).catch(error => status(error.message, true))); return node;
  };
  async function api(action, input = {}) {
    const result = await window.api.mediaDiscovery({ action, ...input });
    if (!result?.ok) throw Error(result?.error || t('Discovery could not be loaded.', 'Keşfet yüklenemedi.'));
    return result;
  }
  function status(message, error = false) {
    const node = state.root?.querySelector('.md-status');
    if (node) { node.textContent = message; node.classList.toggle('mh-error', error); }
  }
  function safeImage(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && ['images.metahub.space', 'image.tmdb.org'].includes(url.hostname) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function image(value, cls = '') {
    const node = el('div', cls), src = safeImage(value);
    node.dataset.placeholder = t('No poster', 'Afiş yok');
    if (src) { const img = el('img'); img.src = src; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.width = 300; img.height = 450; img.addEventListener('error', () => { img.remove(); node.classList.add('md-art-empty'); }, { once: true }); node.append(img); }
    else node.classList.add('md-art-empty');
    return node;
  }
  async function details(row) {
    let translationToken = null;
    const dialog = el('dialog', 'md-detail media-surface'); dialog.dataset.uiUntranslated = ''; dialog.setAttribute('aria-label', row.title);
    const close = btn('×', () => dialog.close(), 'md-close'); close.setAttribute('aria-label', t('Close details', 'Ayrıntıları kapat'));
    const placeholder = el('p', 'md-status', t('Loading details…', 'Ayrıntılar yükleniyor…')); placeholder.setAttribute('role', 'status'); dialog.append(close, placeholder);
    const opener = document.activeElement; document.body.append(dialog); dialog.showModal(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion();
    dialog.addEventListener('close', () => { if(translationToken)void window.api.mediaDiscovery({action:'synopsis-stop',kind:row.kind,id:row.providerId,token:translationToken}).catch(()=>{});dialog.remove(); opener?.isConnected && opener.focus(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); }, { once: true });
    let result;
    try { result = await api('detail', { kind: row.kind, id: row.providerId }); }
    catch (error) { if (dialog.open) placeholder.textContent = `${t('Could not load details: ', 'Ayrıntılar alınamadı: ')}${error.message}`; return; }
    if (!dialog.open) return;
    const item = result.item, body = el('div', 'md-detail-body'), content = el('div', 'md-detail-copy');
    window.MediaExperience?.setContext(dialog, { id: item.providerId, type: 'discovery-title', title: item.title, synopsis: item.synopsis });
    content.append(el('h2', '', item.title), el('p', 'md-meta', [item.year, item.rating ? `IMDb ${item.rating}/10` : '', item.runtime ? `${item.runtime} ${t('min', 'dk')}` : '', item.kind === 'series' ? t('Series', 'Dizi') : t('Film', 'Film')].filter(Boolean).join(' · ')));
    const genres = el('div', 'md-chips'); item.genres.forEach(genre => genres.append(el('span', '', genre))); content.append(genres);
    const storyHeading=el('div','md-story-heading'),synopsis=el('p','md-synopsis',item.synopsis||t('No synopsis is available for this title.','Bu yapımın açıklaması henüz yok.'));
    storyHeading.append(el('h3','',t('Story','Konu')));
    if(item.synopsis){let translated='',showOriginal=false;const translate=btn(t('Translate to Turkish','Türkçeye çevir'),async()=>{
      if(translated){showOriginal=!showOriginal;synopsis.textContent=showOriginal?item.synopsis:translated;translate.textContent=showOriginal?t('Show Turkish','Türkçesini göster'):t('Show original','Özgününü göster');return;}
      translate.disabled=true;translationToken=crypto.randomUUID();const token=translationToken;placeholder.textContent=t('Translating the story…','Konu çevriliyor…');
      try{const r=await window.api.mediaDiscovery({action:'synopsis-translate',kind:row.kind,id:row.providerId,token});if(!dialog.open||translationToken!==token)return;if(!r?.ok)throw Error(r?.error||t('Translation stopped.','Çeviri durduruldu.'));translated=r.item.synopsisTr;synopsis.textContent=translated;translate.textContent=t('Show original','Özgününü göster');placeholder.textContent=t('Turkish · AI translation','Türkçe · AI çevirisi');}
      catch(error){if(dialog.open)placeholder.textContent=error.message;}
      finally{if(translationToken===token)translationToken=null;if(dialog.open)translate.disabled=false;}
    });translate.dataset.discoveryAction='translate';storyHeading.append(translate);}
    content.append(storyHeading,synopsis);
    if (item.cast.length) content.append(el('p', 'md-cast', `${t('Cast', 'Oyuncular')}: ${item.cast.join(', ')}`));
    const actions = el('div', 'mh-actions');
    for (const [value, label] of [['watched', t('Already watched', 'İzledim')], ['hidden', t('Not interested', 'İlgilenmiyorum')], ['none', t('Undo preference', 'Tercihi geri al')]]) {
      if (value === 'none' && !row.feedback) continue;
      actions.append(btn(label, async () => {
        await api('feedback', { id: row.providerId, kind: row.kind, title: row.title, state: value });
        state.rows = state.rows.filter(item => item.providerId !== row.providerId || item.kind !== row.kind);
        dialog.close(); cards(); status(t('Preference saved. Undo it in Preferences.', 'Tercih kaydedildi. Tercihler bölümünden geri alabilirsin.'));
      }));
    }
    const add = btn(result.catalogId ? t('Open in library', 'Kütüphanede aç') : t('Add to watchlist', 'İzleneceklere ekle'), async () => {
      add.disabled = true;
      try {
        const catalogId = result.catalogId || (await api('add', { kind: item.kind, id: item.providerId })).item.id;
        result.catalogId = catalogId; dialog.close();
        document.dispatchEvent(new CustomEvent('media-library-changed'));
        await window.MediaTitleUI.open(catalogId);
      } catch (error) { placeholder.textContent = error.message; add.disabled = false; }
    }, 'mh-action mh-primary');
    actions.append(add, btn(t('IMDb page', 'IMDb sayfası'), async () => {
      dialog.close(); document.getElementById('openPlayer').click();
      document.getElementById('browserAddress').value = `https://www.imdb.com/title/${item.providerId}/`;
      await navigateBrowserFromAddress();
    }));
    const reviews=btn(t('Letterboxd reviews & analysis','Letterboxd yorumları ve analiz'),async()=>{
      reviews.disabled=true;
      try{const saved=await api('add',{kind:item.kind,id:item.providerId});if(!dialog.open)return;result.catalogId=saved.item.id;document.dispatchEvent(new Event('media-library-changed'));await window.MediaToolsUI.open('decision',saved.item);}
      catch(error){if(dialog.open)placeholder.textContent=error.message;}
      finally{if(dialog.open)reviews.disabled=false;}
    });reviews.dataset.discoveryAction='reviews';actions.append(reviews);
    content.append(el('small','md-provider',t('Review analysis saves this title to your watchlist and opens the Letterboxd import tools. No video is downloaded.','Yorum analizi yapımı izleneceklere kaydeder ve Letterboxd yorum alma araçlarını açar. Video indirilmez.')));
    content.append(actions, el('p', 'md-provider', t('Metadata: Cinemeta / IMDb. Adding a title does not download a video.', 'Yapım bilgileri: Cinemeta / IMDb. Kütüphaneye eklemek video indirmez.')));
    placeholder.textContent = ''; body.append(image(item.poster || row.poster, 'md-detail-poster'), content); dialog.append(body);
  }
  function cards() {
    const grid = state.root?.querySelector('.md-grid'); if (!grid) return;
    grid.replaceChildren();
    for (const row of state.rows) {
      const card = btn('', () => details(row), 'mh-card md-card'); card.dataset.discoveryId = row.providerId;
      card.append(image(row.poster, 'mh-art'), el('span', 'mh-card-title', row.title),
        el('span', 'mh-card-meta', [row.year, row.rating ? `★ ${row.rating}` : '', row.catalogId ? t('In library', 'Kütüphanede') : ''].filter(Boolean).join(' · ')));
      if (row.because) card.append(el('span', 'md-reason', t(`Because you liked ${row.because}`, `${row.because} beğeninden dolayı`)));
      if(row.profileBecause){const r=row.profileBecause;card.append(el('span','md-reason',t(`${r.genre} · ${r.count} ratings, ${r.average.toFixed(1)}/5`,`${r.genre} · ${r.count} puan, ${r.average.toFixed(1)}/5`)));}
      if (row.feedback) card.append(el('span','md-reason', row.feedback === 'watched' ? t('Watched','İzlendi') : t('Not interested','İlgilenilmiyor')));
      grid.append(card);
    }
    if (!state.rows.length && !state.busy) grid.append(el('p', 'mh-empty', state.tab === 'preferences' ? t('No hidden or watched preferences. You can undo preferences here.', 'Gizlenen veya izlenen tercihi yok. Tercihlerini buradan geri alabilirsin.') : state.tab === 'personal'
      ? t('Mark favorite titles with genres in your library to get explained recommendations.', 'Gerekçeli öneriler için kütüphanende türleri bulunan yapımları favorile.')
      : t('No titles matched these filters.', 'Bu filtrelerle eşleşen yapım yok.')));
    const more = state.root.querySelector('.md-more'); more.hidden = state.tab !== 'browse' || state.next === null || state.rows.length >= 300; more.disabled = state.busy;
    state.root.querySelectorAll('[data-discovery-control]').forEach(node => { node.disabled = state.busy; });
  }
  async function load(append = false) {
    const root = state.root, request = ++state.request;
    if (!root?.isConnected) return;
    state.busy = true; status(t('Loading titles…', 'Yapımlar yükleniyor…')); cards();
    try {
      const result = await api(state.tab === 'preferences' ? 'feedback-list' : state.tab === 'personal' ? 'personal' : 'list', { kind: state.kind, mode: state.mode, genre: state.genre, year: state.year, query: state.query, skip: append ? state.next : 0 });
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      const unique = new Map((append ? state.rows : []).map(row => [`${row.kind}:${row.providerId}`, row]));
      result.rows.forEach(row => unique.set(`${row.kind}:${row.providerId}`, row)); state.rows = [...unique.values()].slice(0, 300); state.next = result.nextSkip ?? null;
      status(result.needsRatings ? t('Add favorites and genre metadata in the library first.', 'Önce kütüphanede favori ve tür bilgisi ekle.') : '');
    } catch (error) {
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      status(t(`Could not refresh discovery. ${error.message} Use Retry; your library is unchanged.`, `Keşfet yenilenemedi. ${error.message} Yeniden dene; kütüphanen değişmedi.`), true);
    } finally { if (request === state.request && root === state.root && root.isConnected) { state.busy = false; cards(); } }
  }
  function draw() {
    const root = state.root; root.replaceChildren();
    root.setAttribute('aria-label', t('Discover', 'Keşfet'));
    const tabs = el('div', 'md-tabs'); tabs.setAttribute('aria-label', t('Discovery section', 'Keşfet bölümü'));
    for (const [value, label] of [['browse', t('New & popular', 'Yeni ve popüler')], ['personal', t('For you', 'Sana özel')], ['preferences', t('Preferences', 'Tercihler')]]) {
      const node = btn(label, () => { state.tab = value; state.rows = []; state.next = null; draw(); void load(); }, 'md-tab'); node.setAttribute('aria-pressed', String(value === state.tab)); tabs.append(node);
    }
    root.append(tabs);
    const filters = el('form', 'md-filters');
    function select(label, value, options, update) {
      const wrap = el('label', 'md-field'), input = el('select'); wrap.append(el('span', '', label)); input.dataset.discoveryControl = '1';
      for (const [key, title] of options) { const option = el('option', '', title); option.value = key; input.append(option); } input.value = value;
      input.addEventListener('change', () => { update(input.value); state.rows = []; draw(); void load(); }); wrap.append(input); return wrap;
    }
    filters.append(select(t('Type', 'Yapım'), state.kind, [['film', t('Films', 'Filmler')], ['series', t('Series', 'Diziler')]], value => { state.kind = value; }));
    if (state.tab === 'browse') {
      filters.append(select(t('Show', 'Liste'), state.mode, [['top', t('Popular', 'Popüler')], ['year', t('New by year', 'Yıla göre yeni')], ['imdbRating', t('Highly rated', 'Yüksek puanlı')]], value => { state.mode = value; if (value !== 'top') state.query = ''; }));
      const genres = [['', t('All genres', 'Tüm türler')], ['Action', t('Action', 'Aksiyon')], ['Adventure', t('Adventure', 'Macera')], ['Animation', t('Animation', 'Animasyon')], ['Comedy', t('Comedy', 'Komedi')], ['Crime', t('Crime', 'Suç')], ['Documentary', t('Documentary', 'Belgesel')], ['Drama', t('Drama', 'Dram')], ['Fantasy', t('Fantasy', 'Fantastik')], ['Horror', t('Horror', 'Korku')], ['Mystery', t('Mystery', 'Gizem')], ['Romance', t('Romance', 'Romantik')], ['Sci-Fi', t('Sci-Fi', 'Bilim kurgu')], ['Thriller', t('Thriller', 'Gerilim')], ['War', t('War', 'Savaş')]];
      if (state.mode !== 'year') filters.append(select(t('Genre', 'Tür'), state.genre, genres, value => { state.genre = value; }));
      else filters.append(select(t('Year', 'Yıl'), String(state.year), Array.from({ length: 70 }, (_, index) => { const year = new Date().getFullYear() - index; return [String(year), String(year)]; }), value => { state.year = +value; }));
      const searchLabel = el('label', 'md-field md-search'); searchLabel.append(el('span', '', t('Search', 'Ara'))); const search = el('input'); search.type = 'search'; search.maxLength = 200; search.placeholder = t('Film or series title…', 'Film veya dizi adı…'); search.value = state.query; search.name = 'discoverySearch'; search.autocomplete = 'off'; searchLabel.append(search); filters.append(searchLabel);
      filters.addEventListener('submit', event => { event.preventDefault(); state.query = search.value.trim(); state.mode = 'top'; state.rows = []; draw(); void load(); });
      const submit = el('button', 'mh-action mh-primary', t('Search', 'Ara')); submit.type = 'submit'; submit.dataset.discoveryControl = '1'; filters.append(submit);
    } else filters.addEventListener('submit', event => event.preventDefault());
    root.append(filters);
    const statusNode = el('p', 'md-status'); statusNode.setAttribute('role', 'status'); const grid = el('div', 'md-grid');
    const footer = el('div', 'md-footer'); footer.append(btn(t('Show more', 'Daha fazla göster'), () => load(true), 'mh-action md-more'), btn(t('Retry', 'Yeniden dene'), () => load(false), 'mh-text-button'), el('p', 'md-provider', t('Catalog: Cinemeta, the official Stremio movie & series catalog. No account or API key required.', 'Katalog: Cinemeta, resmî Stremio film ve dizi kataloğu. Hesap veya API anahtarı gerekmez.')));
    root.append(statusNode, grid, footer); cards();
  }
  let savedScroll = 0, restoringScroll = false;
  const leave = () => { if (state.root?.isConnected) savedScroll = document.getElementById('mediaHome').scrollTop; state.root = null; };
  document.getElementById('mediaHome')?.addEventListener('scroll', () => { if (!restoringScroll && state.root?.isConnected) savedScroll = document.getElementById('mediaHome').scrollTop; }, { passive:true });
  window.MediaDiscoveryUI = Object.freeze({ leave, mount(root) {
    const targetScroll = savedScroll; restoringScroll = true;
    const hadRows = state.rows.length > 0 && !state.busy; state.root = root; state.busy = false; draw();
    requestAnimationFrame(() => { if (root === state.root && root.isConnected && hadRows) document.getElementById('mediaHome').scrollTop = targetScroll; requestAnimationFrame(() => { restoringScroll = false; }); });
    if (!hadRows) void load();
  } });
})();
