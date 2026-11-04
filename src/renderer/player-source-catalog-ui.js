/* Katalog arayüzü: kaynak dizini (sayfa içi, global gezinme değil) + kaynak tanıtımı + içerik listesi.
   Saf render: renderCatalog(root, vm, handlers). Katalog açılışı medya/AI/indirme BAŞLATMAZ; satır başlığı ayrıntıyı,
   küçük görsel/oynat düğmesi oynatmayı açar (iki ayrı odak hedefi). Kullanıcı metni yalnız textContent ile yazılır. */
(function (root, factory) {
  const isNode = typeof require === 'function' && typeof module === 'object';
  const api = factory(isNode ? require('./player-ui-kit.js') : root.PlayerUiKit, isNode ? require('../player-source-catalog.js') : root.PlayerSourceCatalog);
  if (isNode) module.exports = api; else root.PlayerSourceCatalogUI = api;
})(globalThis, (Kit, Catalog) => {
  'use strict';
  const { h, icon, t, cover, formatClock, formatDate, formatRelative, cleanTitle, displayTitle } = Kit;
  const KIND_TABS = [['youtube', 'videos', 'play'], ['podcast', 'podcasts', 'mic'], ['local', 'local', 'folder']];
  const noop = () => {};

  function sourceRow(vm, source, handlers, pinned) {
    const L = vm.locale; const current = vm.selectedSourceId === source.sourceId;
    const count = Number.isInteger(source.itemCount) ? String(source.itemCount) : '';
    return h('div', { class: 'pw-source', 'aria-current': current ? 'true' : null, data: { sourceId: source.sourceId } },
      h('button', { class: 'pw-source__open pw-link', type: 'button', 'aria-label': source.title, on: { click: () => handlers.onSelectSource && handlers.onSelectSource(source.sourceId) } },
        sourceArtwork(source,'pw-source__avatar'),
        h('span', { class: 'pw-source__name' }, h('span', { text: source.title }), count && h('span', { class: 'pw-source__count pw-num', text: count }))),
      h('span', { class: 'pw-source__tools' },
        h('button', { class: 'pw-source__pin', type: 'button', 'aria-pressed': pinned ? 'true' : 'false', 'aria-label': `${t(L, pinned ? 'unpin' : 'pin')}: ${source.title}`, on: { click: () => handlers.onTogglePin && handlers.onTogglePin(source.sourceId) } }, icon('pin', 'pw-icon--sm'))));
  }

  function rail(vm, handlers) {
    const L = vm.locale; const ordered = Catalog.orderSources({ sources: vm.sources.filter((s) => s.kind === vm.kind), pinned: vm.pinned });
    const scroll = h('div', { class: 'pw-rail__scroll', role: 'list', 'aria-label': t(L, 'sources') });
    if (ordered.pinned.length) { scroll.append(h('div', { class: 'pw-rail__group', text: t(L, 'pinned') })); ordered.pinned.forEach((s) => scroll.append(sourceRow(vm, s, handlers, true))); scroll.append(h('div', { class: 'pw-rail__group', text: t(L, 'all') })); }
    ordered.rest.forEach((s) => scroll.append(sourceRow(vm, s, handlers, false)));
    return h('dialog', { class: 'pw-rail', 'data-drawer': vm.drawerOpen ? 'open' : 'closed', role: vm.drawerOpen ? 'dialog' : null, 'aria-modal': vm.drawerOpen ? 'true' : null, 'aria-label': t(L, 'sources') },
      h('div', { class: 'pw-rail__head' }, h('span', { class: 'pw-rail__title', text: t(L, 'sources') }),
        vm.drawerOpen && h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'closeToast'), on: { click: () => handlers.onCloseDrawer && handlers.onCloseDrawer() } }, icon('close'))),
      scroll);
  }

  function kindTabs(vm, handlers) {
    const L = vm.locale;
    return h('div', { class: 'pw-kinds', role: 'tablist', 'aria-label': t(L, 'kinds') }, KIND_TABS.map(([kind, key, ic]) =>
      h('button', { class: 'pw-kind', type: 'button', role: 'tab', 'aria-selected': vm.kind === kind ? 'true' : 'false', on: { click: () => handlers.onSelectKind && handlers.onSelectKind(kind) } }, icon(ic, 'pw-icon--sm'), t(L, key))));
  }

  /** Arama kutusu bir kez oluşturulur ve yeniden çizimlerde TAŞINIR: IME bileşimi, odak ve imleç korunur. */
  function searchBox(vm, handlers, previous) {
    const L = vm.locale; let input = previous || null; let timer = null; let composing = false;
    const fire = () => handlers.onQuery && handlers.onQuery({ text: input.value, cursor: null });
    if (!input) {
      input = h('input', { type: 'search', class: 'pw-search__input', autocomplete: 'off', spellcheck: 'false', 'aria-label': t(L, 'search'), placeholder: t(L, 'search') });
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; clearTimeout(timer); timer = setTimeout(fire, 250); });
      input.addEventListener('input', () => { if (composing) return; clearTimeout(timer); timer = setTimeout(fire, 250); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); fire(); } if (e.key === 'Escape') { input.blur(); } });
    }
    input.setAttribute('aria-label', t(L, 'search')); input.setAttribute('placeholder', t(L, 'search'));
    if (document.activeElement !== input && input.value !== vm.query.text) input.value = vm.query.text;
    return h('div', { class: 'pw-search' }, icon('search', 'pw-icon--sm'), input,
      vm.query.text && h('button', { type: 'button', 'aria-label': t(L, 'searchClear'), on: { click: () => handlers.onClearSearch && handlers.onClearSearch() } }, icon('close', 'pw-icon--sm')));
  }

  const SORTS = [['newest', 'sortNewest'], ['oldest', 'sortOldest'], ['shortest', 'sortShortest'], ['longest', 'sortLongest'], ['title', 'sortTitle']];
  const CHIP_LABELS = { durations: (v, L) => t(L, 'dur_' + v), personalStates: (v, L) => t(L, 'p_' + v), subtitleAvailability: (v, L) => t(L, 'av_' + v), live: (v, L) => t(L, v === 'live' ? 'liveOnly' : 'vodOnly'), searchDescription: (v, L) => t(L, 'searchDesc') };
  function languageName(code,L){if(!code||code==='und')return L==='tr'?'Bilinmiyor':'Unknown';try{return new Intl.DisplayNames([L==='tr'?'tr':'en'],{type:'language'}).of(code)||code;}catch{return code;}}
  function chipLabel(chip, vm) {
    const L = vm.locale;
    if (chip.field === 'sourceIds') { const s = vm.sources.find((x) => x.sourceId === chip.value); return s ? s.title : chip.value; }
    if (chip.field === 'speechLanguages') return `${t(L, 'speech')}: ${languageName(chip.value,L)}`;
    if (chip.field === 'subtitleLanguages') return `${t(L, 'subtitleLang')}: ${languageName(chip.value,L)}`;
    if (chip.field === 'subtitleOrigins') return chip.value;
    return CHIP_LABELS[chip.field] ? CHIP_LABELS[chip.field](chip.value, L) : chip.value;
  }

  function filtersPanel(vm, handlers) {
    const L=vm.locale,q=vm.query;
    const toggle=(field,value)=>()=>{const cur=q[field].slice(),i=cur.indexOf(value);if(i>=0)cur.splice(i,1);else cur.push(value);handlers.onQuery?.({[field]:cur,cursor:null});};
    const group=(legend,field,options)=>h('section',{class:'pw-filter-group'},h('h3',{text:legend}),h('div',{class:'pw-filter-options'},options.map(([value,label])=>h('button',{type:'button',class:'pw-filter-option',data:{filter:field+':'+value},'aria-pressed':String(q[field].includes(value)),on:{click:toggle(field,value)},text:label}))));
    const langOptions=(available,selected)=>[...new Set([...(available||[]),...selected])].filter(code=>code&&code!=='und').map(code=>[code,languageName(code,L)]);
    const speech=langOptions(vm.speechLanguagesAvailable,q.speechLanguages),subtitles=langOptions(vm.subtitleLanguagesAvailable,q.subtitleLanguages);
    const panel=h('div',{class:'pw-filters',role:'dialog','aria-modal':'false','aria-label':t(L,'filters')},
      h('header',{class:'pw-filter-head'},h('strong',{text:t(L,'filters')}),h('button',{type:'button',class:'pw-btn pw-btn--ghost pw-btn--icon','aria-label':t(L,'closeToast'),on:{click:()=>handlers.onToggleFilters?.()}},icon('close','pw-icon--sm'))),
      (vm.durationsAvailable!==false||q.durations.length>0)&&group(t(L,'duration'),'durations',['under10','10to30','30to60','60plus','unknown'].map(v=>[v,t(L,'dur_'+v)])),
      speech.length>0&&group(t(L,'speech'),'speechLanguages',speech),subtitles.length>0&&group(t(L,'subtitleLang'),'subtitleLanguages',subtitles),
      group(t(L,'personal'),'personalStates',['unwatched','watched','saved','later','liked'].map(v=>[v,t(L,'p_'+v)])),
      h('section',{class:'pw-filter-group'},h('h3',{text:t(L,'availability')}),h('div',{class:'pw-filter-options',role:'group'},['all','present','absent','unknown'].map(v=>h('button',{type:'button',class:'pw-filter-option','aria-pressed':String(q.subtitleAvailability===v),on:{click:()=>handlers.onQuery?.({subtitleAvailability:v,cursor:null})},text:t(L,'av_'+v)})))),
      h('section',{class:'pw-filter-group'},h('h3',{text:t(L,'filters')}),h('div',{class:'pw-filter-options'},
        ['all','live','vod'].map(v=>h('button',{type:'button',class:'pw-filter-option','aria-pressed':String(q.live===v),on:{click:()=>handlers.onQuery?.({live:v,cursor:null})},text:v==='all'?t(L,'all'):t(L,v==='live'?'liveOnly':'vodOnly')})),
        h('button',{type:'button',class:'pw-filter-option','aria-pressed':String(q.searchDescription),on:{click:()=>handlers.onQuery?.({searchDescription:!q.searchDescription,cursor:null})},text:t(L,'searchDesc')}))),
      h('footer',{class:'pw-filter-footer'},h('button',{type:'button',class:'pw-btn pw-btn--ghost',on:{click:()=>handlers.onClearFilters?.()},text:t(L,'clearFilters')}),h('button',{type:'button',class:'pw-btn pw-btn--primary',on:{click:()=>handlers.onToggleFilters?.()},text:L==='tr'?'Sonuçları göster':'Show results'})));
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();handlers.onToggleFilters?.();}});return panel;
  }

  function toolbar(vm,handlers,prevInput){
    const L=vm.locale,chips=Catalog.activeFilterChips(vm.query),n=chips.length;
    return h('div',{class:'pw-toolbar-wrap'},
      h('div',{class:'pw-toolbar'},searchBox(vm,handlers,prevInput),
        h('button',{class:'pw-btn pw-filter-trigger',type:'button','aria-haspopup':'dialog','aria-expanded':String(vm.filtersOpen),'aria-pressed':n?'true':null,on:{click:()=>handlers.onToggleFilters?.()}},icon('filter','pw-icon--sm'),t(L,'filtersN',n)),
        Kit.select({label:t(L,'sort'),value:vm.query.sort,options:SORTS.map(([value,key])=>({value,label:t(L,key)})),onChange:value=>handlers.onQuery?.({sort:value,cursor:null})}),
        h('span',{class:'pw-count pw-num',role:'status',text:vm.kind==='youtube'?`${vm.shown} ${L==='tr'?'video':'videos'}`:Catalog.resultCountLabel(vm.result,vm.shown,L)})),
      n>0&&h('div',{class:'pw-chips'},chips.map(c=>h('span',{class:'pw-chip'},h('span',{text:chipLabel(c,vm)}),h('button',{type:'button','aria-label':`${t(L,'dismiss')}: ${chipLabel(c,vm)}`,on:{click:()=>handlers.onRemoveChip?.(c)}},icon('close','pw-icon--sm')))),h('button',{class:'pw-btn pw-btn--ghost',type:'button',on:{click:()=>handlers.onClearFilters?.()},text:t(L,'clearFilters')})),
      vm.filtersOpen&&filtersPanel(vm,handlers));
  }

  function localHeader(vm,handlers){
    const L=vm.locale,source=vm.sources.find(row=>row.sourceId===vm.selectedSourceId),pinned=source&&vm.pinned.includes(source.sourceId);
    const actions=h('div',{class:'pw-local-header-actions'},h('button',{class:'pw-btn pw-btn--primary',type:'button',on:{click:()=>handlers.onAddSource?.('local')}},icon('folder','pw-icon--sm'),L==='tr'?'Klasör ekle':'Add folder'));
    if(handlers.onOpenFile)actions.append(h('button',{class:'pw-btn',type:'button',on:{click:()=>handlers.onOpenFile()}},icon('film','pw-icon--sm'),L==='tr'?'Dosya aç':'Open file'));
    if(source){const items=[
      {label:L==='tr'?(source.followed?'Klasör takibini durdur':'Klasör değişikliklerini izle'):(source.followed?'Stop monitoring folder':'Monitor folder changes'),onSelect:()=>handlers.onToggleFollow?.(source.sourceId)},
      {label:t(L,pinned?'unpin':'pin'),onSelect:()=>handlers.onTogglePin?.(source.sourceId)},
      {label:L==='tr'?'Klasörleri yönet':'Manage folders',onSelect:()=>handlers.onOpenSourceUrl?.(source.sourceId)},
      {label:L==='tr'?'Sonraki 20 dosyanın süre/dil bilgisini oku':'Read duration/language for next 20 files',onSelect:()=>handlers.onReadMetadata?.(),disabled:vm.loading}
    ];if(vm.metadataFailures>0)items.push({label:L==='tr'?'Hatalı dosya bilgilerini yeniden oku':'Retry failed file metadata',onSelect:()=>handlers.onReadMetadata?.(true),disabled:vm.loading});actions.append(Kit.menuButton({label:L==='tr'?'Yerel arşiv araçları':'Local library tools',icon:'more',items}));}
    return h('header',{class:'pw-local-header'},h('div',null,h('span',{class:'pw-hero__eyebrow',text:L==='tr'?'SENİN ARŞİVİN':'YOUR LIBRARY'}),h('h2',{text:L==='tr'?'Yerel filmler':'Local films'}),h('p',{text:source?source.title+' · '+(L==='tr'?'Kendi dosyaların. Kaldığın yerden, istediğin gibi.':'Your files. Continue where you left off.'):(L==='tr'?'Kendi dosyaların. Kaldığın yerden, istediğin gibi.':'Your files. Continue where you left off.')}),source?.description&&h('p',{class:'pw-local-source-note',role:'status',text:source.description})),actions);
  }

  function hero(vm,handlers){
    const s=vm.sources.find(x=>x.sourceId===vm.selectedSourceId);if(!s)return null;
    const L=vm.locale,pinned=vm.pinned.includes(s.sourceId),open=vm.heroOpen===true;
    const menu=[{label:t(L,pinned?'unpin':'pin'),onSelect:()=>handlers.onTogglePin?.(s.sourceId)}];
    if(s.url||s.kind==='local')menu.push({label:t(L,'openSource'),onSelect:()=>handlers.onOpenSourceUrl?.(s.sourceId)});
    if(s.kind==='local'){menu.push({label:L==='tr'?'Sonraki 20 dosyanın süre/dil bilgisini oku':'Read duration/language for next 20 files',onSelect:()=>handlers.onReadMetadata?.(),disabled:vm.loading});if(vm.metadataFailures>0)menu.push({label:L==='tr'?'Hatalı dosya bilgilerini yeniden oku':'Retry failed file metadata',onSelect:()=>handlers.onReadMetadata?.(true),disabled:vm.loading});}
    const countLabel=Number.isInteger(s.itemCount)?s.kind==='youtube'?(s.countComplete?`${s.itemCount} ${L==='tr'?'video':'videos'}`:''):t(L,'items',s.itemCount):'';
    return h('section',{class:'pw-hero','aria-label':s.title},
      safeArtwork(s.avatar)&&h('img',{class:'pw-hero__tint',src:s.avatar,alt:'','aria-hidden':'true',on:{error:event=>event.currentTarget.remove()}}),
      s.title&&h('span',{class:'pw-hero__watermark','aria-hidden':'true',text:s.title}),
      h('div',{class:'pw-hero__identity'},sourceArtwork(s,'pw-hero__cover'),h('div',{class:'pw-hero__copy'},h('span',{class:'pw-hero__eyebrow',text:s.kind==='local'?(L==='tr'?'SENİN ARŞİVİN':'YOUR LIBRARY'):s.kind==='podcast'?'PODCAST':(L==='tr'?'YOUTUBE · KAYNAK':'YOUTUBE · SOURCE')}),
      h('h2',{class:'pw-hero__title',text:s.title}),s.description&&h('p',{class:'pw-hero__desc','data-open':String(open),text:s.description}),s.description&&s.description.length>220&&h('button',{class:'pw-link pw-hero__more',type:'button',on:{click:()=>handlers.onToggleHero?.()},text:t(L,open?'readLess':'readMore')}),
      h('div',{class:'pw-hero__meta'},h('span',{class:'pw-badge',text:s.kind==='podcast'?t(L,'podcasts'):s.kind==='local'?t(L,'local'):'YouTube'}),countLabel&&h('span',{class:'pw-badge pw-num',text:countLabel}),s.language&&s.language!=='und'&&h('span',{class:'pw-badge',text:languageName(s.language,L)})))),
      h('div',{class:'pw-hero__actions'},h('button',{class:'pw-btn '+(s.followed?'':'pw-btn--primary'),type:'button','aria-pressed':String(!!s.followed),on:{click:()=>handlers.onToggleFollow?.(s.sourceId)}},icon(s.followed?'check':'plus','pw-icon--sm'),s.kind==='local'?(L==='tr'?(s.followed?'Klasör izleniyor':'Klasör değişikliklerini izle'):(s.followed?'Monitoring folder':'Monitor folder changes')):t(L,s.followed?'following':'follow')),Kit.menuButton({label:L==='tr'?'Kaynak işlemleri':'Source actions',icon:'more',items:menu})),
      Array.isArray(s.similar)&&s.similar.length>0&&h('div',{class:'pw-similar'},h('h3',{text:t(L,'similar')}),h('div',{class:'pw-similar__row'},s.similar.slice(0,6).map(x=>h('button',{class:'pw-similar__item',type:'button',on:{click:()=>handlers.onSelectSource?.(x.sourceId)}},cover(x.title,x.sourceId),h('span',{text:x.title})))),h('small',{text:s.similarBasis||''})));
  }

  function safeArtwork(value){return typeof value==='string'&&/^https?:\/\//i.test(value);}
  function sourceArtwork(source,className){
    const fallback=cover(source.title,source.sourceId,className);
    if(safeArtwork(source.avatar))fallback.append(h('img',{src:source.avatar,alt:'',loading:'lazy',on:{error:event=>event.currentTarget.remove()}}));
    return fallback;
  }

  function subtitleBadges(item, L) {
    if (item.subtitleLanguages === null || item.subtitleLanguages === undefined) return [];
    if (!item.subtitleLanguages.length) return [h('span', { class: 'pw-badge', text: t(L, 'noSubtitle') })];
    const origins = Array.isArray(item.subtitleOrigins) ? item.subtitleOrigins : [];
    return item.subtitleLanguages.filter(lang=>lang&&lang!=='und').map((lang, i) => { const o = origins[i] || origins[0]; const mt = o === 'machine-translation' || o === 'asr';
      return h('span', { class: 'pw-badge' + (mt ? '' : ' pw-badge--accent'), title: o || '', text: `${languageName(lang,L)}${o==='asr'?(L==='tr'?' otomatik':' automatic'):o==='machine-translation'?(L==='tr'?' çeviri':' translated'):''}` }); });
  }

  function itemArtwork(item){if(!item.thumbnail)return cover(item.title,item.itemId);return h('img',{src:item.thumbnail,alt:'',loading:'lazy',on:{error:event=>event.currentTarget.replaceWith(cover(item.title,item.itemId))}});}
  function videoRow(vm, item, handlers) {
    const L = vm.locale; const src = vm.sources.find((s) => s.sourceId === item.sourceId); const progress = item.progress > 0 && item.progress < 1 ? item.progress : 0;
    const playLabel = `${t(L, progress ? 'resume' : 'play')}: ${item.title}`;
    return h('article', { class: 'pw-row', data: { itemId: item.itemId } },
      h('button', { class: 'pw-thumb', type: 'button', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } },
        itemArtwork(item),
        h('span', { class: 'pw-thumb__play' }, icon('play')),
        item.isLive ? h('span', { class: 'pw-thumb__dur', text: t(L, 'live') }) : Number.isFinite(item.durationSeconds) && h('span', { class: 'pw-thumb__dur', text: formatClock(item.durationSeconds) }),
        progress > 0 && h('span', { class: 'pw-thumb__bar' }, h('i', { style: `width:${Math.round(progress * 100)}%` }))),
      h('div', { style: 'min-width:0' },
        h('h3', { class: 'pw-row__title' }, h('button', { class: 'pw-link', type: 'button', on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'detail') }, text: item.title })),
        h('div', { class: 'pw-row__meta' }, h('span', { text: item.sourceTitle || (src && src.title) || '' }), item.publishedAt && h('span', { text: formatDate(item.publishedAt, L) })),
        item.description&&h('p',{class:'pw-row__desc',text:item.description}),h('div', { class: 'pw-row__badges' }, subtitleBadges(item, L), item.personal && item.personal.watched && h('span', { class: 'pw-badge', text: t(L, 'watched') }))),
      h('div', { class: 'pw-row__actions' }, h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon pw-btn--ghost', type: 'button', 'aria-label': playLabel, title: t(L, progress ? 'resume' : 'play'), on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, icon('play'))));
  }

  function transcriptBadge(item, L) {
    const best = (item.transcriptDescriptors || []).slice().sort((a, b) => ({ yes: 0, conditional: 1, unknown: 2, no: 3 }[a.timed] - { yes: 0, conditional: 1, unknown: 2, no: 3 }[b.timed]))[0];
    if (!best) return h('span', { class: 'pw-badge', text: t(L, 'transcriptNone') });
    if (best.timed === 'yes') return h('span', { class: 'pw-badge pw-badge--accent', text: t(L, 'transcriptTimed') });
    if (best.timed === 'no') return h('span', { class: 'pw-badge pw-badge--warn', text: t(L, 'transcriptUntimed') });
    return h('span', { class: 'pw-badge', text: t(L, 'transcriptNone') });
  }
  function episodeRow(vm, item, handlers) {
    const L = vm.locale; const playLabel = `${t(L, 'play')}: ${item.title}`;
    return h('article', { class: 'pw-episode', data: { itemId: item.itemId } },
      h('span', { class: 'pw-episode__no pw-num', text: item.episodeNumber != null ? String(item.episodeNumber) : '' }),
      h('button', { class: 'pw-thumb', type: 'button', style: 'width:120px;aspect-ratio:1', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, itemArtwork(item), h('span', { class: 'pw-thumb__play' }, icon('play'))),
      h('div', { style: 'min-width:0' },
        h('h3', { class: 'pw-row__title' }, h('button', { class: 'pw-link', type: 'button', on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'detail') }, text: item.title })),
        h('div', { class: 'pw-row__meta' }, h('span', { text: item.sourceTitle || '' }), item.publishedAt && h('span', { text: formatRelative(item.publishedAt, L, vm.now) }), Number.isFinite(item.durationSeconds) && h('span', { class: 'pw-badge', text: formatClock(item.durationSeconds) })),
        item.description && h('p', { class: 'pw-row__desc', text: item.description }),
        h('div', { class: 'pw-row__badges' }, transcriptBadge(item, L), item.offline && h('span', { class: 'pw-badge', text: t(L, 'offline') }))),
      h('div', { class: 'pw-row__actions' }, h('button', { class: 'pw-btn pw-btn--lg pw-btn--icon pw-btn--ghost', type: 'button', 'aria-label': playLabel, on: { click: () => handlers.onOpenItem && handlers.onOpenItem(item, 'play') } }, icon('play'))));
  }
  function localRow(vm,item,handlers){
    const L=vm.locale,title=displayTitle(cleanTitle(item.title)),missing=item.fileMissing===true,file=item.file||{};
    const extension=String(file.name||item.title).match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toUpperCase();
    const size=Number.isFinite(file.size)&&file.size>=0?file.size:null;
    const bytes=size===null?'':size>=1024*1024*1024?(size/(1024*1024*1024)).toLocaleString(L,{maximumFractionDigits:1})+' GB':size>=1024*1024?(size/(1024*1024)).toLocaleString(L,{maximumFractionDigits:1})+' MB':Math.ceil(size/1024)+' KB';
    const knownLanguages=(item.spokenLanguages?.length?item.spokenLanguages:[item.language]).filter(code=>code&&code!=='und').map(code=>languageName(Catalog.normalizeLang(code),L));
    const subtitleText=item.subtitleLanguages==null?(L==='tr'?'Altyazı bilgisi okunmadı':'Subtitle details unread'):!item.subtitleLanguages.length?t(L,'noSubtitle'):item.subtitleLanguages.filter(code=>code&&code!=='und').map(code=>languageName(code,L)).join(' · ')||(L==='tr'?'Altyazı dili bilinmiyor':'Subtitle language unknown');
    const duration=Number.isFinite(item.durationSeconds)?formatClock(item.durationSeconds):(L==='tr'?'Süre okunmadı':'Duration unread');
    const rowActions=h('div',{class:'pw-row__actions'},missing&&h('button',{class:'pw-btn',type:'button',on:{click:()=>handlers.onLocate?.(item)},text:t(L,'findFile')}));
    if(!missing)rowActions.append(Kit.menuButton({label:(L==='tr'?'Dosya işlemleri: ':'File actions: ')+title,icon:'more',items:[{label:t(L,'play'),onSelect:()=>handlers.onOpenItem?.(item,'play')},{label:L==='tr'?'Ayrıntıları aç':'Open details',onSelect:()=>handlers.onOpenItem?.(item,'detail')}]}));
    return h('article',{class:'pw-row pw-row--local',data:{itemId:item.itemId}},
      h('button',{class:'pw-thumb',type:'button',disabled:missing,'aria-label':`${t(L,'play')}: ${title}`,on:{click:()=>handlers.onOpenItem?.(item,'play')}},cover(title,item.itemId),h('span',{class:'pw-thumb__play'},icon('play'))),
      h('div',{class:'pw-local-title'},h('h3',{class:'pw-row__title'},h('button',{class:'pw-link',type:'button',title:item.title,on:{click:()=>handlers.onOpenItem?.(item,'detail')},text:title})),h('div',{class:'pw-row__meta'},h('span',{text:[item.sourceTitle,...knownLanguages].filter(Boolean).join(' · ')})),missing&&h('span',{class:'pw-badge pw-badge--danger',text:t(L,'fileMissing')})),
      h('span',{class:'pw-local-duration',text:duration}),h('span',{class:'pw-local-file',text:[extension,bytes].filter(Boolean).join(' · ')||(L==='tr'?'Dosya türü bilinmiyor':'File type unknown')}),h('span',{class:'pw-local-subtitle',text:subtitleText}),rowActions);
  }

  function emptyState(vm, handlers) {
    const L = vm.locale; const r = vm.result;
    const box = (ic, title, body, action, ghost) => h('div', { class: 'pw-empty', role: 'status' }, h('div', { class: 'pw-empty__icon' }, icon(ic, '')), h('h3', { text: title }), h('p', { text: body }), action, ghost && h('div', { class: 'pw-ghost', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    if (!vm.sources.some((s) => s.kind === vm.kind)) return box('folder', t(L, 'emptyTitle'), t(L, 'emptyBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onAddSource && handlers.onAddSource(vm.kind) }, text: t(L, 'addSource') }), true);
    if (r.needsMoreSourcePages) return box('search', t(L, 'needMoreTitle'), t(L, 'needMoreBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onLoadRemote && handlers.onLoadRemote(r.remoteNextCursor) }, text: t(L, 'loadSource') }));
    return box('filter', t(L, 'noResultTitle'), t(L, 'noResultBody'), h('button', { class: 'pw-btn pw-btn--primary pw-btn--lg', type: 'button', on: { click: () => handlers.onClearFilters && handlers.onClearFilters() }, text: t(L, 'clearFilters') }));
  }

  /** Kök kapsayıcıyı yeniden çizer; arama kutusunu, kaydırma konumlarını ve odağı korur. */
  function renderCatalog(root, vm, handlers) {
    const scene=vm.kind+':'+(vm.selectedSourceId||'');const changedScene=root.dataset.catalogScene!==scene;root.dataset.catalogScene=scene;
    const filterFocus=root.contains(document.activeElement)?document.activeElement?.dataset?.filter:null;
    const prevInput = root.querySelector('.pw-search__input');
    const prevMain = root.querySelector('.pw-main'); const prevRail = root.querySelector('.pw-rail__scroll');
    const keep = { main: prevMain ? prevMain.scrollTop : 0, rail: prevRail ? prevRail.scrollTop : 0 };
    const hadFocus = prevInput && document.activeElement === prevInput;
    const sel = hadFocus ? [prevInput.selectionStart, prevInput.selectionEnd] : null;
    const L = vm.locale;
    const items = vm.result.items;
    const isGrid = vm.kind === 'podcast' && !vm.selectedSourceId && !vm.query.text && vm.sources.some((s) => s.kind === 'podcast');
    let body;
    if (vm.loading) body = h('div', { class: 'pw-ghost', style: 'width:100%;opacity:.35', 'aria-busy': 'true' }, h('i'), h('i'), h('i'), h('i'));
    else if (isGrid) body = h('div', { class: 'pw-programs' }, vm.sources.filter((s) => s.kind === 'podcast').map((s) => h('button', { class: 'pw-program', type: 'button', on: { click: () => handlers.onSelectSource && handlers.onSelectSource(s.sourceId) } }, cover(s.title, s.sourceId), h('span', null, h('strong', { text: s.title }), h('small', { text: s.publisher || (Number.isInteger(s.itemCount) ? t(L, 'items', s.itemCount) : '') })))));
    else if (!items.length) body = emptyState(vm, handlers);
    else body = h('div', { class: 'pw-list', role: 'list' }, items.map((it) => h('div', { role: 'listitem' }, vm.kind === 'podcast' ? episodeRow(vm, it, handlers) : vm.kind === 'local' ? localRow(vm, it, handlers) : videoRow(vm, it, handlers))),
      vm.result.nextCursor && h('button', { class: 'pw-btn pw-more', type: 'button', on: { click: () => handlers.onLoadMore && handlers.onLoadMore(vm.result.nextCursor) }, text: t(L, 'loadMore') }),
      !vm.result.nextCursor && vm.result.remoteNextCursor && h('button', { class: 'pw-btn pw-more', type: 'button', on: { click: () => handlers.onLoadRemote && handlers.onLoadRemote(vm.result.remoteNextCursor) }, text: t(L, 'loadSource') }));
    const noSources = !vm.sources.some((s) => s.kind === vm.kind);
    const main=h('div',{class:'pw-main','aria-hidden':vm.drawerOpen?'true':null},
      h('div',{class:'pw-source-topbar'},h('button',{class:'pw-btn pw-source-chooser',type:'button','aria-haspopup':'dialog','aria-expanded':String(vm.drawerOpen),on:{click:()=>handlers.onOpenDrawer?.()}},icon('list','pw-icon--sm'),t(L,'sources')),kindTabs(vm,handlers),vm.kind!=='local'&&h('button',{class:'pw-btn pw-btn--ghost',type:'button',on:{click:()=>handlers.onAddSource?.(vm.kind)}},icon('plus','pw-icon--sm'),t(L,'addSource'))),
      vm.kind==='local'?localHeader(vm,handlers):hero(vm,handlers),noSources?null:toolbar(vm,handlers,prevInput),vm.kind==='local'&&items.length>0&&h('div',{class:'pw-local-columns','aria-hidden':'true'},h('span',{text:L==='tr'?'Film':'Film'}),h('span',{text:t(L,'duration')}),h('span',{text:L==='tr'?'Dosya':'File'}),h('span',{text:L==='tr'?'Altyazı':'Subtitles'})),body);
    main.inert=!!vm.drawerOpen;
    const layout=h('div',{class:'pw-catalog pw-catalog--'+vm.kind},vm.drawerOpen&&rail(vm,handlers),main);
    const nodes = [layout];
    if (vm.drawerOpen) nodes.push(h('div', { class: 'pw-scrim', on: { click: () => handlers.onCloseDrawer && handlers.onCloseDrawer() } }));
    if (vm.toast) nodes.push(h('div', { class: 'pw-toast', role: 'status' }, h('span', { text: vm.toast }), h('button', { class: 'pw-btn pw-btn--ghost pw-btn--icon', type: 'button', 'aria-label': t(L, 'closeToast'), on: { click: () => handlers.onDismissToast && handlers.onDismissToast() } }, icon('close'))));
    root.classList.add('pw-root'); root.replaceChildren(...nodes);
    const newMain = root.querySelector('.pw-main'); const newRail = root.querySelector('.pw-rail__scroll');
    if (newMain) newMain.scrollTop = keep.main; if (newRail) newRail.scrollTop = keep.rail;
    const input = root.querySelector('.pw-search__input');
    if (hadFocus && input) { input.focus(); if (sel) input.setSelectionRange(sel[0], sel[1]); }
    if(vm.filtersOpen&&!hadFocus){const restored=filterFocus?[...root.querySelectorAll('[data-filter]')].find(node=>node.dataset.filter===filterFocus):null;(restored||root.querySelector('.pw-filters button'))?.focus();}
    root.onclick=event=>{if(vm.filtersOpen&&!event.target.closest('.pw-filters,.pw-filter-trigger,.mk-popup'))handlers.onToggleFilters?.();};
    if(changedScene){Kit.reveal?.(root.querySelector('.pw-hero'),{duration:320,y:12});[...root.querySelectorAll('.pw-row,.pw-episode')].slice(0,8).forEach((node,index)=>Kit.reveal?.(node,{duration:320,y:12,delay:index*40}));}
    const drawer=root.querySelector('.pw-rail');if(drawer){if(drawer.showModal)drawer.showModal();else drawer.setAttribute('open','');Kit.bindDialog?.(drawer);}
    drawer?.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const nodes=[...drawer.querySelectorAll('button:not(:disabled)')];if(!nodes.length)return;if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}});
    return { searchInput: input };
  }
  return Object.freeze({ renderCatalog, chipLabel });
});
