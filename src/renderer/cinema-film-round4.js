/* Approved Round 4. Canonical controls and their owners retain all state writes. */
(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 const icon=name=>window.CinemaUI.icon(name);
 const keys=['story','characters','pace','visuals','sound','emotion','atmosphere'];
 const descriptions=()=>({story:t('The story and its impact.','Hikâyenin sende bıraktığı iz.'),characters:t('People and performances.','Karakterler ve oyunculuk.'),emotion:t('The emotional impact.','Seni içine alan duygusal etki.'),pace:t('The rhythm of the narrative.','Anlatının ritmi ve akışı.'),visuals:t('Framing, light and visual storytelling.','Kadraj, ışık ve görsel anlatım.'),sound:t('Music and the sound world.','Müzik ve ses dünyasının etkisi.'),atmosphere:t('The world this film creates.','Filmin kurduğu dünyanın hissi.')});
 function mount(page,body){
  body.classList.add('cf4-viewing');
  let disposed=false,editor=null,reflection=null,global=null,scope='film',preferenceControls=null;const moreControls=[],syncs=new Map();
  const watch=()=>observer.observe(page,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-busy']});
  const observer=new MutationObserver(enhance);
  const saved=event=>{const node=event.detail?.kind==='journal'?body.querySelector('.daily-journal .daily-journal-form button'):editor?.querySelector('[data-cf4-save]');if(node&&window.CinemaMotion?.mode!=='off'&&window.CinemaMotion?.mode!=='reduced')node.animate?.([{opacity:.6,transform:'scale(.97)'},{opacity:1,transform:'scale(1)'}],{duration:200,easing:'ease-out'});};
  page.addEventListener('cinema-save-complete',saved);
  const toggled=event=>{if(event.target.matches?.('.cn-accordion,.film-decision-profile'))enhance();};page.addEventListener('toggle',toggled,true);
  function button(label,run,kind='ghost'){return window.CinemaUI.action(label,run,kind);}
  function accordion(node,label,hint,symbol='folder'){
   if(!node)return;node.classList.add('cf4-inline');let summary=node.querySelector(':scope>summary');
   if(!summary){summary=el('summary');node.prepend(summary);}if(summary.dataset.cf4)return;
   summary.dataset.cf4='true';summary.replaceChildren(icon(symbol),el('strong','',label),el('span','',hint),icon('down'));
  }
  function scale(select,label,key,isGlobal){
   const card=el('article','cf4-aspect'),heading=el('h3','',label);heading.id='cf4-'+crypto.randomUUID();
   const description=el('p','',descriptions()[key]||'');select.hidden=true;select.tabIndex=-1;
   const group=el('div','cf4-scale');group.setAttribute('role','radiogroup');group.setAttribute('aria-labelledby',heading.id);
   const options=[...select.options];group.style.setProperty('--cells',options.length);group.append(el('i'));
   const buttons=options.map((option,index)=>{
    const text=option.value===''?t('Unchanged','Değiştirme'):option.textContent;
    const b=el('button','',text);b.type='button';b.title=option.value===''?t('Leave unchanged','Değiştirme'):option.textContent;b.setAttribute('role','radio');
    b.addEventListener('click',()=>{if(b.disabled)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();updateCount();});
    group.append(b);return b;
   });
   const sync=()=>{let selected=options.findIndex(o=>o.value===select.value);if(selected<0)selected=0;group.style.setProperty('--at',selected);buttons.forEach((b,i)=>{b.disabled=select.disabled||options[i].disabled;b.setAttribute('aria-checked',String(i===selected));b.tabIndex=i===selected?0:-1;});};
   group.addEventListener('keydown',e=>{const enabled=buttons.filter(b=>!b.disabled),at=enabled.indexOf(document.activeElement);let next;if(e.key==='Home')next=0;else if(e.key==='End')next=enabled.length-1;else if(['ArrowRight','ArrowDown'].includes(e.key))next=(at+1)%enabled.length;else if(['ArrowLeft','ArrowUp'].includes(e.key))next=(at-1+enabled.length)%enabled.length;else return;if(!enabled.length)return;e.preventDefault();enabled[next].click();enabled[next].focus();});
   card.append(heading,description,select,group);syncs.set(select,sync);select.addEventListener('change',sync);sync();return card;
  }
  function fields(root,isGlobal){
   const original=root.querySelector(':scope>.fw-aspects');if(!original||original.dataset.cf4)return;
   original.dataset.cf4='true';const cards=new Map();
   [...original.querySelectorAll('label')].forEach((label,i)=>{const select=label.querySelector('select');if(select)cards.set(keys[i],scale(select,label.querySelector('span')?.textContent||keys[i],keys[i],isGlobal));});
   original.replaceChildren();
   for(const [label,groupKeys]of [[t('Narrative','Anlatı'),['story','characters','emotion']],[t('Form','Biçim'),['pace','visuals','sound','atmosphere']]]){
    original.append(el('div','cf4-group-title',label));const grid=el('div','cf4-aspect-grid');groupKeys.forEach(k=>{if(cards.has(k))grid.append(cards.get(k));});
    if(grid.children.length%3===1){const summary=el('article','cf4-aspect cf4-selection-summary');summary.append(icon('heart'),el('h3','',t('Your selection','Seçtiklerin')),el('p','cf4-choice-count',''));grid.append(summary);}
    original.append(grid);
   }
  }
  function updateCount(){if(!editor)return;for(const panel of editor.querySelectorAll('.cf4-scope')){const count=[...panel.querySelectorAll('.cf4-aspect select')].filter(s=>s.value!=='').length;for(const n of panel.querySelectorAll('.cf4-choice-count'))n.textContent=t(`${count} choices · only these fields change.`,`${count} tercih · yalnız bu alanlar değişir.`);}}
  function buildTaste(profile,nextReflection){
   if(nextReflection&&nextReflection!==reflection){preferenceControls=editor?.querySelector('.cf4-next')||preferenceControls;editor?.remove();reflection=nextReflection;global=reflection.querySelector(':scope>.fw-global-taste');editor=null;}
   if(!reflection||!global)return;
   if(!editor){
    fields(reflection,false);fields(global,true);
    editor=el('div','cf4-taste');const intro=el('div','cf4-panel-intro'),copy=el('div');copy.append(el('h3','',t('What this film leaves with you','Filmin sende bıraktığı iz')),el('p','',t('Film opinions and global priorities are separate.','Film görüşlerin ve genel önceliklerin ayrı tutulur.')));
    const tabs=el('div','cf4-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',t('Preference scope','Tercih kapsamı'));
    for(const [value,en,tr]of [['film','For this film','Bu film için'],['global','My general preferences','Genel tercihlerim']]){const b=button(t(en,tr),()=>setScope(value));b.dataset.scope=value;b.setAttribute('role','tab');tabs.append(b);}
    tabs.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setScope(e.key==='Home'?'film':e.key==='End'?'global':scope==='film'?'global':'film');tabs.querySelector(`[data-scope=${scope}]`).focus();}});
    intro.append(copy,tabs);editor.append(intro);
    reflection.classList.add('cf4-scope');reflection.dataset.panel='film';global.classList.add('cf4-scope');global.dataset.panel='global';reflection.open=global.open=true;
    for(const section of [reflection,global]){section.querySelector(':scope>summary').hidden=true;section.querySelector(':scope>p').hidden=true;}
    const filmSave=reflection.querySelector(':scope>button'),globalSave=global.querySelector(':scope>button');filmSave.hidden=globalSave.hidden=true;
    editor.append(reflection,global);
    const info=el('p','cf4-info');info.append(icon('spark'),el('span','',t('Global changes require preview and confirmation.','Genel değişiklikler önizleme ve son onayını gerektirir.')));
    const status=el('p','cf4-status');status.setAttribute('role','status');
    const bar=el('div','cf4-savebar'),message=el('span','',t('Only selected fields change.','Yalnız seçtiklerin değişir.'));
    const reset=button(t('Reset draft','Sıfırla'),()=>{const panel=scope==='film'?reflection:global;for(const s of panel.querySelectorAll('.cf4-aspect select')){s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));}updateCount();});
    const save=button('',()=>{const original=scope==='film'?filmSave:globalSave;if(!original.disabled)original.click();},'primary');save.dataset.cf4Save='true';
    bar.append(message,reset,save);editor.append(info,status,bar);editor._saves={film:filmSave,global:globalSave};
   }
   if(!editor.isConnected)profile.append(editor);
   const prefs=body.querySelector('.daily-preferences')||preferenceControls;if(prefs){preferenceControls=prefs;prefs.classList.add('cf4-next');prefs.open=true;prefs.querySelector(':scope>p')?.setAttribute('hidden','');editor.querySelector('.cf4-info').before(prefs);}
   const fullProfile=profile.querySelector(':scope>button');if(fullProfile){const actions=editor.querySelector('.daily-row-actions')||editor.querySelector('.cf4-panel-intro');actions.append(fullProfile);}
   setScope(scope);updateCount();
  }
  function setScope(value){scope=value;if(!editor)return;editor.querySelector('.cf4-tabs').style.setProperty('--cf4-scope-at',scope==='global'?1:0);for(const b of editor.querySelectorAll('.cf4-tabs button')){const on=b.dataset.scope===value;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
   reflection.hidden=value!=='film';global.hidden=value!=='global';const save=editor.querySelector('[data-cf4-save]');save.textContent=value==='film'?t('Save my opinions','Görüşlerimi kaydet'):t('Preview changes','Değişikliği önizle');save.disabled=editor._saves[value].disabled;
  }
  function picker(select){
   if(!select||select.dataset.cf4Picker)return;select.dataset.cf4Picker='true';select.hidden=true;
   const holder=el('div','cf4-picker'),toggle=button('',()=>{list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));if(!list.hidden)list.querySelector('[aria-selected=true]')?.focus();},'secondary');
   const list=el('div','cf4-picker-list');list.hidden=true;list.setAttribute('role','listbox');list.setAttribute('aria-label',select.getAttribute('aria-label')||t('Source','Kaynak'));
   toggle.setAttribute('aria-haspopup','listbox');toggle.setAttribute('aria-expanded','false');
   let signature='';
   const refresh=()=>{const next=JSON.stringify([select.value,select.disabled,[...select.options].map(o=>[o.value,o.textContent,o.disabled])]);if(next===signature)return;signature=next;toggle.replaceChildren(el('span','',select.selectedOptions[0]?.textContent||t('Choose source','Kaynak seç')),icon('down'));toggle.disabled=select.disabled;list.replaceChildren();for(const option of select.options){const b=button(option.textContent,()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));list.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();},'ghost');b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.selected));b.disabled=option.disabled;list.append(b);}};
   const syncPicker=()=>{holder.hidden=!select.options.length;refresh();if(!select.options.length)toggle.disabled=true;};
   select.after(holder);holder.append(toggle,list);select.addEventListener('change',syncPicker);syncs.set(select,syncPicker);
   holder.addEventListener('keydown',e=>{if(e.key==='Escape'){list.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();list.hidden=false;toggle.setAttribute('aria-expanded','true');const buttons=[...list.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;let at=buttons.indexOf(document.activeElement);at=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[at].focus();}});
   holder.addEventListener('focusout',()=>queueMicrotask(()=>{if(!holder.contains(document.activeElement)){list.hidden=true;toggle.setAttribute('aria-expanded','false');}}));syncPicker();
  }
  function preparation(root){
   if(!root||root.dataset.cf4)return;root.dataset.cf4='true';root.classList.add('cf4-card','cf4-preparation');
   const heading=root.querySelector(':scope>h2,:scope>h3');heading.textContent=t('Turkish viewing preparation','Türkçe izleme hazırlığı');
   const header=el('div','cf4-card-heading'),copy=el('div');copy.append(heading);const intro=root.querySelector(':scope>p');if(intro)copy.append(intro);header.append(copy);
   const route=root.querySelector('.fw-view-route'),primary=route?.querySelector('.fw-view-primary');if(primary){primary.classList.add('cf4-primary');header.append(primary);}root.prepend(header);
   const steps=el('div','cf4-steps'),sourceCard=el('article','cf4-source-step'),sourceHead=el('div','cf4-step-title');sourceHead.append(el('span','cf4-step-number','1'),el('h3','',t('Source','Kaynak')));
   const source=root.querySelector('.fw-source-controls>select'),available=!!source?.options.length;sourceHead.append(el('span','cf4-pill '+(available?'ready':'missing'),available?t('Ready','Hazır'):t('Not linked','Bağlı değil')));sourceCard.append(sourceHead);
   const controls=root.querySelector('.fw-source-controls');if(controls)sourceCard.append(controls);picker(source);
   const missing=[...root.querySelectorAll(':scope>p')].find(p=>/No video|Video kaynağı/i.test(p.textContent));if(missing)sourceHead.after(missing);
   steps.append(sourceCard);
   [...root.querySelectorAll('.fw-assets>.fw-step')].forEach((step,index)=>{step.classList.add('cf4-asset-step');const head=step.querySelector('h3'),title=el('div','cf4-step-title');title.append(el('span','cf4-step-number',String(index+2)));if(head)title.append(head);const ready=[...step.querySelectorAll('select option')].some(o=>!o.disabled&&!o.hidden);title.append(el('span','cf4-pill '+(ready?'ready':'missing'),ready?t('Ready','Hazır'):t('Missing','Eksik')));step.prepend(title);steps.append(step);});
   root.append(steps);root.querySelector('.fw-assets')?.remove();
   if(route){route.classList.add('cf4-route-note');route.querySelector('h3')?.remove();root.append(route);}
   accordion(root.querySelector('.fw-handoff'),t('Manage source selection and position','Kaynak seçimini ve devam konumunu yönet'),t('Advanced options','İleri seçenekler'),'link');
  }
  function enhance(){
   if(disposed)return;observer.disconnect();
   const host=body.querySelector(':scope>.fw-workspace'),profile=page.querySelector('.film-decision-profile');
   if(!body.closest('details')?.open&&!profile?.open){watch();return;}
   if(profile){profile.classList.add('cf4-taste-accordion');buildTaste(profile,host?.querySelector(':scope>.fw-reflection'));}
   const p=body.querySelector('.pm-panel');if(p){p.classList.add('cf4-card','cf4-personal');for(const d of p.querySelectorAll('.pm-aspect-details')){d.hidden=true;if(!d.nextElementSibling?.classList.contains('cf4-open-opinions')){const link=button(t('Edit film opinions','Film görüşlerimi düzenle'),()=>{const target=page.querySelector('.film-decision-profile');if(!target)return;target.open=true;setScope('film');target.scrollIntoView({block:'start',behavior:'smooth'});});link.classList.add('cf4-open-opinions');d.after(link);}}}
   const journal=body.querySelector('.daily-journal');if(journal){journal.classList.add('cf4-card','cf4-journal');const h=journal.querySelector('h3');if(h)h.textContent=t('My film journal','Film günlüğüm');}
   const prep=host?.querySelector(':scope>.fw-preparation');preparation(prep);
   if(prep){for(const [index,step]of [...prep.querySelectorAll('.cf4-asset-step')].entries()){const select=step.querySelector('select');const ready=!!select&&!select.disabled&&!!select.value;const pill=step.querySelector('.cf4-pill');pill.textContent=ready?t('Ready','Hazır'):t('Missing','Eksik');pill.classList.toggle('ready',ready);pill.classList.toggle('missing',!ready);}}
   for(const group of body.querySelectorAll('.cn-status-segments'))group.classList.add('cf4-watch');
   for(const options of body.querySelectorAll(':scope>.md-option-group'))if(!moreControls.includes(options))moreControls.push(options);
   if(p&&moreControls.length){let footer=p.querySelector(':scope>.cf4-footer');if(!footer){footer=el('div','cf4-footer');p.append(footer);}for(const options of moreControls)if(!footer.contains(options)){options.classList.add('cf4-more');const hint=options.querySelector('p')?.textContent;for(const b of options.querySelectorAll('button'))if(hint)b.title=hint;footer.append(options);}}
   if(!body.querySelector(':scope>.cf4-reflection-shortcut')&&profile){const row=el('details','cf4-reflection-shortcut');row.append(el('summary'));accordion(row,t('After watching · what stayed with you?','İzledikten sonra · sende ne kaldı?'),t('Open film opinions','Film görüşlerini aç'),'heart');row.append(button(t('Edit my film opinions','Film görüşlerimi düzenle'),()=>{const target=page.querySelector('.film-decision-profile');target.open=true;setScope('film');target.scrollIntoView({block:'start',behavior:'smooth'});}));body.append(row);}
   for(const source of body.querySelectorAll('.daily-sources'))if(!source.dataset.cf4){source.dataset.cf4='true';const h=source.querySelector(':scope>h2,:scope>h3'),d=el('details','cf4-inline cf4-source-records');d.append(el('summary'));source.before(d);if(h)h.remove();d.append(source);accordion(d,t('Sources for this title','Bu yapıma ait kaynaklar'),t('Notes, links and saved outputs','Notlar, bağlantılar ve kayıtlar'),'folder');}
   for(const [select,sync]of syncs){if(!select.isConnected)syncs.delete(select);else sync();}
   const status=host?.querySelector(':scope>.fw-status');if(editor&&status&&editor.querySelector('.cf4-status').textContent!==status.textContent)editor.querySelector('.cf4-status').textContent=status.textContent;
   for(const b of body.querySelectorAll('button:disabled')){b.title=t('Link a source and select an available file to enable this action.','Bu işlem için önce kaynak bağla ve kullanılabilir dosyayı seç.');b.dataset.cinemaTooltip=b.title;}
   if(editor)setScope(scope);watch();
  }
  enhance();return {dispose(){disposed=true;observer.disconnect();syncs.clear();page.removeEventListener('cinema-save-complete',saved);page.removeEventListener('toggle',toggled,true);}};
 }
 window.CinemaFilmRound4=Object.freeze({mount});
})();
