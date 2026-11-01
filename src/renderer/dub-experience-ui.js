(() => {
 'use strict';
 const $=id=>document.getElementById(id),ui=()=>window.DubGeneratorUI,model=window.DubExperienceModel;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 const button=(text,run)=>{const b=el('button','btn btn-ghost',text);b.type='button';b.onclick=run;return b;};
 const host=el('details','dub-experience'),head=el('div','dub-experience-head'),title=el('summary'),tools=el('div','dub-experience-tools'),status=el('p','dub-experience-status');status.setAttribute('role','status');
 const inspect=button('',()=>void preflight()),compare=button('',()=>void comparison()),repair=button('',()=>void repairNow());
 const details=el('details','dub-preflight'),summary=el('summary'),list=el('div','dub-preflight-list');details.hidden=true;details.append(summary,list);tools.append(inspect,compare,repair);head.append(tools);host.append(title,head,status,details);
 let inspectedSource='';
 function reviewVisibility(){const snapshot=ui().experience(),identity=JSON.stringify([snapshot.owner,snapshot.srt]);if(inspectedSource&&inspectedSource!==identity){serial++;status.textContent='';details.hidden=true;list.replaceChildren();inspectedSource='';}host.hidden=!snapshot.srt&&!snapshot.groups.length&&!snapshot.output?.url;inspect.disabled=snapshot.busy;repair.disabled=snapshot.busy||!snapshot.groups.length;}
 host.hidden=true;
 window.addEventListener('dub-takes:context',reviewVisibility);
 window.addEventListener('dub-generator:busy',reviewVisibility);
 $('dubGeneratorDialog').querySelector('.dub-studio-scroll').prepend(host);
 reviewVisibility();
 const files=el('details','dub-files-menu'),fileLabel=el('summary','btn btn-ghost'),filePanel=el('div','dub-files-panel');files.append(fileLabel,filePanel);for(const id of ['dubGeneratorOutput','dubStorageOpen','dubGeneratorLog'])filePanel.append($(id));$('dubGeneratorCancel').parentElement.append(files);
 $('dubGeneratorDialog').addEventListener('pointerdown',event=>{if(!files.contains(event.target))files.open=false;});
 $('dubGeneratorDialog').addEventListener('scroll',()=>{files.open=false;},true);
 $('dubGeneratorDialog').addEventListener('close',()=>{files.open=false;});
 files.addEventListener('click',event=>{if(event.target.closest('button'))files.open=false;});
 files.addEventListener('keydown',event=>{if(event.key==='Escape'&&files.open){files.open=false;event.preventDefault();event.stopPropagation();fileLabel.focus();}});
 let serial=0,lastOwner=ui().experience().owner;
 document.addEventListener('media-context-changed',()=>{const owner=ui().experience().owner;if(owner===lastOwner)return;lastOwner=owner;files.open=false;serial++;inspect.disabled=false;status.textContent='';details.hidden=true;list.replaceChildren();});
 function labels(){fileLabel.textContent=t('Files & log','Dosyalar ve kayıt');title.textContent=t('Review & repair','İnceleme ve onarım');inspect.textContent=t('Inspect script','Metni denetle');compare.textContent=t('Compare translations','Çevirileri karşılaştır');repair.textContent=t('Repair current moment · Ctrl+Alt+R','İzlediğim anı düzelt · Ctrl+Alt+R');}
 async function preflight(){const request=++serial,identity=JSON.stringify([ui().experience().owner,ui().experience().srt]);inspect.disabled=true;
  try{const report=await ui().inspectProduction();if(request!==serial||identity!==JSON.stringify([ui().experience().owner,ui().experience().srt]))return;if(!report){status.textContent=t('Select a subtitle first.','Önce altyazı seç.');return;}
   inspectedSource=identity;
   summary.textContent=t(`${report.rows.length} groups · ${report.flagged} text checks · ${report.dense} dense`,`${report.rows.length} grup · ${report.flagged} metin uyarısı · ${report.dense} yoğun`);
   status.textContent=t('Advisory checks, not a completeness or naturalness guarantee. Nothing is changed automatically. ','Bunlar inceleme ipuçlarıdır; eksiksizlik veya doğallık garantisi değildir. Hiçbir şey otomatik değiştirilmez. ')+(report.referenceChecked?(report.referenceWarnings.length?t('Reference needs review: ','Referansı kontrol et: ')+report.referenceWarnings.map(w=>({quiet:t('low level','kısık ses'),clipping:t('clipping','ses patlaması'),silence:t('long silence','uzun sessizlik'),short:t('too short','çok kısa'),'downmix-cancellation':t('stereo cancellation in mono','mono karışımda stereo zayıflaması')}[w]||w)).join(', '):t('Reference level was checked.','Referans seviyesi kontrol edildi.')):t('Reference audio has not been measured in this session.','Referans sesi bu oturumda henüz ölçülmedi.'));
   const issueLabels={'empty':t('Empty text','Boş metin'),'damaged-text':t('Damaged characters','Bozuk karakterler'),'translation-marker':t('Translation failure marker','Çeviri hata işareti'),'possible-source-language':t('May still be in the source language; review','Kaynak dilde kalmış olabilir; kontrol et')};
   list.replaceChildren();for(const row of report.rows.filter(r=>r.issues.length||r.dense||r.long).slice(0,20)){
    const reasons=[...row.issues.map(i=>issueLabels[i]),...(row.long?[t('Long group','Uzun grup')]:[]),...(row.dense?[t('Dense timing','Yoğun zamanlama')]:[])];
    const text=t(`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):'—'} s available · ~${row.estimated} s estimated`,`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):'—'} sn aralık · ~${row.estimated} sn tahmin`);
    const b=button(reasons.join(' · ')+' — '+text+' · '+row.text.slice(0,110),()=>void ui().editPlanGroup(row.key));list.append(b);
   }
   if(!list.childElementCount)list.append(el('p','',t('No groups flagged by these checks. Listen to a sample before deciding.','Bu kontrollerde grup işaretlenmedi. Karar vermeden önce kısa örneği dinle.')));
   if(report.rows.filter(r=>r.issues.length||r.dense||r.long).length>20)list.append(el('p','',t('First 20 flagged groups shown. All groups remain in the text editor.','İlk 20 işaretli grup gösteriliyor. Tüm gruplar metin düzenleyicisinde bulunur.')));
   if(report.pronunciations.length){
    list.append(el('p','',t('Repeated name / term candidates (not phonetic guesses): ','Tekrarlanan ad / terim adayları (okunuş tahmini değildir): ')+report.pronunciations.map(r=>r.term+' ×'+r.count).join(', ')));
    const snapshot=ui().experience(),draft=button(t('Prepare editable pronunciation draft','Düzenlenebilir telaffuz taslağı hazırla'),()=>{if(!ui().preparePronunciations(report.pronunciations.map(r=>r.term),snapshot.owner,snapshot.srt))status.textContent=t('Source changed or production is busy. Inspect again before editing.','Kaynak değişti veya üretim sürüyor. Düzenlemeden önce yeniden denetle.');});list.append(draft);
   }
   details.hidden=false;details.open=report.flagged>0||report.dense>0||report.long>0||report.pronunciations.length>0;if(details.open)host.open=true;
  }catch(error){if(request===serial)status.textContent=error.message;}finally{if(request===serial)inspect.disabled=false;}
 }
 async function repairNow(){const ok=await ui().editAtCurrent();if(!ok)status.textContent=t('No matching completed dub group at the current video time.','Güncel video anında eşleşen tamamlanmış dublaj grubu yok.');else status.textContent=t('Group opened. Edit and apply the text, then regenerate only this group.','Grup açıldı. Metni düzenleyip uygula; sonra yalnız bu grubu yeniden üret.');}
 async function comparison(){files.open=false;
  const d=el('dialog','speech-compare-dialog media-surface'),h=el('header'),heading=el('h2','',t('Translation workbench','Çeviri karşılaştırması')),close=button('×',()=>d.close());close.setAttribute('aria-label',t('Close comparison','Karşılaştırmayı kapat'));h.append(heading,close);
  const note=el('p','',t('Compare overlapping timestamps. Differences are review clues, not proof of an error. Files stay unchanged.','Örtüşen zamanları karşılaştırır. Farklar inceleme ipucudur, kesin hata kanıtı değildir. Dosyalar değişmez.'));
  const controls=el('div','speech-compare-controls'),filters=el('div','speech-compare-filters'),body=el('div','speech-compare-body'),pager=el('div','speech-compare-pager'),feedback=el('p');feedback.setAttribute('role','status');let page=0,alive=true;const versions={source:0,normal:0,speech:0},data={source:[],normal:[],speech:[]},names={},fileLabels={};let comparison=model.comparisonRows(data);
  const changedOnly=el('input'),numbersOnly=el('input');for(const [input,label]of [[changedOnly,t('Only changed passages','Yalnız değişen metin')],[numbersOnly,t('Missing numbers','Eksilen sayılar')]]){input.type='checkbox';const wrap=el('label');wrap.append(input,document.createTextNode(' '+label));filters.append(wrap);input.addEventListener('change',()=>{page=0;draw();});}
  function draw(){
   body.replaceChildren();const comparable=!!data.normal.length&&!!data.speech.length;changedOnly.disabled=numbersOnly.disabled=!comparable;
   const selected=comparison.rows.filter(row=>(!changedOnly.checked||row.changed)&&(!numbersOnly.checked||row.missingNumbers.length)),total=Math.ceil(selected.length/12);page=Math.max(0,Math.min(page,Math.max(0,total-1)));
   for(const item of selected.slice(page*12,page*12+12)){const cue=item.cue,row=el('article','speech-compare-row'),time=el('h3','',cue.start.toFixed(1)+'–'+cue.end.toFixed(1)+t(' s',' sn')),columns=el('div','speech-compare-columns');row.append(time,columns);const values={};let limited=item.limited;
    for(const key of ['source','normal','speech']){const value=model.indexedOverlap(comparison.indexes[key],cue.start,cue.end);values[key]=value.text;limited||=value.limited;}
    for(const [key,label]of [['source',t('Source','Kaynak')],['normal',t('Subtitle translation','Normal çeviri')],['speech',t('Voice script','Seslendirme metni')]]){const section=el('section'),text=el('p','',values[key]||t('No matching text loaded.','Eşleşen metin yüklenmedi.'));section.append(el('h4','',label),text);columns.append(section);}
    if(limited)row.append(el('p','speech-compare-warning',t('This overlap is too large for a complete comparison; no error verdict was made.','Bu örtüşme tam karşılaştırma için çok büyük; hata kararı verilmedi.')));
    else if(values.normal&&values.speech){const diff=model.difference(values.normal,values.speech),delta=el('details','speech-compare-diff');delta.append(el('summary','',diff.changed?t('Show changed passage','Değişen kısmı göster'):t('Same text','Metin aynı')),el('del','',diff.before),el('ins','',diff.after));if(diff.removedNumbers.length)delta.append(el('p','',t('Check missing numbers: ','Eksilen sayıları kontrol et: ')+diff.removedNumbers.join(', ')));row.append(delta);}body.append(row);
   }
   if(!selected.length)body.append(el('p','speech-compare-empty',comparison.rows.length?t('No passages match these filters.','Bu filtrelerle eşleşen metin yok.'):t('Choose subtitle files to begin.','Başlamak için altyazı dosyalarını seçin.')));
   for(const key of ['source','normal','speech'])if(fileLabels[key]){fileLabels[key].textContent=names[key]||t('No file selected','Dosya seçilmedi');fileLabels[key].title=names[key]||'';}
   feedback.textContent=t(`${selected.length} of ${comparison.rows.length} passages`,`${comparison.rows.length} metinden ${selected.length} gösteriliyor`)+(comparison.limited?t(' · Only the first 5,000 cues per file are shown.',' · Dosya başına ilk 5.000 blok gösteriliyor.'):'');pageInfo.textContent=(total?page+1:0)+' / '+total;prev.disabled=page===0;next.disabled=page+1>=total;
  }
  async function load(key,file){if(typeof file!=='string'||!file)return;const request=++versions[key];try{const r=await window.api.readSubtitle(file);if(!alive||request!==versions[key])return;if(!r?.ok)throw Error(r?.error||t('Subtitle read failed','Altyazı okunamadı'));const cues=parseSubtitles(r.text).sort((a,b)=>a.start-b.start);if(!cues.length)throw Error(t('No readable subtitle cues found.','Okunabilir altyazı bloğu bulunamadı.'));data[key]=cues;names[key]=String(file).split(/[\\/]/).at(-1);comparison=model.comparisonRows(data);page=0;draw();}catch(error){if(alive&&request===versions[key])feedback.textContent=error.message;}}
  for(const [key,label]of [['source',t('Choose source','Kaynak seç')],['normal',t('Choose normal translation','Normal çeviri seç')],['speech',t('Choose voice script','Seslendirme metni seç')]]){const group=el('div','speech-file-control'),name=el('span');fileLabels[key]=name;group.append(button(label,async()=>{const file=await window.api.selectFile('subtitle');if(alive)await load(key,file);}),name);controls.append(group);}
  const prev=button(t('Previous','Önceki'),()=>{page--;draw();}),next=button(t('Next','Sonraki'),()=>{page++;draw();}),pageInfo=el('span');pager.append(prev,pageInfo,next);d.append(h,note,controls,filters,feedback,body,pager);d.addEventListener('keydown',event=>{if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.target.isContentEditable)return;const target=event.key==='ArrowLeft'?prev:event.key==='ArrowRight'?next:null;if(target){event.preventDefault();if(!target.disabled)target.click();}});document.body.append(d);d.addEventListener('close',()=>{alive=false;d.remove();},{once:true});d.showModal();draw();const file=ui().experience().srt;if(file)await load('speech',file);
 }
 const continuity=el('details','dub-preflight'),continuityTitle=el('summary'),continuityRows=el('div','dub-preflight-list');continuity.hidden=true;continuity.append(continuityTitle,continuityRows);host.append(continuity);let continuitySignature='';
 function showContinuity(){const snapshot=ui().experience(),groups=snapshot.groups.map(g=>({...g,continuity:model.continuity(g.continuity)})).filter(g=>g.continuity),signature=JSON.stringify([window.UiLocale?.get?.(),snapshot.busy,groups.map(g=>({key:g.key,group:g.group,continuity:g.continuity}))]);if(signature===continuitySignature)return;continuitySignature=signature;continuity.hidden=!groups.length;continuityTitle.textContent=t('Measured speech continuity','Ölçülen ses devamlılığı');continuityRows.replaceChildren();
  if(!groups.length)return;continuityRows.append(el('p','',t('Raw takes are preserved. Level corrections are limited to ±2 dB; pitch and pacing are not automatically flattened.','Ham kayıtlar korunur. Seviye düzeltmesi ±2 dB ile sınırlıdır; perde ve tempo otomatik tekdüzeleştirilmez.')));
  const labels={'level-jump':t('level change','seviye farkı'),'pace-jump':t('pace change','hız farkı'),'long-edge-pause':t('long edge pause','uzun kenar durağı'),'level-correction-unavailable':t('level adjustment unavailable','seviye düzeltmesi uygulanamadı')};
  for(const g of groups.filter(g=>g.continuity.warnings.length||g.continuity.gainDb).slice(0,20)){
   const m=g.continuity,row=el('div','dub-continuity-row');
   const inspect=button('#'+g.group+' · '+m.levelDb+' dB · '+m.wordsPerSecond+' '+t('words/s','kelime/sn')+' · '+m.warnings.map(w=>labels[w]).join(', '),()=>void ui().editPlanGroup(g.key));inspect.classList.add('dub-continuity-copy');inspect.title=t('Open this group for review','Bu grubu inceleme için aç');
   const listen=button(t('Listen','Dinle'),async()=>{const owner=ui().experience().owner;try{const result=await ui().assistant.group({group_id:g.key,operation:'listen'},()=>owner!==ui().experience().owner);if(owner===ui().experience().owner&&!result?.ok)status.textContent=t('This group could not be played. Check the saved audio in the group panel.','Bu grup oynatılamadı. Grup panelinden kayıtlı sesi kontrol et.');}catch{if(owner===ui().experience().owner)status.textContent=t('Group playback is unavailable. Wait for production to finish or reopen its saved audio.','Grup dinlemesi kullanılamıyor. Üretimin bitmesini bekle veya kayıtlı sesi yeniden aç.');}});
   listen.classList.add('btn-secondary');listen.setAttribute('aria-label',t('Listen to group ','Grubu dinle: ')+g.group);listen.disabled=inspect.disabled=snapshot.busy;row.append(inspect,listen);continuityRows.append(row);
  }
 }
 window.addEventListener('dub-takes:context',showContinuity);document.addEventListener('ui-locale-change',showContinuity);
 document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.altKey&&!event.shiftKey&&event.code==='KeyR'&&!event.repeat&&!/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)&&!event.target.isContentEditable){event.preventDefault();void repairNow();}});
 window.addEventListener('dub-preflight-ready',()=>void preflight());
 document.addEventListener('ui-locale-change',labels);labels();
 window.DubExperienceUI=Object.freeze({preflight,repairNow,comparison});
})();
