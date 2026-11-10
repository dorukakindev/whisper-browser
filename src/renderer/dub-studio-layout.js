(() => {
  'use strict';
  const modal=document.getElementById('dubGeneratorDialog');
  const main=modal?.querySelector('.dub-studio-main');
  if(!main)return;
  const byId=id=>document.getElementById(id);
  const labels={prepare:['Hazırlık','Prepare'],settings:['Ayarlar','Settings'],text:['Metin','Text'],result:['Sonuç','Result'],history:['Geçmiş','History']};
  const headings={prepare:['Dublajı hazırla','Prepare dubbing'],settings:['Üretim ayarları','Production settings'],text:['Seslendirilecek metin','Text to be spoken'],result:['Dublaj sonucu','Dubbing result'],history:['Kayıtlı çalışmalar','Saved productions']};
  const en=()=>window.UiLocale?.get?.()==='en';
  const text=(node,tr,english)=>{node.dataset.uiUntranslated='';node.dataset.tr=tr;node.dataset.en=english;node.textContent=en()?english:tr;};
  const nav=document.createElement('nav');nav.className='dub-workspace-nav';nav.setAttribute('role','tablist');
  const views=new Map(),tabs=new Map();let selected='prepare';
  modal.querySelector('.dub-studio-header').after(nav);
  for(const key of Object.keys(labels)){
    const button=document.createElement('button');button.type='button';button.id='dubTab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls','dubView-'+key);button.dataset.view=key;
    text(button,...labels[key]);nav.append(button);tabs.set(key,button);
    const pane=document.createElement('section');pane.id='dubView-'+key;pane.className='dub-workspace-view';pane.dataset.dubView=key;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',button.id);pane.tabIndex=0;
    const heading=document.createElement('h3');heading.className='dub-view-heading';text(heading,...headings[key]);pane.append(heading);main.append(pane);views.set(key,pane);
    button.addEventListener('click',()=>show(key));
  }
  const setup=modal.querySelector('.dub-setup'),slot=document.createElement('div');slot.className='dub-preparation-content';
  const helpers={source:['Seslendirilecek altyazı','Subtitles to voice','Açık oynatıcıdaki seçili altyazıyı kullanabilir veya başka bir SRT seçebilirsin.','Use the selected subtitles from the player, or choose another SRT.'],voice:['Referans sesini seç','Choose the reference voice','Dublaj bu sesin kimliğini kullanır. Kayıtlı bir ses seçebilir veya kendi referansını hazırlayabilirsin.','Dubbing uses this voice identity. Choose a saved voice or prepare your own reference.'],scope:['Seslendirilecek bölümü belirle','Choose what to voice','Altyazının tamamını kullan veya belirli bir zaman aralığı seç.','Use all subtitles or select a specific time range.']};
  for(const button of setup.querySelectorAll('.dub-readiness-action')){
    const panel=byId(button.getAttribute('aria-controls')),kind=button.dataset.choice,copy=helpers[kind];
    const heading=document.createElement('h3');heading.className='dub-preparation-title';text(heading,copy[0],copy[1]);
    const hint=document.createElement('p');hint.className='dub-preparation-hint';text(hint,copy[2],copy[3]);panel.prepend(heading,hint);slot.append(panel);
  }
  views.get('prepare').append(setup,slot);
  const guide=document.createElement('p');guide.className='dub-preparation-guide';text(guide,'Ses kalitesi ve ileri seçenekler Ayarlar’da. Cümleleri değiştirmek için Metin’e geç.','Voice quality and advanced options are in Settings. Use Text to edit sentences.');views.get('prepare').append(guide);
  const move=(key,id)=>{const node=byId(id);if(node)views.get(key).append(node);};
  move('settings','dubManualSettings');move('text','dubReviewTools');move('result','dubPreviewCard');move('result','dubQualityResults');move('result','dubWorkspacePanel');move('history','dubRuns');
  const settingsBody=byId('dubManualSettings').querySelector('.dub-tool-body'),settingsGroups=document.createElement('div');settingsGroups.className='dub-settings-groups';
  settingsBody.append(settingsGroups);
  for(const id of ['dubProductionSettings','dubAdvancedSettings','dubDeliverySettings','dubBackgroundSettings','dubEngineSettings']){
    const group=byId(id);settingsGroups.append(group);
    group.addEventListener('toggle',()=>{if(group.open)for(const sibling of settingsGroups.children)if(sibling!==group)sibling.open=false;});
  }
  byId('dubProductionSettings').append(byId('dubReadySettings'));
  byId('dubDeliverySettings').querySelector('summary').after(byId('dubNaturalDelivery'));
  const timing=document.createElement('section');timing.className='dub-timing-choice';const timingLabel=modal.querySelector('label[for=dubTimingMode]'),timingSelect=byId('dubTimingMode'),timingHint=timingSelect.nextElementSibling;
  timing.append(timingLabel,timingSelect);if(timingHint?.tagName==='P')timing.append(timingHint);settingsBody.append(timing,settingsGroups);
  const editor=byId('dubTextEditor'),textColumns=document.createElement('div');textColumns.className='dub-text-columns';
  for(const id of ['dubPlanOriginal','dubPlanText']){const column=document.createElement('div');const label=modal.querySelector(`label[for="${id}"]`);column.append(label,byId(id));textColumns.append(column);}byId('dubPlanGroup').after(textColumns);
  const elapsed=modal.querySelector('.dub-run-meta>p');if(elapsed)modal.querySelector('.dub-run-details-body').prepend(elapsed);
  const footer=modal.querySelector('.dub-studio-footer');
  const syncFooter=()=>{footer.dataset.duplicateReason=String(!!byId('dubGeneratorStatus').textContent&&byId('dubGeneratorStatus').textContent===byId('dubStartRequirement').textContent);};
  for(const id of ['dubGeneratorStatus','dubStartRequirement'])new MutationObserver(syncFooter).observe(byId(id),{childList:true,characterData:true,subtree:true});syncFooter();
  const empty=document.createElement('div');empty.id='dubResultEmpty';empty.className='dub-result-empty';
  const emptyTitle=document.createElement('h3'),emptyCopy=document.createElement('p');text(emptyTitle,'Henüz üretilmiş ses yok','No audio has been generated yet');text(emptyCopy,'Hazırlık bölümünden altyazını ve sesini seç. Üretim tamamlanınca sesi burada dinleyebilirsin.','Choose subtitles and a voice in Prepare. Listen here when generation finishes.');empty.append(emptyTitle,emptyCopy);views.get('result').prepend(empty);
  function updateEmpty(){empty.hidden=!byId('dubPreviewCard').hidden;}
  new MutationObserver(updateEmpty).observe(byId('dubPreviewCard'),{attributes:true,attributeFilter:['hidden']});updateEmpty();
  function show(key,{focus=false}={}){
    if(!views.has(key))return;selected=key;
    for(const [name,pane]of views){pane.hidden=name!==key;tabs.get(name).setAttribute('aria-selected',String(name===key));tabs.get(name).tabIndex=name===key?0:-1;}
    for(const id of key==='settings'?['dubManualSettings']:key==='text'?['dubReviewTools']:key==='history'?['dubRuns']:[])byId(id).open=true;
    modal.querySelector('.dub-studio-scroll').scrollTop=0;
    if(focus)tabs.get(key).focus({preventScroll:true});
  }
  function reveal(node){if(typeof node==='string')node=byId(node);const pane=node?.closest('[data-dub-view]');if(pane)show(pane.dataset.dubView);}
  nav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const keys=[...tabs.keys()],index=keys.indexOf(selected);
    show(event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length],{focus:true});
  });
  const locale=()=>{for(const [key,button]of tabs)text(button,...labels[key]);nav.setAttribute('aria-label',en()?'Dubbing sections':'Dublaj bölümleri');};
  document.addEventListener('ui-locale-change',locale);locale();
  const subtitle=modal.querySelector('.dub-title-block p');text(subtitle,'Altyazını ve sesini seç, ardından üret.','Choose subtitles and a voice, then generate.');
  new MutationObserver(()=>{if(modal.open){show('prepare');window.dispatchEvent(new Event('dub-layout:opened'));}}).observe(modal,{attributes:true,attributeFilter:['open']});
  window.DubStudioLayout=Object.freeze({show,reveal,current:()=>selected});
  modal.classList.add('dub-workspace');show('prepare');
})();
