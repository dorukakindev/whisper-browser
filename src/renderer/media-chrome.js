/* Shared media navigation. Moves live controls; never creates another media/job owner. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = (en,tr) => window.UiLocale?.get?.() === 'en' ? en : tr;
  const make = (tag,cls,text) => { const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n; };
  function glyph(name='panel') {
    const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');
    const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',name==='chevron'?'m7 10 5 5 5-5':name==='brand'?'m3 6 5 14 4-14 4 14 5-14':'M3 4h18v16H3zM14 4v16');s.append(p);return s;
  }
  function label(n,en,tr){n.dataset.chromeEn=en;n.dataset.chromeTr=tr;n.textContent=t(en,tr);return n;}
  function choiceMenu(id,en,tr,signal) {
    const d=make('details','mc-choice');d.id=id;
    const s=make('summary','mc-choice-trigger');s.append(glyph(),label(make('span',''),en,tr),glyph('chevron'));s.setAttribute('aria-expanded','false');
    const panel=make('div','mc-choice-panel');d.append(s,panel);
    d.addEventListener('toggle',()=>s.setAttribute('aria-expanded',String(d.open)));
    panel.addEventListener('click',e=>{if(e.target.closest('button'))d.open=false;});
    document.addEventListener('pointerdown',e=>{if(!d.contains(e.target))d.open=false;},signal?{signal}:undefined);
    d.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();d.open=false;s.focus();}});
    return {node:d,trigger:s,panel};
  }
  function action(en,tr,run){const b=label(make('button','mc-choice-action'),en,tr);b.type='button';b.addEventListener('click',run);return b;}
  function mountHome(c) {
    const {header,launcher,modes,nav,actions,settings,browser,signal}=c;
    header.classList.add('mc-homebar');header.dataset.mediaChrome='true';
    const caption=make('div','mc-home-caption');const brand=launcher.querySelector('.mh-brand');
    brand.replaceChildren(glyph('brand'),make('span','mc-wordmark','whisper'));
    caption.append(launcher);
    caption.addEventListener('keydown',e=>{if(e.key==='Escape'&&!c.menu.hidden){e.preventDefault();c.setMenu(false,true);}});
    const work=choiceMenu('mhWorkspaceMenu','Workspace','Çalışma alanı',signal);
    work.panel.append(action('Player','Oynatıcı',async()=>{await window.MediaHomeUI?.resumeWorkspace();if($('playerLayer')?.classList.contains('hidden'))window.MediaHubUI?.open();else $('workspacePlayerMode')?.click();}));
    actions.querySelectorAll('.mh-study-entry').forEach(n=>work.panel.append(n));
    label(work.trigger.querySelector('span'),'Stage','Sahne');
    const titlebar=header.parentElement?.querySelector('.mh-titlebar');if(titlebar){titlebar.classList.add('mc-home-titlebar');titlebar.replaceChildren();}
    const kind=choiceMenu('mhKindMenu','Film','Film',signal);kind.node.classList.add('mc-kind');
    // The trigger mirrors the live pressed mode button (single owner: media-home). Drop the static i18n pair so the locale handler cannot reset it to "Film".
    const kindLabel=kind.trigger.querySelector('span');delete kindLabel.dataset.chromeEn;delete kindLabel.dataset.chromeTr;
    const selected=modes.querySelector('[aria-pressed="true"]');kindLabel.textContent=selected?.textContent||t('Film','Film');
    kind.panel.append(modes);
    const feeds=c.menu.querySelector('[data-home-page="feeds"]');if(feeds)nav.insertBefore(feeds,nav.querySelector('.mh-nav-more'));
    nav.insertBefore(browser,nav.querySelector('.mh-nav-more'));browser.classList.add('mc-browser-nav');
    const more=nav.querySelector('.mh-nav-more');more.setAttribute('aria-controls','mhAppMenuPanel');
    more.addEventListener('click',()=>more.setAttribute('aria-expanded',String(!c.menu.hidden)));
    more.textContent=t('Rooms','Odalar');
    const assistant=actions.querySelector('.mv-assistant');if(assistant){assistant.append(label(make('span','mc-assistant-label'),'Assistant','Asistan'));}
    const studio=[...c.menu.querySelectorAll('.mh-menu-tools button')].find(n=>n.textContent===t('Studio','Stüdyo'));
    if(studio){studio.classList.add('mh-action','mc-home-studio');studio.prepend(glyph());actions.insertBefore(studio,assistant||actions.firstChild);}
    actions.insertBefore(work.node,assistant||actions.firstChild);actions.append(settings);
    header.replaceChildren(caption,kind.node,nav,actions);
    const overflow=c.menu.querySelector('.mh-menu-nav');
    const library=nav.querySelector('[data-home-page="watched"]');
    const fit=()=>{if(!overflow||!header.isConnected)return;const w=header.clientWidth;
      for(const [node,cutoff]of [[feeds,1150],[browser,850],[library,700]])if(node){if(w<cutoff){if(node.parentElement!==overflow)overflow.prepend(node);}else if(node.parentElement!==nav)nav.insertBefore(node,more);}
    };
    const sizing=new ResizeObserver(fit);sizing.observe(header);signal?.addEventListener('abort',()=>sizing.disconnect(),{once:true});fit();
  }
  function mountBrowser() {
    const details=$('browserTranslateMenu'),tabbar=document.querySelector('.browser-tabbar');
    if(!details||!tabbar||details.dataset.mediaChrome)return;
    details.dataset.mediaChrome='true';document.body.classList.add('mc-browser-installed');
    const toolbar=document.querySelector('.browser-toolbar');toolbar.classList.add('mc-browserbar');
    const place=()=>toolbar.style.setProperty('--mc-studio-top',`${toolbar.getBoundingClientRect().bottom}px`);
    new ResizeObserver(place).observe(toolbar);window.addEventListener('resize',place);place();
    const actions=toolbar.querySelector('.browser-toolbar-actions');
    const work=choiceMenu('browserWorkspaceMenu','Workspace','Çalışma alanı');
    work.panel.append(action('Player','Oynatıcı',()=>$('workspacePlayerMode')?.click()),$('browserStudyOpen'),$('browserPodcastOpen'));
    const headActions=document.querySelector('#playerLayer>.player-head>.player-head-actions');
    const switcher=document.querySelector('#playerLayer>.player-head>.player-workspace-switch');
    if(switcher)work.panel.append(switcher);if(headActions)work.panel.append(headActions);
    const home=$('playerBack');if(home)tabbar.prepend(home);
    tabbar.append(work.node,$('browserSettingsQuick'));
    work.node.addEventListener('toggle',()=>{if(work.node.open&&typeof closeBrowserToolbarMenus==='function')closeBrowserToolbarMenus(work.node.id);if(typeof syncBrowserOcclusion==='function')syncBrowserOcclusion();});
    const summary=$('browserSubtitleSettingsToggle');
    const subtitle=label(make('small','mc-studio-subtitle'),'Subtitles · Translation · Dubbing','Altyazı · Çeviri · Dublaj');
    const copy=make('span','mc-studio-label');copy.append($('browserSubtitleLabel'),subtitle);summary.insertBefore(copy,summary.querySelector('.browser-translate-caret'));
    const pop=details.querySelector('.browser-hub-popover');pop.classList.add('mc-studio');pop.setAttribute('role','group');
    // Dock the existing panel, retaining its original controls/listeners. The slot's
    // ResizeObserver remains the single owner of native browser bounds.
    const surface=$('browserWorkspace');
    const dock=()=>{const on=details.open;surface.classList.toggle('mc-studio-open',on);surface.style.setProperty('--mc-studio-top',`${toolbar.getBoundingClientRect().bottom}px`);if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();};
    details.addEventListener('toggle',dock);window.addEventListener('resize',dock);
    const nodes=[...pop.children];const head=make('div','mc-studio-head');head.append($('browserHubStatus'),$('browserHubJobOpen'));
    const close=label(make('button','mc-studio-close'),'Close','Kapat');close.type='button';close.addEventListener('click',()=>{details.open=false;summary.focus();});head.append(close);
    const layout=make('div','mc-studio-layout'),nav=make('nav','mc-studio-nav'),content=make('div','mc-studio-content');
    nav.setAttribute('aria-label',t('Media tools','Medya araçları'));
    const panes={};const tabs=[];
    function select(key){for(const [k,p] of Object.entries(panes))p.hidden=k!==key;for(const b of tabs){const on=b.dataset.chromePane===key;b.classList.toggle('is-current',on);b.setAttribute('aria-pressed',String(on));}}
    for(const [key,en,tr] of [['subtitles','Subtitles','Altyazı'],['translation','Translation','Çeviri'],['dubbing','Dubbing','Dublaj']]){
      const b=action(en,tr,()=>select(key));b.dataset.chromePane=key;tabs.push(b);nav.append(b);
      const p=make('section','mc-studio-pane');p.dataset.chromePane=key;p.append(label(make('h3',''),en,tr));panes[key]=p;content.append(p);
    }
    panes.subtitles.append($('browserPanelMain'));
    for(const n of nodes){
      if(n===head||head.contains(n))continue;
      if(n.classList.contains('browser-hub-step'))continue;
      const proxy=n.dataset.browserProxy||'';
      if(proxy==='browserPageTranslate'){$('browserPageQuickMenu').querySelector('.browser-page-quick-popover').prepend(n);continue;}
      const key=/Dub/.test(proxy)||n.id==='browserVoiceReferenceOpen'?'dubbing':n.classList.contains('browser-whisper-action-row')||/Translate/.test(proxy)?'translation':'subtitles';
      panes[key].append(n);
    }
    // The loaded text translation uses the existing settings surface and provider owner.
    const translate=action('Subtitle translation settings','Altyazı çevirisi ayarları',()=>{$('browserSubtitleSettingsMenu')?.click();});panes.translation.insertBefore(translate,panes.translation.children[1]||null);
    layout.append(nav,content);pop.replaceChildren(head,layout);select('subtitles');
    const pageGroup=toolbar.querySelector('.tb-page');const more=$('browserMoreMenu')?.querySelector('.browser-more-groups')||$('browserMoreMenu');
    // Complete old controls remain reachable; no ID or event handler is replaced.
    for(const n of [...pageGroup.children]){if(n.id!=='browserPageTranslate'&&n.id!=='browserPageQuickMenu')more.append(n);}
    const address=toolbar.querySelector('.browser-address-wrap');address.append(pageGroup);
    pageGroup.classList.replace('tb-page','mc-page-tools');
    const pageButton=$('browserPageTranslate'),pageProxy=$('browserPageQuickMenu').querySelector('[data-browser-proxy="browserPageTranslate"]');
    if(pageProxy&&pageButton){pageProxy.replaceWith(pageButton);pageButton.classList.add('mc-page-start');pageButton.setAttribute('role','menuitem');}
    const quick=$('browserPageQuickMenu').querySelector('summary');
    const quickText=label(make('span','mc-page-label'),'Translate: Page','Çevir: Sayfa');
    quick.replaceChildren(glyph(),quickText,glyph('chevron'));
    actions.prepend(details);
    for(const n of [...toolbar.querySelector('.tb-media').children]){if(n!==details)more.append(n);}
    $('browserMoreMenu').addEventListener('click',e=>{if(e.target.closest('button[data-browser-proxy]'))details.open=false;});
    details.addEventListener('toggle',()=>{if(details.open)select(details.dataset.chromeSelected||'subtitles');});
    nav.addEventListener('click',e=>{const b=e.target.closest('[data-chrome-pane]');if(b)details.dataset.chromeSelected=b.dataset.chromePane;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&details.open){details.open=false;summary.focus();}});
    dock();
  }
  // Keeps the visible media-type label equal to the pressed mode after page() changes it without rebuilding the shell.
  function syncKind(){const label=document.querySelector('#mhKindMenu > summary > span:not([data-chrome-en])');const pressed=document.querySelector('#mediaHome [data-home-mode][aria-pressed="true"]');if(label&&pressed&&pressed.textContent&&label.textContent!==pressed.textContent)label.textContent=pressed.textContent;}
  window.MediaChrome={mountHome,syncKind,ownsHome:header=>header.dataset.mediaChrome==='true'};
  mountBrowser();
  document.addEventListener('ui-locale-change',()=>{for(const n of document.querySelectorAll('[data-chrome-en]'))n.textContent=t(n.dataset.chromeEn,n.dataset.chromeTr);syncKind();});
})();
