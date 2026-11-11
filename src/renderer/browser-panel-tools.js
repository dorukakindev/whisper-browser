(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const jobs = new Map();
  let serial = 0, surface = null;
  const tr = (a,b) => window.UiLocale?.get?.() === 'en' ? b : a;
  function make(tag, cls, text) {
    const element = document.createElement(tag); element.className = cls;
    if (text) element.textContent = text;
    element.dataset.uiUntranslated=''; return element;
  }
  const icons = {
    display:'M3 5h18v14H3zM7 10h10M7 14h5',
    play:'M4 4h16v16H4z m6 5 6 3-6 3z',
    search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-1 5 5 5',
    film:'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4',
    text:'M5 5h14M12 5v14M8 19h8',
    font:'m4 20 6-16 6 16M6 15h8M17 10h5M19 7v13',
    file:'M14 3H5v18h14V8zM14 3v6h5M8 13h8m-8 4h5',
    frame:'M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M8 9h8m-8 5h8',
    chapter:'M5 4h14v17l-7-4-7 4z',
    close:'M6 6l12 12M18 6 6 18',
    link:'m9 15 6-6M8 16l-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m4 0 2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0',
    sync:'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',
    chevron:'m6 9 6 6 6-6'
  };
  function icon(name) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[name]||icons.file);svg.append(path);return svg;
  }
  function action(text, fn) {
    const button=make('button','bt-action',text);button.type='button';button.onclick=fn;return button;
  }
  function context() {
    const tab=typeof browserTabState==='function'?browserTabState():null;
    return tab ? JSON.stringify([tab.id,tab.generation,tab.mediaId||'']) : '';
  }
  function renderJobs() {
    if (!surface) return;
    surface.replaceChildren();
    const visible=[...jobs.values()].filter(job=>job.context===context());
    for(const job of visible.slice(0,2)) {
      const card=make('article','bt-task');card.setAttribute('aria-label',job.label);
      const line=make('div','bt-task-head');
      const pulse=make('i','bt-task-pulse');pulse.setAttribute('aria-hidden','true');
      line.append(pulse,make('strong','',job.label));
      const cancel=action(tr('İptal et','Cancel'),()=>{if(job.cancelling)return;job.cancelling=true;cancel.disabled=true;job.cancel?.();});
      cancel.disabled=job.cancelling;line.append(cancel);
      const progress=make('div','bt-progress');progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',job.label);
      const bar=make('i','');progress.append(bar);
      if(Number.isFinite(job.total)&&job.total>0) {
        const value=Math.max(0,Math.min(100,job.done/job.total*100));
        bar.style.width=value+'%';progress.setAttribute('aria-valuenow',String(value));progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');
      } else progress.classList.add('indeterminate');
      const status=make('p','',job.cancelling ? tr('İptal isteği gönderildi','Cancellation requested') : job.message||tr('İşleniyor… Videoyu izlemeye devam edebilirsin.','Working… You can keep watching.'));
      card.append(line,status,progress);surface.append(card);
    }
    if(visible.length>2) surface.append(make('div','bt-task-more','+'+(visible.length-2)+' '+tr('iş daha sürüyor','more tasks running')));
    surface.hidden=!visible.length;
  }
  function start(spec) {
    const id='browser-tool-'+(++serial);
    jobs.set(id,{...spec,id,context:spec.context||context()});renderJobs();return id;
  }
  function update(id, spec) { const job=jobs.get(id);if(job){Object.assign(job,spec);renderJobs();} }
  function finish(id, result={}) {
    const job=jobs.get(id);if(!job)return;
    jobs.delete(id);renderJobs();
    if(!surface || job.context!==context() || result.silent) return;
    const toast=make('div','bt-toast');toast.setAttribute('role','status');
    toast.append(make('span','',result.error||tr('Tamamlandı','Completed')+' · '+job.label));
    if(!result.error && job.open) toast.append(action(job.openLabel||tr('Sonucu aç','Open result'),job.open));
    const close=action(tr('Kapat','Dismiss'),()=>toast.remove());close.classList.add('bt-toast-close');toast.append(close);
    surface.parentElement.querySelector('.bt-toast')?.remove();surface.after(toast);
    window.BrowserPanel?.reveal(toast);
    setTimeout(()=>toast.remove(),9000);
  }
  // G14: intent vocabulary per group (lower-case). Search matches tool labels first, then these everyday phrases.
  const intents={
    'Yazı ve görünüm':'yazı yazıyı büyüt küçült font yazı tipi boyut renk karakter bozuk türkçe harf ass stil görünüm text size bigger fonts encoding broken characters style',
    'Oynatma':'ses geriden geliyor gecikme önde senkron zaman kaydır ofset küçük oynatıcı mini pencere sync delay late early offset timing audio',
    'Bul ve anla':'bul ara replik cümle kare karedeki yazı ekrandaki yazı ocr anlam arama find search dialogue line frame text on screen',
    'Sahne ve bölümler':'sahne bölüm jenerik atla intro giriş dizi sonraki bölüm scene chapter skip credits series episode',
    'Altyazı işlemleri':'altyazı oluştur çevir çeviri karşılaştır dışa aktar indir kaydet srt subtitle create translate compare export save download'
  };
  const definitions=[
    {name:['Yazı ve görünüm','Text & appearance'],hint:['Yazı boyutu, font ve karakter düzeltmeleri · ASS biçimi','Text size, fonts and character repair · ASS format'],icon:'display',tools:[
      {selector:'[data-bf-action="ass-load"]',icon:'file'},
      {selector:'[data-bf-action="ass-load-fonts"]',icon:'font'},
      {selector:'[data-bf-action="ass-load-mkv-fonts"]',icon:'film'},
      {selector:'[data-bf-action="encoding-preview"]',icon:'text'},
      {selector:'[data-bf-action="ass-clear"]',icon:'close'}]},
    {name:['Oynatma','Playback'],hint:['Küçük oynatıcı ve ses–metin senkronu','Mini player and subtitle timing'],icon:'play',tools:[
      {selector:'[data-bf-action="mini-open"]',icon:'play'},
      {selector:'#browserAnalysisTools',icon:'sync'}]},
    {name:['Bul ve anla','Find & understand'],hint:['Altyazı, replik ve kare içindeki yazılar','Subtitles, dialogue and text in frames'],icon:'search',tools:[
      {selector:'[aria-labelledby="bfFindTitle"]',icon:'search'},
      {selector:'[aria-labelledby="bfSemanticTitle"]',icon:'text'},
      {selector:'[aria-labelledby="bfOcrTitle"]',icon:'frame'},
      {selector:'#browserVideoAnalysisTools',icon:'film'}]},
    {name:['Sahne ve bölümler','Scenes & chapters'],hint:['Sahneler, jenerikler ve dizi bağlamı','Scenes, intros and series context'],icon:'film',tools:[
      {selector:'[aria-labelledby="bfScenesTitle"]',icon:'film'},
      {selector:'[aria-labelledby="bfSkipTitle"]',icon:'chapter'},
      {selector:'#bfSeriesContext',icon:'link'}]},
    {name:['Altyazı işlemleri','Subtitle actions'],hint:['Oluştur, çevir, karşılaştır ve dışa aktar','Create, translate, compare and export'],icon:'text',tools:[
      {selector:'#subtitleActionsMenu',icon:'file'}]}
  ];
  function mount({container,footer,take,reveal}) {
    const root=byId('browserFeatures');if(!root)return;
    const workspace=root.querySelector('.bf-workspace');if(!workspace)return;
    root.classList.add('bt-root');workspace.classList.add('bt-workspace');
    const english=window.UiLocale?.get?.()==='en';
    const label=make('label','bt-search');label.append(icon('search'));
    const input=make('input','');input.type='search';input.placeholder=tr('Araç ara','Find a tool');input.setAttribute('aria-label',input.placeholder);
    label.append(input,make('kbd','','/'));
    const head=make('div','bt-library-head');head.append(make('span','bp-section-title',tr('ARAÇ KİTAPLIĞI','TOOL LIBRARY')));
    const count=make('span','bt-result-count','5 '+tr('grup','groups'));head.append(count);
    const groupHost=make('div','bt-groups');const rows=[];const groups=[];const restored=[];
    for(const definition of definitions) {
      const group=make('details','bt-group');const summary=make('summary','');
      const badge=make('span','bt-group-icon');badge.append(icon(definition.icon));
      const copy=make('span','bt-group-copy');copy.append(make('strong','',definition.name[english?1:0]),make('small','',definition.hint[english?1:0]));
      group.dataset.intent=(intents[definition.name[0]]||'');summary.append(badge,copy,icon('chevron'));group.append(summary);const body=make('div','bt-group-body');group.append(body);groupHost.append(group);groups.push(group);
      let before=[];
      summary.addEventListener('click',()=>{before=groups.map(element=>({element,top:element.getBoundingClientRect().top}));});
      group.addEventListener('toggle',()=>{
        if(group.open){
          if(!input.value.trim()) for(const other of groups)if(other!==group)other.open=false;
          reveal(body);
        }
        const full=window.CinemaMotion?.mode==='full'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
        if(full){
          for(const {element,top} of before){const delta=top-element.getBoundingClientRect().top;if(element!==group&&Math.abs(delta)>1)element.animate([{transform:'translateY('+delta+'px)'},{transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});}
          if(group.open)body.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'ease-out'});
        }
        before=[];
      });
      for(const spec of definition.tools) {
        const tool=document.querySelector(spec.selector);if(!tool)continue;
        take(tool,body);
        const target=tool.tagName==='DETAILS'?tool.querySelector(':scope > summary'):tool;
        if(!target)continue;
        const originalChildren=[...target.childNodes];
        restored.push(()=>{target.replaceChildren(...originalChildren);target.classList.remove('bt-tool-row');tool.classList.remove('bt-inline-tool');});
        target.classList.add('bt-tool-row');
        const existing=target.querySelector('.bt-tool-name');
        let text=existing;
        if(!text) {
          text=make('span','bt-tool-name');while(target.firstChild)text.append(target.firstChild);
          target.append(icon(spec.icon),text);
          if(tool.tagName==='DETAILS') target.append(icon('chevron'));
        }
        if(tool.tagName==='DETAILS')tool.classList.add('bt-inline-tool');
        if(tool.dataset.bfAction==='ass-clear'){const hint=make('small','bt-state-hint',tool.disabled?tr('Kapalı','Off'):tr('Açık','On'));target.append(hint);}
        rows.push({tool,target,text,label:window.UiLocale?.t(text.textContent.trim())||text.textContent.trim(),group});
      }
    }
    const empty=make('div','bt-empty');empty.hidden=true;empty.append(icon('search'),make('strong','',tr('Araç bulunamadı','No tools found')),make('p','',tr('Başka bir sözcük deneyebilirsin.','Try a different search.')),
      action(tr('Aramayı temizle','Clear search'),()=>{input.value='';filter();input.focus();}));
    const shortcuts=make('details','bt-shortcuts');shortcuts.append(make('summary','',tr('Kısayollar','Shortcuts')));
    const shortBody=make('div','bt-shortcuts-body');shortcuts.append(shortBody);
    const enabled=make('input','');enabled.type='checkbox';enabled.checked=readKeys().enabled;
    const enabledLabel=make('label','');enabledLabel.append(enabled,make('span','',tr('Panelde cümle kısayollarını kullan','Enable sentence shortcuts in panel')));shortBody.append(enabledLabel);
    const fields={};
    for(const [key,caption] of [['previous',tr('Önceki cümle','Previous sentence')],['replay',tr('Tekrar','Replay')],['next',tr('Sonraki cümle','Next sentence')]]) {
      const field=make('input','');field.type='text';field.maxLength=1;field.value=readKeys()[key];field.setAttribute('aria-label',caption);fields[key]=field;
      const wrap=make('label','');wrap.append(make('span','',caption),field);shortBody.append(wrap);
    }
    const keyStatus=make('p','');keyStatus.setAttribute('role','status');shortBody.append(keyStatus);
    const saveKeys=()=>{
      const value={enabled:enabled.checked,...Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value.toLowerCase()]))};
      if(!Object.values(fields).every(field=>/^[a-z]$/i.test(field.value))||new Set([value.previous,value.replay,value.next]).size!==3) {
        keyStatus.textContent=tr('Üç farklı harf seçin (A–Z).','Choose three different letters (A–Z).');return;
      }
      try{localStorage.setItem('browserSentenceKeys',JSON.stringify(value));keyStatus.textContent=tr('Kaydedildi. Metin alanlarında kısayollar çalışmaz.','Saved. Shortcuts are inactive while typing.');}catch(_){keyStatus.textContent=tr('Kısayollar kaydedilemedi.','Could not save shortcuts.');}
      syncKeyHints();
    };
    enabled.onchange=saveKeys;Object.values(fields).forEach(field=>field.addEventListener('change',saveKeys));
    const hint=make('p','bt-key-hint','Alt + Shift + S · '+tr('panel','panel'));shortcuts.append(hint);
    const old=[];for(const node of [...workspace.children])if(!node.closest('.bt-group'))old.push(node);
    const legacy=make('div','bt-state-pool');legacy.hidden=true;
    for(const node of old)take(node,legacy);
    workspace.append(label,head,groupHost,empty,shortcuts,legacy);
    const encoding=root.querySelector('#bfEncodingPreview');
    if(encoding)take(encoding,groups[0].querySelector('.bt-group-body'));
    // Approved inner layouts retain the live controls and their original handlers.
    const actionMenu=byId('subtitleActionsMenu');
    const actionList=actionMenu?.querySelector('.subtitle-actions-pop');
    if(actionList){
      actionList.classList.add('bt-action-list');
      take(actionList,groups[4].querySelector('.bt-group-body'));
      actionMenu.classList.add('bt-action-container');
      const navigateActions=event=>{
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        const buttons=[...actionList.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
        const current=buttons.indexOf(event.target);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        event.preventDefault();buttons[next].focus();
      };
      actionList.addEventListener('keydown',navigateActions);
      restored.push(()=>{actionMenu.classList.remove('bt-action-container');actionList.removeEventListener('keydown',navigateActions);});
      take(byId('abCompareBtn'),actionList);take(byId('exportTranslationBtn'),actionList);
      const actionIcons={makeSubsBtn:'film',makeTransBtn:'text',retranslateAllBtn:'sync',retranslateRangeBtn:'frame',abCompareBtn:'play',subCompareBtn:'display',exportTranslationBtn:'file'};
      for(const control of actionList.querySelectorAll('button')){
        const children=[...control.childNodes];
        const label=make('span','',window.UiLocale?.t(control.textContent.trim())||control.textContent.trim());
        control.replaceChildren(icon(actionIcons[control.id]||'text'),label);
        restored.push(()=>control.replaceChildren(...children));
      }
      const edit=action(tr('Altyazıyı düzenle','Edit subtitles'),()=>openCueEditor(false));
      edit.replaceChildren(icon('text'),make('span','',tr('Altyazıyı düzenle','Edit subtitles')));
      const updateEdit=()=>{edit.disabled=!player.cues?.length;edit.title=edit.disabled?tr('Önce bir altyazı yükleyin.','Load subtitles first.'):tr('Altyazıyı düzenle','Edit subtitles');};
      actionList.insertBefore(edit,byId('exportTranslationBtn'));updateEdit();
      document.addEventListener('browser-panel-context',updateEdit);
      restored.push(()=>{edit.remove();actionList.classList.remove('bt-action-list');document.removeEventListener('browser-panel-context',updateEdit);});
    }
    const sync=byId('browserAnalysisTools'),syncBody=sync?.querySelector('.bf-group-body');
    if(syncBody){
      const layout=make('section','bt-detail-form');syncBody.classList.add('bt-sync-body');syncBody.append(layout);
      layout.append(make('p','',tr('İzlenen videoyla aynı sürümdeki yerel dosya.','A local file matching the playing video.')));
      const reference=make('div','bt-reference');take(byId('baReference'),reference);take(byId('baReferenceName'),reference);layout.append(reference);
      const source=byId('subOffset');
      let cleanupOffset=()=>{};
      if(source){
        const label=make('label','bt-offset-label',tr('Altyazı kayması','Subtitle offset'));
        const output=make('output','');label.append(output);
        const row=make('div','bt-offset');const slider=make('input','');slider.type='range';
        slider.min=source.min;slider.max=source.max;slider.step=source.step;slider.setAttribute('aria-label',tr('Altyazı kayması','Subtitle offset'));
        const update=()=>{slider.value=source.value;output.textContent=Number(source.value).toFixed(1)+' '+tr('sn','s');};
        const apply=()=>{source.value=slider.value;source.dispatchEvent(new Event('input',{bubbles:true}));update();};
        const less=action('−',()=>{slider.stepDown();apply();});less.setAttribute('aria-label',tr('Gecikmeyi azalt','Decrease offset'));
        const more=action('+',()=>{slider.stepUp();apply();});more.setAttribute('aria-label',tr('Gecikmeyi artır','Increase offset'));
        slider.addEventListener('input',apply);source.addEventListener('input',update);document.addEventListener('browser-panel-context',update);
        row.append(less,slider,more);layout.append(label,row);update();
        cleanupOffset=()=>{source.removeEventListener('input',update);document.removeEventListener('browser-panel-context',update);};
      }
      const preview=make('div','bt-preview');preview.append(make('label','',tr('Önizlemeli video konumu','Video preview position')));
      take(byId('baThumb'),preview);take(byId('baSeek'),preview);take(byId('baPreviewHint'),preview);layout.append(preview);
      for(const id of ['baWaveform','baAlign','baAlignAudio'])take(byId(id),layout);
      const status=make('div','bt-inline-status');take(byId('baStatus'),status);take(byId('baCancel'),status);layout.append(status);
      take(byId('baAlignment'),layout);take(byId('baApply'),layout);
      restored.push(()=>{cleanupOffset();layout.remove();syncBody.classList.remove('bt-sync-body');});
    }
    // Basic player controls keep their listeners and live above the library.
    const controls=container.querySelector('.side-bottom');
    if(controls){
      label.after(controls);
      const toggle=controls.querySelector('#toolsToggle');
      if(toggle){const children=[...toggle.childNodes];restored.push(()=>{toggle.replaceChildren(...children);toggle.classList.remove('bt-controls-label');});toggle.textContent=tr('İZLEME KONTROLLERİ','WATCH CONTROLS');toggle.classList.add('bt-controls-label');}
    }
    surface=make('section','bt-running-jobs');surface.hidden=true;surface.setAttribute('aria-live','polite');footer.before(surface);
    const keyEntry=action(tr('Kısayollar','Shortcuts'),()=>{setSideTab('tools');shortcuts.open=true;shortcuts.scrollIntoView({block:'nearest'});enabled.focus();});
    const settingsBody=byId('settingsPageSource');if(settingsBody)settingsBody.append(keyEntry);
    const fieldsObserver=new MutationObserver(()=>{
      const clear=root.querySelector('[data-bf-action="ass-clear"]');
      if(clear){const hint=clear.querySelector('.bt-state-hint');if(hint)hint.textContent=clear.disabled?tr('Kapalı','Off'):tr('Açık','On');clear.title=clear.disabled?tr('Şu anda etkin bir ASS görünümü yok veya bir işlem sürüyor.','No ASS view is active, or an operation is running.'):tr('ASS görünümünü kapat','Disable ASS rendering');}
    });
    fieldsObserver.observe(root,{attributes:true,subtree:true,attributeFilter:['disabled']});
    function filter() {
      const query=input.value.trim().toLocaleLowerCase('tr');let matches=0;
      for(const row of rows) {
        const text=row.label;const at=text.toLocaleLowerCase('tr').indexOf(query);
        const words=query.split(/\s+/).filter(w=>w.length>1),intentText=(row.group.dataset.intent||'').toLocaleLowerCase('tr'),intentHit=!!query&&words.length>0&&words.every(w=>intentText.includes(w)),found=!query||at>=0||intentHit;row.tool.hidden=!found;if(found)matches++;
        row.text.replaceChildren();
        if(query&&at>=0){row.text.append(document.createTextNode(text.slice(0,at)),make('mark','',text.slice(at,at+query.length)),document.createTextNode(text.slice(at+query.length)));}
        else row.text.textContent=text;
      }
      for(const group of groups){group.hidden=!rows.some(row=>row.group===group&&!row.tool.hidden);if(query)group.open=!group.hidden;}
      count.textContent=query?matches+' '+tr('sonuç','results'):'5 '+tr('grup','groups');empty.hidden=matches>0;
    }
    input.addEventListener('input',filter);
    const onKey=event=>{
      if(!container.contains(event.target)||event.isComposing)return;
      const typing=event.target.closest('input,textarea,select,[contenteditable]');
      if(event.key==='/'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopPropagation();input.focus();}
      if(event.key==='Escape'&&event.target===input){event.preventDefault();event.stopPropagation();input.value='';filter();}
    };
    container.addEventListener('keydown',onKey,true);
    filter();
    syncKeyHints();renderJobs();
    return ()=>{for(const restore of restored)restore();keyEntry.remove();for(const node of [label,head,groupHost,empty,shortcuts,legacy])node.remove();fieldsObserver.disconnect();container.removeEventListener('keydown',onKey,true);root.classList.remove('bt-root');workspace.classList.remove('bt-workspace');surface?.remove();surface=null;};
  }
  function readKeys() {
    const defaults={enabled:true,previous:'a',replay:'r',next:'d'};
    try {
      const raw=JSON.parse(localStorage.getItem('browserSentenceKeys')||'null');
      if(!raw||!['previous','replay','next'].every(key=>/^[a-z]$/.test(raw[key]))||new Set([raw.previous,raw.replay,raw.next]).size!==3)return defaults;
      return {...defaults,...raw,enabled:raw.enabled!==false};
    }catch(_){return defaults;}
  }
  function syncKeyHints() {
    const keys=readKeys();
    for(const [id,key,label] of [['cuePrevBtn','previous',tr('Önceki cümle','Previous sentence')],['cueReplayBtn','replay',tr('Cümleyi tekrar oynat','Replay sentence')],['cueNextBtn','next',tr('Sonraki cümle','Next sentence')]]) {
      const button=byId(id);if(button){button.title=label+(keys.enabled?' · '+keys[key].toUpperCase():'');button.setAttribute('aria-label',label);}
    }
  }
  function shortcut(event) {
    if(!byId('playerSide')?.contains(event.target)||event.target.closest?.('input,textarea,select,[contenteditable]')||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
    const keys=readKeys();if(!keys.enabled)return false;
    const key=String(event.key).toLowerCase();
    if(key===keys.previous)stepCue(-1);else if(key===keys.replay)replayCue();else if(key===keys.next)stepCue(1);else return false;
    event.preventDefault();return true;
  }
  document.addEventListener('browser-panel-context',renderJobs);
  window.BrowserPanelTools=Object.freeze({mount,start,update,finish,shortcut});
})();
