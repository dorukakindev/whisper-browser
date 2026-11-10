(() => {
 'use strict';
 const $=id=>document.getElementById(id),ui=()=>window.DubGeneratorUI,model=window.DubExperienceModel;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 const button=(text,run)=>{const b=el('button','btn btn-ghost',text);b.type='button';b.onclick=run;return b;};
 const host=el('details','dub-experience'),head=el('div','dub-experience-head'),title=el('summary'),tools=el('div','dub-experience-tools'),status=el('p','dub-experience-status');status.setAttribute('role','status');
 const inspect=button('',()=>void preflight()),compare=button('',()=>void comparison()),repair=button('',()=>void repairNow());
 const details=el('details','dub-preflight'),summary=el('summary'),list=el('div','dub-preflight-list');details.hidden=true;details.append(summary,list);tools.append(inspect,compare,repair);head.append(tools);host.append(title,head,status,details);
 let inspectedSource='',groupCompare=null,groupingPending=false,translationDialog=null,translationOwner='';
 function reviewVisibility(){const snapshot=ui().experience(),identity=JSON.stringify([snapshot.owner,snapshot.srt]);if(inspectedSource&&inspectedSource!==identity){serial++;status.textContent='';details.hidden=true;list.replaceChildren();inspectedSource='';}host.hidden=!snapshot.srt&&!snapshot.groups.length&&!snapshot.output?.url;inspect.disabled=compare.disabled=snapshot.busy;repair.disabled=snapshot.busy||(!snapshot.srt&&!snapshot.groups.length);if(groupCompare)groupCompare.disabled=groupingPending||snapshot.busy;}
 host.hidden=true;
 window.addEventListener('dub-takes:context',reviewVisibility);
 window.addEventListener('dub-generator:busy',reviewVisibility);
 $('dubReviewToolsBody').prepend(host);
 reviewVisibility();
 const files=el('details','dub-files-menu'),fileLabel=el('summary','btn btn-ghost'),filePanel=el('div','dub-files-panel');files.append(fileLabel,filePanel);for(const id of ['dubGeneratorOutput','dubStorageOpen','dubGeneratorLog'])filePanel.append($(id));($('dubGeneratorDialog').querySelector('.dub-run-meta')||$('dubGeneratorCancel').parentElement).append(files);
 $('dubGeneratorDialog').addEventListener('pointerdown',event=>{if(!files.contains(event.target))files.open=false;});
 $('dubGeneratorDialog').addEventListener('scroll',()=>{files.open=false;},true);
 $('dubGeneratorDialog').addEventListener('close',()=>{files.open=false;});
 files.addEventListener('click',event=>{if(event.target.closest('button'))files.open=false;});
 files.addEventListener('keydown',event=>{if(event.key==='Escape'&&files.open){files.open=false;event.preventDefault();event.stopPropagation();fileLabel.focus();}});
 let serial=0,lastOwner=ui().experience().owner;
 document.addEventListener('media-context-changed',()=>{const owner=ui().experience().owner;if(owner===lastOwner)return;lastOwner=owner;files.open=false;serial++;inspect.disabled=false;status.textContent='';details.hidden=true;list.replaceChildren();});
 function labels(){groupCompare.textContent=t('Compare grouping','Gruplamayı karşılaştır');fileLabel.textContent=t('Files & log','Dosyalar ve kayıt');title.textContent=t('Review & repair','İnceleme ve onarım');inspect.textContent=t('Inspect script','Metni denetle');compare.textContent=t('Compare translations','Çevirileri karşılaştır');repair.textContent=t('Repair current moment · Ctrl+Alt+R','İzlediğim anı düzelt · Ctrl+Alt+R');}
 async function preflight(scopedReport=null){const request=++serial,identity=JSON.stringify([ui().experience().owner,ui().experience().srt]);inspect.disabled=true;
  try{const report=scopedReport||await ui().inspectProduction();if(request!==serial||identity!==JSON.stringify([ui().experience().owner,ui().experience().srt]))return;if(!report){status.textContent=t('Select a subtitle first.','Önce altyazı seç.');return;}
   inspectedSource=scopedReport?null:identity;
   summary.textContent=t(`${report.rows.length} groups · ${report.flagged} text checks · ${report.dense} dense`,`${report.rows.length} grup · ${report.flagged} metin uyarısı · ${report.dense} yoğun`);
   status.textContent=t('Advisory checks, not a completeness or naturalness guarantee. Nothing is changed automatically. ','Bunlar inceleme ipuçlarıdır; eksiksizlik veya doğallık garantisi değildir. Hiçbir şey otomatik değiştirilmez. ')+(report.referenceChecked?(report.referenceWarnings.length?t('Reference needs review: ','Referansı kontrol et: ')+report.referenceWarnings.map(w=>({quiet:t('low level','kısık ses'),clipping:t('clipping','ses patlaması'),silence:t('long silence','uzun sessizlik'),short:t('too short','çok kısa'),'downmix-cancellation':t('stereo cancellation in mono','mono karışımda stereo zayıflaması')}[w]||w)).join(', '):t('Reference level was checked.','Referans seviyesi kontrol edildi.')):t('Reference audio has not been measured in this session.','Referans sesi bu oturumda henüz ölçülmedi.'));
   const issueLabels={'empty':t('Empty text','Boş metin'),'damaged-text':t('Damaged characters','Bozuk karakterler'),'translation-marker':t('Translation failure marker','Çeviri hata işareti'),'source-copy':t('Text matches the English source','Metin İngilizce kaynakla aynı'),'number-check':t('Check quantities against source; formats may differ','Miktarları kaynakla karşılaştır; yazılışları farklı olabilir'),'possible-source-language':t('May still be in the source language; review','Kaynak dilde kalmış olabilir; kontrol et')};
   list.replaceChildren();for(const row of report.rows.filter(r=>r.issues.length||r.dense||r.long).slice(0,20)){
    const reasons=[...row.issues.map(i=>issueLabels[i]),...(row.long?[t('Long group','Uzun grup')]:[]),...(row.dense?[t('Dense timing','Yoğun zamanlama')]:[])];
    const text=t(`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):'—'} s available · ~${row.estimated} s estimated`,`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):'—'} sn aralık · ~${row.estimated} sn tahmin`);
    const copy=reasons.join(' · ')+' — '+text+' · '+row.text.slice(0,110);
    list.append(scopedReport?el('p','',copy):button(copy,()=>void ui().editPlanGroup(row.key)));
   }
   if(!list.childElementCount)list.append(el('p','',t('No groups flagged by these checks. Listen to a sample before deciding.','Bu kontrollerde grup işaretlenmedi. Karar vermeden önce kısa örneği dinle.')));
   if(report.rows.filter(r=>r.issues.length||r.dense||r.long).length>20)list.append(el('p','',t('First 20 flagged groups shown. All groups remain in the text editor.','İlk 20 işaretli grup gösteriliyor. Tüm gruplar metin düzenleyicisinde bulunur.')));
   if(report.pronunciations.length){
    list.append(el('p','',t('Repeated name / term candidates (not phonetic guesses): ','Tekrarlanan ad / terim adayları (okunuş tahmini değildir): ')+report.pronunciations.map(r=>r.term+' ×'+r.count).join(', ')));
    const snapshot=ui().experience(),draft=button(t('Prepare editable pronunciation draft','Düzenlenebilir telaffuz taslağı hazırla'),()=>{if(!ui().preparePronunciations(report.pronunciations.map(r=>r.term),snapshot.owner,snapshot.srt))status.textContent=t('Source changed or production is busy. Inspect again before editing.','Kaynak değişti veya üretim sürüyor. Düzenlemeden önce yeniden denetle.');});list.append(draft);
   }
   if(report.coverage?.checked){list.append(el('p','dub-coverage-note',t('Source timing compared. Unmatched passages: ','Kaynak zamanları karşılaştırıldı. Eşleşmeyen metin: ')+report.coverage.missing.length+(report.coverage.limited?t(' · comparison limited',' · karşılaştırma sınırlı'):'')));for(const row of report.coverage.missing.slice(0,8))list.append(el('p','dub-coverage-missing',row.start.toFixed(1)+'–'+row.end.toFixed(1)+' s · '+row.text));}
   else list.append(el('p','dub-coverage-note',t('Original subtitle evidence is not available. Meaning and missing passages could not be checked.','Özgün altyazı kanıtı yok. Anlam ve eksik metin denetlenemedi.')));
   details.hidden=false;details.open=!!report.coverage?.missing.length||report.flagged>0||report.dense>0||report.long>0||report.pronunciations.length>0;if(details.open)host.open=true;
  }catch(error){if(request===serial)status.textContent=error.message;}finally{if(request===serial)inspect.disabled=false;}
 }
 async function repairNow(){const ok=await ui().editAtCurrent();if(!ok)status.textContent=t('No unique subtitle or dub group at the current video time.','Güncel video anında tek bir altyazı veya dublaj grubu eşleşmedi.');else status.textContent=t('Group opened. Edit and apply the text, then regenerate only this group.','Grup açıldı. Metni düzenleyip uygula; sonra yalnız bu grubu yeniden üret.');}
 groupCompare=button('',()=>void groupingComparison());groupCompare.classList.add('dub-group-compare');tools.append(groupCompare);
 let groupingSerial=0,groupingDialog=null,groupingOwner='';
 function invalidateGrouping(){groupingSerial++;groupingPending=false;groupingOwner='';reviewVisibility();if(groupingDialog?.open)groupingDialog.close();}
 $('dubGeneratorDialog').addEventListener('close',invalidateGrouping);
 document.addEventListener('media-context-changed',()=>{if(groupingOwner&&groupingOwner!==ui().experience().requestOwner)invalidateGrouping();});
 async function groupingComparison(){
  const parent=$('dubGeneratorDialog');if(!parent.open||groupCompare.disabled)return;
  if(groupingDialog?.open){groupingDialog.focus();return;}
  const ticket=++groupingSerial,owner=groupingOwner=ui().experience().requestOwner;
  const current=()=>ticket===groupingSerial&&parent.open&&owner===ui().experience().requestOwner;
  groupingPending=true;groupCompare.disabled=true;
  try{
   const result=await ui().compareGrouping();if(!current())return;
   if(!result){status.textContent=t('Plan changed or comparison is unavailable. Prepare the current subtitle first.','Plan değişti veya karşılaştırma kullanılamıyor. Önce güncel altyazıyı hazırla.');return;}
   const d=el('dialog','speech-compare-dialog dub-grouping-dialog media-surface'),header=el('header'),close=button('×',()=>d.close());
   close.setAttribute('aria-label',t('Close comparison','Karşılaştırmayı kapat'));header.append(el('h2','',t('Sentence flow · compare grouping','Cümle akışı · gruplamayı karşılaştır')),close);
   const body=el('div','speech-compare-body');body.append(el('p','',t('Text planning only. Speaker labels, overlap and long silence remain boundaries. This does not compare voice quality; listen to samples before choosing. Your current plan and edits are unchanged.','Yalnız metin planı. Konuşmacı işaretleri, örtüşme ve uzun sessizlikler sınır olarak korunur. Bu bir ses kalitesi karşılaştırması değildir; karar vermeden önce örnekleri dinle. Güncel planın ve düzenlemelerin değişmedi.')));
   const columns=el('div','speech-compare-columns');
   for(const [label,mode,rows]of [[t('Current','Güncel'),result.currentMode,result.current],[t('Alternative','Alternatif'),result.mode,result.alternative]]){
    const modeLabel={akici:t('Flowing blocks','Akıcı bloklar'),anlatim:t('Sentence flow','Cümle akışı'),cumle:t('Sentence groups','Cümle grupları'),satir:t('Subtitle rows','Altyazı satırları')}[mode]||t('Grouping','Gruplama');
    const c=el('section');c.append(el('h3','',label+' · '+modeLabel+' · '+rows.length+' '+t('groups','grup')));
    for(const g of rows.slice(0,6)){const row=el('article','dub-grouping-row');row.append(el('small','',(g.start/1000).toFixed(1)+'–'+(g.end/1000).toFixed(1)+' s'),el('p','',g.text));c.append(row);}
    if(rows.length>6)c.append(el('p','',t('First six groups shown.','İlk altı grup gösteriliyor.')));columns.append(c);
   }
   body.append(columns);d.append(header,body);document.body.append(d);groupingDialog=d;
   d.addEventListener('close',()=>{d.remove();if(groupingDialog===d)groupingDialog=null;if(current()&&groupCompare.isConnected&&!groupCompare.disabled)groupCompare.focus({preventScroll:true});},{once:true});d.showModal();
  }catch(e){if(current())status.textContent=e.message;}
  finally{if(ticket===groupingSerial){groupingPending=false;reviewVisibility();}}
 }
 function closeTranslation(){if(translationDialog?.open)translationDialog.close();}
 $('dubGeneratorDialog').addEventListener('close',closeTranslation);
 function checkComparisonOwner(){
  const owner=ui().experience().requestOwner;
  if(translationDialog&&translationOwner!==owner)closeTranslation();
  if(groupingOwner&&groupingOwner!==owner)invalidateGrouping();
 }
 document.addEventListener('media-context-changed',checkComparisonOwner);
 window.addEventListener('browser-panel-layout',checkComparisonOwner);
 for(const event of ['loadstart','emptied','loadedmetadata'])$('playerVideo')?.addEventListener(event,checkComparisonOwner);
 async function comparison(){
  const parent=$('dubGeneratorDialog');if(!parent.open)return;
  if(translationDialog?.open){translationDialog.focus();return;}
  if(ui().experience().busy)return;
  const owner=translationOwner=ui().experience().requestOwner;files.open=false;
  const d=el('dialog','speech-compare-dialog media-surface'),h=el('header'),heading=el('h2','',t('Translation workbench','Çeviri karşılaştırması')),close=button('×',()=>d.close());close.setAttribute('aria-label',t('Close comparison','Karşılaştırmayı kapat'));h.append(heading,close);
  const note=el('p','',t('Compare overlapping timestamps. Differences are review clues, not proof of an error. Files stay unchanged.','Örtüşen zamanları karşılaştırır. Farklar inceleme ipucudur, kesin hata kanıtı değildir. Dosyalar değişmez.'));
  const controls=el('div','speech-compare-controls'),filters=el('div','speech-compare-filters'),body=el('div','speech-compare-body'),pager=el('div','speech-compare-pager'),feedback=el('p');feedback.setAttribute('role','status');let page=0,alive=true;const current=()=>alive&&parent.open&&owner===ui().experience().requestOwner&&translationDialog===d;const versions={source:0,normal:0,speech:0},data={source:[],normal:[],speech:[]},names={},fileLabels={};let comparison=model.comparisonRows(data);
  const changedOnly=el('input'),numbersOnly=el('input');for(const [input,label]of [[changedOnly,t('Only changed passages','Yalnız değişen metin')],[numbersOnly,t('Missing numbers','Eksilen sayılar')]]){input.type='checkbox';const wrap=el('label');wrap.append(input,document.createTextNode(' '+label));filters.append(wrap);input.addEventListener('change',()=>{page=0;draw();});}
  function draw(){
   if(!current())return;body.replaceChildren();const comparable=!!data.normal.length&&!!data.speech.length;changedOnly.disabled=numbersOnly.disabled=!comparable;
   const selected=comparison.rows.filter(row=>(!changedOnly.checked||row.changed)&&(!numbersOnly.checked||row.missingNumbers.length)),total=Math.ceil(selected.length/12);page=Math.max(0,Math.min(page,Math.max(0,total-1)));
   for(const item of selected.slice(page*12,page*12+12)){const cue=item.cue,row=el('article','speech-compare-row'),time=el('h3','',cue.start.toFixed(1)+'–'+cue.end.toFixed(1)+t(' s',' sn')),columns=el('div','speech-compare-columns');row.append(time,columns);const values={};let limited=item.limited;
    for(const key of ['source','normal','speech']){const value=model.indexedOverlap(comparison.indexes[key],cue.start,cue.end);values[key]=value.text;limited||=value.limited;}
    for(const [key,label]of [['source',t('Source','Kaynak')],['normal',t('Subtitle translation','Normal çeviri')],['speech',t('Voice script','Seslendirme metni')]]){const section=el('section'),text=el('p','',values[key]||t('No matching text loaded.','Eşleşen metin yüklenmedi.'));section.append(el('h4','',label),text);columns.append(section);}
    if(item.unmatchedSpeech)row.append(el('p','speech-compare-warning',t('No voice-script passage overlaps this subtitle. Check file coverage; this alone does not prove missing audio.','Bu altyazıyla örtüşen seslendirme metni yok. Dosya kapsamını kontrol edin; bu tek başına ses kaybını kanıtlamaz.')));
    if(limited)row.append(el('p','speech-compare-warning',t('This overlap is too large for a complete comparison; no error verdict was made.','Bu örtüşme tam karşılaştırma için çok büyük; hata kararı verilmedi.')));
    else if(values.normal&&values.speech){const diff=model.difference(values.normal,values.speech),delta=el('details','speech-compare-diff');delta.append(el('summary','',diff.changed?t('Show changed passage','Değişen kısmı göster'):t('Same text','Metin aynı')),el('del','',diff.before),el('ins','',diff.after));if(diff.removedNumbers.length)delta.append(el('p','',t('Check missing numbers: ','Eksilen sayıları kontrol et: ')+diff.removedNumbers.join(', ')));row.append(delta);}body.append(row);
   }
   if(!selected.length)body.append(el('p','speech-compare-empty',comparison.rows.length?t('No passages match these filters.','Bu filtrelerle eşleşen metin yok.'):t('Choose subtitle files to begin.','Başlamak için altyazı dosyalarını seçin.')));
   for(const key of ['source','normal','speech'])if(fileLabels[key]){fileLabels[key].textContent=names[key]||t('No file selected','Dosya seçilmedi');fileLabels[key].title=names[key]||'';}
   feedback.textContent=t(`${selected.length} of ${comparison.rows.length} passages match`,`${comparison.rows.length} metinden ${selected.length} eşleşiyor`)+t(` · Showing ${selected.length?page*12+1:0}–${Math.min((page+1)*12,selected.length)}`,` · Gösterilen: ${selected.length?page*12+1:0}–${Math.min((page+1)*12,selected.length)}`)+t(` · ${comparison.rows.filter(r=>r.unmatchedSpeech).length} unmatched subtitle passages`, ` · ${comparison.rows.filter(r=>r.unmatchedSpeech).length} eşleşmeyen altyazı metni`)+['source','normal','speech'].map(key=>{const rows=comparison.indexes[key].rows;const label={source:t('Source','Kaynak'),normal:t('Subtitle translation','Normal çeviri'),speech:t('Voice script','Seslendirme metni')}[key];return ` · ${label}: ${rows.length?rows[0].start.toFixed(1)+'–'+Math.max(...rows.map(r=>r.end)).toFixed(1)+' s':'—'}`;}).join('')+(comparison.limited?t(' · Only the first 5,000 cues per file are shown.',' · Dosya başına ilk 5.000 blok gösteriliyor.'):'');pageInfo.textContent=(total?page+1:0)+' / '+total;prev.disabled=page===0;next.disabled=page+1>=total;
  }
  async function load(key,file){if(!current()||typeof file!=='string'||!file)return;const request=++versions[key];try{const r=await window.api.readSubtitle(file);if(!current()||request!==versions[key])return;if(!r?.ok)throw Error(r?.error||t('Subtitle read failed','Altyazı okunamadı'));const cues=parseSubtitles(r.text).sort((a,b)=>a.start-b.start);if(!cues.length)throw Error(t('No readable subtitle cues found.','Okunabilir altyazı bloğu bulunamadı.'));data[key]=cues;names[key]=String(file).split(/[\\/]/).at(-1);comparison=model.comparisonRows(data);page=0;draw();}catch(error){if(current()&&request===versions[key])feedback.textContent=error.message;}}
  for(const [key,label]of [['source',t('Choose source','Kaynak seç')],['normal',t('Choose normal translation','Normal çeviri seç')],['speech',t('Choose voice script','Seslendirme metni seç')]]){const group=el('div','speech-file-control'),name=el('span');fileLabels[key]=name;group.append(button(label,async()=>{const file=await window.api.selectFile('subtitle');if(current())await load(key,file);}),name);controls.append(group);}
  const prev=button(t('Previous','Önceki'),()=>{page--;draw();}),next=button(t('Next','Sonraki'),()=>{page++;draw();}),pageInfo=el('span');pager.append(prev,pageInfo,next);d.append(h,note,controls,filters,feedback,body,pager);d.addEventListener('keydown',event=>{if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.target.isContentEditable)return;const target=event.key==='ArrowLeft'?prev:event.key==='ArrowRight'?next:null;if(target){event.preventDefault();if(!target.disabled)target.click();}});document.body.append(d);translationDialog=d;d.addEventListener('close',()=>{
   alive=false;d.remove();if(translationDialog===d){translationDialog=null;translationOwner='';}
   if(parent.open&&owner===ui().experience().requestOwner&&!document.querySelector('dialog[open]:not(#dubGeneratorDialog)')&&compare.isConnected&&!compare.disabled)compare.focus({preventScroll:true});
  },{once:true});d.showModal();draw();const file=ui().experience().srt;if(file)await load('speech',file);
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
 document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.isComposing||[...document.querySelectorAll('dialog[open]')].some(dialog=>dialog!==$('dubGeneratorDialog')))return;if(event.ctrlKey&&event.altKey&&!event.shiftKey&&event.code==='KeyR'&&!event.repeat&&!/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)&&!event.target.isContentEditable){event.preventDefault();void repairNow();}});
 window.addEventListener('dub-preflight-ready',event=>{
  if(event.detail?.reveal){
   window.DubStudioLayout?.reveal(host);
   $('dubReviewTools').open=true;
   host.open=true;
   host.scrollIntoView?.({block:'nearest'});
   title.focus({preventScroll:true});
  }
  void preflight(event.detail?.scopedReport);
 });
 document.addEventListener('ui-locale-change',labels);labels();
 window.DubExperienceUI=Object.freeze({preflight,repairNow,comparison});
})();
