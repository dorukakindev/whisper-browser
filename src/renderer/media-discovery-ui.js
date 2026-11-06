(() => {
  'use strict';
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const score = value => window.MediaVisual?.score?.(value) || String(value);
  const genre = value => window.MediaVisual?.genre?.(value) ?? value;
  const failure = error => window.MediaDiscoveryErrors?.message(error,window.UiLocale?.get?.()) || error?.message || String(error);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = String(text); return node; };
  const state = { root: null, tab: 'browse', kind: 'film', mode: 'top', genre: '', year: new Date().getFullYear(), query: '', loadedQuery: '', view:'unwatched', rows: [], skip: 0, next: null, request: 0, busy: false, loadError: false, retryAppend: false, needsRatings: false, scope: '' };
  let restoreControl = '', drawGeneration = 0, shelfRequest = 0;
  const recommendationReason = row => window.DiscoveryPersonalUI?.reason(row) || {kind:'catalog',label:t('Catalog selection','Katalog seçkisi'),text:t('No verified personal recommendation evidence.','Doğrulanmış kişisel öneri dayanağı yok.')};
  const btn = (label, callback, cls = 'mh-action') => {
    const node = el('button', cls, label); node.type = 'button';
    node.addEventListener('click', () => Promise.resolve().then(callback).catch(error => { const local=node.closest('.media-title-page')?.querySelector('.md-status');if(local){local.textContent=failure(error);local.classList.add('mh-error');}else status(failure(error), true); })); return node;
  };
  async function api(action, input = {}) {
    const result = await window.api.mediaDiscovery({ action, ...input });
    if (!result?.ok) throw Object.assign(Error(result?.error || t('Discovery could not be loaded.', 'Keşfet yüklenemedi.')), {errorCode:result?.errorCode});
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
    let translationToken = null, personalView = null;
    const mediaOrigin = document.activeElement?.closest?.('[data-discovery-id]')?.dataset.discoveryId === row.providerId ? window.UiMotion?.captureMedia(document.activeElement.closest('[data-discovery-id]')) : null;
    if(!document.body.classList.contains('media-home-active')||!document.getElementById('playerLayer')?.classList.contains('hidden'))await window.MediaHomeUI.returnHome();
    const dialog = window.MediaTitleUI.createPage('md-detail media-surface',{key:JSON.stringify(['discovery',row.kind,row.providerId,row.year])}); dialog.dataset.uiUntranslated = ''; dialog.setAttribute('aria-label', row.title);
    const close = btn(t('← Back to Discover','← Keşfete dön'), () => dialog.close(), 'mh-action md-page-back'); close.setAttribute('aria-label', t('Close details', 'Ayrıntıları kapat'));
    const placeholder = el('p', 'md-status', t('Loading details…', 'Ayrıntılar yükleniyor…')); placeholder.setAttribute('role', 'status'); dialog.append(close, placeholder);
    if(row.feedback)dialog.append(btn(t('Undo preference', 'Tercihi geri al'),async()=>{await api('feedback',{id:row.providerId,kind:row.kind,title:row.title,state:'none'});if(!dialog.open)return;state.rows=state.rows.filter(item=>item.providerId!==row.providerId||item.kind!==row.kind);dialog.close();cards();}));
    const opener = document.activeElement;  if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion();
    dialog.addEventListener('close', () => { personalView?.dispose();if(translationToken)void window.api.mediaDiscovery({action:'synopsis-stop',kind:row.kind,id:row.providerId,token:translationToken}).catch(()=>{});dialog.remove(); opener?.isConnected && opener.focus(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); }, { once: true });
    let result;
    try { result = await api('detail', { kind: row.kind, id: row.providerId }); }
    catch (error) { if (dialog.open) {placeholder.textContent = `${t('Could not load details: ', 'Ayrıntılar alınamadı: ')}${failure(error)}`;dialog.append(btn(t('Retry details','Ayrıntıları yeniden dene'),()=>{dialog.close();return details(row);},'mh-action md-detail-retry'));} return; }
    if (!dialog.open) return;
    const item = result.item; if(!item||item.kind!==row.kind||item.providerId!==row.providerId){placeholder.textContent=t('Title identity changed. Reopen the selected title.','Yapım kimliği değişti. Seçtiğin yapımı yeniden aç.');return {ok:false};} dialog.dataset.pageKind='discovery';
    const body = el('div', 'md-detail-body'), content = el('div', 'md-detail-copy');
    window.MediaExperience?.setContext(dialog, { id: `discovery:${item.kind}:${item.providerId}`, type: 'discovery-title', title: item.title, synopsis: item.synopsis });
    content.append(el('h1', '', item.title), el('p', 'md-meta', [item.year, item.rating ? `IMDb ${score(item.rating)}/10` : '', item.runtime ? `${item.runtime} ${t('min', 'dk')}` : '', item.kind === 'series' ? t('Series', 'Dizi') : t('Film', 'Film')].filter(Boolean).join(' · ')));
    const basis = recommendationReason(row);
    const explanation = el('details', 'md-recommendation-basis');
    explanation.dataset.reasonKind = basis.kind;
    const summary = el('summary');
    summary.append(el('span', '', t('Why this title?', 'Bu yapım neden burada?')),
      el('span', 'md-basis-label', basis.label));
    explanation.append(summary, el('p', 'md-basis-text', basis.text));
    explanation.open = basis.kind === 'personal';
    content.append(explanation);
    const genres = el('div', 'md-chips'); item.genres.forEach(value => genres.append(el('span', '', genre(value)))); content.append(genres);
    const storyHeading=el('div','md-story-heading'),synopsis=el('p','md-synopsis',item.synopsisTr||item.synopsis||t('No synopsis is available for this title.','Bu yapımın açıklaması henüz yok.'));
    storyHeading.append(el('h3','',t('Story','Konu')));
    if(item.synopsis){let translated=item.synopsisTr||'',showOriginal=false;const translate=btn(translated?t('Show original','Özgününü göster'):t('Translate to Turkish','Türkçeye çevir'),async()=>{
      if(translated){showOriginal=!showOriginal;synopsis.textContent=showOriginal?item.synopsis:translated;translate.textContent=showOriginal?t('Show Turkish','Türkçesini göster'):t('Show original','Özgününü göster');return;}
      translate.disabled=true;translationToken=crypto.randomUUID();const token=translationToken;placeholder.textContent=t('Translating the story…','Konu çevriliyor…');
      try{const r=await window.api.mediaDiscovery({action:'synopsis-translate',kind:row.kind,id:row.providerId,token});if(!dialog.open||translationToken!==token)return;if(!r?.ok)throw Error(r?.error||t('Translation stopped.','Çeviri durduruldu.'));translated=r.item.synopsisTr;synopsis.textContent=translated;translate.textContent=t('Show original','Özgününü göster');placeholder.textContent=t('Turkish · AI translation','Türkçe · AI çevirisi');}
      catch(error){if(dialog.open)placeholder.textContent=failure(error);}
      finally{if(translationToken===token)translationToken=null;if(dialog.open)translate.disabled=false;}
    });translate.dataset.discoveryAction='translate';storyHeading.append(translate);}
    content.append(storyHeading,synopsis);
    const actions = el('div', 'mh-actions md-primary-actions');
    const options=el('details','md-detail-options'),preferences=el('section','md-option-group'),preferenceActions=el('div','md-option-actions');
    options.append(el('summary','',t('More actions & viewing preferences','Diğer işlemler ve izleme tercihleri')));
    preferences.append(el('h3','',t('Your discovery preferences','Keşif tercihlerin')),el('p','md-provider',t('Not interested? Hide this title from discovery. Restore hidden titles in Preferences. Use your viewing status above to mark a title watched.','İlgini çekmedi mi? Yapımı keşiften gizle. Gizlediğin yapımları Tercihler bölümünden geri alabilirsin. İzledim için yukarıdaki izleme durumunu kullan.')),preferenceActions);options.append(preferences);
    for (const [value, label] of [['hidden', t('Not interested', 'İlgilenmiyorum')], ['none', t('Undo preference', 'Tercihi geri al')]]) {
      if (value === 'none' && !row.feedback) continue;
      preferenceActions.append(btn(label, async () => {
        await api('feedback', { id: row.providerId, kind: row.kind, title: row.title, state: value });
        state.rows = state.rows.filter(item => item.providerId !== row.providerId || item.kind !== row.kind);
        dialog.close(); cards(); status(t('Preference saved. Undo it in Preferences.', 'Tercih kaydedildi. Tercihler bölümünden geri alabilirsin.'));
      }));
    }
    const add = btn(result.catalogId ? t('Open in library', 'Kütüphanede aç') : t('Add to watchlist', 'İzleneceklere ekle'), async () => {
      add.disabled = true;
      try {
        const saved=result.catalogId?null:await api('add', { kind: item.kind, id: item.providerId });
        if(saved&&(!saved.item?.id||saved.item.kind!==item.kind||saved.item.imdbId!==item.providerId))throw Error(t('Saved title identity could not be verified. Retry.','Kaydedilen yapımın kimliği doğrulanamadı. Yeniden dene.'));
        const catalogId = result.catalogId || saved.item.id;
        result.catalogId = catalogId;
        refreshMembership();
        document.dispatchEvent(new CustomEvent('media-library-changed'));
        if(!dialog.open)return;
        dialog.close();
        await window.MediaTitleUI.open(catalogId);
      } catch (error) { placeholder.textContent = failure(error); add.disabled = false; }
    }, 'mh-action mh-primary');
    const membership=el('p','md-provider md-membership');membership.setAttribute('role','status');content.append(membership);
    function refreshMembership(){add.textContent=result.catalogId?t('Open in library','Kütüphanede aç'):t('Add to watchlist','İzleneceklere ekle');membership.textContent=result.catalogId?t('In your library','Kütüphanende'):t('Not in your library','Kütüphanende yok');}
    refreshMembership();let membershipRequest=0;const membershipAbort=new AbortController();dialog.addEventListener('close',()=>membershipAbort.abort(),{once:true});
    async function refreshTitleMembership(event){const identity=event.detail?.identity;if(identity&&(identity.kind!==item.kind||identity.imdbId!==item.providerId))return;const ticket=++membershipRequest;try{const fresh=await api('detail',{kind:item.kind,id:item.providerId});if(!dialog.open||ticket!==membershipRequest)return;result.catalogId=fresh.catalogId;refreshMembership();}catch(error){if(dialog.open&&ticket===membershipRequest)placeholder.textContent=failure(error);}}
    for(const event of ['media-personal-changed','media-library-changed'])document.addEventListener(event,refreshTitleMembership,{signal:membershipAbort.signal});
    const credits=el('section','md-option-group');credits.append(el('h3','',t('Credits & source','Oyuncular ve kaynak')));
    if (item.cast.length) credits.append(el('p', 'md-cast', `${t('Cast', 'Oyuncular')}: ${item.cast.join(', ')}`));
    credits.append(btn(t('IMDb page', 'IMDb sayfası'), async () => {
      dialog.close(); document.getElementById('openPlayer').click();
      document.getElementById('browserAddress').value = `https://www.imdb.com/title/${item.providerId}/`;
      await navigateBrowserFromAddress();
    }),el('p', 'md-provider', t('Metadata: Cinemeta / IMDb. Adding a title does not download a video.', 'Yapım bilgileri: Cinemeta / IMDb. Kütüphaneye eklemek video indirmez.')));options.append(credits);
    const reviews=btn(t('Letterboxd reviews & analysis','Letterboxd yorumları ve analiz'),async()=>{
      reviews.disabled=true;
      try{dialog.querySelector('[data-review-action=load]')?.click();}
      catch(error){if(dialog.open)placeholder.textContent=failure(error);}
      finally{if(dialog.open)reviews.disabled=false;}
    });reviews.dataset.discoveryAction='reviews';actions.append(add,reviews);
    const reviewNote=el('small','md-provider md-review-note',t('Reviews and analysis stay on this film page.','Yorumları ve analizi bu film sayfasında incele.'));
    // Keep the everyday choices next to the title, before a long synopsis.
    content.insertBefore(actions,storyHeading);content.insertBefore(reviewNote,storyHeading);content.append(options);
    const personal=el('div','md-personal-host');content.insertBefore(personal,storyHeading);personalView=window.PersonalMediaUI?.mount(personal,{item,identity:{kind:item.kind,imdbId:item.imdbId||item.providerId}});
    placeholder.textContent = '';
    const hero=el('section','md-page-hero'),background=el('div','md-page-backdrop');background.setAttribute('aria-hidden','true');
    const backdrop=safeImage(item.backdrop);if(backdrop){const art=el('img');art.src=backdrop;art.alt='';art.referrerPolicy='no-referrer';art.addEventListener('load',()=>hero.classList.add('has-art'),{once:true});art.addEventListener('error',()=>background.remove(),{once:true});background.append(art);}
    const narrative=el('section','md-page-story'),lower=el('div','md-page-lower'),side=el('aside','md-page-aside');
    narrative.append(storyHeading,synopsis);
    side.append(credits,options);lower.append(narrative,side);
    body.append(image(item.poster || row.poster, 'md-detail-poster'),content);hero.append(background,body);dialog.append(hero,lower);
    const reviewSection=el('section','mtd-review');lower.append(reviewSection);window.MediaReviewDecision?.mountTitle(reviewSection,{...item,id:`discovery:${item.kind}:${item.providerId}`,imdbId:item.providerId,discovery:{kind:item.kind,id:item.providerId}});window.FilmContextFeatures?.mount(narrative,{...item,id:`discovery:${item.kind}:${item.providerId}`,imdbId:item.providerId,discovery:{kind:item.kind,id:item.providerId}},()=>details(row));window.FilmPageEnhancements?.enhance(dialog,item);window.CinemaUI?.film(dialog,item);
    dialog.restorePosition?.();window.UiMotion?.mediaTransfer(mediaOrigin, dialog.querySelector('.cn-film-poster'));
    window.UiMotion?.reveal(dialog, 'page');
    return dialog.open?{ok:true,itemId:'discovery:'+row.kind+':'+row.providerId}:{ok:false};
  }
  function drawFeature() {
    const slot = state.root?.querySelector('.cn-feature-slot'); if (!slot) return;
    if (state.tab !== 'browse' || state.query.trim()) { slot.replaceChildren(); return; }
    const featured = state.rows.filter(item => safeImage(item.backdrop)).slice(0, 5);
    if (!featured.length) { slot.replaceChildren(); return; }
    const featureKey=JSON.stringify(featured.map(row=>[row.kind,row.providerId,row.backdrop,row.title,row.rating,row.synopsis]));
    if(slot.firstElementChild?.dataset.featureKey===featureKey)return;
    const previousId=slot.firstElementChild?.dataset.featureId;
    slot.replaceChildren();
    const hero = el('section', 'cn-hero cn-discover-hero'); hero.hidden = true;
    hero.dataset.featureKey=featureKey;
    hero.setAttribute('aria-label', t('Featured titles', 'Öne çıkan yapımlar'));
    hero.setAttribute('aria-roledescription',t('carousel','karusel'));
    let wrap=el('div','cn-hero-art');const content=el('div','cn-container cn-hero-content');
    const controls=el('div','cn-discover-carousel'),dots=el('div','cn-discover-dots');
    let active=Math.max(0,featured.findIndex(row=>row.providerId===previousId)),generation=0;
    const drawSlide=index=>{
      active=(index+featured.length)%featured.length;
      const row=featured[active],current=++generation;
      hero.dataset.featureId=row.providerId;
      const artwork=el('img');artwork.alt='';artwork.src=safeImage(row.backdrop);artwork.referrerPolicy='no-referrer';
      artwork.addEventListener('load',()=>{if(current===generation)hero.hidden=artwork.naturalWidth/artwork.naturalHeight<1.3;},{once:true});
      artwork.addEventListener('error',()=>{if(current===generation)hero.hidden=true;},{once:true});
      const previous=wrap;wrap=el('div','cn-hero-art');wrap.append(artwork);previous.before(wrap);artwork.addEventListener('load',()=>wrap.dispatchEvent(new Event('home-art-ready')),{once:true});window.CinemaMotion?.swapArtwork(hero,previous,wrap);if(!window.CinemaMotion)previous.remove();
      const copy=el('div','cn-hero-copy'),headline=el('div','cn-discover-feature-heading');
      headline.append(el('span','cn-eyebrow',t('Featured title','Öne çıkan yapım')));
      if(row.rating)headline.append(el('span','mv-feature-rating','IMDb '+score(row.rating)+'/10'));
      copy.append(headline,el('h1','',window.MediaVisual?.title(row.title)||row.title));
      const facts=[row.year,...(row.genres||[]).slice(0,3).map(genre)].filter(Boolean).join(' · ');
      if(facts)copy.append(el('p','cn-feature-facts',facts));
      if(row.synopsis)copy.append(el('p','cn-hero-description',row.synopsis));
      const open=btn(t('Explore this title','Yapımı keşfet'),()=>details(row),'mh-action cn-feature-open');
      window.CinemaUI?.rebutton(open,'primary');
      const actions=el('div','cn-hero-actions');actions.append(open);copy.append(actions);content.replaceChildren(copy);
      [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===active)));
    };
    featured.forEach((row,index)=>{
      const label=t('Show featured title: ','Öne çıkan yapımı göster: ')+row.title;
      const dot=btn('',()=>drawSlide(index),'cn-discover-dot');dot.setAttribute('aria-label',label);dot.title=label;dot.append(image(row.poster,'cv2-feature-thumb'));dots.append(dot);
    });
    const arrow=(step,label)=>{
      const button=btn('',()=>hero._cinemaCarousel?hero._cinemaCarousel.jump(active+step):drawSlide(active+step),'cn-discover-arrow');button.setAttribute('aria-label',label);button.title=label;
      const icon=el('span','',step<0?'‹':'›');icon.setAttribute('aria-hidden','true');button.append(icon);return button;
    };
    controls.append(dots,arrow(-1,t('Previous featured title','Önceki öne çıkan yapım')),arrow(1,t('Next featured title','Sonraki öne çıkan yapım')));
    controls.hidden=featured.length<2;
    hero.append(wrap,content,controls);slot.append(hero);drawSlide(active);hero._cinemaCarousel=window.CinemaMotion?.carousel(hero,{count:featured.length,getIndex:()=>active,goTo:drawSlide,indicators:dots,decorateIndicator:(button,index)=>{button.classList.add('cn-discover-dot');button.title=featured[index].title;button.setAttribute('aria-label',t('Show featured title: ','Öne çıkan yapımı göster: ')+featured[index].title);button.append(image(featured[index].poster,'cv2-feature-thumb'));}});
  }

  let closeCardMenu=null;
  let personalActions=null,personalRoot=null;
  async function setCardWatchState(row,watchStatus){return personalActions?.update(row,{watchStatus});}
  function cardMenu(event,card,row){
    event.preventDefault();event.stopPropagation();closeCardMenu?.();
    const root=state.root,menu=el('div','md-card-menu media-surface'),abort=new AbortController();menu.setAttribute('role','menu');menu.setAttribute('aria-label',row.title+' · '+t('Viewing status','İzlenme durumu'));menu.append(el('span','md-card-menu-heading',t('My viewing','İzleme durumum')));
    const close=(focus=false)=>{abort.abort();observer.disconnect();menu.remove();card.setAttribute('aria-expanded','false');if(closeCardMenu===close)closeCardMenu=null;if(focus&&card.isConnected)card.focus({preventScroll:true});};closeCardMenu=close;
    let buttons=[];const position=()=>{const r=card.getBoundingClientRect(),box=menu.getBoundingClientRect(),keyboard=event.type==='keydown',x=keyboard?r.left:event.clientX,y=keyboard?r.top+Math.min(r.height,40):event.clientY;menu.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-box.height-8))+'px';};
    const show=(more=false)=>{menu.querySelectorAll('button').forEach(n=>n.remove());const entries=personalActions?personalActions.menu(row,more):[{label:t('Watched','İzledim'),run:()=>setCardWatchState(row,'completed')},{label:t('Want to watch','İzleyeceğim'),run:()=>setCardWatchState(row,'planned')}];for(const entry of entries){const b=el('button','',entry.label);b.type='button';b.setAttribute('role',entry.checked===undefined?'menuitem':'menuitemcheckbox');if(entry.checked!==undefined)b.setAttribute('aria-checked',String(entry.checked));if(entry.more||entry.back)b.setAttribute('aria-haspopup','menu');b.disabled=!!personalActions?.isBusy();b.onclick=()=>{if(entry.more||entry.back){show(!!entry.more);return;}close(true);Promise.resolve().then(entry.run).catch(error=>status(failure(error),true));};menu.append(b);}buttons=[...menu.querySelectorAll('button')];position();buttons.find(b=>!b.disabled)?.focus({preventScroll:true});};
    document.body.append(menu);card.setAttribute('aria-expanded','true');
    show();
    document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close();},{capture:true,signal:abort.signal});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(e.key==='Tab')close();else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const i=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}},{capture:true,signal:abort.signal});
    window.addEventListener('resize',()=>close(),{signal:abort.signal});document.addEventListener('scroll',e=>{if(!menu.contains(e.target))close();},{capture:true,signal:abort.signal});
    const observer=new MutationObserver(()=>{if(!card.isConnected||state.root!==root)close();});observer.observe(state.root?.parentElement||document.body,{childList:true,subtree:true});
  }
  function cards() {
    const grid = state.root?.querySelector('.cn-catalog-grid'); if (!grid) return;
    drawFeature();
    grid.setAttribute('aria-busy', String(state.busy));
    const existing=new Map([...grid.querySelectorAll('[data-discovery-id]')].map(card=>[card.dataset.discoveryKey,card])),nodes=[];
    if (state.busy && !state.rows.length) {
      for (let i = 0; i < 6; i++) {
        const tile = el('div', 'cn-discover-skeleton'); tile.setAttribute('aria-hidden', 'true');
        tile.append(el('span', 'cn-discover-skeleton-art'), el('span', 'cn-discover-skeleton-line'), el('span', 'cn-discover-skeleton-line'));
        nodes.push(tile);
      }
    }
    personalActions?.toolbar(state.root.querySelector('.md-personal-slot'));
    for (const row of state.rows) {
      const key=row.kind+':'+row.providerId,signature=JSON.stringify([row,personalActions?.isSelecting(),personalActions?.isSelected(row)]),prior=existing.get(key);
      if(prior?._discoverySignature===signature){nodes.push(prior);continue;}
      const card = btn('', () => personalActions?.isSelecting()?personalActions.toggleRow(row):details(row), 'cn-poster'); card.dataset.discoveryId = row.providerId;card.setAttribute('aria-haspopup','menu');card.addEventListener('contextmenu',event=>cardMenu(event,card,row));card.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')cardMenu(event,card,row);});
      card.dataset.discoveryKey=key;card._discoverySignature=signature;
      const poster = image(row.poster, 'cn-poster-art');if(personalActions?.isSelecting()){card.setAttribute('aria-pressed',String(personalActions.isSelected(row)));card.classList.toggle('md-card-selected',personalActions.isSelected(row));poster.append(el('span','md-card-selector',personalActions.isSelected(row)?'✓':''));}const badge=personalActions?.badge(row);if(badge)poster.append(badge);if(row.catalogId&&!poster.querySelector('img')&&window.api.mediaCatalog)void window.api.mediaCatalog({action:'poster',id:row.catalogId}).then(r=>{if(poster.isConnected&&r?.ok&&/^data:image\/png;base64,/.test(r.image||'')){const img=el('img');img.src=r.image;img.alt='';poster.prepend(img);poster.classList.remove('md-art-empty');}}).catch(()=>{});
      if (row.rating) { const rating=el('span','cn-rating',score(row.rating)); rating.setAttribute('aria-label', t('IMDb rating ','IMDb puanı ')+score(row.rating)+'/10'); poster.append(rating); }
      card.append(poster, el('span', 'cn-poster-title', window.MediaVisual.title(row.title)),
        el('span', 'cn-poster-meta', [row.year, row.catalogId ? t('In library', 'Kütüphanede') : ''].filter(Boolean).join(' · ')));
      window.MediaVisual?.art(poster,row.title);
      if(row.because||row.profileBecause||row.directorBecause){const basis=recommendationReason(row);card.append(el('span','md-reason',basis.label+' · '+basis.text));}
      if (row.feedback) card.append(el('span','md-reason', row.feedback === 'watched' ? t('Watched','İzlendi') : t('Not interested','İlgilenilmiyor')));
      if(row.personalMedia&&(row.personalMedia.reaction||row.personalMedia.manualResume||row.personalMedia.effectiveResume||row.personalMedia.note))card.append(el('span','pm-card-summary',window.PersonalMediaUI?.summary(row.personalMedia)||''));
      nodes.push(card);
    }
    if (!state.rows.length && !state.busy && !state.loadError){
      const text=state.tab === 'preferences' ? t('No hidden or watched preferences. You can undo preferences here.', 'Gizlenen veya izlenen tercihi yok. Tercihlerini buradan geri alabilirsin.') : state.tab === 'personal'
      ? state.needsRatings?t('Like titles with genre metadata in your library to get explained recommendations.', 'Gerekçeli öneriler için kütüphanende tür bilgisi olan yapımları beğen.'):t('No new recommendations match your saved preferences right now.', 'Şu anda kayıtlı tercihlerinle eşleşen yeni öneri yok.')
      : state.next!==null?t('No visible titles on this page. Show more to check the next catalog page.', 'Bu sayfada gösterilecek yapım yok. Sonraki katalog sayfası için Daha fazla göster’i kullan.'):t('No titles matched these filters.', 'Bu filtrelerle eşleşen yapım yok.');
      if(window.MediaVisual){const action=btn(state.next!==null?t('Show more','Daha fazla göster'):state.tab==='browse'?t('Change search','Aramayı değiştir'):t('Explore titles','Yapımları keşfet'),()=>{if(state.next!==null)return load(true);if(state.tab==='browse')return state.root.querySelector('.cn-filter-search input')?.focus();state.root.querySelector('.cn-discover-tab')?.click();});nodes.push(window.MediaVisual.empty({title:t('Find your next story','Sıradaki hikâyeni bul'),text,actions:[action]}));}
      else nodes.push(el('p','mh-empty',text));
    }
    nodes.forEach((node,index)=>{if(grid.children[index]!==node)grid.insertBefore(node,grid.children[index]||null);});
    while(grid.children.length>nodes.length)grid.lastElementChild.remove();
    const context=state.root.querySelector('.cn-discover-results');if(context)context.textContent=state.busy&&!state.rows.length?'':(state.scope==='saved-library-viewing'?t('Saved library','Kayıtlı kütüphane'):state.tab==='personal'?t('Based on your preferences','Tercihlerine göre'):state.tab==='preferences'?t('Discovery exclusions','Keşiften gizlenenler'):t('Cinemeta catalog','Cinemeta kataloğu'))+' · '+state.rows.length+' '+t('titles shown','yapım gösteriliyor');
    const more = state.root.querySelector('.md-more'); more.hidden = state.tab !== 'browse' || state.next === null || state.rows.length >= 300 || state.loadError; more.disabled = state.busy;
    const retry=state.root.querySelector('.md-retry');if(retry){retry.hidden=!state.loadError;retry.disabled=state.busy;}
    state.root.querySelectorAll('[data-discovery-control]').forEach(node => { node.disabled = state.busy; });
    if(!state.busy&&restoreControl){const control=[...state.root.querySelectorAll('[data-discovery-focus]')].find(n=>n.dataset.discoveryFocus===restoreControl);restoreControl='';control?.focus({preventScroll:true});}
  }
  async function load(append = false) {
    const root = state.root, request = ++state.request, query = append ? state.loadedQuery : state.query;
    if (!root?.isConnected) return;
    restoreControl=document.activeElement?.dataset.discoveryFocus||restoreControl;
    state.loadError = false; state.busy = true; status(t('Loading titles…', 'Yapımlar yükleniyor…')); cards();
    try {
      const result = await api(state.tab === 'preferences' ? 'feedback-list' : state.tab === 'personal' ? 'personal' : 'list', { kind: state.kind, mode: state.mode, genre: state.genre, year: state.year, query, view:state.view, skip: append ? state.next : 0 });
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      const unique = new Map((append ? state.rows : []).map(row => [`${row.kind}:${row.providerId}`, row]));
      result.rows.forEach(row => unique.set(`${row.kind}:${row.providerId}`, state.tab==='browse'&&!query&&state.mode==='top'?{...row,discoveryBasis:'catalog-ranking'}:row)); state.rows = [...unique.values()].slice(0, 300); state.next = result.nextSkip ?? null;state.needsRatings=!!result.needsRatings;state.scope=result.scope||'';state.loadedQuery=query;state.retryAppend=false;
      status(result.needsRatings ? t('Add favorites and genre metadata in the library first.', 'Önce kütüphanede favori ve tür bilgisi ekle.') : '');
    } catch (error) {
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      state.loadError = true; state.retryAppend=append;if(!append)state.next = null;
      const timeout = /timeout|timed out|abort/i.test(String(error.message));
      status(window.MediaDiscoveryErrors ? failure(error)+' '+t('Your library is unchanged.','Kütüphanen değişmedi.')
        : timeout ? t('Discovery timed out. Retry; your library is unchanged.', 'Keşfet isteği zaman aşımına uğradı. Yeniden dene; kütüphanen değişmedi.')
        : t('Discovery could not be reached. Check your connection and retry; your library is unchanged.', 'Keşfet kaynağına ulaşılamadı. Bağlantını kontrol edip yeniden dene; kütüphanen değişmedi.'), true);
    } finally { if (request === state.request && root === state.root && root.isConnected) { state.busy = false; cards(); } }
  }
  function draw() {
    restoreControl=document.activeElement?.dataset.discoveryFocus||restoreControl;
    ++drawGeneration;
    const root = state.root; root.replaceChildren();if(window.DiscoveryPersonalUI&&personalRoot!==root){personalActions?.dispose();personalRoot=root;personalActions=window.DiscoveryPersonalUI.create({root,render:cards,reload:()=>load(),openDetails:details});}
    root.setAttribute('aria-label', t('Discover', 'Keşfet'));
    const tabs = el('div', 'cn-discover-tabs'); tabs.setAttribute('aria-label', t('Discovery section', 'Keşfet bölümü'));
    for (const [value, label] of [['browse', t('New & popular', 'Yeni ve popüler')], ['personal', t('For you', 'Sana özel')], ['preferences', t('Preferences', 'Tercihler')]]) {
      const node = btn(label, () => { state.tab = value; state.rows = []; state.next = null; draw(); void load(); }, 'cn-discover-tab'); node.setAttribute('aria-pressed', String(value === state.tab)); tabs.append(node);
    }
    root.classList.add('cn-discover-page','cv2-discover');const dock=el('section','cn-discover-controls'),viewRow=el('div','cn-discover-view-row');dock.setAttribute('aria-label',t('Discovery controls','Keşfet kontrolleri'));dock.append(tabs);root.append(dock);if(state.tab==='browse'){const views=el('div','cn-watch-views');views.setAttribute('aria-label',t('Viewing filter','İzlenme filtresi'));for(const [value,en,tr]of [['unwatched','Unwatched','İzlemediklerim'],['all','Include watched','Tümü'],['watched','Watched','İzlediklerim'],['watchlist','Watchlist','İzleme listem']]){const b=btn(t(en,tr),()=>{state.view=value;state.rows=[];draw();void load();},'cn-watch-choice');b.setAttribute('aria-pressed',String(state.view===value));views.append(b);}viewRow.append(views);}
    viewRow.append(btn(t('Conditional library selection','Koşullu kütüphane seçkisi'),()=>window.MediaCatalogUI.open({conditions:true}), 'cn-watch-choice'));
    const filters = el('form', 'cn-discover-filters');
    function select(label, value, options, update) {
      const wrap = el('label', 'cn-filter-field'), input = el('select'); wrap.append(el('span', '', label)); input.dataset.discoveryControl = '1';
      input.dataset.discoveryFocus=label;
      for (const [key, title] of options) { const option = el('option', '', title); option.value = key; input.append(option); } input.value = value;
      input.addEventListener('change', () => { update(input.value); state.rows = []; draw(); void load(); }); wrap.append(input); return window.MediaVisual?.filter(wrap)||wrap;
    }
    filters.append(select(t('Type', 'Yapım'), state.kind, [['film', t('Films', 'Filmler')], ['series', t('Series', 'Diziler')]], value => { state.kind = value; }));
    if (state.tab === 'browse') {
      filters.append(select(t('Show', 'Liste'), state.mode, [['top', t('Popular', 'Popüler')], ['year', t('New by year', 'Yıla göre yeni')], ['imdbRating', t('Highly rated', 'Yüksek puanlı')]], value => { state.mode = value; if (value !== 'top') state.query = ''; }));
      const genres = [['', t('All genres', 'Tüm türler')], ['Action', t('Action', 'Aksiyon')], ['Adventure', t('Adventure', 'Macera')], ['Animation', t('Animation', 'Animasyon')], ['Comedy', t('Comedy', 'Komedi')], ['Crime', t('Crime', 'Suç')], ['Documentary', t('Documentary', 'Belgesel')], ['Drama', t('Drama', 'Dram')], ['Fantasy', t('Fantasy', 'Fantastik')], ['Horror', t('Horror', 'Korku')], ['Mystery', t('Mystery', 'Gizem')], ['Romance', t('Romance', 'Romantik')], ['Sci-Fi', t('Sci-Fi', 'Bilim kurgu')], ['Thriller', t('Thriller', 'Gerilim')], ['War', t('War', 'Savaş')]];
      if (state.mode !== 'year') filters.append(select(t('Genre', 'Tür'), state.genre, genres, value => { state.genre = value; }));
      else filters.append(select(t('Year', 'Yıl'), String(state.year), Array.from({ length: 70 }, (_, index) => { const year = new Date().getFullYear() - index; return [String(year), String(year)]; }), value => { state.year = +value; }));
      const searchLabel = el('label', 'cn-filter-field cn-filter-search'); searchLabel.append(el('span', '', t('Search', 'Ara'))); const search = el('input'); search.type = 'search'; search.maxLength = 200; search.placeholder = t('Film or series title…', 'Film veya dizi adı…'); search.value = state.query; search.name = 'discoverySearch'; search.autocomplete = 'off';search.addEventListener('input',()=>{state.query=search.value;}); searchLabel.append(search); filters.append(searchLabel);
      filters.addEventListener('submit', event => { event.preventDefault(); state.query = search.value.trim(); state.mode = 'top'; state.rows = []; draw(); void load(); });
      const submit = el('button', 'mh-action', '');submit.setAttribute('aria-label',t('Search','Ara'));submit.title=submit.getAttribute('aria-label');submit.append(window.MediaVisual?.icon('search')||document.createTextNode(t('Search','Ara'))); submit.type = 'submit'; submit.dataset.discoveryControl = '1';submit.classList.add('mv-search-submit');const searchGroup=el('div','mv-search-group');filters.insertBefore(searchGroup,searchLabel);searchGroup.append(searchLabel,submit);
    } else filters.addEventListener('submit', event => event.preventDefault());
    dock.append(filters);const personalSlot=el('div','md-personal-slot');viewRow.append(personalSlot);
    const statusNode = el('p', 'md-status'); statusNode.setAttribute('role', 'status'); const grid = el('div', 'cn-catalog-grid');
    const footer = el('div', 'cn-discover-footer'); footer.append(btn(t('Show more', 'Daha fazla göster'), () => load(true), 'mh-action md-more'), btn(t('Retry', 'Yeniden dene'), () => load(state.retryAppend), 'mh-action md-retry'), el('p', 'md-provider', t('Catalog: Cinemeta, the official Stremio movie & series catalog. No account or API key required.', 'Katalog: Cinemeta, resmî Stremio film ve dizi kataloğu. Hesap veya API anahtarı gerekmez.')));
    const featureSlot=el('div','cn-feature-slot');
    const sectionTitle=el('div','cv2-discover-section-heading');sectionTitle.append(el('h2','',state.tab==='personal'?t('Chosen for you','Sana özel'):state.tab==='preferences'?t('Your discovery preferences','Keşif tercihlerin'):t('Find your next story','Sıradaki hikâyeni bul')));
    root.append(statusNode,featureSlot,sectionTitle,viewRow,el('p','cn-discover-results'),grid,footer);cards();
    if(state.tab==='browse'&&!state.query.trim())void personalShelf(root);

  }
  async function personalShelf(root) {
    const kind=state.kind, owner=drawGeneration,ticket=++shelfRequest;
    try {
      const result=await api('personal',{kind,view:'unwatched'});
      if(root!==state.root||!root.isConnected||state.tab!=='browse'||state.query.trim()||kind!==state.kind||owner!==drawGeneration||ticket!==shelfRequest)return;
      root.querySelector('.cv2-discover-personal')?.remove();
      const rows=(result.rows||[]).slice(0,8);
      if(!rows.length)return;
      const entries = rows.map(row => ({ row, basis: recommendationReason(row) }));
      const personalOnly = entries.every(({ basis }) => basis.kind === 'personal');
      const section=el('section','cv2-discover-personal'),heading=el('header');
      const text = el('div');
      text.append(el('h2', '', personalOnly ? t('For you', 'Sana özel') : t('More to explore', 'Keşfedilecek diğer yapımlar')),
        el('p', '', t('Open a title to see why it appears here.', 'Dayanağını görmek için yapımı aç.')));
      heading.append(text,btn(t('See all','Tümünü gör'),()=>{state.tab='personal';state.rows=[];state.next=null;draw();void load();},'cn-button'));
      const rail=el('div','cv2-personal-rail');
      for(const {row, basis} of entries){const card=btn('',()=>details(row),'cv2-personal-card'),art=image(row.poster,'cv2-personal-art');window.MediaVisual?.art(art,row.title);card.append(art,el('strong','',window.MediaVisual.title(row.title)));
        const label = el('small', 'md-basis-label', basis.label);
        label.dataset.reasonKind = basis.kind;
        card.append(label);
        rail.append(card);}
      section.append(heading,rail);root.querySelector('.cv2-discover-section-heading')?.before(section);
    } catch { /* Main discovery remains usable; an unavailable preview is never invented. */ }
  }
  let savedScroll = 0, restoringScroll = false;
  function snapshot(){return {tab:state.tab,kind:state.kind,mode:state.mode,genre:state.genre,year:state.year,query:state.query,loadedQuery:state.loadedQuery,view:state.view,rows:state.rows.slice(),next:state.next,needsRatings:state.needsRatings,scope:state.scope,scrollTop:state.root?.isConnected?document.getElementById('mediaHome').scrollTop:savedScroll};}
  function restore(saved){
    if(!saved||typeof saved!=='object')return;
    for(const [name,values]of Object.entries({tab:['browse','personal','preferences'],kind:['film','series'],mode:['top','year','imdbRating'],view:['unwatched','all','watched','watchlist']}))if(values.includes(saved[name]))state[name]=saved[name];
    if(typeof saved.genre==='string')state.genre=saved.genre.slice(0,80);
    if(typeof saved.query==='string')state.query=saved.query.slice(0,200);
    state.loadedQuery=typeof saved.loadedQuery==='string'?saved.loadedQuery.slice(0,200):state.query;
    if(Number.isInteger(saved.year)&&saved.year>=1920&&saved.year<=new Date().getFullYear()+1)state.year=saved.year;
    if(Array.isArray(saved.rows))state.rows=saved.rows.slice(0,300);
    state.next=Number.isSafeInteger(saved.next)&&saved.next>=0&&saved.next<=2000?saved.next:null;
    state.needsRatings=!!saved.needsRatings;state.scope=typeof saved.scope==='string'?saved.scope:'';
    savedScroll=Math.max(0,Number(saved.scrollTop)||0);state.busy=false;state.loadError=false;state.retryAppend=false;state.request++;
  }
  function refreshSurfaces(event){if(!state.root?.isConnected)return;if(event.detail?.origin!=='discovery-personal')void load();if(state.tab==='browse'&&!state.query.trim())void personalShelf(state.root);}
  document.addEventListener('media-personal-changed',refreshSurfaces);
  document.addEventListener('media-library-changed',refreshSurfaces);
  const leave = () => { state.root?.querySelector(".cn-discover-hero")?._cinemaCarousel?.dispose();closeCardMenu?.();personalActions?.dispose();personalActions=null;personalRoot=null; if (state.root?.isConnected) savedScroll = document.getElementById('mediaHome').scrollTop; state.root = null; };
  document.getElementById('mediaHome')?.addEventListener('scroll', () => { if (!restoringScroll && state.root?.isConnected) savedScroll = document.getElementById('mediaHome').scrollTop; }, { passive:true });
  window.MediaDiscoveryUI = Object.freeze({ leave, openDetail:details, snapshot, restore, mount(root,saved) {
    if(saved)restore(saved);
    const targetScroll = savedScroll; restoringScroll = true;
    const hadRows = state.rows.length > 0 && !state.busy; state.root = root; state.busy = false; draw();
    requestAnimationFrame(() => { if (root === state.root && root.isConnected && hadRows) document.getElementById('mediaHome').scrollTop = targetScroll; requestAnimationFrame(() => { restoringScroll = false; }); });
    if (!hadRows) void load();
  } });
})();
