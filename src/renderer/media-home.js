(() => {
  'use strict';
  const host = document.getElementById('mediaHome');
  const model = window.MediaHomeModel;
  if (!host || !model || !window.api) return; // A failed shell must leave the studio usable.
  const layer = document.getElementById('playerLayer');
  host.addEventListener('pointerdown',()=>{host.dataset.navigationInput='pointer';},true);
  host.addEventListener('keydown',event=>{if(['Tab','ArrowLeft','ArrowRight','Home','End'].includes(event.key))host.dataset.navigationInput='keyboard';},true);
  const state = { page: 'home', query: '', filter: 'all', limit: 48, active: true,
    data: model.snapshot([], []), request: 0, render: 0, busy: false, loaded: false, error: '', featuredKey: '', searchOpen: false };
  try{const saved=localStorage.getItem('media-home-featured-v1');if(saved&&saved.length<=8192)state.featuredKey=saved;}catch{}
  let virtualDisposers=[];
  let feedsView=null,recallView=null,feedSnapshot=null;const pagePositions=new Map();
  const watchlist = { kind: '', runtime: '', sort: '' };
  let watchlistReturn = null;
  function retainFeeds(){if(feedsView?.snapshot)feedSnapshot=feedsView.snapshot();}
  function retainPage(){if(state.active)pagePositions.set(state.page,host.scrollTop);retainFeeds();}
  let disposeShell = () => {};
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
    if(!active)retainPage();
    state.active = active;
    if(!active){feedsView?.dispose();feedsView=null;recallView?.dispose();recallView=null;}
    document.body.classList.toggle('media-home-active', active);
    host.classList.toggle('hidden', !active);
    syncLayer();
    if (active) { void refresh(); document.getElementById('mhHome')?.focus(); }
    else document.getElementById('openPlayer')?.focus();
  }
  let returningHome=false,resuming=false,closingParked=false,parked=null;
  let homeReturnPromise=null;
  function returnHome(){if(homeReturnPromise)return homeReturnPromise;homeReturnPromise=performReturnHome().finally(()=>{homeReturnPromise=null;});return homeReturnPromise;}
  async function performReturnHome() {
    returningHome=true;
    try{
      if(layer && !layer.classList.contains('hidden')){
        const intent=++player.openIntent;
        const mode=player.workspaceMode,key=player.mediaKey,tabId=player.browserActiveTabId;
        if(mode==='browser'&&tabId)await browserCommand('pause',undefined,tabId);
        if(intent!==player.openIntent)return;
        document.getElementById('playerVideo')?.pause();
        const voice=window.BrowserDubAudioUI?.suspend ? null : window.BrowserDubAudioUI?.snapshot();
        if(window.BrowserDubAudioUI?.suspend)await window.BrowserDubAudioUI.suspend();
        else await window.BrowserDubAudioUI?.stop();
        if(intent!==player.openIntent)return;
        if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
        if(document.pictureInPictureElement)await document.exitPictureInPicture().catch(()=>{});
        await flushWatchState(false,true);
        if(intent!==player.openIntent)return;
        closeBrowserFind(false);closeBrowserTransientPanels();
        await window.api.hideBrowser();
        if(intent!==player.openIntent)return;
        disconnectBrowserBoundsObserver();
        parked={mode,key,tabId,generation:player.generation,title:document.getElementById('playerTitle')?.textContent||t('Open workspace','Açık çalışma alanı'),
          position:mode==='browser'?player.browserTime:document.getElementById('playerVideo').currentTime,
          subtitle:mode==='browser'?player.browserTracks?.length>0:player.cues?.length>0,
          voice};
        layer.classList.add('hidden');
      }
      retainPage();if(state.page==='discover')window.MediaDiscoveryUI?.leave();
      state.page='home';state.query='';renderShell();setHome(true);
    }finally{returningHome=false;}
  }
  async function resumeWorkspace(){
    if(!parked)return;
    const target=parked;
    if(target.key!==player.mediaKey||(target.mode==='browser'&&target.tabId!==player.browserActiveTabId)){parked=null;renderContent();return;}
    if(resuming||closingParked)return;resuming=true;
    try{
      layer.classList.remove('hidden');setWorkspaceMode(target.mode,false);
      document.getElementById('playerTitle').textContent=target.title;
      if(target.voice)await window.BrowserDubAudioUI?.restore(target.voice,target.key);
      if(target.mode!=='browser')document.getElementById('playerBack')?.focus();
    }finally{resuming=false;}
    // Explicit return restores the workspace; playback remains paused until Play.
  }
  async function closeParkedWorkspace(){
    if(closingParked||resuming||returningHome||!parked)return;
    const target=parked,intent=player.openIntent;
    const current=()=>parked===target&&target.key===player.mediaKey&&target.generation===player.generation
      &&target.mode===player.workspaceMode&&intent===player.openIntent&&layer.classList.contains('hidden')
      &&(target.mode!=='browser'||target.tabId===player.browserActiveTabId);
    if(!current()){parked=null;renderContent();return;}
    closingParked=true;renderContent();let closed=false;
    try{
      if(target.mode==='browser'){
        // The existing owner requests explicit confirmation for pinned tabs or active work.
        await closeBrowserTab(target.tabId);
        if(browserTabState(target.tabId))return;
      }else{
        await flushWatchState(false,true);if(!current())return;
        if(window.NativePlayerUI?.busy())await window.NativePlayerUI.stop({resume:false});
        if(!current())return;
        await window.BrowserDubAudioUI?.stop();if(!current())return;
        // setMediaKey flushes the old owner's live timestamp before clearing its identity.
        // Unloading first can reset currentTime and overwrite that saved position with zero.
        setMediaKey('');
        // The layer is already hidden, so this performs teardown instead of parking again.
        closePlayer();
        const video=document.getElementById('playerVideo');video?.pause();video?.removeAttribute('src');video?.load();
      }
      if(parked===target){parked=null;closed=true;}
    }finally{
      closingParked=false;renderContent();
      document.getElementById(closed?'mhHome':'mhCloseWorkspace')?.focus({preventScroll:true});
    }
  }
  let wasPlayerOpen = !layer?.classList.contains('hidden');
  function syncLayer() {
    const open = !!layer && !layer.classList.contains('hidden');
    if ((!state.active || open) && host.contains(document.activeElement)) document.activeElement.blur();
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
  function openBrowser() {
    // Returning to a parked browser must not reload the last Whisper job video.
    if(parked?.mode==='browser'&&parked.key===player.mediaKey&&parked.tabId===player.browserActiveTabId)return resumeWorkspace();
    click('openPlayer');
  }
  function openStudio() { setHome(false); }
  async function catalog(options = {}) {
    if (!window.MediaCatalogUI?.open) throw new Error(t('Library is unavailable.', 'Kütüphane kullanılamıyor.'));
    await window.MediaCatalogUI.open({ ...options, opener: document.activeElement });
  }
  async function playWatch(item, options = {}) {
    if (state.busy) return;
    state.busy = true;
    try {
      if (typeof openWatchLibraryItem !== 'function') throw new Error(t('Player is unavailable.', 'Oynatıcı kullanılamıyor.'));
      if (typeof flushWatchState === 'function') await flushWatchState(false, false);
      await openWatchLibraryItem(item, options.fromStart || item.completed ? 0 : model.progress(item).position);
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
  const posters = new Map(), failedArtwork = new Map();
  const artworkKey = item => item?.key || item?.id || '';
  const hasArtwork = item => model.hasArtwork(item) && (failedArtwork.get(artworkKey(item)) || 0) < Date.now();
  function artError(node) { node.dispatchEvent(new Event('home-art-error', { bubbles: true })); }
  function loadArt(node, src, upgrade = false) {
    const image = el('img'); image.alt = ''; image.loading = node.dataset.artRequired ? 'eager' : 'lazy'; image.referrerPolicy = 'no-referrer';
    const youtube = /^https:\/\/i\.ytimg\.com\/vi\/[a-zA-Z0-9_-]{11}\/hqdefault\.jpg$/.test(src);
    if (youtube) image.className = 'mh-remote-thumbnail';
    const candidates=youtube?['hq720.jpg','hqdefault.jpg','mqdefault.jpg'].map(name=>src.replace('hqdefault.jpg',name)):[src];let candidate=0;
    const unavailable = () => {
      if (upgrade || node.dataset.artWideReady === 'true') { image.remove(); return; }
      if (++candidate<candidates.length) {image.src=candidates[candidate];return;}
      image.remove(); if (node.isConnected) artError(node);
    };
    image.onload = () => {
      if (!node.isConnected) return;
      if (!upgrade && node.dataset.artWideReady === 'true') { image.remove(); return; }
      if (upgrade && image.naturalWidth / image.naturalHeight < 1.2) { image.remove(); return; }
      // YouTube sometimes returns its tiny generic missing-image tile with HTTP 200.
      if (!image.naturalWidth || youtube && image.naturalWidth <= 120) return unavailable();
      if(youtube)image.classList.toggle('mh-letterboxed-thumbnail',Math.abs(image.naturalWidth/image.naturalHeight-4/3)<.04);
      if (node.classList.contains('cn-hero-art')) {
        const bounds = node.getBoundingClientRect();
        node.dataset.artLowResolution = String(image.naturalWidth < bounds.width || image.naturalHeight < bounds.height);
      }
      if (upgrade) { node.dataset.artWideReady = 'true'; image.style.opacity = ''; }
      const meters=[...node.children].filter(child=>child.matches('.mh-progress,.cn-progress,.cn-rating,.cn-source-mark'));node.replaceChildren(image,...meters); node.dispatchEvent(new Event('home-art-ready', { bubbles:true }));
    };
    image.onerror = unavailable;
    if (upgrade) image.style.opacity = '0';
    node.append(image); image.src = candidates[0];
  }
  const safePoster = value => typeof value === 'string' && value.length < 8_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
  function pumpPosters() {
    while (posterActive < 3 && posterQueue.length) {
      const task = posterQueue.shift();
      if (!task.node.isConnected || task.generation !== state.render) continue;
      posterActive++;
      const cacheKey = task.cacheKey || 'poster:'+task.id, cached = posters.get(cacheKey);
      Promise.resolve(cached || window.api.mediaCatalog({ action: task.upgrade ? 'backdrop' : 'poster', id: task.id }))
        .then(result => {
          if (!safePoster(result?.image)) { if (!task.upgrade) artError(task.node); return; }
          posters.set(cacheKey, result);
          while (posters.size > 80) posters.delete(posters.keys().next().value);
          if (!task.node.isConnected || task.generation !== state.render) return;
          loadArt(task.node, result.image, task.upgrade);
        }).catch(() => { if (!task.upgrade && task.node.isConnected && task.generation === state.render) artError(task.node); }).finally(() => { posterActive--; pumpPosters(); });
    }
  }
  const posterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      posterObserver.unobserve(entry.target);
      posterQueue.push({ node: entry.target, id: entry.target.dataset.homePoster, generation: state.render });
    }
    pumpPosters();
  }, { rootMargin: '180px' });
  function art(item, cls, required = false) {
    const node = el('div', cls); node.append(icon());
    if (required) node.dataset.artRequired = 'true';
    if ((node.classList.contains('mh-hero-art') || node.classList.contains('cn-hero-art')) && item?.id && item.backdrop) {
      const generation=state.render;
      node.addEventListener('home-art-ready',()=>{
        if(!node.isConnected || generation!==state.render)return;
        // Show the cached cover immediately, then use the wide film image when ready.
        // The shared queue keeps this enhancement within the same three-request budget.
        posterQueue.unshift({node,id:item.id,generation,upgrade:true,cacheKey:'backdrop:'+item.backdrop});pumpPosters();
      },{once:true});
    }
    node.addEventListener('home-art-error', () => { if (required) failedArtwork.set(artworkKey(item), Date.now()+60000); }, { once: true });
    if (item?.hasPoster && item.id && !(model.medium(item)==='web'&&model.thumbnail(item))) {
      node.dataset.homePoster = item.id;
      queueMicrotask(() => {
        if (!node.isConnected) return;
        if (required) { posterQueue.push({node, id:item.id, generation:state.render}); pumpPosters(); }
        else posterObserver.observe(node);
      });
    } else {
      const src = model.thumbnail(item);
      if (src) loadArt(node, src);
      else if (required) queueMicrotask(() => artError(node));
    }
    return node;
  }
  function card(item, options = {}) {
    const web=!!item.key&&model.medium(item)==='web';
    const node = button('', () => {
      if (item.key) return playWatch(item);
      if (state.filter === 'planned') {
        const keys = [...node.parentElement.querySelectorAll('[data-home-item]')].map(card => card.dataset.homeItem);
        const index = keys.indexOf(item.id);
        watchlistReturn = { page: state.page, scroll: host.scrollTop, keys: [item.id, ...keys.slice(index + 1), ...keys.slice(0, index).reverse()] };
      }
      return window.MediaTitleUI.open(item.id);
    }, 'mh-card'+(web?' mh-web-card':''));
    if(web&&!options.artworkOnly&&state.page!=='home'){node.classList.add('mh-art-pending');node.addEventListener('home-art-ready',()=>node.classList.remove('mh-art-pending','mh-no-art'),{once:true});node.addEventListener('home-art-error',()=>{node.classList.remove('mh-art-pending');node.classList.add('mh-no-art');},{once:true});if(!hasArtwork(item))node.classList.add('mh-no-art');}
    node.dispose=()=>node.querySelectorAll('[data-home-poster]').forEach(image=>posterObserver.unobserve(image));
    node.dataset.homeItem = item.key || item.id;
    node.title = String(item.title || t('Untitled', 'Başlıksız'));
    if (options.artworkOnly) {
      node.hidden = true;
      node.addEventListener('home-art-ready', () => { node.hidden = false; options.ready?.(); }, { once:true });
      node.addEventListener('home-art-error', () => { node.remove(); options.unavailable?.(); }, { once:true });
    }
    node.append(art(item, 'mh-art', !!options.artworkOnly), el('span', 'mh-card-title', node.title));
    if(state.page==='home')window.MediaVisual?.card(node,{title:node.title,wide:!!item.key});
    const p = model.progress(item);
    const kind = item.key ? (model.medium(item) === 'web' ? 'Web' : model.medium(item) === 'music' ? t('Audio', 'Ses') : t('Video', 'Video')) : item.kind === 'series' ? t('Series', 'Dizi') : t('Film', 'Film');
    const length = state.filter === 'planned' ? (item.runtime > 0 ? item.runtime + t(' min', ' dk') : t('Runtime unknown', 'Süre bilinmiyor')) : '';
    node.append(el('span', 'mh-card-meta', [item.year, kind, length, p.position ? `${minutes(p.position)} / ${p.duration ? minutes(p.duration) : '—'}` : ''].filter(Boolean).join(' · ')));
    if (p.position && p.duration){const meter=progress(item);if(state.page==='home')node.querySelector('.mh-art').append(meter);else node.append(meter);}
    return node;
  }
  function emptyState(title,description,actions=[]){
    if(state.page==='home'&&window.MediaVisual)return window.MediaVisual.empty({title,text:description,actions:actions.map(([label,run])=>button(label,run))});
    const node=el('section','mh-empty-state'),mark=el('div','mh-empty-mark');mark.setAttribute('aria-hidden','true');mark.append(icon());
    const copy=el('div','mh-empty-copy');copy.append(el('h2','',title),el('p','',description));
    if(actions.length){const buttons=el('div','mh-empty-actions');for(const [label,action] of actions)buttons.append(button(label,action,'mh-action'+(buttons.childElementCount?'':' mh-primary')));copy.append(buttons);}
    node.append(mark,copy);return node;
  }
  function section(title, rows, options = {}) {
    const node = el('section', 'mh-section'), heading = el('div', 'mh-section-head');
    heading.append(el('h2', '', title));if(state.page==='home')window.MediaVisual?.sectionHeading(heading);
    if (options.more) heading.append(button(t('View all', 'Tümünü gör'), options.more, 'mh-text-button'));
    const grid = el('div', options.grid ? 'mh-grid'+(options.web?' mh-web-grid':'') : `mh-rail${options.wide ? ' mh-wide' : ''}`);
    const virtual = options.grid && rows.length > 100 && state.filter !== 'planned' && window.MediaVirtualGrid;
    if(virtual){queueMicrotask(()=>{if(grid.isConnected)virtualDisposers.push(window.MediaVirtualGrid.mount(grid,rows,card,host));});}
    else if (options.artworkOnly) {
      node.hidden = true; let next = 0;
      const appendNext = () => { if (next < rows.length) grid.append(card(rows[next++], {artworkOnly:true, ready:()=>{node.hidden=false;}, unavailable:appendNext})); };
      for (let i=0;i<Math.min(12,rows.length);i++) appendNext();
    } else rows.slice(0, options.grid ? state.limit : 12).forEach(item => grid.append(card(item)));
    if(state.page==='home'&&!options.grid&&window.MediaVisual){const rail=window.MediaVisual.rail(grid,title);virtualDisposers.push(rail.dispose);node.append(heading,rail.element);}else node.append(heading, grid);
    if (!rows.length) {const searching=!!state.query||state.filter!=='all';node.append(emptyState(searching?t('No matching titles','Eşleşen yapım yok'):t('Nothing here yet','Burada henüz bir kayıt yok'),searching?t('Try a shorter search or clear the current filter.','Daha kısa bir arama dene veya mevcut filtreyi temizle.'):t('Add media to your library or open a video in the browser. Your progress will appear here.','Kütüphanene medya ekle veya browserda video aç. İlerlemen burada görünür.'),searching?[[t('Clear filters','Filtreleri temizle'),()=>{state.query='';state.filter='all';const input=document.getElementById('mhSearch');if(input)input.value='';renderContent();}]]:[[t('Open browser','Browserı aç'),openBrowser],[t('Manage library','Kütüphaneyi yönet'),()=>catalog()]]));}
    if (options.grid && rows.length > state.limit && !virtual) node.append(button(t('Show more', 'Daha fazla göster'), () => { state.limit += 48; renderContent(); }));
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
    retainPage();
    const changed = state.page !== value;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    state.page = value; state.limit = 48; state.filter = 'all';
    host.dataset.page = value;
    host.scrollTop = 0;
    host.querySelectorAll('[data-home-page]').forEach(node => node.setAttribute('aria-current', node.dataset.homePage === value ? 'page' : 'false'));
    // Üst çubukta yalnız Ana sayfa/Keşfet/Kütüphanem var; menüye taşınan sayfalar ait oldukları üst girişi (veya Daha fazla) işaretler: kullanıcı nerede olduğunu kaybetmesin.
    const directTop = [...host.querySelectorAll('.mh-nav > [data-home-page]')].some(node => node.dataset.homePage === value);
    const topOwner = directTop ? value : ({ home: 'home', discover: 'discover', stremio: 'discover', films: 'discover', series: 'discover', recommend: 'discover', watched: 'watched', anime: 'watched', manga: 'watched', taste: 'watched', recall: 'more', feeds: 'more', radio: 'more', web: 'more', recent: 'more' }[value] || '');
    host.querySelectorAll('.mh-nav > [data-home-page]').forEach(node => node.setAttribute('aria-current', node.dataset.homePage === topOwner ? 'page' : 'false'));
    host.querySelector('.mh-nav > .mh-nav-more')?.setAttribute('aria-current', topOwner === 'more' ? 'page' : 'false');
    host.querySelectorAll('[data-home-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.homeMode === (['music', 'radio'].includes(value) ? 'music' : value === 'books' ? 'books' : 'film'))));
    window.MediaChrome?.syncKind?.();
    renderContent();
    if (changed) window.UiMotion?.reveal(document.getElementById('mhContent'), 'page');
  }
  function renderContent() {
    const content = document.getElementById('mhContent'); if (!content) return;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    retainFeeds();feedsView?.dispose();feedsView=null;recallView?.dispose();recallView=null;
    const focusKey = content.contains(document.activeElement) ? document.activeElement?.dataset.homeItem : null;
    virtualDisposers.forEach(dispose=>dispose());virtualDisposers=[];
    state.render++; posterQueue = []; posterObserver.disconnect();
    content.classList.remove('cn-home-content', 'cv2-home');content.replaceChildren();
    if(parked&&(parked.key!==player.mediaKey||parked.generation!==player.generation||(parked.mode==='browser'&&parked.tabId!==player.browserActiveTabId)))parked=null;
    const status = el('p', 'mh-status'); status.id = 'mhStatus'; status.setAttribute('role', 'status'); content.append(status);
    if (state.error){const panel=el('section','mh-library-load-error media-surface');panel.setAttribute('role','alert');panel.append(el('h2','',t('Some library data is unavailable','Bazı kütüphane verileri kullanılamıyor')),el('p','',state.error),el('p','mh-muted',t('Available data and the last loaded records remain usable. Retry reads only; it does not change ratings, history or sources.','Kullanılabilir veri ve son yüklenen kayıtlar kullanılabilir kalır. Yeniden deneme yalnız okur; puan, geçmiş veya kaynak değiştirmez.')),button(t('Retry library data','Kütüphane verilerini yeniden yükle'),()=>refresh({metadata:false})));content.append(panel);}
    else if (!state.loaded) report(t('Loading your library…', 'Kütüphanen yükleniyor…'));
    if(state.page==='home'&&feedSnapshot?.entryId){
      const resume=el('div','mh-reading-return');resume.append(el('span','',t('Your reading place is saved.','Kaldığın okuma yeri kayıtlı.')),button(t('Return to Feeds','Akışlarda okumaya dön'),()=>page('feeds'),'mh-text-button'));content.append(resume);
    }
    if(parked && state.page === 'home'){
      const session=el('section','mh-session');session.id='mhOpenSession';
      const text=el('div');text.append(el('small','',t('Open session · paused','Açık oturum · duraklatıldı')),el('strong','',parked.title),el('p','',[
        parked.mode==='browser'?t('Browser','Tarayıcı'):t('Player','Oynatıcı'),Number.isFinite(parked.position)?minutes(parked.position):'',parked.subtitle?t('Subtitles ready','Altyazı hazır'):'',parked.voice?t('Voice attached','Dublaj bağlı'):''].filter(Boolean).join(' · ')));
      const actions=el('div','mh-session-actions');const back=button(t('Return to session','Oturuma dön'),resumeWorkspace,'mh-action mh-primary');back.id='mhResumeWorkspace';
      actions.append(back,button(t('Voice preparation','Ses hazırlığı'),async()=>{await resumeWorkspace();if(!layer.classList.contains('hidden'))await window.MediaExperience?.openVoice();}));
      const close=button('',closeParkedWorkspace,'mh-session-close');close.id='mhCloseWorkspace';
      close.setAttribute('aria-label',t('Close playback session','Oynatma oturumunu kapat'));close.title=parked.mode==='browser'?t('Close session; active tab work may require confirmation.','Oturumu kapat; sekmedeki işler için onay istenebilir.'):t('Close playback session. Background production jobs continue.','Oynatma oturumunu kapat. Arka plan üretim işleri sürer.');
      close.append(window.MediaVisual?.icon('close')||document.createTextNode('×'));
      for(const control of [...actions.querySelectorAll('button'),close]){control.disabled=closingParked;if(closingParked)control.setAttribute('aria-busy','true');}
      session.append(text,actions,close);content.append(session);
    }
    const { items, watch, continuing } = state.data;
    const filter = rows => rows.filter(item => model.matches(item, state.query));
    if (state.page === 'home' && !state.query) {
      const view=window.CinemaUI.home(content,{items,watch,continuing,progress:model.progress,art,hasArtwork,play,details:id=>window.MediaTitleUI.open(id),page,addFolder:()=>catalog({mode:'folder'}),minutes,featuredKey:state.featuredKey,onFeature:key=>{state.featuredKey=key;try{localStorage.setItem('media-home-featured-v1',key);}catch{}}});
      virtualDisposers.push(view.dispose);
      const toolbox=el('details','cn-accordion');toolbox.append(el('summary','',t('Subtitle & voice tools','Altyazı ve ses araçları')),tools());view.body.append(toolbox);
    } else if (state.page === 'recall' && window.RecallNetworkUI) {
      recallView=window.RecallNetworkUI.render({host:content,api:input=>window.api.recallRequest(input),locale:english()?'en':'tr',onOpen:async source=>{
        if(source.kind==='collection')return window.PersonalLibraryUI.openCollection(source.id);if(source.kind==='catalog')return window.MediaTitleUI.open(source.id);
        if(source.kind==='feed')return window.MediaHomeUI.openFeedEntry(source.id);
        if(source.kind==='book')return window.MediaShelfUI.openBook(source.id);
        if(source.kind==='podcast')return window.MediaShelfUI.openPodcast(source.locator?.podcastId,source.locator?.url);
        if(source.kind==='shelf-review'){page('taste');return;}
        throw Error(t('Open this source from its owning workspace.','Bu kaynağı ait olduğu çalışma alanından aç.'));
      }});
    } else if (state.page === 'feeds' && window.MediaFeedsUI) {
      feedsView=window.MediaFeedsUI.render({host:content,restore:feedSnapshot,api:input=>window.api.feedsRequest(input),locale:english()?'en':'tr',onOpen:async request=>{
        const originRender=state.render,intent=++player.openIntent;
        const result=await window.api.feedsRequest({action:'entry',entryId:request.entryId});
        if(!result?.ok||!result.entry)throw Error(result?.error||t('Source is unavailable.','Kaynak kullanılamıyor.'));
        if(player.openIntent!==intent||state.page!=='feeds'||state.render!==originRender||!content.isConnected)return;
        const entry=result.entry;
        if(request.mode==='play'&&entry.enclosures?.length){
          const source=entry.enclosures[request.enclosureIndex||0];if(!source?.url)throw Error(t('Media is unavailable.','Medya kullanılamıyor.'));
          const stream=await window.api.mediaHub({action:'network',url:source.url});
          if(!stream?.ok)throw Error(stream?.error||t('Media could not be opened.','Medya açılamadı.'));
          await flushWatchState(false,false);
          const history=await window.api.listWatchLibrary(),previous=history?.find(row=>row.key===stream.key);
          if(player.openIntent!==intent||state.page!=='feeds'||state.render!==originRender)return;
          stream.title=entry.title;await window.MediaHubUI.playStream(stream,previous?.completed?0:Number(previous?.position)||0);
        }else{
          await flushWatchState(false,false);
          if(player.openIntent!==intent||state.page!=='feeds'||state.render!==originRender)return;
          document.getElementById('playerLayer').classList.remove('hidden');setWorkspaceMode('browser',false);
          // Wait for the real browser tab before its initial snapshot can replace
          // the address. Navigating a null tab races the browser's first show.
          await new Promise(resolve=>requestAnimationFrame(resolve));await showBrowserWorkspace();
          if(player.openIntent!==intent||player.workspaceMode!=='browser'||document.getElementById('playerLayer').classList.contains('hidden'))return;
          if(!player.browserActiveTabId)throw Error(t('Browser is not ready. Reopen the source to retry.','Browser hazır değil. Yeniden denemek için kaynağı aç.'));
          document.getElementById('browserAddress').value=entry.url;
          const opened=await navigateBrowserFromAddress();if(opened?.ok===false)throw Error(opened.error||t('Source could not be opened.','Kaynak açılamadı.'));
        }
      }});
      const currentView=feedsView,currentRender=state.render;void currentView.ready.then(()=>{if(feedsView===currentView&&state.page==='feeds'&&state.render===currentRender&&state.active)host.scrollTop=pagePositions.get('feeds')||0;});
    } else if (state.page === 'discover' && window.MediaDiscoveryUI) {
      const discovery = el('section', 'md-page'); content.append(discovery); window.MediaDiscoveryUI.mount(discovery);
    } else if (state.page==='stremio'&&window.StremioUI) {
      const stremio=window.StremioUI.mount(content);virtualDisposers.push(()=>stremio.dispose());
    } else if (state.page==='recommend'&&window.RecommendationHubUI) {
      const recommendations=window.RecommendationHubUI.mount(content);virtualDisposers.push(()=>recommendations.dispose());
    } else if (['watched','anime','manga'].includes(state.page) && window.PersonalLibraryUI) {
      const personal=window.PersonalLibraryUI.mount(content,{page:state.page,history:watch,onOpen:id=>window.MediaTitleUI.open(id),onPlay:playWatch});virtualDisposers.push(()=>personal.dispose());
    } else if (state.page === 'web' && window.WebHistoryV2) {
      const web = window.WebHistoryV2.mount(content, watch.filter(item => model.medium(item) === 'web'), {
        query: state.query, playWatch, artwork: item => art(item, 'whv-owned-art'), disposeArtwork: node => posterObserver.unobserve(node),
        removeWatchItem: async item => { const result=await window.api.removeWatchItem(item.key); if(result?.ok===false)throw Error(result.error||t('Record could not be removed.','Kayıt kaldırılamadı.')); await refresh(); },
        openFile: () => click('playerPickVideo'), manageLibrary: () => catalog(), openBrowser
      });
      virtualDisposers.push(() => web.dispose());
    } else if (['books', 'music', 'radio', 'taste'].includes(state.page) && window.MediaShelfUI) {
      const titles = { books: t('Books', 'Kitaplar'), music: t('Music', 'Müzik'), radio: t('Radio & podcasts', 'Radyo ve podcast'), taste: 'Letterboxd' };
      if(state.page!=='taste'&&state.page!=='radio')content.append(el('h1', 'mh-page-title', titles[state.page]));
      const shelf = el('section', 'ms-shelf'); content.append(shelf); window.MediaShelfUI.mount(shelf, state.page, state.query);
    } else {
      const titles = { home: t('Search results', 'Arama sonuçları'), recent: t('Recently played', 'Son oynatılanlar'), films: t('Films', 'Filmler'), series: t('Series', 'Diziler'), music: t('Music & audio', 'Müzik ve ses'), web: t('Web videos', 'Web videoları'), books: t('Search results', 'Arama sonuçları') };
      const isHistory = ['recent', 'music', 'web'].includes(state.page);
      let rows = isHistory ? watch : items;
      if (state.page === 'films' && state.filter !== 'planned') rows = rows.filter(item => item.kind !== 'series');
      if (state.page === 'series' && state.filter !== 'planned') rows = rows.filter(item => item.kind === 'series');
      if (state.page === 'music') rows = rows.filter(item => model.medium(item) === 'music');
      if (state.page === 'web') rows = rows.filter(item => model.medium(item) === 'web');
      if (state.query && ['home', 'books'].includes(state.page)) { const catalogIds=new Set(items.map(item=>item.id).filter(Boolean));rows = [...items, ...watch.filter(row=>!row.id||!catalogIds.has(row.id))]; }
      if(state.filter.startsWith('collection:'))rows=rows.filter(item=>(item.collections||[]).includes(state.filter.slice(11)));
      if (state.filter === 'favorites') rows = rows.filter(item => item.favorite);
      if (state.filter === 'planned') rows = rows.filter(item => ['planned', 'watching'].includes(item.watchStatus));
      const controls = el('div', 'mh-filterbar');
      if (!isHistory) {
        const select = el('select'); select.setAttribute('aria-label', t('Library filter', 'Kütüphane filtresi'));
        [['all', t('All titles', 'Tüm yapımlar')], ['favorites', t('Favorites', 'Favoriler')], ['planned', t('Watchlist', 'İzlenecekler')]].forEach(([value, label]) => { const option = el('option', '', label); option.value = value; select.append(option); });
        for(const name of [...new Set(items.flatMap(item=>item.collections||[]))].sort()){const option=el('option','',name);option.value='collection:'+name;option.dataset.uiUntranslated='';select.append(option);}
        select.value = state.filter; select.addEventListener('change', () => { state.filter = select.value; state.limit = 48; renderContent(); }); controls.append(select);
      }
      if (!isHistory && state.filter === 'planned') {
        const choices = [
          ['kind', t('Title type', 'Yapım türü'), [['',t('All types','Tüm türler')], ['film',t('Films','Filmler')], ['series',t('Series','Diziler')]]],
          ['runtime', t('Runtime', 'Süre'), [['',t('Any runtime','Tüm süreler')], ['60',t('Up to 60 min','60 dk ve altı')], ['90',t('Up to 90 min','90 dk ve altı')], ['120',t('Up to 120 min','120 dk ve altı')], ['unknown',t('Runtime unknown','Süre bilinmiyor')]]],
          ['sort', t('Watchlist order', 'İzlenecekler sırası'), [['',t('Library order','Kütüphane sırası')], ['recent',t('Recently added','Son eklenenler')]]]
        ];
        for (const [key, label, options] of choices) {
          const select = el('select'); select.dataset.watchlistFilter = key; select.setAttribute('aria-label', label);
          for (const [value, name] of options) { const option = el('option', '', name); option.value = value; select.append(option); }
          select.value = watchlist[key];
          select.onchange = () => {
            watchlist[key] = select.value; state.limit = 48; renderContent();
            content.querySelector(`[data-watchlist-filter="${key}"]`)?.focus({preventScroll:true});
          };
          controls.append(select);
        }
        rows = rows.filter(item => (!watchlist.kind || item.kind === watchlist.kind) &&
          (!watchlist.runtime || (watchlist.runtime === 'unknown' ? !(item.runtime > 0) : item.runtime > 0 && item.runtime <= Number(watchlist.runtime))));
        if (watchlist.sort === 'recent') rows = [...rows].sort((a,b) => (b.watchlistAddedAt || 0) - (a.watchlistAddedAt || 0));
      }
      if(state.filter.startsWith('collection:')&&window.FilmWatchUI)controls.append(button(t('Open collection page','Koleksiyon sayfasını aç'),()=>window.FilmWatchUI.openCollection(state.filter.slice(11))));
      controls.append(button(t('Open a file', 'Dosya aç'), () => click('playerPickVideo')), button(t('Manage library', 'Kütüphaneyi yönet'), () => catalog()));
      content.append(controls, section(!isHistory && state.filter === 'planned' ? t('Watchlist', 'İzlenecekler') : titles[state.page], filter(rows), { grid: true,web:state.page==='web' }));
      if (state.page === 'music') content.append(el('p', 'mh-empty', t('Local audio you play appears here. Playback uses your existing player and queue.', 'Oynattığın yerel sesler burada görünür. Mevcut oynatıcın ve kuyruğun kullanılır.')));
    }
    if (focusKey) [...content.querySelectorAll('[data-home-item]')].find(node => node.dataset.homeItem === focusKey)?.focus({ preventScroll: true });
  }
  function renderShell() {
    retainPage();disposeShell();
    const lifetime = new AbortController();
    let openTimer, closeTimer, resizeFrame;
    const focused = document.activeElement?.id;
    if (state.page === 'discover') window.MediaDiscoveryUI?.leave();
    host.dataset.page=state.page;host.setAttribute('aria-label', t('Media home', 'Medya ana sayfası'));
    const back = document.getElementById('mediaHomeBack');
    if (back) back.textContent = t('Home', 'Ana sayfa');
    const browserHome=document.getElementById('browserMediaHome');
    if(browserHome){const label=t('Home','Ana sayfa');browserHome.querySelector('span').textContent=label;browserHome.setAttribute('aria-label',label);browserHome.title=t('Media home — your tabs stay open','Medya ana sayfası — sekmelerin açık kalır');}
    const menuHome=document.getElementById('browserMediaHomeMenuLabel');if(menuHome)menuHome.textContent=t('Home','Ana sayfa');
    const playerHome=document.getElementById('playerBack');if(playerHome){playerHome.querySelector('span').textContent=t('Home','Ana sayfa');playerHome.title=t('Media home — keep this session','Medya ana sayfası — oturumu koru');playerHome.setAttribute('aria-label',t('Home','Ana sayfa'));}
    host.replaceChildren(el('div', 'mh-titlebar'));
    const header = el('header', 'mh-header');
    const launcher = el('div', 'mh-launcher');
    const brand = button('', () => setMenu(menu.hidden), 'mh-brand');
    brand.id = 'mhAppMenu'; brand.title = t('Application menu', 'Uygulama menüsü');
    brand.setAttribute('aria-label', brand.title); brand.setAttribute('aria-expanded', 'false');
    brand.setAttribute('aria-controls', 'mhAppMenuPanel'); brand.append(icon());
    const menu = el('div', 'mh-launcher-menu'); menu.id = 'mhAppMenuPanel'; menu.hidden = true;
    menu.setAttribute('role', 'region'); menu.setAttribute('aria-label', brand.title);
    const modeSlot = el('div', 'mh-menu-modes');
    const extraNav = el('div', 'mh-menu-nav');
    const toolsGroup = el('div', 'mh-menu-tools');
    menu.append(modeSlot, extraNav, toolsGroup); launcher.append(brand, menu);
    function setMenu(open, returnFocus = false) {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (!header.isConnected) return;
      const changed = menu.hidden === open;
      menu.hidden = !open; brand.setAttribute('aria-expanded', String(open));
      if (open && changed) window.UiMotion?.reveal(menu, 'panel');
      if (!open && returnFocus) brand.focus({preventScroll:true});
    }
    launcher.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      clearTimeout(closeTimer); openTimer = setTimeout(() => setMenu(true), 70);
    });
    launcher.addEventListener('pointerleave', () => {
      clearTimeout(openTimer); closeTimer = setTimeout(() => {
        if (!menu.contains(document.activeElement)) setMenu(false);
      }, 180);
    });
    launcher.addEventListener('focusout', event => {
      if (!launcher.contains(event.relatedTarget)) setMenu(false);
    });
    brand.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault(); setMenu(true); menu.querySelector('button')?.focus();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!launcher.contains(event.target)) setMenu(false);
      if (!header.contains(event.target) && state.searchOpen) setSearchOpen(false);
    }, {signal:lifetime.signal});
    header.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault(); event.stopPropagation(); setMenu(false, true);
      }
    });
    const modes = el('div', 'mh-modes'); modes.setAttribute('aria-label', t('Media type', 'Medya türü'));
    for (const [key, label, target] of [['film', t('Film', 'Film'), 'home'], ['music', t('Music', 'Müzik'), 'music'], ['books', t('Books', 'Kitaplar'), 'books']]) {
      const mode = button(label, () => page(target)); mode.dataset.homeMode = key;
      mode.setAttribute('aria-pressed', String(key === (['music', 'radio'].includes(state.page) ? 'music' : state.page === 'books' ? 'books' : 'film'))); modes.append(mode);
    }
    const actions = el('div', 'mh-actions');
    const browser = button('', openBrowser, 'mh-action mh-browser-action');
    const openMedia = button('', () => window.MediaHubUI?.open(), 'mh-action mh-primary mh-open-media');
    function actionIcon(node, d, label) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d);
      svg.append(path); node.append(svg, el('span', '', label)); node.setAttribute('aria-label', label); node.title = label;
    }
    actionIcon(browser, 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18Z', t('Browser', 'Tarayıcı'));
    actionIcon(openMedia, 'M3 6h6l2 2h10v12H3V6Z', t('Open media', 'Medya aç'));
    for(const [mode,tr,en,path] of [['bilingual','Çift dilli çalış','Bilingual study','M4 5h16v14H4zM8 10h3m2 0h3M8 14h8'],['podcast','Podcast','Podcast','M5 13v-2a7 7 0 0 1 14 0v2M5 12H3v7h4v-7Zm14 0h2v7h-4v-7Z']]){
      const entry=button('',()=>window.PodcastLinkUI?.enter(mode),'mh-action mh-study-entry');entry.dataset.studyView=mode;actionIcon(entry,path,t(en,tr));actions.append(entry);
    }
    actions.append(openMedia);
    if(window.MediaVisual){const assistant=button('',()=>window.api.showAssistant?.(),'mh-action mv-assistant');assistant.title=t('Assistant','Asistan');assistant.setAttribute('aria-label',assistant.title);assistant.append(window.MediaVisual.icon('chat'));actions.insertBefore(assistant,openMedia);actions.insertBefore(browser,openMedia);}
    for (const [label, run] of [
      [t('Production workspace','Üretim çalışma alanı'),()=>window.MediaWorkflowsUI.open()],
      [t('Studio','Stüdyo'),openStudio],
      [t('Subtitle → voice','Altyazı → ses'),()=>click('dubMainOpen')],
      [t('Tonight','Bu akşam'),()=>window.MediaDailyUI?window.MediaDailyUI.open('tonight'):window.MediaToolsUI?.open('tonight')],
      [t('Library care','Arşiv bakımı'),()=>window.MediaToolsUI?.open('health')],
      [t('Activity','İşlemler'),()=>window.MediaExperience?.openTasks()]
    ]) toolsGroup.append(button(label, () => { setMenu(false); return run(); }));
    const settings=button('',()=>window.AppSettingsUI.open());settings.id='mhSettings';settings.classList.add('mh-settings-icon');settings.title=t('Settings','Ayarlar');settings.setAttribute('aria-label',settings.title);
    const gear=document.createElementNS('http://www.w3.org/2000/svg','svg');gear.setAttribute('viewBox','0 0 24 24');gear.setAttribute('aria-hidden','true');gear.setAttribute('fill','none');gear.setAttribute('stroke','currentColor');gear.setAttribute('stroke-width','1.6');
    const outline=document.createElementNS(gear.namespaceURI,'path');let points=[];for(let i=0;i<32;i++){const angle=i*Math.PI/16-Math.PI/2,r=i%4===1||i%4===2?10:8;points.push((12+Math.cos(angle)*r).toFixed(2)+','+(12+Math.sin(angle)*r).toFixed(2));}outline.setAttribute('d','M'+points.join('L')+'Z');const center=document.createElementNS(gear.namespaceURI,'circle');center.setAttribute('cx','12');center.setAttribute('cy','12');center.setAttribute('r','3.2');gear.append(outline,center);settings.append(gear);actions.append(settings);
    const mainPages = [];
    const nav = el('nav', 'mh-nav'); nav.setAttribute('aria-label', t('Media navigation', 'Medya gezinmesi'));
    for (const [key, label] of [['home', t('Home', 'Ana sayfa')], ['discover', t('Discover', 'Keşfet')], ['stremio', 'Stremio'], ['films', t('Films', 'Filmler')], ['series', t('Series', 'Diziler')], ['watched',t('My viewing','İzlediklerim')], ['recommend',t('Recommendations','Öneriler')], ['anime','Anime'], ['manga','Manga / Manhwa'], ['recall', t('Content network', 'İçerik ağı')], ['feeds', t('Feeds (RSS)', 'Akışlar (RSS)')], ['radio', t('Radio / podcast', 'Radyo / podcast')], ['taste', t('My taste','Zevkim')], ['web', 'Web'], ['recent', t('Recent', 'Son oynatılanlar')]]) {
      const control = button(label, () => page(key)); control.dataset.homePage = key;
      control.setAttribute('aria-current', state.page === key ? 'page' : 'false');
      if (key === 'home') control.id = 'mhHome';
      control.addEventListener('click', () => setMenu(false));
      if (['home','discover','watched'].includes(key)) { if (key === 'watched') control.textContent = t('My library', 'Kütüphanem'); mainPages.push(control); nav.append(control); }   // Stremio/Filmler/Diziler/Öneriler/Akışlar/Zevkim üst çubuğu şişirmez; menüde
      else extraNav.append(control);
    }
    // Üst çubukta yer açmak için taşınan sayfalara (Stremio, Filmler, Diziler, Öneriler, Akışlar, Zevkim…) görünür tek giriş.
    const moreNav = button(t('More', 'Daha fazla'), () => setMenu(menu.hidden)); moreNav.classList.add('mh-nav-more'); moreNav.setAttribute('aria-haspopup', 'menu'); nav.append(moreNav);
    extraNav.append(button(t('Browser scripts','Tarayıcı scriptleri'),()=>window.UserscriptManagerUI.open()),button(t('Browser engine & memory','Tarayıcı motoru ve bellek'),()=>window.BrowserMechanismsUI.open()));
    extraNav.append(button(t('Application updates','Uygulama güncellemeleri'),()=>{setMenu(false);window.ApplicationUpdatesUI.open();}));
    const searchWrap = el('div', 'mh-search'), search = el('input'); searchWrap.id='mhSearchRegion';search.type = 'search'; search.id = 'mhSearch'; search.maxLength = 200;
    search.placeholder = t('Search your library', 'Kütüphanende ara'); search.setAttribute('aria-label', search.placeholder); search.value = state.query;
    let searchTimer;
    const searchToggle=button('',()=>{setSearchOpen(!state.searchOpen);if(state.searchOpen)search.focus();},'mh-action mh-search-toggle');searchToggle.id='mhSearchToggle';searchToggle.setAttribute('aria-controls',searchWrap.id);
    const searchClear=button(t('Clear','Temizle'),()=>{clearTimeout(searchTimer);search.value='';state.query='';state.limit=48;updateSearch();renderContent();search.focus();},'mh-search-clear');searchClear.setAttribute('aria-label',t('Clear library search','Kütüphane aramasını temizle'));
    function updateSearch(){searchClear.hidden=!search.value;searchWrap.classList.toggle('has-query',!!search.value);searchToggle.setAttribute('aria-expanded',String(state.searchOpen));searchToggle.setAttribute('aria-label',t('Search library','Kütüphanede ara'));searchToggle.title=search.value?t(`Search: ${search.value}`,`Arama: ${search.value}`):t('Search library','Kütüphanede ara');searchToggle.classList.toggle('has-query',!!search.value);}
    function setSearchOpen(open){state.searchOpen=open;header.classList.toggle('mh-search-open',open);updateSearch();}
    search.addEventListener('input', () => { state.query = search.value; state.limit = 48;updateSearch();clearTimeout(searchTimer); searchTimer = setTimeout(renderContent, 120); });
    search.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.searchOpen){event.preventDefault();event.stopPropagation();setSearchOpen(false);searchToggle.focus();}});
    search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void window.MediaSearchUI.open(search.value);}});
    const searchAll=button('',()=>window.MediaSearchUI.open(search.value),'mh-search-all');searchAll.setAttribute('aria-label',t('Search all media sources','Tüm medya kaynaklarında ara'));searchAll.title=t('Search all sources · Enter','Tüm kaynaklarda ara · Enter');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0');svg.append(path);searchAll.append(svg);searchToggle.append(svg.cloneNode(true));actions.prepend(searchToggle);searchWrap.append(search,searchClear,searchAll);actions.append(searchWrap);setSearchOpen(state.searchOpen);
    const content = el('main', 'mh-content'); content.id = 'mhContent';
    header.append(launcher, modes, nav, actions);
    function fitHeader() {
      if (window.MediaChrome?.ownsHome(header)) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!header.isConnected) return;
        const compact = header.clientWidth < 1100;
        const quick=header.querySelector('.mh-quick-actions .mv-overflow-panel');if(quick){if(header.clientWidth<600)quick.append(settings);else actions.append(settings);}
        header.classList.toggle('is-compact', compact);
        if (compact) modeSlot.append(modes); else header.insertBefore(modes, nav);
        modeSlot.hidden = !compact;
        for (const control of mainPages) nav.append(control);
        // Move complete controls, never clip labels or create a second navigation row.
        while (nav.scrollWidth > nav.clientWidth + 1 && nav.children.length > 1) {
          extraNav.prepend(nav.lastElementChild);
        }
      });
    }
    const resize = new ResizeObserver(fitHeader); resize.observe(header);
    document.fonts?.ready.then(() => { if (header.isConnected) fitHeader(); });
    disposeShell = () => { lifetime.abort(); resize.disconnect(); cancelAnimationFrame(resizeFrame); clearTimeout(openTimer); clearTimeout(closeTimer); };
    const metadata=el('div','mh-metadata');metadata.id='mhMetadataStatus';host.append(header,metadata, content);
    window.MediaChrome?.mountHome({header,launcher,modes,nav,actions,settings,browser,menu,setMenu,signal:lifetime.signal});
    fitHeader();drawMetadata(metadata);renderContent();
    if (focused && host.querySelector(`#${focused}`)) document.getElementById(focused).focus();
  }
  async function refresh({metadata=true,preserveDiscovery=false}={}) {
    const scroll=host.scrollTop;
    const request = ++state.request;
    const results = await Promise.allSettled([
      Promise.resolve().then(() => window.api.mediaCatalog({ action: 'list' })),
      Promise.resolve().then(() => window.api.listWatchLibrary()),
    ]);
    if (request !== state.request) return;
    const catalogResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const history = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : null;
    state.error = [!catalogResult?.ok?t('Title catalog could not be loaded.','Yapım kataloğu yüklenemedi.'):'',!history?t('Playback history could not be loaded.','Oynatma geçmişi yüklenemedi.'):''].filter(Boolean).join(' ');
    state.data = model.snapshot(catalogResult?.ok ? catalogResult.items : state.data.items, history || state.data.watch);
    state.loaded = true;
    if (state.active&&!(preserveDiscovery&&state.page==='discover')) {
      renderContent();host.scrollTop=scroll;
      if (watchlistReturn && !document.getElementById('mediaTitleDialog')?.open) {
        const target = watchlistReturn;watchlistReturn = null;
        if (target.page === state.page && state.filter === 'planned') {
          const cards = new Map([...host.querySelectorAll('[data-home-item]')].map(card => [card.dataset.homeItem, card]));
          const card = target.keys.map(key => cards.get(key)).find(Boolean);
          (card || host.querySelector('[data-watchlist-filter]'))?.focus({preventScroll:true});
          host.scrollTop = target.scroll;
          if (card && card.dataset.homeItem !== target.keys[0]) card.scrollIntoView({block:'nearest'});
        }
      }
    }
    if(metadata)void initialSettingsReady.then(()=>syncMetadata('start'));
  }
  let metadataState={},metadataTimer,metadataBusy=false,metadataPending='',metadataVersion=0,metadataDismissed=false;
  function drawMetadata(target){
    if(!target)return;target.replaceChildren();target.classList.add('mv-toast');const job=metadataState;
    target.hidden=metadataDismissed||!job.configured||(!job.running&&!job.total&&!job.issue);
    if(target.hidden)return;
    const text=el('div');const message=job.running?t(`Updating film information · ${job.done}/${job.total}`,`Film bilgileri güncelleniyor · ${job.done}/${job.total}`):job.stopped?t('Artwork update stopped','Afiş güncellemesi durduruldu'):t(`${job.updated||0} titles updated`,`${job.updated||0} yapım güncellendi`);
    const detail=job.issue==='auth'?t('TMDB credential rejected. Check Settings.','TMDB anahtarı reddedildi. Ayarları kontrol et.'):job.issue==='rate'?t('TMDB rate limit reached. Retry later.','TMDB istek sınırı. Daha sonra yeniden dene.'):job.running?job.current:job.unmatched?t(`${job.unmatched} titles need manual matching.`,`${job.unmatched} yapım elle eşleştirilmeli.`):job.failed?t(`${job.failed} could not be retrieved. Retry when connected.`,`${job.failed} yapım alınamadı. Bağlantını kontrol edip yeniden dene.`):t('Your ratings and watch progress were kept.','Kişisel puanların ve izleme ilerlemen korundu.');
    const combined=!job.running&&job.issue!=='auth'&&job.issue!=='rate'?[job.unmatched?t(`${job.unmatched} need manual matching.`,`${job.unmatched} yapım elle eşleştirilmeli.`):'',job.failed?t(`${job.failed} could not be retrieved.`,`${job.failed} yapım alınamadı.`):'',job.noPoster?t(`${job.noPoster} have no TMDB poster.`,`${job.noPoster} yapımın TMDB afişi yok.`):''].filter(Boolean).join(' '):'';
    text.append(el('strong','',message),el('small','',combined||detail||''));text.setAttribute('role','status');target.append(text);
    if(job.running){const progress=el('progress');progress.max=job.total;progress.value=job.done;progress.setAttribute('aria-label',message);target.append(progress,button(t('Stop','Durdur'),()=>syncMetadata('cancel')));}
    else target.append(button(t('Refresh missing info','Eksik bilgileri yenile'),()=>syncMetadata('retry')));
    if(job.unmatched||job.issue==='auth')target.append(button(t('Review matches','Eşleşmeleri incele'),()=>window.AppSettingsUI.open('metadata')));
    const close=button('',()=>{metadataDismissed=true;target.hidden=true;},'mv-toast-close');close.setAttribute('aria-label',t('Dismiss update notification','Güncelleme bildirimini kapat'));close.title=close.getAttribute('aria-label');close.append(window.MediaVisual?.icon('close')||document.createTextNode('×'));target.append(close);
  }
  async function syncMetadata(mode='status'){
    if(mode==='retry')metadataDismissed=false;
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
  // Keşfet açıkken kendi listesini yerinde yeniler (MediaDiscoveryUI.refreshLoaded); sayfayı baştan kurmak odağı ve konumu düşürür.
  document.addEventListener('media-library-changed', event => { if (state.active) void refresh(event.detail?.origin==='discovery-personal'?{metadata:false,preserveDiscovery:true}:{preserveDiscovery:true}); });
  // Do not switch workspace or touch saved jobs, captions, tabs or dub state on startup.
  renderShell(); setHome(true);
  window.MediaHomeUI=Object.freeze({openRecallNode:async id=>{await returnHome();page('recall');await recallView?.reload();await recallView?.openNode(id);},openFeedEntry:async id=>{await returnHome();page('feeds');await feedsView?.reload();return await feedsView?.openEntry(id);},currentPage:()=>state.page,emptyState,returnHome,resumeWorkspace,openStudio,navigate:async(value)=>{await returnHome();page(value);}});
})();
