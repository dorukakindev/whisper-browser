(() => {
  'use strict';
  // Ortak yüzey dili davranışı: yan panel kaynak adı ve kullanılamayan menü öğeleri için gerçek neden/adım.
  // Açma/kapama, Escape, odak dönüşü ve karşılıklı kapanma renderer.js'tedir (closeBrowserToolbarMenus, wireDetailsMenuNav).
  const t = (tr, en) => (window.UiLocale?.get?.() === 'en' ? en : tr);
  const MENUS = '.browser-menu-popover, .subtitle-actions-pop, .quick-pop-menu';
  const REASONS = {
    makeTransBtn: ['Önce bir altyazı yükleyin veya oluşturun.', 'First load or create subtitles.'],
    retranslateAllBtn: ['Önce bir altyazı yükleyin veya oluşturun.', 'First load or create subtitles.'],
    retranslateRangeBtn: ['Önce zaman çizelgesinde Shift+tıkla bir aralık seçin.', 'First Shift+click a range on the timeline.'],
    abCompareBtn: ['Önce zaman çizelgesinde bir aralık seçin.', 'First select a range on the timeline.'],
    subCompareBtn: ['İki altyazı kanalı yüklenince kullanılabilir.', 'Available once two subtitle channels are loaded.'],
    exportTranslationBtn: ['Dışa aktarmak için önce bir çeviri yükleyin veya oluşturun.', 'Load or create a translation before exporting.'],
  };

  function bindSource() {
    const title = document.getElementById('playerTitle'), host = document.querySelector('.side-heading > div');
    if (!title || !host) return;
    let node = document.getElementById('sideSourceName');
    if (!node) { node = document.createElement('span'); node.id = 'sideSourceName'; node.className = 'side-source'; node.dataset.uiUntranslated = ''; host.append(node); }
    const sync = () => {
      const text = (title.textContent || '').trim();
      node.textContent = text; node.hidden = !text;
      node.title = text ? t('Altyazı değişiklikleri bu kaynağa uygulanır: ', 'Subtitle changes apply to this source: ') + text : '';
    };
    sync();
    new MutationObserver(sync).observe(title, { childList: true, characterData: true, subtree: true });
    document.addEventListener('ui-locale-change', sync);
  }

  function reasonFor(item) {
    if (item.dataset.reason) return item.dataset.reason;
    const known = REASONS[item.id];
    if (known) return t(known[0], known[1]);
    return t('Bu kaynak veya durum için şu an kullanılamıyor.', 'Not available for this source or state right now.');
  }

  function decorate(menu) {
    for (const item of menu.querySelectorAll('button')) {
      if (item.matches('.quick-pop-stepper button, .browser-more-zoom button, .browser-more-quick > button')) continue;
      const unavailable = item.disabled || item.getAttribute('aria-disabled') === 'true', mark = item.querySelector(':scope > .sy-reason');
      if (!unavailable) { mark?.remove(); continue; }
      if (!item.textContent.trim()) continue; // yalnız ikonlu düğmeler satır olarak açıklanmaz
      const text = reasonFor(item);
      if (mark) { if(mark.textContent!==text)mark.textContent = text; continue; }
      const note = document.createElement('small'); note.className = 'sy-reason'; note.dataset.uiUntranslated = ''; note.textContent = text; item.append(note);
    }
  }

  // Menü açıldığı anda gerçek devre dışı durumları işaretlenir (toggle kabarcıklanmaz; yakalama aşamasında dinlenir).
  document.addEventListener('toggle', event => {
    const details = event.target;
    if (details instanceof HTMLDetailsElement && details.open) for (const menu of details.querySelectorAll(MENUS)) decorate(menu);
  }, true);
  document.addEventListener('ui-locale-change', () => { for (const menu of document.querySelectorAll(MENUS)) if (menu.closest('details')?.open) { for (const mark of menu.querySelectorAll('.sy-reason')) mark.remove(); decorate(menu); } });

  // Only state attributes are observed: decorating text must not trigger itself.
  const changes=new MutationObserver(records=>{
    const menus=new Set();
    for(const record of records){const menu=record.target.closest?.(MENUS);if(menu)menus.add(menu);}
    for(const menu of menus)decorate(menu);
  });
  for(const menu of document.querySelectorAll(MENUS)){
    changes.observe(menu,{subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled','data-reason']});
    decorate(menu);
  }
  // Existing action nodes retain their handlers, identity and confirmation owners.
  const exportButton=document.getElementById('exportTranslationBtn');
  const actionHost=exportButton?.parentElement;
  if(actionHost&&!actionHost.querySelector('.sy-action-group')){
    for(const [label,english,ids]of [
      ['Çeviri','Translation',['makeTransBtn','retranslateAllBtn','retranslateRangeBtn']],
      ['İncele ve karşılaştır','Inspect and compare',['abCompareBtn','subCompareBtn']],
      ['Dosyaya kaydet','Save to file',['exportTranslationBtn']]]){
      const nodes=ids.map(id=>document.getElementById(id)).filter(node=>node?.parentElement===actionHost);
      if(!nodes.length)continue;
      const group=document.createElement('div');group.className='sy-action-group';group.setAttribute('role','group');
      const title=document.createElement('span');title.className='sy-group-title';title.dataset.uiUntranslated='';
      const sync=()=>{title.textContent=t(label,english);group.setAttribute('aria-label',title.textContent);};sync();document.addEventListener('ui-locale-change',sync);
      actionHost.insertBefore(group,nodes[0]);group.append(title,...nodes);
    }
  }
  const sourceOffset=document.getElementById('subOffset'),translationOffset=document.getElementById('sub2Offset');
  const languageRow=document.querySelector('.side-langs');
  if(sourceOffset&&translationOffset&&languageRow){
    const strip=document.createElement('div');strip.className='sy-timing-overview';
    for(const [input,translation]of [[sourceOffset,false],[translationOffset,true]]){
      const button=document.createElement('button');button.type='button';button.dataset.uiUntranslated='';strip.append(button);
      const sync=()=>{const value=Number(input.value)||0;const role=translation?t('İkinci iz','Second track'):t('Birinci iz','First track');const available=typeof player!=='undefined'&&!!(translation?player.sub2Path:player.subPath);button.disabled=!available;if(!available){button.textContent=role+': '+t('yüklü değil','not loaded');return;}const state=value===0?t('eşzamanlı','in sync'):value>0?t('geç','late'):t('erken','early');button.textContent=role+': '+(value===0?'':Math.abs(value).toFixed(1)+t(' sn ',' s '))+state;};
      button.onclick=()=>{if(typeof setSettingsDrawer==='function')setSettingsDrawer(true);for(let node=input;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;input.focus();input.scrollIntoView?.({block:'center'});};
      input.addEventListener('input',sync);input.addEventListener('change',sync);document.addEventListener('media-context-changed',sync);document.addEventListener('ui-locale-change',sync);
      const valueLabel=document.getElementById('subOffsetVal');if(valueLabel)new MutationObserver(sync).observe(valueLabel,{childList:true,characterData:true,subtree:true});sync();
    }
    languageRow.after(strip);
  }
  window.PanelSystem = Object.freeze({ decorate });
  bindSource();
})();
