(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const side = byId('playerSide');
  const layer = byId('playerLayer');
  if (!side || !layer) return;
  const scrim = document.createElement('button');
  scrim.type='button';scrim.className='bp-scrim';scrim.title='Paneli kapat';scrim.setAttribute('aria-label','Paneli kapat');
  scrim.onclick=()=>{player.narrowPanelTakeover=false;syncResponsivePlayerLayout();};
  document.querySelector('.player-body')?.append(scrim);
  const paths = {
    close: 'M6 6l12 12M18 6 6 18',
    chevron: 'm6 9 6 6 6-6',
    chat: 'M4 4h16v12H9l-5 4z M8 8h8m-8 4h5',
    settings: 'M4 8h7m5 0h4M4 16h2m6 0h8 M13 6v4M9 14v4',
    check: 'm5 12 4 4L19 6',
    file: 'M14 3H5v18h14V8zM14 3v6h5M8 13h8m-8 4h5',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    search: 'M15 15l5 5 M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name] || paths.settings);
    svg.append(path);
    return svg;
  }
  function node(tag, cls, text) {
    const item = document.createElement(tag);
    item.className = cls;
    if (text) { item.textContent = text; item.dataset.uiUntranslated = ''; }
    return item;
  }
  function copy(tr, en) { return window.UiLocale?.get?.() === 'en' ? en : tr; }
  function button(label, action, cls = 'bp-button') {
    const item = node('button', cls, label);
    item.type = 'button'; item.title = label; item.setAttribute('aria-label', label);
    item.addEventListener('click', action);
    return item;
  }
  const placements = [];
  function take(item, parent) {
    if (!item) return;
    const anchor = document.createComment('panel-control');
    item.before(anchor); placements.push({ item, anchor }); parent.append(item);
  }
  let disposeTools = null;
  let mounted = false, originalChildren = [], originalTabs = null, frame = 0;
  let scroll, flow, trackSection, utilities, follow, picker, pickerLabel, count, footer, tabs, indicator;
  let lastTrackKey = '', lastHost = '', lastLayoutKey = '';
  const animations = new WeakMap();
  const accordionBindings = new WeakSet();
  function reflow(change) {
    const elements = [...side.querySelectorAll('.browser-panel-track-footer,.bp-disclosures,.bp-cue-actions')];
    const before = elements.map(element => element.getBoundingClientRect().top);
    change();
    if (window.CinemaMotion?.mode !== 'full' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const shifts = elements.map((element, index) => ({ element, delta: before[index] - element.getBoundingClientRect().top }));
    for (const { element, delta } of shifts) {
      if (Math.abs(delta) < 1) continue;
      animations.get(element)?.cancel();
      animations.set(element, element.animate(
        [{ transform: 'translateY(' + delta + 'px)' }, { transform: 'translateY(0)' }],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    }
  }
  function reveal(item) {
    const mode = window.CinemaMotion?.mode;
    if (mode === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    animations.get(item)?.cancel();
    animations.set(item, item.animate(mode === 'reduced' ? [{ opacity: .6 }, { opacity: 1 }] :
      [{ opacity: .4, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
  }
  function accordion(item, name, hint, glyph) {
    if (!item) return;
    item.classList.add('bp-disclosure');
    const summary = item.querySelector(':scope > summary');
    if (!summary) return;
    summary.dataset.uiUntranslated = '';
    const title = node('span', 'bp-disclosure-title', name);
    const count = summary.querySelector('[id]');
    const content = node('span', 'bp-disclosure-hint', hint);
    summary.replaceChildren(icon(glyph), title);
    if (count) title.append(' ', count);
    summary.append(content, icon('chevron'));
    if (!accordionBindings.has(item)) {
      accordionBindings.add(item);
      let before=[];
      summary.addEventListener('click',()=>{
        before=[...scroll.querySelectorAll('.bp-disclosure,.bp-flow,#cueList')].map(element=>({element,top:element.getBoundingClientRect().top}));
      });
      item.addEventListener('toggle',()=>{
        if(item.open)reveal(item);
        if(window.CinemaMotion?.mode!=='full'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
        const changes=before.map(entry=>({...entry,delta:entry.top-entry.element.getBoundingClientRect().top}));
        before=[];
        for(const {element,delta} of changes)if(element!==item&&Math.abs(delta)>1) {
          animations.get(element)?.cancel();
          animations.set(element,element.animate([{transform:'translateY('+delta+'px)'},{transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}));
        }
      });
    }
  }
  function mount() {
    mounted = true;
    originalChildren = [...side.childNodes];
    side.classList.add('bp-panel');
    const oldTop = side.querySelector('.side-top');
    const head = node('header', 'bp-head');
    const title = node('div', 'bp-title');
    title.append(node('span', 'bp-eyebrow', copy('İZLEME ALANI', 'WATCH SPACE')),
      node('h2', '', copy('Video araçları', 'Video tools')));
    const close = byId('sideRailCollapse');
    const controls = node('div', 'bp-head-actions');
    const menu = node('details', 'bp-utilities');
    const summary = node('summary', 'bp-icon');
    summary.title = copy('Panel işlemleri', 'Panel actions');
    summary.setAttribute('aria-label', summary.title);
    summary.append(icon('more')); menu.append(summary);
    utilities = node('div', 'bp-utilities-body');
    menu.append(utilities); controls.append(menu);
    for (const id of ['sideAppSettings', 'sideSubtitleExport', 'sideSubtitleLayoutMenu']) take(byId(id), utilities);
    if (close) { take(close, controls); close.replaceChildren(icon('close')); close.title = 'Paneli ikon rayına daralt · Alt+Shift+S'; }
    head.append(title, controls);
    tabs = node('nav', 'bp-tabs');
    tabs.setAttribute('aria-label', copy('Panel bölümleri', 'Panel sections'));
    originalTabs = side.querySelector('.side-tabs');
    take(originalTabs, tabs);
    indicator = node('i', 'bp-tab-indicator'); indicator.setAttribute('aria-hidden', 'true'); tabs.append(indicator);
    scroll = node('div', 'bp-scroll');
    const sub = node('section', 'bp-subtitles');
    sub.dataset.uiUntranslated = '';
    trackSection = node('div', 'bp-track-section');
    trackSection.append(node('h3', 'bp-section-title', copy('ALTYAZILAR', 'SUBTITLES')));
    take(byId('browserPanelTracks'), trackSection); sub.append(trackSection);
    const disclosures = node('div', 'bp-disclosures');
    take(byId('browserWatchTools'), disclosures); take(byId('browserSubtitleReview'), disclosures);
    accordion(disclosures.querySelector('#browserWatchTools'), copy('İzlerken altyazı ayarı','Subtitle appearance'), copy('Görünüm','Appearance'), 'settings');
    accordion(disclosures.querySelector('#browserSubtitleReview'), copy('Altyazı kontrolü','Subtitle review'), copy('Kalite ve kaynak','Quality & source'), 'check');
    flow = node('section', 'bp-flow');
    const flowHead = node('div', 'bp-flow-head');
    const heading = node('h3', 'bp-section-title', copy('CÜMLE AKIŞI', 'SENTENCE FLOW'));
    count = byId('cuePosition'); take(count, heading);
    picker = node('details', 'bp-track-picker');
    const pickerButton = node('summary', 'bp-button');
    pickerLabel = node('span', 'bp-track-picker-label'); pickerButton.append(pickerLabel, icon('chevron'));
    picker.append(pickerButton, node('div', 'bp-track-picker-list')); flowHead.append(heading, picker);
    const context = node('div', 'bp-flow-context');
    follow = button('', () => byId('autoFollow')?.click(), 'bp-follow');
    context.append(follow); take(byId('backToActive'), context);
    flow.append(flowHead, context);
    take(byId('subtitleReadingMode'), flow);
    const search = node('div', 'bp-search');
    search.append(icon('search')); take(byId('cueSearch'), search); take(byId('clearCueSearch'), search);
    const filters = node('details', 'bp-utilities bp-filters');
    const filterSummary = node('summary', 'bp-icon'); filterSummary.title = copy('Cümle filtreleri ve düzenleme','Sentence filters & editing');
    filterSummary.setAttribute('aria-label', filterSummary.title); filterSummary.append(icon('settings'));
    filters.append(filterSummary); const filterBody = node('div', 'bp-utilities-body'); filters.append(filterBody);
    for (const id of ['savedOnlyBtn','qualityOnlyBtn','untranslatedOnlyBtn','subtitleFindReplaceToggle','toggleSettings']) take(byId(id), filterBody);
    search.append(filters); flow.append(search);take(byId('subtitleWorkSummary'),flow);take(byId('cueIssueTools'),flow);
    take(byId('subtitleFindReplacePanel'), flow);
    sub.append(flow); take(byId('cueList'), sub); sub.append(disclosures);
    for (const id of ['browserQuickEdit','aiAnswer','wordInspector']) take(byId(id), sub);
    const cueActions = node('details', 'bp-cue-actions bp-disclosure');
    cueActions.append(node('summary','',copy('Cümle işlemleri','Sentence actions')));
    take(byId('selectedCueActions'),cueActions);
    accordion(cueActions,copy('Cümle işlemleri','Sentence actions'),copy('Açıkla ve kaydet','Explain & save'),'chat');
    sub.append(cueActions);
    const quick = node('details', 'bp-quick-youtube bp-disclosure');
    const quickTitle = node('summary', '', copy('YouTube bağlantısı yükle','Load YouTube link')); quickTitle.append(icon('chevron'));
    quick.append(quickTitle); take(oldTop?.querySelector('.side-source-quick'), quick); sub.append(quick);
    scroll.append(sub);
    const tools = node('section', 'bp-tools-existing');
    take(side.querySelector('.side-bottom'), tools); take(byId('browserFeatures'), tools); scroll.append(tools);
    const aiChatEl = byId('aiChat'); take(aiChatEl, scroll); take(byId('playerLibraryPanel'), scroll);
    // G12: this panel and the floating assistant share a task vocabulary; the bridge says what opening the other surface means.
    { const chat = aiChatEl;
      if (chat && window.api?.showAssistant && !chat.querySelector('.bp-assistant-bridge')) {
        const bridge = node('div','bp-assistant-bridge');
        const open = button(copy('Açılır asistanda aç','Open in floating assistant'), () => window.api.showAssistant(), 'bp-button');
        bridge.append(node('span','',copy('Geniş okuma alanı ve kaynak ayrıntıları için. Açılır asistanın sohbet geçmişi ayrıdır; bu panelle otomatik birleştirilmez.','For a wider reading area and source details. The floating assistant keeps its own conversations; nothing is merged with this panel automatically.')), open);
        chat.prepend(bridge);
      } }
    // Residual state/utility controls stay attached so existing handlers can reach them.
    const statePool = node('div','bp-state-pool'); statePool.hidden = true;
    take(oldTop, statePool);
    footer = node('footer', 'bp-footer');
    const ask = button(copy('Asistana sor','Ask assistant'), () => { setSideTab('ai', {focusContent:true}); }, 'bp-ask');
    ask.prepend(icon('chat'));
    const status = node('span','bp-context-status',copy('Video bağlamı hazır','Video context ready'));
    status.prepend(node('i','')); footer.append(ask,status);
    const drawer = byId('settingsDrawer');
    const roots = [head,tabs,scroll,footer,statePool];
    if (drawer) { take(drawer, statePool); roots.push(drawer); }
    // All existing dialogs and other side surfaces remain reachable.
    const moved = new Set(placements.map(entry => entry.item));
    for (const child of originalChildren) if (child.nodeType === 1 && !moved.has(child) && child !== drawer) statePool.append(child);
    side.replaceChildren(...roots);
    disposeTools = window.BrowserPanelTools?.mount({container:side,footer,take,reveal});
    for (const item of utilities.querySelectorAll('button')) {
      const label = item.title || item.getAttribute('aria-label');
      if (label) item.append(node('span','bp-utility-label',label));
    }
    const layout = node('details','bp-layout-menu');
    // G13: the menu states the current width, its effect on the page, and offers a one-step return to the previous width.
    const layoutSummary = node('summary','',copy('Panel yerleşimi','Panel layout'));
    layout.append(layoutSummary);
    const widthNames = {360:copy('Kompakt','Compact'),420:copy('Dengeli','Balanced'),500:copy('Geniş','Wide')};
    const layoutNote = node('p','bp-layout-note',copy('Daha geniş panel okuma alanı verir, sayfaya daha az yer bırakır.','A wider panel gives more reading room and leaves less room for the page.'));
    const layoutButtons = new Map(); let currentWidth = 0, previousWidth = 0, undo = null;
    const measuredWidth = () => { const w=side.getBoundingClientRect().width; return [360,420,500].reduce((a,b)=>Math.abs(b-w)<Math.abs(a-w)?b:a); };
    const paintLayout = () => {
      for (const [width,b] of layoutButtons) b.setAttribute('aria-pressed',String(width===currentWidth));
      layoutSummary.textContent = copy('Panel yerleşimi','Panel layout')+' · '+widthNames[currentWidth]+' ('+currentWidth+')';
      undo.hidden = !previousWidth || previousWidth===currentWidth;
      if (!undo.hidden) undo.textContent = copy('Önceki genişliğe dön','Back to previous width')+' · '+widthNames[previousWidth]+' ('+previousWidth+')';
    };
    const applyWidth = (width) => {
      if (currentWidth && currentWidth!==width) previousWidth = currentWidth;
      currentWidth = width;
      setSideWidth(width);
      const host = browserSideRailHost();
      if (host) { const map = readWidths(); map[host]=width; try { localStorage.setItem('browserPanelWidths',JSON.stringify(map)); } catch (_) {} }
      paintLayout();
    };
    layout.append(layoutNote);
    for (const width of [360,420,500]) {
      const b = button(widthNames[width], () => { applyWidth(width); menu.open=false; });
      b.setAttribute('aria-pressed','false'); layoutButtons.set(width,b); layout.append(b);
    }
    undo = button('', () => { const back = previousWidth; if (back) { applyWidth(back); } }); undo.hidden = true; layout.append(undo);
    layout.addEventListener('toggle', () => { if (layout.open) { currentWidth = measuredWidth(); paintLayout(); } });
    utilities.append(layout);
    refresh();
  }
  function readWidths() {
    try { const map=JSON.parse(localStorage.getItem('browserPanelWidths')||'{}'); return map && typeof map==='object' && !Array.isArray(map) ? map : {}; } catch (_) { return {}; }
  }
  function unmount() {
    mounted=false;
    disposeTools?.();disposeTools=null;
    side.querySelectorAll('.bp-utility-label').forEach(item=>item.remove());
    for (const {item,anchor} of placements.reverse()) { anchor.replaceWith(item); }
    placements.length=0;
    side.replaceChildren(...originalChildren); side.classList.remove('bp-panel');
    originalChildren=[]; lastTrackKey='';
  }
  function sync() {
    if (player.workspaceMode !== 'browser') { if (mounted) unmount(); return; }
    if (!mounted) mount();
    const rail=side.classList.contains('side-rail');
    const tab=player.sideTab||'subs'; side.dataset.bpTab=tab;
    side.dataset.bpState=player.cues.length ? 'playing' : player.browserTracks.length ? 'tracks' : 'empty';
    const hasCues=player.cues.length>0;
    const chatHint=byId('aiChatEmpty')?.querySelector('.ai-chat-empty-text');
    const chatCopy=hasCues?copy('O anki altyazı satırı, çevirisi, yakın satırlar ve zaman bilgisi soruyla birlikte gönderilir.','The current subtitle, translation, nearby lines and timing accompany your question.'):copy('Henüz altyazı yok. Genel soru sorabilir ya da Altyazılar bölümünden metin ekleyebilirsin.','No subtitles yet. Ask a general question or add text in Subtitles.');
    if(chatHint&&chatHint.textContent!==chatCopy)chatHint.textContent=chatCopy;
    flow.hidden=!hasCues; trackSection.hidden=!player.browserTracks.length||hasCues;
    const tabIndex=['subs','ai','library','tools'].indexOf(tab);
    indicator.style.transform='translateX('+Math.max(0,tabIndex)*100+'%)';
    const aiTab=byId('sideTabAi')?.querySelector('span:last-child');
    if(aiTab && aiTab.textContent!==copy('Asistan','Assistant')) aiTab.textContent=copy('Asistan','Assistant');
    for(const tabButton of tabs.querySelectorAll('[data-stab]')) {
      tabButton.title=tabButton.textContent.trim();tabButton.setAttribute('aria-label',tabButton.title);
    }
    follow.textContent=player.autoFollow ? copy('Takip açık','Follow on') : copy('Takip kapalı','Follow off');
    follow.setAttribute('aria-pressed',String(player.autoFollow));
    const primary=player.browserTracks.find(t=>String(t.id)===byId('browserTrackSelect')?.value);
    pickerLabel.textContent=primary?.language ? languageName(primary.language) : copy('Altyazı izi','Subtitle track');
    const key=JSON.stringify(player.browserTracks.map(t=>[t.id,t.label,t.language,t.role,t.sourceMismatch]));
    if(key!==lastTrackKey) {
      lastTrackKey=key; const target=picker.querySelector('.bp-track-picker-list'); target.replaceChildren();
      for(const track of player.browserTracks) {
        const option=button(track.label||languageName(track.language),()=>{
          byId('browserTrackSelect').value=track.id;
          byId('browserTrackSelect').dispatchEvent(new Event('change',{bubbles:true}));
          byId('browserTrackLoad').click(); picker.open=false; refresh();
        });
        option.disabled=!!track.sourceMismatch; target.append(option);
      }
      if(!target.children.length) target.append(button(copy('Altyazı dosyası seç','Choose subtitle file'),()=>byId('playerPickSub')?.click()));
    }
    const host=browserSideRailHost();
    if(host!==lastHost) { lastHost=host; const width=Number(readWidths()[host]); if([360,420,500].includes(width)) setSideWidth(width); }
    for(const btn of document.querySelectorAll('#subtitleReadingMode button')) {
      if(btn.getAttribute('aria-checked')==='true') byId('subtitleReadingMode').style.setProperty('--bp-selected',String([...btn.parentNode.children].indexOf(btn)));
    }
    const contextStatus=footer.querySelector('.bp-context-status');
    // G15: say what is actually known (page/video open, subtitles recorded) — "ready" never implies the content was read or verified.
    contextStatus.textContent=player.browserMediaSeen ? copy('Video açık','Video open')+' · '+(hasCues?copy('altyazı kayıtlı','subtitles recorded'):copy('altyazı yok','no subtitles')) : copy('Sayfa açık · video algılanmadı','Page open · no video detected');
    contextStatus.title=copy('Bu durum içeriğin okunduğu veya videonun tamamının doğrulandığı anlamına gelmez. Ayrıntı için Asistan sekmesini aç.','This does not mean the content was read or the whole video was verified. Open the Assistant tab for details.');
    contextStatus.prepend(node('i',''));
    const layoutKey=tab+'|'+side.dataset.bpState+'|'+rail;
    if(hasCues && layoutKey!==lastLayoutKey) requestAnimationFrame(highlightCueRow);
    lastLayoutKey=layoutKey;
    if(rail) byId('sideRailCollapse').title=copy('Paneli aç · Alt+Shift+S','Open panel · Alt+Shift+S');
    // Keep the existing overlay route informed; the panel footer is its entry point.
    window.dispatchEvent(new Event('browser-panel-layout'));
    document.dispatchEvent(new Event('browser-panel-context'));
  }
  function languageName(code) {
    try { return new Intl.DisplayNames([window.UiLocale?.get?.()||'tr'],{type:'language'}).of(code)||code; } catch (_) { return code||copy('Altyazı izi','Subtitle track'); }
  }
  let followFrame = 0, followTarget = 0;
  function cancelFollow() { cancelAnimationFrame(followFrame); followFrame=0; }
  function scrollToActive(box, top) {
    if (followFrame && Math.abs(followTarget-top)<8) return;
    cancelFollow(); followTarget=top;
    if (window.CinemaMotion?.mode!=='full' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.scrollTop=top; player.expectedScroll=box.scrollTop; return;
    }
    const start=box.scrollTop, began=performance.now();
    const tick=now=>{
      if(player.userScrolled || !mounted) {cancelFollow();return;}
      const fraction=Math.min(1,(now-began)/180);
      box.scrollTop=start+(followTarget-start)*(1-Math.pow(1-fraction,3));
      player.expectedScroll=box.scrollTop;
      followFrame=fraction<1 ? requestAnimationFrame(tick) : 0;
    };
    followFrame=requestAnimationFrame(tick);
  }
  function refresh() { if(frame)return;frame=requestAnimationFrame(()=>{frame=0;sync();}); }
  new MutationObserver(refresh).observe(layer,{attributes:true,attributeFilter:['class']});
  new MutationObserver(refresh).observe(side,{attributes:true,attributeFilter:['class']});
  side.addEventListener('keydown',event=>{
    const row=event.target.closest('#browserPanelTrackScroll .bp-track');
    if(!row||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const rows=[...row.parentElement.children].filter(button=>!button.hidden&&!button.disabled);
    const index=rows.indexOf(row);
    const next=event.key==='Home'?0:event.key==='End'?rows.length-1:(index+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length;
    event.preventDefault();rows[next]?.focus();rows[next]?.click();
  });
  side.addEventListener('change',refresh); side.addEventListener('click',event=>{ const row=event.target.closest('.cue-card'); if(row)reveal(row); refresh(); });
  document.addEventListener('ui-locale-change',()=>{ if(mounted) unmount(); refresh(); });
  window.addEventListener('resize',refresh);
  window.BrowserPanel=Object.freeze({refresh,reveal,reflow,scrollToActive,cancelFollow});
  refresh();
})();
