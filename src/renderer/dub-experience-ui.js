(() => {
 'use strict';
 const $=id=>document.getElementById(id),ui=()=>window.DubGeneratorUI,model=window.DubExperienceModel;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
 const button=(text,run)=>{const b=el('button','btn btn-ghost',text);b.type='button';b.onclick=run;return b;};
 const host=el('section','dub-experience'),head=el('div','dub-experience-head'),title=el('h3'),tools=el('div','dub-experience-tools'),status=el('p','dub-experience-status');status.setAttribute('role','status');
 const inspect=button('',()=>void preflight()),compare=button('',()=>void comparison()),repair=button('',()=>void repairNow());
 const details=el('details','dub-preflight'),summary=el('summary'),list=el('div','dub-preflight-list');details.hidden=true;details.append(summary,list);tools.append(inspect,compare,repair);head.append(title,tools);host.append(head,status,details);
 $('dubGeneratorDialog').querySelector('.dub-studio-scroll').prepend(host);
 const files=el('details','dub-files-menu'),fileLabel=el('summary','btn btn-ghost'),filePanel=el('div','dub-files-panel');files.append(fileLabel,filePanel);for(const id of ['dubGeneratorOutput','dubStorageOpen','dubGeneratorLog'])filePanel.append($(id));$('dubGeneratorCancel').parentElement.append(files);
 $('dubGeneratorDialog').addEventListener('pointerdown',event=>{if(!files.contains(event.target))files.open=false;});
 $('dubGeneratorDialog').addEventListener('scroll',()=>{files.open=false;},true);
 files.addEventListener('click',event=>{if(event.target.closest('button'))files.open=false;});
 files.addEventListener('keydown',event=>{if(event.key==='Escape'&&files.open){files.open=false;event.preventDefault();event.stopPropagation();fileLabel.focus();}});
 let serial=0,lastOwner=ui().experience().owner;
 document.addEventListener('media-context-changed',()=>{const owner=ui().experience().owner;if(owner===lastOwner)return;lastOwner=owner;serial++;inspect.disabled=false;status.textContent='';details.hidden=true;list.replaceChildren();});
 function labels(){fileLabel.textContent=t('Files & log','Dosyalar ve kayıt');title.textContent=t('Production check','Üretim kontrolü');inspect.textContent=t('Inspect script','Metni denetle');compare.textContent=t('Compare translations','Çevirileri karşılaştır');repair.textContent=t('Repair current moment · Ctrl+Alt+R','İzlediğim anı düzelt · Ctrl+Alt+R');}
 async function preflight(){const request=++serial,identity=JSON.stringify([ui().experience().owner,ui().experience().srt]);inspect.disabled=true;
  try{const report=await ui().inspectProduction();if(request!==serial||identity!==JSON.stringify([ui().experience().owner,ui().experience().srt]))return;if(!report){status.textContent=t('Select a subtitle first.','Önce altyazı seç.');return;}
   summary.textContent=t(`${report.rows.length} groups · ${report.dense} dense · ${report.long} long`,`${report.rows.length} grup · ${report.dense} yoğun · ${report.long} uzun`);
   status.textContent=t('Duration is an estimate, not a naturalness score. ','Süre tahminidir; doğallık puanı değildir. ')+(report.referenceChecked?(report.referenceWarnings.length?t('Reference needs review: ','Referansı kontrol et: ')+report.referenceWarnings.map(w=>({quiet:t('low level','kısık ses'),clipping:t('clipping','ses patlaması'),silence:t('long silence','uzun sessizlik'),short:t('too short','çok kısa')}[w]||w)).join(', '):t('Reference level was checked.','Referans seviyesi kontrol edildi.')):t('Reference audio has not been measured in this session.','Referans sesi bu oturumda henüz ölçülmedi.'));
   list.replaceChildren();for(const row of report.rows.filter(r=>r.dense||r.long).slice(0,20)){const text=t(`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):"—"} s available · ~${row.estimated} s estimated`,`${Number.isFinite(row.seconds)?row.seconds.toFixed(1):"—"} sn aralık · ~${row.estimated} sn tahmin`);const b=button(text+' · '+row.text.slice(0,110),()=>void ui().editPlanGroup(row.key));list.append(b);}
   if(!list.childElementCount)list.append(el('p','',t('No dense or long groups flagged. Listen to a sample before deciding.','Yoğun veya uzun grup işaretlenmedi. Karar vermeden önce kısa örneği dinle.')));
   details.hidden=false;details.open=report.dense>0||report.long>0;
  }catch(error){if(request===serial)status.textContent=error.message;}finally{if(request===serial)inspect.disabled=false;}
 }
 async function repairNow(){const ok=await ui().editAtCurrent();if(!ok)status.textContent=t('No matching completed dub group at the current video time.','Güncel video anında eşleşen tamamlanmış dublaj grubu yok.');else status.textContent=t('Group opened. Edit and apply the text, then regenerate only this group.','Grup açıldı. Metni düzenleyip uygula; sonra yalnız bu grubu yeniden üret.');}
 async function comparison(){
  const d=el('dialog','speech-compare-dialog media-surface'),h=el('header'),heading=el('h2','',t('Translation workbench','Çeviri karşılaştırması')),close=button('×',()=>d.close());close.setAttribute('aria-label',t('Close comparison','Karşılaştırmayı kapat'));h.append(heading,close);
  const note=el('p','',t('Aligns by overlapping timestamps. Changes and number differences are clues, not proof of preserved meaning. Files are not changed.','Zaman aralıklarına göre eşleştirir. Metin ve sayı farkları ipucudur; anlamın korunduğunun kanıtı değildir. Dosyalar değiştirilmez.'));
  const controls=el('div','speech-compare-controls'),body=el('div','speech-compare-body'),pager=el('div','speech-compare-pager'),feedback=el('p');feedback.setAttribute('role','status');let page=0,alive=true;const versions={source:0,normal:0,speech:0};const data={source:[],normal:[],speech:[]},names={};
  function draw(){body.replaceChildren();const base=data.speech.length?data.speech:data.normal.length?data.normal:data.source,total=Math.ceil(base.length/12);page=Math.max(0,Math.min(page,Math.max(0,total-1)));
   for(const cue of base.slice(page*12,page*12+12)){const row=el('article','speech-compare-row'),time=el('h3','',cue.start.toFixed(1)+'–'+cue.end.toFixed(1)+' s'),columns=el('div','speech-compare-columns');row.append(time,columns);const values={};for(const key of ['source','normal','speech'])values[key]=model.overlap(data[key],cue.start,cue.end);
    for(const [key,label]of [['source',t('Source','Kaynak')],['normal',t('Subtitle translation','Normal çeviri')],['speech',t('Voice script','Seslendirme metni')]]){const section=el('section'),text=el('p','',values[key]||t('No matching text loaded.','Eşleşen metin yüklenmedi.'));section.append(el('h4','',label),text);columns.append(section);}
    if(values.normal&&values.speech){const diff=model.difference(values.normal,values.speech);const delta=el('details','speech-compare-diff');delta.append(el('summary','',diff.changed?t('Show changed passage','Değişen kısmı göster'):t('Same text','Metin aynı')),el('del','',diff.before),el('ins','',diff.after));if(diff.removedNumbers.length)delta.append(el('p','',t('Check missing numbers: ','Eksilen sayıları kontrol et: ')+diff.removedNumbers.join(', ')));row.append(delta);}body.append(row);
   }
   feedback.textContent=Object.entries(names).map(([key,name])=>name+' · '+data[key].length).join(' / ');pageInfo.textContent=(total?page+1:0)+' / '+total;prev.disabled=page===0;next.disabled=page+1>=total;
  }
  async function load(key,file){if(typeof file!=='string'||!file)return;const request=++versions[key];try{const r=await window.api.readSubtitle(file);if(!alive||request!==versions[key])return;if(!r?.ok)throw Error(r?.error||'Subtitle read failed');const cues=parseSubtitles(r.text).sort((a,b)=>a.start-b.start);if(!cues.length)throw Error(t('No readable subtitle cues found.','Okunabilir altyazı bloğu bulunamadı.'));data[key]=cues;names[key]=String(file).split(/[\\/]/).at(-1);page=0;draw();}catch(error){if(alive&&request===versions[key])feedback.textContent=error.message;}}
  for(const [key,label]of [['source',t('Choose source','Kaynak seç')],['normal',t('Choose normal translation','Normal çeviri seç')],['speech',t('Choose voice script','Seslendirme metni seç')]])controls.append(button(label,async()=>{const file=await window.api.selectFile('subtitle');if(alive)await load(key,file);}));
  const prev=button(t('Previous','Önceki'),()=>{page--;draw();}),next=button(t('Next','Sonraki'),()=>{page++;draw();}),pageInfo=el('span');pager.append(prev,pageInfo,next);d.append(h,note,controls,feedback,body,pager);document.body.append(d);d.addEventListener('close',()=>{alive=false;d.remove();},{once:true});d.showModal();draw();const file=ui().experience().srt;if(file)await load('speech',file);
 }
 const continuity=el('details','dub-preflight'),continuityTitle=el('summary'),continuityRows=el('div','dub-preflight-list');continuity.hidden=true;continuity.append(continuityTitle,continuityRows);host.append(continuity);let continuitySignature='';
 function showContinuity(){const groups=ui().experience().groups.map(g=>({...g,continuity:model.continuity(g.continuity)})).filter(g=>g.continuity),signature=JSON.stringify([window.UiLocale?.get?.(),groups.map(g=>({key:g.key,group:g.group,continuity:g.continuity}))]);if(signature===continuitySignature)return;continuitySignature=signature;continuity.hidden=!groups.length;continuityTitle.textContent=t('Measured speech continuity','Ölçülen ses devamlılığı');continuityRows.replaceChildren();
  if(!groups.length)return;continuityRows.append(el('p','',t('Raw takes are preserved. Level corrections are limited to ±2 dB; pitch and pacing are not automatically flattened.','Ham kayıtlar korunur. Seviye düzeltmesi ±2 dB ile sınırlıdır; perde ve tempo otomatik tekdüzeleştirilmez.')));
  const labels={'level-jump':t('level change','seviye farkı'),'pace-jump':t('pace change','hız farkı'),'long-edge-pause':t('long edge pause','uzun kenar durağı')};
  for(const g of groups.filter(g=>g.continuity.warnings.length||g.continuity.gainDb).slice(0,20)){const m=g.continuity;continuityRows.append(button('#'+g.group+' · '+m.levelDb+' dB · '+m.wordsPerSecond+' '+t('words/s','kelime/sn')+' · '+m.gainDb+' dB · '+m.warnings.map(w=>labels[w]||w).join(', '),()=>void ui().editPlanGroup(g.key)));}
 }
 window.addEventListener('dub-takes:context',showContinuity);document.addEventListener('ui-locale-change',showContinuity);
 document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.altKey&&!event.shiftKey&&event.code==='KeyR'&&!event.repeat&&!/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)&&!event.target.isContentEditable){event.preventDefault();void repairNow();}});
 window.addEventListener('dub-preflight-ready',()=>void preflight());
 document.addEventListener('ui-locale-change',labels);labels();
 window.DubExperienceUI=Object.freeze({preflight,repairNow,comparison});
})();
