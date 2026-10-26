(() => {
  'use strict';
  const host = document.getElementById('mediaHome');
  const model = window.MediaHomeModel;
  if (!host || !model || !window.api) return; // A failed shell must leave the studio usable.
  const layer = document.getElementById('playerLayer');
  const state = { page: 'home', query: '', filter: 'all', limit: 48, active: true,
    data: model.snapshot([], []), request: 0, render: 0, busy: false, loaded: false, error: '', featuredKey: '' };
  let virtualDisposers=[];
  const english = () => window.UiLocale?.get?.() !== 'tr';
  const t = (en, tr) => english() ? en : tr;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const icon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M8 11h32v26H8z M16 11v26 M32 11v26 M8 19h8 M8 29h8 M32 19h8 M32 29h8 M22 20l7 4-7 4z');
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.4');
    svg.append(path); return svg;
  };
  const button = (label, callback, cls = 'mh-action') => {
    const node = el('button', cls, label); node.type = 'button';
    node.addEventListener('click', () => void perform(callback)); return node;
  };
  function report(message = '', error = false) {
    const node = document.getElementById('mhStatus');
    if (node) { node.textContent = message; node.classList.toggle('mh-error', error); }
  }
  async function perform(callback) {
    try { await callback(); }
    catch (error) { report(error?.message || t('Could not open this item.', 'Bu öğe açılamadı.'), true); }
  }
  const click = id => {
    const control = document.getElementById(id);
    if (!control) throw new Error(t('This tool is unavailable.', 'Bu araç kullanılamıyor.'));
    control.click();
  };
  function setHome(active) {
    state.active = active;
    document.body.classList.toggle('media-home-active', active);
    host.classList.toggle('hidden', !active);
    syncLayer();
    if (active) { void refresh(); document.getElementById('mhHome')?.focus(); }
    else document.getElementById('openPlayer')?.focus();
  }
  let returningHome=false,resuming=false,parked=null;
  async function returnHome() {
    if(returningHome)return;returningHome=true;
    try{
      if(layer && !layer.classList.contains('hidden')){
        const intent=++player.openIntent;
        const mode=player.workspaceMode,key=player.mediaKey,tabId=player.browserActiveTabId;
        if(mode==='browser'&&tabId)await browserCommand('pause',undefined,tabId);
        if(intent!==player.openIntent)return;
        document.getElementById('playerVideo')?.pause();
        const voice=window.BrowserDubAudioUI?.snapshot();
        await window.BrowserDubAudioUI?.stop();
        if(intent!==player.openIntent)return;
        if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
        if(document.pictureInPictureElement)await document.exitPictureInPicture().catch(()=>{});
        await flushWatchState(false,true);
        if(intent!==player.openIntent)return;
        closeBrowserFind(false);closeBrowserTransientPanels();
        await window.api.hideBrowser();
        if(intent!==player.openIntent)return;
        disconnectBrowserBoundsObserver();
        parked={mode,key,tabId,title:document.getElementById('playerTitle')?.textContent||t('Open workspace','Açık çalışma alanı'),
          position:mode==='browser'?player.browserTime:document.getElementById('playerVideo').currentTime,
          subtitle:mode==='browser'?player.browserTracks?.length>0:player.cues?.length>0,
          voice};
        layer.classList.add('hidden');
      }
      if(state.page==='discover')window.MediaDiscoveryUI?.leave();
      state.page='home';state.query='';renderShell();setHome(true);
    }finally{returningHome=false;}
  }
  async function resumeWorkspace(){
    if(!parked)return;
    const target=parked;
    if(target.key!==player.mediaKey||(target.mode==='browser'&&target.tabId!==player.browserActiveTabId)){parked=null;renderContent();return;}
    if(resuming)return;resuming=true;
    try{
      layer.classList.remove('hidden');setWorkspaceMode(target.mode,false);
      document.getElementById('playerTitle').textContent=target.title;
      if(target.voice)await window.BrowserDubAudioUI?.restore(target.voice,target.key);
      if(target.mode!=='browser')document.getElementById('playerBack')?.focus();
    }finally{resuming=false;}
    // Explicit return restores the workspace; playback remains paused until Play.
  }
  let wasPlayerOpen = !layer?.classList.contains('hidden');
  function syncLayer() {
    const open = !!layer && !layer.classList.contains('hidden');
    host.inert = !state.active || open;
    host.setAttribute('aria-hidden', String(!state.active || open));
    if (wasPlayerOpen && !open && state.active) {
      // closePlayer flushes history asynchronously. Reload once it has settled.
      clearTimeout(refreshTimer); refreshTimer = setTimeout(() => {
        void refresh(); document.getElementById('mhHome')?.focus();
      }, 400);
    }
    wasPlayerOpen = open;
  }
  let refreshTimer;
  new MutationObserver(syncLayer).observe(layer, { attributes: true, attributeFilter: ['class'] });
  function openBrowser() { click('openPlayer'); }
  function openStudio() { setHome(false); }
  async function catalog(options = {}) {
    if (!window.MediaCatalogUI?.open) throw new Error(t('Library is unavailable.', 'Kütüphane kullanılamıyor.'));
    await window.MediaCatalogUI.open({ ...options, opener: document.activeElement });
  }
  async function playWatch(item) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (typeof openWatchLibraryItem !== 'function') throw new Error(t('Player is unavailable.', 'Oynatıcı kullanılamıyor.'));
      if (typeof flushWatchState === 'function') await flushWatchState(false, false);
      await openWatchLibraryItem(item, item.completed ? 0 : model.progress(item).position);
      if (layer.classList.contains('hidden')) throw new Error(t('The file could not be opened. Open the library to re-link it.', 'Dosya açılamadı. Yeniden bağlamak için kütüphaneyi açın.'));
    } finally { state.busy = false; }
  }
  async function playCatalog(item) {
    if (state.busy) return;
    if (item.kind === 'series' || !item.source) { await catalog({ id: item.id }); return; }
    state.busy = true;
    try {
      const result = await window.api.mediaCatalog({ action: 'play', id: item.id });
      if (result?.canceled) return;
      if (!result?.ok || !result.watchItem) throw new Error(result?.error || t('Could not open this media.', 'Medya açılamadı.'));
      await window.openMediaCatalogPlayback(result.watchItem);
    } finally { state.busy = false; }
  }
  const play = item => item.key ? playWatch(item) : playCatalog(item);
  const minutes = value => {
    const seconds = Math.floor(Math.max(0, Number(value) || 0));
    return seconds < 60 ? `0:${String(seconds).padStart(2, '0')}` : `${Math.floor(seconds / 60)} ${t('min', 'dk')}`;
  };
  function progress(item) {
    const p = model.progress(item), bar = el('progress', 'mh-progress');
    bar.max = 100; bar.value = p.percent;
    bar.setAttribute('aria-label', t('Watch progress', 'İzleme ilerlemesi'));
    return bar;
  }
  let posterQueue = [], posterActive = 0;
  const posters = new Map();
  const safePoster = value => typeof value === 'string' && value.length < 8_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
  function pumpPosters() {
    while (posterActive < 3 && posterQueue.length) {
      const task = posterQueue.shift();
      if (!task.node.isConnected || task.generation !== state.render) continue;
      posterActive++;
      const cached = posters.get(task.id);
      Promise.resolve(cached || window.api.mediaCatalog({ action: 'poster', id: task.id }))
        .then(result => {
          if (!safePoster(result?.image)) return;
          posters.set(task.id, result);
          while (posters.size > 80) posters.delete(posters.keys().next().value);
          if (!task.node.isConnected || task.generation !== state.render) return;
          const image = el('img'); image.src = result.image; image.alt = ''; image.loading = 'lazy';
          task.node.replaceChildren(image);
        }).catch(() => {}).finally(() => { posterActive--; pumpPosters(); });
    }
  }
  const posterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      posterObserver.unobserve(entry.target);
      posterQueue.push({ node: entry.target, id: entry.target.dataset.homePoster, generation: state.render });
    }
    pumpPosters();
  }, { rootMargin: '180px' });
  function art(item, cls) {
    const node = el('div', cls); node.append(icon());
    if (item?.hasPoster && item.id) {
      node.dataset.homePoster = item.id;
      queueMicrotask(() => { if (node.isConnected) posterObserver.observe(node); });
    } else {
      const src = model.thumbnail(item);
      if (src) {
        const image = el('img', 'mh-remote-thumbnail'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.onload = () => { if (node.isConnected) node.replaceChildren(image); };
        image.onerror = () => image.remove(); node.append(image); image.src = src;
      }
    }
    return node;
  }
  function card(item) {
    const node = button('', () => item.key ? playWatch(item) : window.MediaTitleUI.open(item.id), 'mh-card');
    node.dispose=()=>node.querySelectorAll('[data-home-poster]').forEach(image=>posterObserver.unobserve(image));
    node.dataset.homeItem = item.key || item.id;
    node.title = String(item.title || t('Untitled', 'Başlıksız'));
    node.append(art(item, 'mh-art'), el('span', 'mh-card-title', node.title));
    const p = model.progress(item);
    const kind = item.key ? (model.medium(item) === 'web' ? 'Web' : model.medium(item) === 'music' ? t('Audio', 'Ses') : t('Video', 'Video')) : item.kind === 'series' ? t('Series', 'Dizi') : t('Film', 'Film');
    node.append(el('span', 'mh-card-meta', [item.year, kind, p.position ? `${minutes(p.position)} / ${p.duration ? minutes(p.duration) : '—'}` : ''].filter(Boolean).join(' · ')));
    if (p.position && p.duration) node.append(progress(item));
    return node;
  }
  function section(title, rows, options = {}) {
    const node = el('section', 'mh-section'), heading = el('div', 'mh-section-head');
    heading.append(el('h2', '', title));
    if (options.more) heading.append(button(t('View all', 'Tümünü gör'), options.more, 'mh-text-button'));
    const grid = el('div', options.grid ? 'mh-grid' : `mh-rail${options.wide ? ' mh-wide' : ''}`);
    if(options.grid&&rows.length>100&&window.MediaVirtualGrid){queueMicrotask(()=>{if(grid.isConnected)virtualDisposers.push(window.MediaVirtualGrid.mount(grid,rows,card,host));});}
    else rows.slice(0, options.grid ? state.limit : 12).forEach(item => grid.append(card(item)));
    node.append(heading, grid);
    if (!rows.length) node.append(el('p', 'mh-empty', t('No matching items yet.', 'Henüz eşleşen öğe yok.')));
    if (options.grid && rows.length > state.limit && rows.length<=100) node.append(button(t('Show more', 'Daha fazla göster'), () => { state.limit += 48; renderContent(); }));
    return node;
  }
  function tool(title, description, label, callback) {
    const node = el('section', 'mh-tool');
    node.append(el('h3', '', title), el('p', '', description), button(label, callback)); return node;
  }
  function tools() {
    const node = el('div', 'mh-tools');
    node.append(
      tool(t('Watch with your voice', 'Kendi sesinle izle'), t('Translate subtitles for speech and create a synchronized dub.', 'Altyazıyı konuşmaya uygun çevir, senkron dublaj üret.'), t('Subtitle → voice', 'Altyazı → ses'), () => click('dubMainOpen')),
      tool(t('Whisper studio', 'Whisper stüdyosu'), t('Transcribe a file or YouTube video. Keep your current settings and queue.', 'Dosya veya YouTube videosundan altyazı çıkar. Mevcut ayarların ve kuyruğun korunur.'), t('Open studio', 'Stüdyoyu aç'), openStudio),
      tool(t('Text and voice', 'Metin ve ses'), t('Read your text with a saved or local reference voice.', 'Metnini kayıtlı veya yerel referans sesle okut.'), t('Open voice studio', 'Ses stüdyosunu aç'), async () => {
        const result = await window.api.openTextVoiceUI();
        if (result?.ok === false) throw new Error(result.error || t('Voice studio could not be opened.', 'Ses stüdyosu açılamadı.'));
      }));
    return node;
  }
  function page(value) {
    const changed = state.page !== value;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    state.page = value; state.limit = 48; state.filter = 'all';
    host.dataset.page = value;
    host.scrollTop = 0;
    host.querySelectorAll('[data-home-page]').forEach(node => node.setAttribute('aria-current', node.dataset.homePage === value ? 'page' : 'false'));
    host.querySelectorAll('[data-home-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.homeMode === (['music', 'radio'].includes(value) ? 'music' : value === 'books' ? 'books' : 'film'))));
    renderContent();
    if (changed) window.UiMotion?.reveal(document.getElementById('mhContent'), 'page');
  }
  function renderContent() {
    const content = document.getElementById('mhContent'); if (!content) return;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    const focusKey = content.contains(document.activeElement) ? document.activeElement?.dataset.homeItem : null;
    virtualDisposers.forEach(dispose=>dispose());virtualDisposers=[];
    state.render++; posterQueue = []; posterObserver.disconnect();
    content.replaceChildren();
    if(parked&&(parked.key!==player.mediaKey||(parked.mode==='browser'&&parked.tabId!==player.browserActiveTabId)))parked=null;
    const status = el('p', 'mh-status'); status.id = 'mhStatus'; status.setAttribute('role', 'status'); content.append(status);
    if (state.error) report(state.error, true);
    else if (!state.loaded) report(t('Loading your library…', 'Kütüphanen yükleniyor…'));
    if(parked && state.page === 'home'){
      const session=el('section','mh-session');session.id='mhOpenSession';
      const text=el('div');text.append(el('small','',t('Open session · paused','Açık oturum · duraklatıldı')),el('strong','',parked.title),el('p','',[
        parked.mode==='browser'?'Browser':t('Player','Oynatıcı'),Number.isFinite(parked.position)?minutes(parked.position):'',parked.subtitle?t('Subtitles ready','Altyazı hazır'):'',parked.voice?t('Voice attached','Dublaj bağlı'):''].filter(Boolean).join(' · ')));
      const actions=el('div','mh-session-actions');const back=button(t('Return to session','Oturuma dön'),resumeWorkspace,'mh-action mh-primary');back.id='mhResumeWorkspace';
      actions.append(back,button(t('Voice preparation','Ses hazırlığı'),async()=>{await resumeWorkspace();if(!layer.classList.contains('hidden'))await window.MediaExperience?.openVoice();}));session.append(text,actions);content.append(session);
    }
    const { items, watch, continuing } = state.data;
    const filter = rows => rows.filter(item => model.matches(item, state.query));
    if (state.page === 'home' && !state.query) {
      const candidates = continuing.length ? continuing : items.filter(item => item.source);
      if (!candidates.length && items[0]) candidates.push(items[0]);
      const keyOf = item => item?.key || item?.id || '';
      let featuredIndex = candidates.findIndex(item => keyOf(item) === state.featuredKey);
      if (featuredIndex < 0) featuredIndex = Math.max(0, candidates.findIndex(item => model.medium(item) === 'video'));
      const hero = el('section', 'mh-hero'), copy = el('div', 'mh-hero-copy');
      const controls = el('div', 'mh-hero-navigation');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', t('Continue watching carousel', 'Kaldığın yerden gezinme'));
      const count = el('output', 'mh-hero-count'); count.setAttribute('aria-live', 'polite');
      function arrow(label, direction) {
        const node = button('', () => { featuredIndex = (featuredIndex + direction + candidates.length) % candidates.length; drawFeatured(); node.focus({preventScroll:true}); }, 'mh-hero-arrow');
        node.setAttribute('aria-label', label); node.title = label;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
        const path = document.createElementNS(svg.namespaceURI,'path');
        path.setAttribute('d', direction < 0 ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'); svg.append(path); node.append(svg); return node;
      }
      controls.append(arrow(t('Previous title', 'Önceki içerik'), -1), count, arrow(t('Next title', 'Sonraki içerik'), 1));
      controls.hidden = candidates.length < 2;
      function drawFeatured() {
        const featured = candidates[featuredIndex]; state.featuredKey = keyOf(featured);
        window.UiMotion?.reveal(copy, 'section'); copy.replaceChildren(); hero.querySelectorAll('[data-home-poster]').forEach(node => posterObserver.unobserve(node));
        hero.classList.toggle('mh-empty-hero', !featured);
        copy.append(el('span', 'mh-hero-meta', featured ? t('Ready when you are', 'Kaldığın yerden') : t('Your media, your voice', 'Videoların, senin sesin')),
          el('h1', '', featured?.title || t('Your media library starts here.', 'Medya kütüphaneni oluştur.')),
          el('p', '', featured ? (featured.synopsis || (model.progress(featured).position ? t(`Continue from ${minutes(model.progress(featured).position)}. Subtitles and voice tools are ready in the player.`, `${minutes(model.progress(featured).position)} konumundan devam et. Altyazı ve ses araçların oynatıcıda hazır.`) : t('Open this title from your library.', 'Kütüphanendeki bu yapımı aç.'))) : t('Your films, series and listening, together. Add your media or open a video in the browser.', 'Filmlerin, dizilerin ve dinlediklerin bir arada. Medyanı ekle veya browserda bir video aç.')));
        const actions = el('div', 'mh-actions');
        actions.append(button(featured ? (model.progress(featured).resume ? t('Continue watching', 'İzlemeye devam et') : t('Open', 'Aç')) : t('Open a file', 'Dosya aç'), () => featured ? play(featured) : click('playerPickVideo'), 'mh-action mh-primary'),
          button(featured?.id ? t('Details', 'Ayrıntılar') : t('Add media folder', 'Medya klasörü ekle'), () => featured?.id ? window.MediaTitleUI.open(featured.id) : catalog({mode:'folder'})));
        copy.append(actions); if (featured && model.progress(featured).duration) copy.append(progress(featured));
        count.textContent = `${featuredIndex + 1} / ${candidates.length}`;
        hero.replaceChildren(copy, art(featured, 'mh-hero-art'), controls);
      }
      drawFeatured(); content.append(hero);
      if (continuing.length) content.append(section(t('Continue watching & listening', 'İzlemeye ve dinlemeye devam et'), continuing, { wide: true, more: () => page('recent') }));
      if (items.some(item => item.kind === 'series')) content.append(section(t('Your series', 'Dizilerin'), items.filter(item => item.kind === 'series'), { more: () => page('series') }));
      if (items.some(item => item.kind !== 'series')) content.append(section(t('Your films', 'Filmlerin'), items.filter(item => item.kind !== 'series'), { more: () => page('films') }));
      if (!items.length && state.loaded) content.append(tool(t('Build your library', 'Kütüphaneni oluştur'), t('Scan a folder, review the matches, then add films and series with their posters and progress.', 'Bir klasörü tara, eşleşmeleri incele; film ve dizilerini afişleri ve ilerlemeleriyle ekle.'), t('Manage library', 'Kütüphaneyi yönet'), () => catalog()));
      content.append(tools());
    } else if (state.page === 'discover' && window.MediaDiscoveryUI) {
      const discovery = el('section', 'md-page'); content.append(discovery); window.MediaDiscoveryUI.mount(discovery);
    } else if (['books', 'music', 'radio', 'taste'].includes(state.page) && window.MediaShelfUI) {
      const titles = { books: t('Books', 'Kitaplar'), music: t('Music', 'Müzik'), radio: t('Radio & podcasts', 'Radyo ve podcast'), taste: 'Letterboxd' };
      if(state.page!=='taste')content.append(el('h1', 'mh-page-title', titles[state.page]));
      const shelf = el('section', 'ms-shelf'); content.append(shelf); window.MediaShelfUI.mount(shelf, state.page, state.query);
    } else {
      const titles = { home: t('Search results', 'Arama sonuçları'), recent: t('Recently played', 'Son oynatılanlar'), films: t('Films', 'Filmler'), series: t('Series', 'Diziler'), music: t('Music & audio', 'Müzik ve ses'), web: t('Web videos', 'Web videoları'), books: t('Search results', 'Arama sonuçları') };
      const isHistory = ['recent', 'music', 'web'].includes(state.page);
      let rows = isHistory ? watch : items;
      if (state.page === 'films') rows = rows.filter(item => item.kind !== 'series');
      if (state.page === 'series') rows = rows.filter(item => item.kind === 'series');
      if (state.page === 'music') rows = rows.filter(item => model.medium(item) === 'music');
      if (state.page === 'web') rows = rows.filter(item => model.medium(item) === 'web');
      if (state.query && ['home', 'books'].includes(state.page)) rows = [...items, ...watch];
      if (state.filter === 'favorites') rows = rows.filter(item => item.favorite);
      if (state.filter === 'planned') rows = rows.filter(item => ['planned', 'watching'].includes(item.watchStatus));
      const controls = el('div', 'mh-filterbar');
      if (!isHistory) {
        const select = el('select'); select.setAttribute('aria-label', t('Library filter', 'Kütüphane filtresi'));
        [['all', t('All titles', 'Tüm yapımlar')], ['favorites', t('Favorites', 'Favoriler')], ['planned', t('Watchlist', 'İzlenecekler')]].forEach(([value, label]) => { const option = el('option', '', label); option.value = value; select.append(option); });
        select.value = state.filter; select.addEventListener('change', () => { state.filter = select.value; state.limit = 48; renderContent(); }); controls.append(select);
      }
      controls.append(button(t('Open a file', 'Dosya aç'), () => click('playerPickVideo')), button(t('Manage library', 'Kütüphaneyi yönet'), () => catalog()));
      content.append(controls, section(titles[state.page], filter(rows), { grid: true }));
      if (state.page === 'music') content.append(el('p', 'mh-empty', t('Local audio you play appears here. Playback uses your existing player and queue.', 'Oynattığın yerel sesler burada görünür. Mevcut oynatıcın ve kuyruğun kullanılır.')));
    }
    if (focusKey) [...content.querySelectorAll('[data-home-item]')].find(node => node.dataset.homeItem === focusKey)?.focus({ preventScroll: true });
  }
  function renderShell() {
    const focused = document.activeElement?.id;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    host.setAttribute('aria-label', t('Media home', 'Medya ana sayfası'));
    const back = document.getElementById('mediaHomeBack');
    if (back) back.textContent = t('Home', 'Ana sayfa');
    const browserHome=document.getElementById('browserMediaHome');
    if(browserHome){const label=t('Home','Ana sayfa');browserHome.querySelector('span').textContent=label;browserHome.setAttribute('aria-label',label);browserHome.title=t('Media home — your tabs stay open','Medya ana sayfası — sekmelerin açık kalır');}
    const menuHome=document.getElementById('browserMediaHomeMenuLabel');if(menuHome)menuHome.textContent=t('Home','Ana sayfa');
    const playerHome=document.getElementById('playerBack');if(playerHome){playerHome.querySelector('span').textContent=t('Home','Ana sayfa');playerHome.title=t('Media home — keep this session','Medya ana sayfası — oturumu koru');playerHome.setAttribute('aria-label',t('Home','Ana sayfa'));}
    host.replaceChildren(el('div', 'mh-titlebar'));
    const header = el('header', 'mh-header'), brand = el('div', 'mh-brand');
    brand.title = 'Whisper Browser'; brand.setAttribute('aria-label', 'Whisper Browser'); brand.append(icon());
    const modes = el('div', 'mh-modes'); modes.setAttribute('aria-label', t('Media type', 'Medya türü'));
    for (const [key, label, target] of [['film', t('Film', 'Film'), 'home'], ['music', t('Music', 'Müzik'), 'music'], ['books', t('Books', 'Kitaplar'), 'books']]) {
      const mode = button(label, () => page(target)); mode.dataset.homeMode = key;
      mode.setAttribute('aria-pressed', String(key === (['music', 'radio'].includes(state.page) ? 'music' : state.page === 'books' ? 'books' : 'film'))); modes.append(mode);
    }
    const actions = el('div', 'mh-actions');
    actions.append(button('Browser', openBrowser),button(t('Open media','Medya aç'),()=>window.MediaHubUI?.open(),'mh-action mh-primary'));
    const more=el('details','mh-more'),trigger=el('summary','mh-action',t('Tools','Araçlar'));more.append(trigger);const menu=el('div','mh-more-menu');
    for(const [label,run]of [[t('Production workspace','Üretim çalışma alanı'),()=>window.MediaWorkflowsUI.open()],[t('Studio','Stüdyo'),openStudio],[t('Subtitle → voice','Altyazı → ses'),()=>click('dubMainOpen')],[t('Tonight','Bu akşam'),()=>window.MediaToolsUI?.open('tonight')],[t('Library care','Arşiv bakımı'),()=>window.MediaToolsUI?.open('health')],[t('Activity','İşlemler'),()=>window.MediaExperience?.openTasks()]])menu.append(button(label,()=>{more.open=false;return run();}));more.append(menu);actions.append(more);
    const settings=button('',()=>window.AppSettingsUI.open());settings.id='mhSettings';settings.classList.add('mh-settings-icon');settings.title=t('Settings','Ayarlar');settings.setAttribute('aria-label',settings.title);
    const gear=document.createElementNS('http://www.w3.org/2000/svg','svg');gear.setAttribute('viewBox','0 0 24 24');gear.setAttribute('aria-hidden','true');gear.setAttribute('fill','none');gear.setAttribute('stroke','currentColor');gear.setAttribute('stroke-width','1.6');
    const outline=document.createElementNS(gear.namespaceURI,'path');let points=[];for(let i=0;i<32;i++){const angle=i*Math.PI/16-Math.PI/2,r=i%4===1||i%4===2?10:8;points.push((12+Math.cos(angle)*r).toFixed(2)+','+(12+Math.sin(angle)*r).toFixed(2));}outline.setAttribute('d','M'+points.join('L')+'Z');const center=document.createElementNS(gear.namespaceURI,'circle');center.setAttribute('cx','12');center.setAttribute('cy','12');center.setAttribute('r','3.2');gear.append(outline,center);settings.append(gear);actions.append(settings);
    const nav = el('nav', 'mh-nav'); nav.setAttribute('aria-label', t('Media navigation', 'Medya gezinmesi'));
    for (const [key, label] of [['home', t('Home', 'Ana sayfa')], ['discover', t('Discover', 'Keşfet')], ['films', t('Films', 'Filmler')], ['series', t('Series', 'Diziler')], ['radio', t('Radio / podcast', 'Radyo / podcast')], ['taste', t('Taste profile','Zevk profilim')], ['web', 'Web'], ['recent', t('Recent', 'Son oynatılanlar')]]) {
      const control = button(label, () => page(key)); control.dataset.homePage = key;
      control.setAttribute('aria-current', state.page === key ? 'page' : 'false'); if (key === 'home') control.id = 'mhHome'; nav.append(control);
    }
    const searchWrap = el('label', 'mh-search'), search = el('input'); search.type = 'search'; search.id = 'mhSearch'; search.maxLength = 200;
    search.placeholder = t('Search your library', 'Kütüphanende ara'); search.setAttribute('aria-label', search.placeholder); search.value = state.query;
    let searchTimer;
    search.addEventListener('input', () => { state.query = search.value; state.limit = 48; clearTimeout(searchTimer); searchTimer = setTimeout(renderContent, 120); });
    search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void window.MediaSearchUI.open(search.value);}});
    const searchAll=button('',()=>window.MediaSearchUI.open(search.value),'mh-search-all');searchAll.setAttribute('aria-label',t('Search all media sources','Tüm medya kaynaklarında ara'));searchAll.title=t('Search all sources · Enter','Tüm kaynaklarda ara · Enter');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0');svg.append(path);searchAll.append(svg);searchWrap.append(search,searchAll);nav.append(searchWrap);
    const content = el('main', 'mh-content'); content.id = 'mhContent';
    header.append(brand, modes, nav, actions); const metadata=el('div','mh-metadata');metadata.id='mhMetadataStatus';host.append(header,metadata, content);drawMetadata(metadata);renderContent();
    if (focused && host.querySelector(`#${focused}`)) document.getElementById(focused).focus();
  }
  async function refresh({metadata=true}={}) {
    const scroll=host.scrollTop;
    const request = ++state.request;
    const results = await Promise.allSettled([
      Promise.resolve().then(() => window.api.mediaCatalog({ action: 'list' })),
      Promise.resolve().then(() => window.api.listWatchLibrary()),
    ]);
    if (request !== state.request) return;
    const catalogResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const history = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : null;
    state.error = catalogResult?.ok && history ? '' : t('Some library data could not be loaded. Open the library to retry.', 'Bazı kütüphane verileri yüklenemedi. Yeniden denemek için kütüphaneyi açın.');
    state.data = model.snapshot(catalogResult?.ok ? catalogResult.items : state.data.items, history || state.data.watch);
    state.loaded = true;
    if (state.active) {renderContent();host.scrollTop=scroll;}
    if(metadata)void initialSettingsReady.then(()=>syncMetadata('start'));
  }
  let metadataState={},metadataTimer,metadataBusy=false,metadataPending='',metadataVersion=0;
  function drawMetadata(target){
    if(!target)return;target.replaceChildren();const job=metadataState;
    target.hidden=!job.configured||(!job.running&&!job.total&&!job.issue);
    if(target.hidden)return;
    const text=el('div');const message=job.running?t(`Updating film information · ${job.done}/${job.total}`,`Film bilgileri güncelleniyor · ${job.done}/${job.total}`):job.stopped?t('Artwork update stopped','Afiş güncellemesi durduruldu'):t(`${job.updated||0} titles updated`,`${job.updated||0} yapım güncellendi`);
    const detail=job.issue==='auth'?t('TMDB credential rejected. Check Settings.','TMDB anahtarı reddedildi. Ayarları kontrol et.'):job.issue==='rate'?t('TMDB rate limit reached. Retry later.','TMDB istek sınırı. Daha sonra yeniden dene.'):job.running?job.current:job.unmatched?t(`${job.unmatched} titles need manual matching.`,`${job.unmatched} yapım elle eşleştirilmeli.`):job.failed?t(`${job.failed} could not be retrieved. Retry when connected.`,`${job.failed} yapım alınamadı. Bağlantını kontrol edip yeniden dene.`):t('Your ratings and watch progress were kept.','Kişisel puanların ve izleme ilerlemen korundu.');
    const combined=!job.running&&job.issue!=='auth'&&job.issue!=='rate'?[job.unmatched?t(`${job.unmatched} need manual matching.`,`${job.unmatched} yapım elle eşleştirilmeli.`):'',job.failed?t(`${job.failed} could not be retrieved.`,`${job.failed} yapım alınamadı.`):'',job.noPoster?t(`${job.noPoster} have no TMDB poster.`,`${job.noPoster} yapımın TMDB afişi yok.`):''].filter(Boolean).join(' '):'';
    text.append(el('strong','',message),el('small','',combined||detail||''));text.setAttribute('role','status');target.append(text);
    if(job.running){const progress=el('progress');progress.max=job.total;progress.value=job.done;progress.setAttribute('aria-label',message);target.append(progress,button(t('Stop','Durdur'),()=>syncMetadata('cancel')));}
    else target.append(button(t('Refresh missing info','Eksik bilgileri yenile'),()=>syncMetadata('retry')));
    if(job.unmatched||job.issue==='auth')target.append(button(t('Review matches','Eşleşmeleri incele'),()=>window.AppSettingsUI.open('metadata')));
  }
  async function syncMetadata(mode='status'){
    if(metadataBusy){if(mode!=='status')metadataPending=mode;return;}
    metadataBusy=true;clearTimeout(metadataTimer);
    try{
      const result=await window.api.mediaCatalog({action:'metadata-sync',mode:mode==='retry'?'start':mode,retry:mode==='retry'});
      if(!result?.ok)return;metadataState=result;drawMetadata(document.getElementById('mhMetadataStatus'));
      document.dispatchEvent(new CustomEvent('metadata-job-change',{detail:result}));
      if(result.version!==metadataVersion){metadataVersion=result.version;posters.clear();document.dispatchEvent(new Event('media-metadata-updated'));await refresh({metadata:false});}
      if(result.running)metadataTimer=setTimeout(()=>void syncMetadata(),1200);
    }catch{ /* Other library operations remain usable while offline. */ }
    finally{metadataBusy=false;if(metadataPending){const pending=metadataPending;metadataPending='';void syncMetadata(pending);}}
  }
  window.MetadataArtworkUI=Object.freeze({status:()=>({...metadataState}),draw:drawMetadata,start:()=>syncMetadata('retry'),stop:()=>syncMetadata('cancel')});
  document.addEventListener('metadata-settings-saved',()=>void syncMetadata('start'));
  document.getElementById('mediaHomeBack')?.addEventListener('click', () => void perform(returnHome));
  document.getElementById('browserMediaHome')?.addEventListener('click', () => void perform(returnHome));
  document.getElementById('mediaCatalogDialog')?.addEventListener('close', () => { posters.clear(); if (state.active) void refresh(); });
  document.addEventListener('pointerdown',event=>{for(const menu of host.querySelectorAll('.mh-more[open]'))if(!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const menu of host.querySelectorAll('.mh-more[open]'))menu.open=false;});
  document.addEventListener('ui-locale-change', renderShell);
  document.addEventListener('media-library-changed', () => { if (state.active) void refresh(); });
  // Do not switch workspace or touch saved jobs, captions, tabs or dub state on startup.
  renderShell(); setHome(true);
  window.MediaHomeUI=Object.freeze({returnHome,resumeWorkspace,openStudio});
})();
