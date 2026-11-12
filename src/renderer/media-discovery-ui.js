(() => {
  'use strict';
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const score = value => window.MediaVisual?.score?.(value) || String(value);
  const genre = value => window.MediaVisual?.genre?.(value) ?? value;
  const failure = error => window.MediaDiscoveryErrors?.message(error,window.UiLocale?.get?.()) || error?.message || String(error);
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = String(text); return node; };
  const state = { root: null, tab: 'browse', kind: 'film', mode: 'top', genre: '', year: new Date().getFullYear(), query: '', loadedQuery: '', view:'unwatched', rows: [], skip: 0, next: null, request: 0, busy: false, loadError: false, retryAppend: false, needsRatings: false, scope: '', stamp: 0, applied: 0 };
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
  // Detaydan dönerken odak hedefi: açan öğe hâlâ DOM'daysa o; kart yeniden çizildiyse aynı yapım kimliğindeki kart;
  // o da yoksa (filtre dışında kaldı) ilgili liste kontrolü.
  function returnTarget(trigger, row) {
    if (trigger?.isConnected && trigger !== document.body) return trigger;
    const key = row.kind + ':' + row.providerId;
    return [...(state.root?.querySelectorAll('[data-discovery-key]') || [])].find(node => node.dataset.discoveryKey === key)
      || state.root?.querySelector('.cn-watch-choice[aria-pressed=true]') || state.root?.querySelector('.cn-filter-search input') || null;
  }
  async function details(row, detailOptions = {}) {
    let translationToken = null, personalView = null, sourceDispose = null;
    const backLabel=()=>typeof detailOptions.backLabel==='function'?detailOptions.backLabel():t('← Back to Discover','← Keşfete dön');
    const fallback=detailOptions.fallbackDetail?.item?.kind===row.kind&&detailOptions.fallbackDetail.item.providerId===row.providerId?detailOptions.fallbackDetail:null;
    const external=!!fallback&&!/^tt\d{7,12}$/.test(row.providerId||'');
    const trigger = document.activeElement;
    const mediaOrigin = document.activeElement?.closest?.('[data-discovery-id]')?.dataset.discoveryId === row.providerId ? window.UiMotion?.captureMedia(document.activeElement.closest('[data-discovery-id]')) : null;
    if(!document.body.classList.contains('media-home-active')||!document.getElementById('playerLayer')?.classList.contains('hidden'))await window.MediaHomeUI.returnHome();
    const dialog = window.MediaTitleUI.createPage('md-detail media-surface',{key:JSON.stringify(['discovery',row.kind,row.providerId,row.year]),returnFocus:()=>detailOptions.returnFocus?.()||returnTarget(trigger,row)}); dialog.dataset.uiUntranslated = ''; dialog.setAttribute('aria-label', row.title);
    const close = btn(backLabel(), async () => {dialog.close();await detailOptions.onReturn?.();}, 'mh-action md-page-back'); close.setAttribute('aria-label', t('Close details', 'Ayrıntıları kapat'));
    const placeholder = el('p', 'md-status', t('Loading details…', 'Ayrıntılar yükleniyor…')); placeholder.setAttribute('role', 'status'); dialog.append(close, placeholder);
    if(row.feedback)dialog.append(btn(t('Undo preference', 'Tercihi geri al'),async()=>{await api('feedback',{id:row.providerId,kind:row.kind,title:row.title,state:'none'});if(!dialog.open)return;state.rows=state.rows.filter(item=>item.providerId!==row.providerId||item.kind!==row.kind);dialog.close();cards();}));
    const opener = document.activeElement;  if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion();
    dialog.addEventListener('close', () => { personalView?.dispose();sourceDispose?.();if(translationToken)void window.api.mediaDiscovery({action:'synopsis-stop',kind:row.kind,id:row.providerId,token:translationToken}).catch(()=>{});dialog.remove(); if (typeof syncBrowserOcclusion === 'function') syncBrowserOcclusion(); }, { once: true });
    let result;
    try { result = external?fallback:await api('detail', { kind: row.kind, id: row.providerId }); }
    catch (error) {if(fallback)result=fallback;else{if (dialog.open) {placeholder.textContent = `${t('Could not load details: ', 'Ayrıntılar alınamadı: ')}${failure(error)}`;dialog.append(btn(t('Retry details','Ayrıntıları yeniden dene'),()=>{dialog.close();return details(row,detailOptions);},'mh-action md-detail-retry'));} return;}}
    if (!dialog.open) return;
    const item = result.item; if(!item||item.kind!==row.kind||item.providerId!==row.providerId){placeholder.textContent=t('Title identity changed. Reopen the selected title.','Yapım kimliği değişti. Seçtiğin yapımı yeniden aç.');return {ok:false};} dialog.dataset.pageKind='discovery';dialog.dataset.sourceOnly=String(external);if(detailOptions.navigationPage==='stremio')dialog.dataset.filmNavigationPage='stremio';
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
    if(item.synopsis&&!external){let translated=item.synopsisTr||'',showOriginal=false;const translate=btn(translated?t('Show original','Özgününü göster'):t('Translate to Turkish','Türkçeye çevir'),async()=>{
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
    preferences.append(el('h3','',t('Your discovery preferences','Keşif tercihlerin')),el('p','md-provider',t('Hide affects Discover visibility only; restore in Preferences. Recommendation feedback/deferral and personal ratings are separate. Use viewing status above to mark watched.','Gizle yalnız Keşfet görünürlüğünü etkiler; Tercihler’den geri alabilirsin. Öneri geri bildirimi/erteleme ve kişisel puan ayrıdır. İzledim için yukarıdaki izleme durumunu kullan.')),preferenceActions);options.append(preferences);
    for (const [value, label] of [['hidden', t('Not interested', 'İlgilenmiyorum')], ['none', t('Undo preference', 'Tercihi geri al')]]) {
      if (value === 'none' && !row.feedback) continue;
      preferenceActions.append(btn(label, async () => {
        await api('feedback', { id: row.providerId, kind: row.kind, title: row.title, state: value });
        state.rows = state.rows.filter(item => item.providerId !== row.providerId || item.kind !== row.kind);
        dialog.close(); cards(); status(t('Preference saved. Undo it in Preferences.', 'Tercih kaydedildi. Tercihler bölümünden geri alabilirsin.'));
      }));
    }
    const openLibrary = async catalogId => { dialog.close(); await window.MediaTitleUI.open(catalogId, { returnFocus: () => detailOptions.returnFocus?.()||returnTarget(trigger, row), backLabel }); };
    // Kütüphanedeyse bu düğme gerçek kayıt kimliğini açar; değilse ekler ve kullanıcıyı bu sayfada bırakır.
    // Başarı metni yalnız doğrulanmış yanıttan sonra görünür.
    const add = btn(result.catalogId ? t('Open in library', 'Kütüphanede aç') : t('Add to watchlist', 'İzleneceklere ekle'), async () => {
      add.disabled = true;
      try {
        if (result.catalogId) { await openLibrary(result.catalogId); return; }
        const saved = await api('add', { kind: item.kind, id: item.providerId });
        if(!saved.item?.id||saved.item.kind!==item.kind||saved.item.imdbId!==item.providerId)throw Error(t('Saved title identity could not be verified. Retry.','Kaydedilen yapımın kimliği doğrulanamadı. Yeniden dene.'));
        document.dispatchEvent(new CustomEvent('media-library-changed'));
        if(!dialog.open)return;
        result.catalogId = saved.item.id; listed = saved.item.watchStatus || 'planned';
        refreshMembership();
        placeholder.textContent = t('Added to your watchlist.', 'İzleme listene eklendi.');
      } catch (error) { if(dialog.open) placeholder.textContent = failure(error); }
      finally { if (dialog.open) add.disabled = false; }
    }, 'mh-action mh-primary');
    // Çıkarma yeni bir yazma yolu açmaz: mevcut "İzleme durumum" önizleme/onay akışını "Belirtilmedi" ile başlatır.
    const remove = btn(t('Remove from watchlist', 'İzleme listesinden çıkar'), async () => {
      if(remove.disabled)return;
      remove.disabled=true;
      try {
      // The detail metadata may arrive before the personal record. Wait for that read;
      // dispatching change to a disabled select is ignored by the confirmation owner.
      let select;
      placeholder.classList.remove('mh-error');
      placeholder.textContent=t('Preparing viewing controls…','İzleme denetimleri hazırlanıyor…');
      for(let attempt=0;attempt<40&&dialog.open;attempt++){
        select=dialog.querySelector('.md-personal-host .pm-watch select');
        if(select&&!select.disabled)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!dialog.open)return;
      if(!select||select.disabled)throw Error(t('The viewing controls are not ready yet. Try again in a moment.', 'İzleme denetimleri henüz hazır değil. Biraz sonra yeniden dene.'));
      if (select.value !== 'unspecified') { select.value = 'unspecified'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      placeholder.textContent = t('Review the change, then confirm. Nothing is removed until you confirm.', 'Değişikliği incele ve onayla. Onaylayana kadar hiçbir şey çıkarılmaz.');
      // Önizleme "İzleme ve kaynaklar" bölümünde oluşur; kullanıcıyı oraya götür ve onay düğmesine odakla.
      for (let attempt = 0; attempt < 40 && dialog.open; attempt++) {
        const box = dialog.querySelector('.pm-preview');
        if (box) { const group = box.closest('details'); if (group) group.open = true; box.scrollIntoView({ block: 'center' }); box.querySelector('button')?.focus({ preventScroll: true }); return; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if(dialog.open)throw Error(t('The preview is not ready. Check the viewing controls and retry.','Önizleme hazır değil. İzleme denetimlerini kontrol edip yeniden dene.'));
      } finally { if(dialog.open)remove.disabled=false; }
    }, 'mh-action md-remove-watchlist'); remove.hidden = true;
    // Üyelik satırı: durum metni (canlı bölge) ve yanında bağlamsal “listeden çıkar” eylemi tek kapta; CinemaUI kabı birlikte taşır.
    const membership=el('div','md-provider md-membership'),membershipLabel=el('span','md-membership-text');membershipLabel.setAttribute('role','status');membership.append(membershipLabel);content.append(membership);
    let listed = item.watchStatus || 'unspecified', latest = item, stripRefresh = () => {}, pulse = () => {};
    function membershipText(){if(!result.catalogId)return t('Not in your library','Kütüphanende yok');const base=t('In your library','Kütüphanende');return listed==='planned'?base+' · '+t('On your watchlist','İzleme listende'):listed==='watching'?base+' · '+t('Watching','İzleniyor'):listed==='completed'?base+' · '+t('Watched','İzlendi'):base;}
    // CinemaUI düğmeyi simge + etiket olarak yeniden kurar: etiketle birlikte simge de duruma uymalı (kütüphanedeyse "+" yanıltıcıdır).
    function setAddLabel(){const text=result.catalogId?t('Open in library','Kütüphanede aç'):t('Add to watchlist','İzleneceklere ekle'),span=add.querySelector(':scope>span');if(!span){add.textContent=text;return;}span.textContent=text;const icon=add.querySelector(':scope>svg'),next=window.CinemaUI?.icon?.(result.catalogId?'folder':'plus');if(icon&&next&&icon.outerHTML!==next.outerHTML)icon.replaceWith(next);add.title=text;add.setAttribute('aria-label',text);}
    function refreshMembership(){setAddLabel();const nextText=membershipText(),changed=!!membershipLabel.textContent&&membershipLabel.textContent!==nextText;membershipLabel.textContent=nextText;remove.hidden=!(result.catalogId&&listed==='planned');if(changed)pulse();}
    refreshMembership();let membershipRequest=0;const membershipAbort=new AbortController();dialog.addEventListener('close',()=>membershipAbort.abort(),{once:true});
    async function refreshTitleMembership(event){const identity=event.detail?.identity;if(identity&&(identity.kind!==item.kind||identity.imdbId!==item.providerId))return;const ticket=++membershipRequest;try{const fresh=await api('detail',{kind:item.kind,id:item.providerId});if(!dialog.open||ticket!==membershipRequest)return;result.catalogId=fresh.catalogId;listed=fresh.item?.watchStatus||(fresh.catalogId?listed:'unspecified');if(fresh.item)latest=fresh.item;refreshMembership();stripRefresh();}catch(error){if(dialog.open&&ticket===membershipRequest)placeholder.textContent=failure(error);}}
    if(!external)for(const event of ['media-personal-changed','media-library-changed'])document.addEventListener(event,refreshTitleMembership,{signal:membershipAbort.signal});
    const credits=el('section','md-option-group');credits.append(el('h3','',t('Credits & source','Oyuncular ve kaynak')));
    if (item.cast.length) credits.append(el('p', 'md-cast', `${t('Cast', 'Oyuncular')}: ${item.cast.join(', ')}`));
    if(!external)credits.append(btn(t('IMDb page', 'IMDb sayfası'), async () => {
      dialog.close(); document.getElementById('openPlayer').click();
      document.getElementById('browserAddress').value = `https://www.imdb.com/title/${item.providerId}/`;
      await navigateBrowserFromAddress();
    }),el('p', 'md-provider', t('Metadata: Cinemeta / IMDb. Adding a title does not download a video.', 'Yapım bilgileri: Cinemeta / IMDb. Kütüphaneye eklemek video indirmez.')));options.append(credits);
    const reviews=btn(t('Letterboxd reviews & analysis','Letterboxd yorumları ve analiz'),async()=>{
      reviews.disabled=true;
      try{dialog.querySelector('[data-review-action=load]')?.click();}
      catch(error){if(dialog.open)placeholder.textContent=failure(error);}
      finally{if(dialog.open)reviews.disabled=false;}
    });reviews.dataset.discoveryAction='reviews';if(!external)actions.append(add,reviews);membership.append(remove);
    if(item.kind==='film'&&!external&&window.RecommendationHubUI){const recommend=btn(t('Recommend similar','Benzerlerini öner'),()=>window.RecommendationHubUI.open({...row,...item}),'mh-action');recommend.dataset.discoveryAction='recommend';actions.append(recommend);}
    const reviewNote=el('small','md-provider md-review-note',t('Reviews and analysis stay on this film page.','Yorumları ve analizi bu film sayfasında incele.'));
    // Keep the everyday choices next to the title, before a long synopsis.
    content.insertBefore(actions,storyHeading);content.insertBefore(reviewNote,storyHeading);content.append(options);
    const personal=el('div','md-personal-host');content.insertBefore(personal,storyHeading);if(!external)personalView=window.PersonalMediaUI?.mount(personal,{item,identity:{kind:item.kind,imdbId:item.imdbId||item.providerId}});
    if(external){membership.hidden=true;reviewNote.textContent=t('Addon metadata. IMDb-based reviews and personal discovery controls are unavailable for this identity; source-specific tools remain below.','Eklenti bilgileri. Bu kimlik için IMDb tabanlı yorumlar ve kişisel Keşfet denetimleri kullanılamıyor; kaynağa özel araçlar aşağıda.');preferences.remove();}
    placeholder.textContent = '';
    const hero=el('section','md-page-hero'),background=el('div','md-page-backdrop');background.setAttribute('aria-hidden','true');
    const backdrop=safeImage(item.backdrop);if(backdrop){const art=el('img');art.src=backdrop;art.alt='';art.referrerPolicy='no-referrer';art.addEventListener('load',()=>hero.classList.add('has-art'),{once:true});art.addEventListener('error',()=>background.remove(),{once:true});background.append(art);}
    const narrative=el('section','md-page-story'),lower=el('div','md-page-lower'),side=el('aside','md-page-aside');
    narrative.append(storyHeading,synopsis);
    side.append(credits,options);lower.append(narrative,side);
    body.append(image(item.poster || row.poster, 'md-detail-poster'),content);hero.append(background,body);dialog.append(hero,lower);
    if(!external){const reviewSection=el('section','mtd-review');lower.append(reviewSection);window.MediaReviewDecision?.mountTitle(reviewSection,{...item,id:`discovery:${item.kind}:${item.providerId}`,imdbId:item.providerId,discovery:{kind:item.kind,id:item.providerId}});window.FilmContextFeatures?.mount(narrative,{...item,id:`discovery:${item.kind}:${item.providerId}`,imdbId:item.providerId,discovery:{kind:item.kind,id:item.providerId}},()=>details(row,detailOptions));}window.FilmPageEnhancements?.enhance(dialog,item,{sourceOnly:external});window.CinemaUI?.film(dialog,item);
    setAddLabel();
    // Üyelik · devam konumu · kaynaklar: hero'da eylemlerin hemen altında tek şerit. Yerel/web/erişilemeyen kaynak ve dizide sezon/bölüm ayrı gösterilir.
    let stripTicket=0;
    function mountStrip(){
      const copy=dialog.querySelector('.cn-film-copy'),actions=copy?.querySelector('.cn-hero-actions');if(!copy||!actions)return;
      const strip=el('section','md-status-strip');strip.setAttribute('aria-label',t('Library, progress and sources','Kütüphane, devam konumu ve kaynaklar'));
      const make=(cls,label)=>{const cell=el('div','md-strip-cell md-strip-'+cls),value=el('div','md-strip-value');cell.append(el('small','',label),value);strip.append(cell);return {cell,value};};
      const member=make('member',t('Library','Kütüphane')),resume=make('resume',t('Continue','Devam')),sources=make('sources',t('Sources','Kaynaklar'));
      member.value.append(membership);actions.after(strip);
      pulse=()=>{if(window.CinemaMotion?.mode==='off'||window.CinemaMotion?.mode==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;member.cell.animate([{background:'color-mix(in srgb, var(--cn-gold, #d8a657) 26%, transparent)'},{background:'transparent'}],{duration:900,easing:'ease-out'});};
      const clock=seconds=>{const s=Math.max(0,Math.round(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60,p=n=>String(n).padStart(2,'0');return h?h+':'+p(m)+':'+p(r):m+':'+p(r);};
      const chip=(kind,text)=>{const node=el('span','md-strip-chip',text);node.dataset.kind=kind;return node;};
      stripRefresh=async()=>{
        const ticket=++stripTicket,owned=result.catalogId,stale=()=>!dialog.open||ticket!==stripTicket||result.catalogId!==owned;
        if(!owned){resume.cell.hidden=true;sources.cell.dataset.state='none';sources.value.replaceChildren(el('span','md-strip-note',t('Add it to your watchlist first, then link a video source.','Önce izleneceklere ekle, ardından video kaynağı bağla.')));return;}
        resume.cell.hidden=false;
        const [libraryResult,overview]=await Promise.allSettled([Promise.resolve().then(()=>window.api.mediaCatalog?.({action:'list'})),Promise.resolve().then(()=>window.api.mediaTools?.({action:'film-watch-overview',itemId:owned}))]);
        if(stale())return;
        const libraryRows=libraryResult.status==='fulfilled'&&libraryResult.value?.ok&&Array.isArray(libraryResult.value.items)?libraryResult.value.items:null;
        const row=libraryRows?.find(entry=>entry.id===owned);
        const list=overview.status==='fulfilled'&&overview.value?.ok&&Array.isArray(overview.value.sources)?overview.value.sources:null;
        const usable=entry=>!entry.needsRelink&&entry.available!==false,web=entry=>entry.type==='browser'||entry.type==='youtube';
        const all=list||[row?.source,...(row?.episodes||[]).map(episode=>episode.source),...(row?.editions||[]).map(edition=>edition.source)].filter(Boolean);
        const counts={local:all.filter(entry=>usable(entry)&&!web(entry)).length,web:all.filter(entry=>usable(entry)&&web(entry)).length,broken:list?all.filter(entry=>!usable(entry)).length:0};
        const parts=[];
        if(counts.local)parts.push(chip('local',t(counts.local+(counts.local===1?' local file':' local files'),counts.local+' yerel dosya')));
        if(counts.web)parts.push(chip('web',t(counts.web+(counts.web===1?' web link':' web links'),counts.web+' web bağlantısı')));
        if(counts.broken)parts.push(chip('broken',t(counts.broken+(counts.broken===1?' unreachable source':' unreachable sources'),counts.broken+' kaynağa erişilemiyor')));
        const sourcesUnknown=!list&&!row;
        if(sourcesUnknown)parts.push(chip('unknown',t('Source details could not be read. Use Open in library to retry.','Kaynak bilgileri okunamadı. Yeniden denemek için Kütüphanede aç.')));
        else if(!parts.length)parts.push(chip('none',t('No source linked yet','Henüz kaynak bağlı değil')));
        if(!list&&row&&all.length)parts.push(chip('unknown',t('Availability not checked','Erişilebilirlik doğrulanmadı')));
        const episodes=row?.episodes||[];
        if(item.kind==='series'&&episodes.length){const seasons=new Set(episodes.map(episode=>episode.season)).size,linked=episodes.filter(episode=>episode.source).length;parts.push(chip('episodes',t(seasons+' seasons · '+linked+'/'+episodes.length+' episodes linked',seasons+' sezon · '+linked+'/'+episodes.length+' bölümün kaynağı bağlı')));}
        sources.cell.dataset.state=sourcesUnknown?'error':counts.broken?'warn':counts.local+counts.web?'ready':'none';sources.value.replaceChildren(...parts);
        const pm=latest.personalMedia||{},at=pm.effectiveResume||pm.manualResume||null,best=list?[...list].filter(entry=>usable(entry)&&entry.position>0).sort((a,b)=>(b.lastWatched||0)-(a.lastWatched||0))[0]:null;
        const seconds=at?.positionSeconds??best?.position;
        let text;
        if(latest.watchStatus==='completed')text=t('Watched','İzlendi');
        else if(at?.season!=null&&at?.number!=null)text=t('Season '+at.season+' · Episode '+at.number,'Sezon '+at.season+' · Bölüm '+at.number)+(seconds>0?' · '+clock(seconds):'');
        else if(seconds>0)text=t('Resume at ','Kaldığın yer ')+clock(seconds);
        else text=t('Not started yet','Henüz başlanmadı');
        resume.cell.dataset.state=seconds>0||at?'active':'idle';resume.value.replaceChildren(el('span','md-strip-main',text));if(at){resume.value.append(el('small','md-strip-note',(at.origin==='playback'?t('Playback record','Oynatma kaydı'):t('Manual record','Elle kayıt'))+' · '+(Number(at.updatedAt)>0?new Date(Number(at.updatedAt)).toLocaleString(t('en-GB','tr-TR')):t('Date unknown','Tarih bilinmiyor'))));if(item.kind==='series'&&row){const episode=episodes.find(e=>e.id===at.episodeId||e.season===at.season&&e.number===at.number);if(episode)resume.value.append(btn(t('Inspect this episode source','Bu bölümün kaynağını incele'),()=>window.MediaCatalogUI.open({id:row.id,episodeId:episode.id}),'mh-text-button'));}}
      };
      void stripRefresh();
    }
    if(!external)mountStrip();
    if(typeof detailOptions.onReady==='function'&&dialog.open){const dispose=detailOptions.onReady({page:dialog,item,actions:dialog.querySelector('.cn-hero-actions')||actions,sourceHost:dialog.querySelector('.cv2-film-sources')||lower,status:placeholder,close:()=>dialog.close()});if(typeof dispose==='function')sourceDispose=dispose;}
    // Uzun başlık kırpılsa da tam başlığa erişilebilir (ipucu) ve kütüphane sayfasındaki küçültme sınıfı uygulanır.
    { const heading = dialog.querySelector('.cn-film-copy h1'); if (heading) { heading.title = item.title; if (Array.from(item.title).length > 36) heading.classList.add('cn-title-long'); } }
    dialog.restorePosition?.();window.UiMotion?.mediaTransfer(mediaOrigin, dialog.querySelector('.cn-film-poster'));
    window.UiMotion?.reveal(dialog, 'page');
    return dialog.open?{ok:true,itemId:'discovery:'+row.kind+':'+row.providerId}:{ok:false};
  }
  function drawFeature() {
    const slot = state.root?.querySelector('.cn-feature-slot'); if (!slot) return;
    if (state.tab !== 'browse' || state.query.trim()) { slot.replaceChildren(); return; }
    const featured = state.rows.filter(item => safeImage(item.backdrop)).slice(0, 5);
    if (!featured.length) { slot.replaceChildren(); return; }
    const featureKey=JSON.stringify(featured.map(row=>[row.kind,row.providerId,row.backdrop,row.title,row.rating,row.synopsis,row.catalogId,row.watchStatus||row.personalMedia?.watchStatus,recommendationReason(row)]));
    if(slot.firstElementChild?.dataset.featureKey===featureKey)return;
    const previousHero=slot.firstElementChild,previousId=previousHero?.dataset.featureId;
    const focused=document.activeElement,focusSelector=['.cn-feature-open','.cn-discover-dot','.cn-discover-arrow'].find(selector=>slot.contains(focused)&&focused.matches(selector));
    const focusIndex=focusSelector?[...slot.querySelectorAll(focusSelector)].indexOf(focused):-1;
    slot.replaceChildren();
    const hero = el('section', 'cn-hero cn-discover-hero'); hero.hidden = previousHero?.hidden ?? true;
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
      // Üst satır tek hizada: etiket · puan · gerekçe. Gerekçe yalnız gerçek veriden gelir: katalog sıralaması ile kişisel öneri ayrı biçimlenir.
      const basis=recommendationReason(row),basisChip=el('span','cn-feature-basis',basis.label);basisChip.dataset.reasonKind=basis.kind;basisChip.title=basis.text;
      headline.append(el('span','cn-eyebrow',t('Featured title','Öne çıkan yapım')));
      if(row.rating)headline.append(el('span','mv-feature-rating','IMDb '+score(row.rating)+'/10'));
      headline.append(basisChip);
      copy.append(headline,el('h1','',window.MediaVisual?.title(row.title)||row.title));
      const facts=[row.kind==='series'?t('Series','Dizi'):'',row.year,...(row.genres||[]).slice(0,3).map(genre)].filter(Boolean).join(' · ');
      if(facts)copy.append(el('p','cn-feature-facts',facts));
      if(basis.kind==='personal')copy.append(el('p','cn-feature-reason',basis.text));
      if(row.synopsis)copy.append(el('p','cn-hero-description',row.synopsis));
      const open=btn(t('Explore this title','Yapımı keşfet'),()=>details(row),'mh-action cn-feature-open');
      window.CinemaUI?.rebutton(open,'primary');
      const actions=el('div','cn-hero-actions');actions.append(open);
      if(row.catalogId){const owned=el('span','cn-feature-owned',t('In your library','Kütüphanende'));owned.dataset.state=row.watchStatus||row.personalMedia?.watchStatus||'';actions.append(owned);}
      copy.append(actions);content.replaceChildren(copy);
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
    if(focusSelector&&!focused.isConnected&&document.activeElement===document.body)hero.querySelectorAll(focusSelector)[focusIndex]?.focus({preventScroll:true});
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
    const activeNow=document.activeElement,focusedCard=activeNow&&grid.contains(activeNow)?activeNow.closest('[data-discovery-key]'):null,focusedKey=focusedCard?.dataset.discoveryKey||'',focusedIndex=focusedCard?[...grid.querySelectorAll('[data-discovery-key]')].indexOf(focusedCard):-1;
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
      if(prior?._discoverySignature===signature){nodes.push(prior.closest('.cn-discover-entry')||prior);continue;}
      const card = btn('', () => personalActions?.isSelecting()?personalActions.toggleRow(row):details(row), 'cn-poster'); card.dataset.discoveryId = row.providerId;card.setAttribute('aria-haspopup','menu');card.addEventListener('contextmenu',event=>cardMenu(event,card,row));card.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')cardMenu(event,card,row);});
      card.dataset.discoveryKey=key;card._discoverySignature=signature;
      const poster = image(row.poster, 'cn-poster-art');if(personalActions?.isSelecting()){card.setAttribute('aria-pressed',String(personalActions.isSelected(row)));card.classList.toggle('md-card-selected',personalActions.isSelected(row));poster.append(el('span','md-card-selector',personalActions.isSelected(row)?'✓':''));}const badge=personalActions?.badge(row);if(badge)poster.append(badge);if(row.catalogId&&!poster.querySelector('img')&&window.api.mediaCatalog)void window.api.mediaCatalog({action:'poster',id:row.catalogId}).then(r=>{if(poster.isConnected&&r?.ok&&/^data:image\/png;base64,/.test(r.image||'')){const img=el('img');img.src=r.image;img.alt='';poster.prepend(img);poster.classList.remove('md-art-empty');}}).catch(()=>{});
      if (row.rating) { const rating=el('span','cn-rating',score(row.rating)); rating.setAttribute('aria-label', t('IMDb rating ','IMDb puanı ')+score(row.rating)+'/10'); poster.append(rating); }
      const cardMeta=el('span','cn-poster-meta');cardMeta.append(el('span','cn-poster-year',row.year||''));
      if(row.catalogId){const state=el('span','cn-poster-state',t('In library','Kütüphanede'));state.dataset.state=row.watchStatus||row.personalMedia?.watchStatus||'';cardMeta.append(state);}
      card.title=row.title+(row.year?' ('+row.year+')':'');
      card.append(poster, el('span', 'cn-poster-title', window.MediaVisual.title(row.title)), cardMeta);
      window.MediaVisual?.art(poster,row.title);
      if(state.tab==='personal'||row.because||row.profileBecause||row.directorBecause){const basis=recommendationReason(row),reason=el('span','md-reason',basis.label+' · '+basis.text);reason.title=reason.textContent;card.append(reason);}
      if (row.feedback) card.append(el('span','md-reason', row.feedback === 'watched' ? t('Watched','İzlendi') : t('Not interested','İlgilenilmiyor')));
      if(row.personalMedia&&(row.personalMedia.reaction||row.personalMedia.manualResume||row.personalMedia.effectiveResume||row.personalMedia.note))card.append(el('span','pm-card-summary',window.PersonalMediaUI?.summary(row.personalMedia)||''));
      if(state.tab==='preferences'&&row.feedback){const entry=el('article','cn-discover-entry'),restore=btn(row.feedback==='watched'?t('Remove discovery watched exclusion','Keşifteki izlendi dışlamasını kaldır'):t('Unhide in Discover','Keşfette gizlemeyi kaldır'),async()=>{restore.disabled=true;try{await api('feedback',{id:row.providerId,kind:row.kind,title:row.title,state:'none'});state.rows=state.rows.filter(item=>item.providerId!==row.providerId||item.kind!==row.kind);cards();status(t('Discovery exclusion removed. Personal rating and viewing history are unchanged.','Keşif dışlaması kaldırıldı. Kişisel puan ve izleme geçmişi değişmedi.'));}catch(error){restore.disabled=false;throw error;}},'mh-action md-restore-preference');restore.setAttribute('aria-label',restore.textContent+' · '+row.title);entry.append(card,el('small','md-provider',t('Removes only this discovery exclusion; keeps viewing history and ratings.','Yalnız bu keşif dışlamasını kaldırır; izleme geçmişi ve puanlar korunur.')),restore);nodes.push(entry);}else nodes.push(card);
    }
    if (!state.rows.length && !state.busy && !state.loadError){
      const text=state.tab === 'preferences' ? t('No hidden or watched preferences. You can undo preferences here.', 'Gizlenen veya izlenen tercihi yok. Tercihlerini buradan geri alabilirsin.') : state.tab === 'personal'
      ? state.needsRatings?t('Like titles with genre metadata in your library to get explained recommendations.', 'Gerekçeli öneriler için kütüphanende tür bilgisi olan yapımları beğen.'):t('No new recommendations match your saved preferences right now.', 'Şu anda kayıtlı tercihlerinle eşleşen yeni öneri yok.')
      : state.next!==null?t('No visible titles on this page. Show more to check the next catalog page.', 'Bu sayfada gösterilecek yapım yok. Sonraki katalog sayfası için Daha fazla göster’i kullan.'):t('No titles matched these filters.', 'Bu filtrelerle eşleşen yapım yok.');
      const empty = el('section', 'cn-discover-empty');
      empty.append(el('h3', '', t('No titles to show', 'Gösterilecek yapım yok')));
      if (state.tab === 'browse' && state.loadedQuery) {
        const query = el('bdi', 'cn-discover-empty-query', state.loadedQuery);
        empty.append(query);
      }
      empty.append(el('p', '', text));
      const actions = el('div', 'cn-discover-empty-actions');
      if (state.tab === 'browse') {
        if (state.next !== null) actions.append(btn(t('Show more', 'Daha fazla göster'), () => load(true), 'cn-button'));
        const search = state.root.querySelector('.cn-filter-search input');
        actions.append(btn(t('Change search', 'Aramayı değiştir'), () => search?.focus(), 'cn-button'));
        if (state.loadedQuery || state.genre || state.mode !== 'top' || state.view !== 'unwatched') {
          actions.append(btn(t('Reset search and filters', 'Arama ve filtreleri sıfırla'), () => {
            Object.assign(state, { query: '', loadedQuery: '', mode: 'top', genre: '', view: 'unwatched', rows: [], next: null });
            restoreControl = 'search';
            draw();
            void load();
          }, 'cn-button'));
        }
      } else {
        if(state.tab==='personal'&&state.needsRatings){actions.append(btn(t('Review library ratings and genres','Kütüphanedeki puan ve türleri incele'),()=>window.MediaHomeUI.navigate(state.kind==='series'?'series':'films'),'cn-button'));empty.append(el('p','md-provider',t('Open an existing title to review your own rating, reaction and genre metadata. Nothing is liked or edited automatically.','Kendi puanını, tepkini ve tür bilgisini incelemek için mevcut bir yapımı aç. Otomatik beğeni veya düzenleme yapılmaz.')));}actions.append(btn(t('Explore titles', 'Yapımları keşfet'), () => state.root.querySelector('.cn-discover-tab')?.click(), 'cn-button'));
      }
      empty.append(actions);
      nodes.push(empty);
    }
    // Var olan kartları yerinde bırak (taşımak odağı düşürür): önce artıkları kaldır, sonra yalnız yenileri ekle.
    const keep=new Set(nodes);for(const child of [...grid.children])if(!keep.has(child))child.remove();
    nodes.forEach((node,index)=>{if(grid.children[index]!==node)grid.insertBefore(node,grid.children[index]||null);});
    if(focusedKey&&(document.activeElement===document.body||!document.activeElement?.isConnected)){
      const all=[...grid.querySelectorAll('[data-discovery-key]')],target=all.find(n=>n.dataset.discoveryKey===focusedKey)||all[Math.min(Math.max(focusedIndex,0),all.length-1)]||state.root.querySelector('.cn-watch-choice[aria-pressed=true]')||state.root.querySelector('.cn-filter-search input');
      target?.focus({preventScroll:true});
    }
    const context=state.root.querySelector('.cn-discover-results');if(context)context.textContent=state.busy&&!state.rows.length?'':(state.scope==='saved-library-viewing'?t('Saved library','Kayıtlı kütüphane'):state.tab==='personal'?t('Based on your preferences','Tercihlerine göre'):state.tab==='preferences'?t('Discovery exclusions','Keşiften gizlenenler'):t('Cinemeta catalog','Cinemeta kataloğu'))+' · '+state.rows.length+' '+t('titles shown','yapım gösteriliyor');
    const more = state.root.querySelector('.md-more'); more.hidden = state.tab !== 'browse' || state.next === null || !state.rows.length || state.rows.length >= 300 || state.loadError; more.disabled = state.busy;
    const retry=state.root.querySelector('.md-retry');if(retry){retry.hidden=!state.loadError;retry.disabled=state.busy;}
    state.root.querySelectorAll('[data-discovery-control]').forEach(node => { node.disabled = state.busy; });
    if(!state.busy&&restoreControl){const control=[...state.root.querySelectorAll('[data-discovery-focus]')].find(n=>n.dataset.discoveryFocus===restoreControl);restoreControl='';control?.focus({preventScroll:true});}
  }
  async function load(append = false) {
    const root = state.root, request = ++state.request, query = append ? state.loadedQuery : state.query, stamp = state.stamp;
    if (!root?.isConnected) return;
    restoreControl=document.activeElement?.dataset.discoveryFocus||restoreControl;
    state.loadError = false; state.busy = true; status(t('Loading titles…', 'Yapımlar yükleniyor…')); cards();
    try {
      const result = await api(listAction(state.tab), { kind: state.kind, mode: state.mode, genre: state.genre, year: state.year, query, view:state.view, skip: append ? state.next : 0 });
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      const unique = new Map((append ? state.rows : []).map(row => [`${row.kind}:${row.providerId}`, row]));
      result.rows.forEach(row => unique.set(`${row.kind}:${row.providerId}`, state.tab==='browse'&&!query&&state.mode==='top'?{...row,discoveryBasis:'catalog-ranking'}:row)); state.rows = [...unique.values()].slice(0, 300); state.next = result.nextSkip ?? null;state.needsRatings=!!result.needsRatings;state.scope=result.scope||'';state.loadedQuery=query;state.retryAppend=false;if(!append)state.applied=Math.max(state.applied,stamp);
      status(result.needsRatings ? t('Add favorites and genre metadata in the library first.', 'Önce kütüphanede favori ve tür bilgisi ekle.') : '');
    } catch (error) {
      if (request !== state.request || root !== state.root || !root.isConnected) return;
      state.loadError = true; state.retryAppend=append;if(!append)state.next = null;
      const timeout = /timeout|timed out|abort/i.test(String(error.message));
      status(window.MediaDiscoveryErrors ? failure(error)+' '+t('Your library is unchanged.','Kütüphanen değişmedi.')
        : timeout ? t('Discovery timed out. Retry; your library is unchanged.', 'Keşfet isteği zaman aşımına uğradı. Yeniden dene; kütüphanen değişmedi.')
        : t('Discovery could not be reached. Check your connection and retry; your library is unchanged.', 'Keşfet kaynağına ulaşılamadı. Bağlantını kontrol edip yeniden dene; kütüphanen değişmedi.'), true);
    } finally { if (request === state.request && root === state.root && root.isConnected) { state.busy = false; cards(); if (state.applied < state.stamp && !state.loadError) void refreshLoaded(); } }
  }
  const listAction = tab => tab === 'preferences' ? 'feedback-list' : tab === 'personal' ? 'personal' : 'list';
  // Kütüphane/kişisel durum değişince yüklenmiş sayfaların tamamını yerinde yeniler: satırlar, sıra, sorgu,
  // filtreler ve "Daha fazla" imleci korunur; yalnız sağlayıcının güncel üyelik/izleme bilgisi uygulanır.
  // Sonuç yalnız istek hâlâ geçerliyse uygulanır; araya giren aramayı, filtreyi veya sayfa isteğini ezmez.
  async function refreshLoaded() {
    const root = state.root;
    if (!root?.isConnected) return;
    if (state.busy) return; // sürmekte olan istek bitince, kütüphane sürümü uygulanmadıysa yenileme onun ardından çalışır
    const request = ++state.request, tab = state.tab, query = state.loadedQuery, previousNext = state.next, stamp = state.stamp;
    const base = { kind: state.kind, mode: state.mode, genre: state.genre, year: state.year, query, view: state.view };
    const current = () => request === state.request && root === state.root && root.isConnected;
    try {
      const fresh = []; let skip = 0, next = null, first = null;
      for (let guard = 0; guard < 30; guard++) {
        const result = await api(listAction(tab), { ...base, skip });
        if (!current()) return;
        first ||= result; fresh.push(...result.rows);
        next = result.nextSkip ?? null;
        if (next === null || (previousNext !== null && next >= previousNext) || fresh.length >= 300) break;
        skip = next;
      }
      const unique = new Map();
      fresh.forEach(row => unique.set(`${row.kind}:${row.providerId}`, tab === 'browse' && !query && state.mode === 'top' ? { ...row, discoveryBasis: 'catalog-ranking' } : row));
      state.rows = [...unique.values()].slice(0, 300); state.next = next; state.needsRatings = !!first?.needsRatings; state.scope = first?.scope || '';
      state.applied = Math.max(state.applied, stamp);
      cards();
    } catch (error) {
      if (!current()) return;
      status(failure(error) + ' ' + t('The list below is the last loaded one.', 'Aşağıdaki liste son yüklenen listedir.'), true);
    }
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
    viewRow.append(btn(t('Conditional library selection','Kütüphaneden seç'),()=>window.MediaCatalogUI.open({conditions:true}), 'cn-watch-choice'));
    /* G25: the conditions that narrow this list, each removable, plus one way back to the defaults. Counts keep meaning "this loaded response". */
    let activeChipsRow = null;
    {
      const active = [];
      if (state.loadedQuery) active.push([t('Search: ', 'Arama: ') + state.loadedQuery, () => { state.query = ''; state.loadedQuery = ''; }]);
      if (state.genre) active.push([t('Genre: ', 'Tür: ') + state.genre, () => { state.genre = ''; }, 'genre']);
      if (state.tab === 'browse' && state.view !== 'unwatched') active.push([t('Viewing: ', 'Görünüm: ') + ({ all: t('All', 'Tümü'), watched: t('Watched', 'İzlediklerim'), watchlist: t('Watchlist', 'İzleme listem') })[state.view], () => { state.view = 'unwatched'; }]);
      if (active.length) {
        const chips = el('div', 'cn-active-filters'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', t('Active filters', 'Etkin filtreler'));
        for (const [label, clear, kind] of active) {
          const chip = btn(label + ' ×', () => { clear(); state.rows = []; state.next = null; draw(); void load(); }, 'cn-watch-choice cn-active-chip');
          chip.title = t('Remove this filter', 'Bu filtreyi kaldır'); if (kind) chip.dataset.chip = kind; chips.append(chip);
        }
        chips.append(btn(t('Back to defaults', 'Varsayılana dön'), () => { Object.assign(state, { query: '', loadedQuery: '', mode: 'top', genre: '', view: 'unwatched', rows: [], next: null }); draw(); void load(); }, 'cn-watch-choice'));
        activeChipsRow = chips;
      }
    }
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
      { const gc = activeChipsRow?.querySelector('[data-chip=genre]'), hit = genres.find(([key]) => key === state.genre); if (gc && hit) gc.textContent = t('Genre: ', 'Tür: ') + hit[1] + ' ×'; }
      if (state.mode !== 'year') filters.append(select(t('Genre', 'Tür'), state.genre, genres, value => { state.genre = value; }));
      else filters.append(select(t('Year', 'Yıl'), String(state.year), Array.from({ length: 70 }, (_, index) => { const year = new Date().getFullYear() - index; return [String(year), String(year)]; }), value => { state.year = +value; }));
      const searchLabel = el('label', 'cn-filter-field cn-filter-search'); searchLabel.append(el('span', '', t('Search', 'Ara'))); const search = el('input'); search.type = 'search'; search.maxLength = 200; search.placeholder = t('Film or series title…', 'Film veya dizi adı…'); search.value = state.query; search.name = 'discoverySearch'; search.dataset.discoveryFocus = 'search'; search.autocomplete = 'off';search.addEventListener('input',()=>{state.query=search.value;}); searchLabel.append(search); filters.append(searchLabel);
      filters.addEventListener('submit', event => { event.preventDefault(); state.query = search.value.trim(); state.mode = 'top'; state.rows = []; draw(); void load(); });
      const submit = el('button', 'mh-action', '');submit.setAttribute('aria-label',t('Search','Ara'));submit.title=submit.getAttribute('aria-label');submit.append(window.MediaVisual?.icon('search')||document.createTextNode(t('Search','Ara'))); submit.type = 'submit'; submit.dataset.discoveryControl = '1';submit.classList.add('mv-search-submit');const searchGroup=el('div','mv-search-group');filters.insertBefore(searchGroup,searchLabel);searchGroup.append(searchLabel,submit);
    } else filters.addEventListener('submit', event => event.preventDefault());
    dock.append(filters);const personalSlot=el('div','md-personal-slot');viewRow.append(personalSlot);
    const statusNode = el('p', 'md-status'); statusNode.setAttribute('role', 'status'); const grid = el('div', 'cn-catalog-grid');
    const footer = el('div', 'cn-discover-footer'); footer.append(btn(t('Show more', 'Daha fazla göster'), () => load(true), 'mh-action md-more'), btn(t('Retry', 'Yeniden dene'), () => load(state.retryAppend), 'mh-action md-retry'), el('p', 'md-provider', t('Catalog: Cinemeta, the official Stremio movie & series catalog. No account or API key required.', 'Katalog: Cinemeta, resmî Stremio film ve dizi kataloğu. Hesap veya API anahtarı gerekmez.')));
    const featureSlot=el('div','cn-feature-slot');
    const sectionTitle=el('div','cv2-discover-section-heading');sectionTitle.append(el('h2','',state.tab==='personal'?t('Chosen for you','Sana özel'):state.tab==='preferences'?t('Your discovery preferences','Keşif tercihlerin'):t('Find your next story','Sıradaki hikâyeni bul')));
    if(state.tab==='personal')sectionTitle.append(el('p','md-provider',t('Personal evidence: your saved ratings or explicit likes. Catalog and metadata relationships are labelled separately and are not a personal fit guarantee.','Kişisel dayanak: kayıtlı puanın veya açık beğenin. Katalog ve metadata ilişkileri ayrı etiketlenir; kişisel uygunluk garantisi değildir.')));if(state.tab==='browse')sectionTitle.append(filters);   // Yapım/Liste/Tür filtreleri ikinci sabit şeritte değil, katalog başlığının sağında
    root.append(statusNode,featureSlot,sectionTitle,viewRow,...(activeChipsRow?[activeChipsRow]:[]),el('p','cn-discover-results'),grid,footer);cards();
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
  let savedScroll = 0, restoringScroll = false, savedFocusKey = '';
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
  function refreshSurfaces(event){if(!state.root?.isConnected)return;if(event.detail?.origin!=='discovery-personal'){state.stamp++;if(state.rows.length&&!state.loadError)void refreshLoaded();else void load();}if(state.tab==='browse'&&!state.query.trim())void personalShelf(state.root);}
  document.addEventListener('media-personal-changed',refreshSurfaces);
  document.addEventListener('media-library-changed',refreshSurfaces);
  const leave = () => { state.root?.querySelector(".cn-discover-hero")?._cinemaCarousel?.dispose();closeCardMenu?.();personalActions?.dispose();personalActions=null;personalRoot=null; if (state.root?.isConnected && !document.getElementById('mediaHome').classList.contains('has-title-page')) savedScroll = document.getElementById('mediaHome').scrollTop; const focused = document.activeElement?.closest?.('[data-discovery-key]'); savedFocusKey = focused && state.root?.contains(focused) ? focused.dataset.discoveryKey : ''; state.root = null; };
  document.getElementById('mediaHome')?.addEventListener('scroll', () => { if (!restoringScroll && state.root?.isConnected) savedScroll = document.getElementById('mediaHome').scrollTop; }, { passive:true });
  window.MediaDiscoveryUI = Object.freeze({ leave, openDetail:details, snapshot, restore, mount(root,saved) {
    if(saved)restore(saved);
    const targetScroll = savedScroll; restoringScroll = true;
    const hadRows = state.rows.length > 0 && !state.busy; state.root = root; state.busy = false; draw();
    if (savedFocusKey && hadRows && (document.activeElement === document.body || !document.activeElement?.isConnected)) { const card = [...root.querySelectorAll('[data-discovery-key]')].find(n => n.dataset.discoveryKey === savedFocusKey); card?.focus({ preventScroll: true }); } savedFocusKey = '';
    requestAnimationFrame(() => { if (root === state.root && root.isConnected && hadRows) document.getElementById('mediaHome').scrollTop = targetScroll; requestAnimationFrame(() => { restoringScroll = false; }); });
    if (!hadRows) void load();
  } });
})();
