(() => {
 'use strict';
 // "Recent runs" inside the production panel. The service owns every fact (state, evidence, retry plans, approvals);
 // this file only shows what the service answered and sends explicit actions. Selecting a row never starts a
 // production or a recovery. Every await re-checks the panel epoch / the selected run / the request sequence, so a
 // late answer cannot change a newer selection or a closed panel.
 const section=document.getElementById('dubRuns');
 if(!section||!window.api?.dubRuns)return;
 const L=(tr,en)=>window.UiLocale?.get?.()==='en'?en:tr;
 const part=value=>{const rows=String(value||'').split(' / ');return window.UiLocale?.get?.()==='en'?rows[0]:(rows[1]||rows[0]);};
 const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const button=(label,onclick,className='btn btn-ghost btn-sm')=>{const b=node('button',className,label);b.type='button';b.addEventListener('click',onclick);return b;};
 const STATES={
  running:['Çalışıyor','Running','live'],'running-elsewhere':['Başka örnekte çalışıyor','Running in another app instance','live'],interrupted:['Kesilmiş','Interrupted','warn'],uncertain:['Belirsiz','Uncertain','warn'],
  cancelled:['İptal edildi','Cancelled','muted'],failed:['Hata','Failed','bad'],partial:['Kısmi','Partial','warn'],completed:['Tamamlandı','Completed','ok'],'output-missing':['Çıktı eksik','Output missing','warn']
 };
 const stateText=state=>{const row=STATES[state]||STATES.uncertain;return L(row[0],row[1]);};
 const MODES={pinned:{title:()=>L('Sabitlenmiş seçeneklerle yeniden dene','Retry with the pinned options'),confirm:()=>L('Sabit seçeneklerle başlat','Start with pinned options'),
   lead:()=>L('Özgün işin seçenekleriyle yeni bir üretim başlatır.','Starts a new generation with the original run\'s options.')},
  current:{title:()=>L('Güncel ayarlarla yeni üretim','New generation with current settings'),confirm:()=>L('Güncel ayarlarla başlat','Start with current settings'),
   lead:()=>L('Aynı kaynakla, bugünkü ayarlarla yeni bir üretim başlatır.','Starts a new generation from the same source with today\'s settings.')}};
 const FIELD={profile:['Ses kalitesi','Voice quality'],verification:['Doğrulama','Verification'],timingMode:['Zamanlama','Timing'],grouping:['Gruplama','Grouping'],expression:['Anlatım tonu','Tone'],deliveryStrength:['Aktarım gücü','Delivery strength'],
  resultMode:['Dublaj kipi','Dubbing mode'],concurrency:['Paralel üretim','Parallel groups'],autoFit:['Süre uydurma','Duration fitting'],naturalSpeech:['Doğal konuşma','Natural speech'],followDelivery:['Anlatımı takip','Follow delivery'],voice:['Ses','Voice'],range:['Aralık','Range']};
 const VALUE={fast:['Hızlı','Fast'],quality:['Kaliteli','Quality'],balanced:['Dengeli','Balanced'],detailed:['Ayrıntılı','Detailed'],clip:['Klip','Clip'],video:['Video','Video'],true:['Açık','On'],false:['Kapalı','Off'],
  akici:['Akıcı konuşma blokları','Fluent speech blocks'],anlatim:['Cümle akışı','Sentence flow'],cumle:['Cümle','Sentence'],satir:['Altyazı satırı','Subtitle line'],reference:['Referansın tonu','Reference tone'],calm:['Sakin','Calm'],warm:['Sıcak','Warm'],lively:['Canlı','Lively'],gentle:['Hafif','Gentle'],strong:['Güçlü','Strong'],natural:['Doğal','Natural'],custom:['Özel','Custom']};
 const fieldName=key=>L(...(FIELD[key]||[key,key]));
 const valueText=value=>{if(value&&typeof value==='object')return clock(value.start)+'–'+clock(value.end);const row=VALUE[String(value)];return row?L(...row):String(value);};
 const clock=seconds=>{const s=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=String(s%60).padStart(2,'0');return h?h+':'+String(m).padStart(2,'0')+':'+r:m+':'+r;};
 const rangeText=range=>range?clock(range.start)+'–'+clock(range.end):L('Tüm video','Whole video');
 const ago=iso=>{const t=Date.parse(iso);if(!Number.isFinite(t))return '';const m=Math.round((Date.now()-t)/60000);if(m<1)return L('az önce','just now');if(m<60)return m+' '+L('dk önce','min ago');const h=Math.round(m/60);return h<48?h+' '+L('sa önce','h ago'):Math.round(h/24)+' '+L('gün önce','d ago');};

 const body=section.querySelector('.dub-runs-body'),notice=section.querySelector('#dubRunsNotice'),list=section.querySelector('#dubRunsList'),count=section.querySelector('#dubRunsCount'),refreshButton=section.querySelector('#dubRunsRefresh');
 const dialog=section.closest('dialog');
 let epoch=0,listSeq=0,detailSeq=0,runs=[],loaded=false,loading=false,listError=false,extra={unreadable:[],orphans:[],orphanNote:null},active=null;
 let selected=null,detail=null,detailState='idle',loadable=null,audio=null;
 const messages=new Map(),previews={pinned:null,current:null},pending=new Set(),sourceNotes=new Map();
 const call=async request=>{try{return await window.api.dubRuns(request);}catch(_){return {ok:false,code:'transport'};}};
 const guard=(ep,seq,counter,id)=>ep===epoch&&(counter===undefined||seq===counter())&&(id===undefined||selected===id);

 function stopAudio(){if(audio){audio.pause();audio.removeAttribute('src');audio.load?.();}audio=null;}
 function say(text){notice.textContent=text||'';notice.hidden=!text;}
 function busyEvent(){window.dispatchEvent(new CustomEvent('dub-runs:busy',{detail:!!active}));}

 // ---------- list ----------
 async function refresh(){
  const ep=epoch,seq=++listSeq;loading=true;render();
  const result=await call({action:'list'});
  if(!guard(ep,seq,()=>listSeq))return;
  loading=false;
  if(!result?.ok){
   // A failed load never erases the last valid list.
   listError=true;render();return;
  }
  listError=false;loaded=true;runs=result.runs||[];active=result.active||null;extra={unreadable:result.unreadable||[],orphans:result.orphans||[],orphanNote:result.orphanNote||null};
  if(selected&&!runs.some(row=>row.id===selected))closeDetail();
  busyEvent();render();
 }
 function closeDetail(){selected=null;detail=null;detailState='idle';loadable=null;previews.pinned=previews.current=null;stopAudio();detailSeq++;}
 async function select(id){
  if(selected===id){closeDetail();render();focusRow(id);return;}
  closeDetail();selected=id;detailState='loading';render();
  const ep=epoch,seq=++detailSeq,result=await call({action:'detail',runId:id});
  if(!guard(ep,seq,()=>detailSeq,id))return;
  if(!result?.ok){detailState='error';detail={error:result?.error||''};render();return;}
  detail=result;detailState='ready';render();
  await probeLoadable(id,ep,seq);
 }
 // Whether this result matches the current subtitle/range/source is answered by the same saved-output check the dialog uses.
 async function probeLoadable(id,ep,seq){
  const row=runs.find(item=>item.id===id);loadable=null;
  if(!(row&&['completed','partial'].includes(row.state)&&row.output.state==='valid'&&window.DubGeneratorBridge))return;
  const ok=await window.DubGeneratorBridge.probe(id);
  if(!guard(ep,seq,()=>detailSeq,id))return;
  loadable=ok;render();
 }
 function focusRow(id){const target=[...list.querySelectorAll('[data-run]')].find(row=>row.dataset.run===id)?.querySelector('.dub-run-main');target?.focus?.();}

 // ---------- actions ----------
 async function recover(id){
  if(pending.has('recover:'+id))return;pending.add('recover:'+id);messages.set(id,{tone:'info',text:L('Kurtarılıyor…','Recovering…')});render();
  const ep=epoch,result=await call({action:'recover',runId:id});pending.delete('recover:'+id);
  if(ep!==epoch)return;
  messages.set(id,result?.ok?{tone:'ok',text:result.replayed?L('Bu çıktı zaten kurtarılmıştı.','This output was already recovered.'):L('Kurtarıldı. Hiçbir bölüme bağlanmadı ve çalmadı; incelemek için “Dinle”, bu bölüme almak için “Bu bölüme yükle” kullan.','Recovered. It was not attached to any section and did not play; use “Listen” to inspect it or “Load into this section” to use it.')}
   :{tone:'bad',text:result?.code==='transport'?L('Sonuç bilinmiyor: uygulama yanıt vermedi. Listeyi yenile.','Result unknown: the app did not answer. Refresh the list.'):part(result?.error)});
  await refresh();if(selected===id)await reloadDetail(id);
  list.querySelector('.dub-run-message')?.scrollIntoView?.({block:'nearest'});
 }
 async function reloadDetail(id){
  const ep=epoch,seq=++detailSeq,result=await call({action:'detail',runId:id});
  if(!guard(ep,seq,()=>detailSeq,id))return;
  if(result?.ok){detail=result;detailState='ready';render();await probeLoadable(id,ep,seq);}
 }
 async function listen(id){
  stopAudio();messages.set(id,{tone:'info',text:L('Dosya denetleniyor…','Checking the file…')});render();
  const ep=epoch,result=await call({action:'review',runId:id});
  if(!guard(ep,undefined,undefined,id))return;
  if(!result?.ok){messages.set(id,{tone:'bad',text:part(result?.error||'')+(result?.next?' '+part(result.next):'')});await refresh();render();return;}
  messages.set(id,{tone:'ok',text:result.use==='bound'?L('Yalnız dinleme. Bu sonucun kaynağı kayıtlı; bir bölüme almak için “Bu bölüme yükle” kullan.','Listening only. This result\'s source is recorded; use “Load into this section” to use it.')
   :L('Yalnız dinleme: kaynağa ve zaman eksenine bağlı değil, senkron kullanılamaz.','Listening only: not bound to a source or timeline; it cannot be used for sync.')});
  audio=node('audio','dub-run-audio');audio.controls=true;audio.preload='none';audio.src=result.url;audio.setAttribute('aria-label',L('İnceleme sesi','Review audio'));
  render();
 }
 async function loadIntoSection(id){
  messages.set(id,{tone:'info',text:L('Denetleniyor…','Checking…')});render();
  const ep=epoch;let result=await window.DubGeneratorBridge.load(id,{isCurrent:()=>guard(ep,undefined,undefined,id)});
  if(!guard(ep,undefined,undefined,id))return;
  if(result?.code==='not-this-section'){
   // Distinguish "does not match this section" from "the file changed or disappeared" instead of blaming the section.
   const checked=await call({action:'review',runId:id});if(!guard(ep,undefined,undefined,id))return;
   if(!checked?.ok&&checked?.code==='output-changed'){messages.set(id,{tone:'bad',text:part(checked.error)+' '+part(checked.next)});render();await refresh();return;}
  }
  const text={ok:L('Bu bölüme yüklendi (çalmaya başlamadı). Ana üretim alanında inceleyebilirsin.','Loaded into this section (not playing). Review it in the main production area.'),
   busy:L('Başka bir işlem sürüyor; bitince tekrar dene.','Another action is in progress; try again when it finishes.'),'no-subtitle':L('Önce bir altyazı seç.','Choose a subtitle first.'),
   'not-this-section':L('Bu sonuç şu anki altyazı/aralıkla eşleşmiyor; yalnız dinlenebilir.','This result does not match the current subtitle/range; it can only be listened to.'),stale:L('Seçim değişti; tekrar dene.','The selection changed; try again.')}[result?.ok?'ok':result?.code]||L('Yüklenemedi.','Could not be loaded.');
  messages.set(id,{tone:result?.ok?'ok':'bad',text});render();
 }
 async function preview(id,mode){
  const slot={mode,state:'loading',seq:(previews[mode]?.seq||0)+1};previews[mode]=slot;render();
  const ep=epoch,result=await call({action:'retry-preview',runId:id,settings:mode});
  if(!guard(ep,undefined,undefined,id)||previews[mode]!==slot)return;
  Object.assign(slot,result?.ok?{state:'ready',plan:result,token:result.token}:{state:'refused',error:result?.code==='transport'?L('Uygulama yanıt vermedi. Tekrar dene.','The app did not answer. Try again.'):part(result?.reason||result?.error),next:part(result?.next),differences:result?.differences});
  render();
  list.querySelector(`[data-preview="${mode}"] h5`)?.focus?.();
 }
 async function approve(id,mode){
  const slot=previews[mode];if(!slot||!slot.token||slot.sending)return;
  slot.sending=true;slot.status='sending';render();
  const token=slot.token,ep=epoch,result=await call({action:'retry-approve',token});
  if(ep!==epoch)return;     // panel closed: the service continues; the next open shows the truth
  if(previews[mode]!==slot){await refresh();return;}
  slot.sending=false;
  if(result?.code==='transport'){slot.status='unknown';}
  else if(result?.ok){slot.status=result.replayed?'replayed':'started';slot.token=null;const other=previews[mode==='pinned'?'current':'pinned'];if(other)other.state='closed';}
  else if(['pending','busy'].includes(result?.code)){slot.status=result.code;slot.error=part(result.error);}
  else{slot.status='consumed';slot.token=null;slot.code=result?.code;slot.error=part(result?.error);slot.next=part(result?.next);}
  render();await refresh();
  // the answer must be visible where the user pressed the button, after the list was re-rendered
  list.querySelector(`[data-preview="${mode}"] [role="status"]`)?.scrollIntoView?.({block:'nearest'});
 }
 const dismissPreview=(mode,id)=>{previews[mode]=null;render();focusRow(id);};
 // Open the run's recorded source through the one owner (dub-source-return.js). The answer is only ever shown for the panel that
 // asked: a closed/reset panel (epoch change) drops it, and a superseded request is shown as such, never as a failure.
 async function openSource(id,allowChanged=false){
  if(pending.has('source:'+id))return;
  if(!window.DubSourceReturn){sourceNotes.set(id,{tone:'bad',text:L('Kaynak açıcı kullanılamıyor. Hiçbir şey açılmadı.','The source opener is unavailable. Nothing was opened.')});render();return;}
  pending.add('source:'+id);sourceNotes.set(id,{tone:'info',text:L('Kaynak açılıyor…','Opening the source…')});render();
  const ep=epoch,result=await window.DubSourceReturn.open(id,{allowChanged,isCancelled:()=>ep!==epoch});
  pending.delete('source:'+id);
  if(ep!==epoch)return;
  if(result?.ok){sourceNotes.delete(id);render();if(typeof dialog?.close==='function')dialog.close();return;}
  sourceNotes.set(id,{tone:result?.code==='superseded'?'info':'bad',text:result?.message||'',next:result?.next||'',canOpenCurrent:result?.canOpenCurrent===true,opened:result?.opened===true});
  render();
  list.querySelector('[data-source-open]')?.focus?.({preventScroll:true});
 }

 // ---------- rendering ----------
 function metaLine(row){
  const bits=[];
  bits.push(row.pinned?.range!==undefined||row.pinned?rangeText(row.pinned?.range):L('Bilinmeyen aralık','Unknown range'));
  if(row.pinned?.profile)bits.push(valueText(row.pinned.profile));
  if(row.sample)bits.push(L('Kısa örnek','Short sample'));
  const when=ago(row.startedAt);if(when)bits.push(when);
  bits.push(row.output.state==='valid'?L('ses ','audio ')+clock(row.output.seconds):row.output.state==='invalid'?L('ses kesik','audio truncated'):L('ses yok','no audio'));
  return bits.join(' · ');
 }
 function renderRow(row){
  const tone=(STATES[row.state]||STATES.uncertain)[2],li=node('li','dub-run');li.dataset.run=row.id;li.dataset.state=row.state;li.dataset.tone=tone;
  if(selected===row.id)li.dataset.selected='true';
  const main=node('button','dub-run-main');main.type='button';main.setAttribute('aria-expanded',selected===row.id?'true':'false');main.addEventListener('click',()=>select(row.id));
  const chip=node('span','dub-run-state');chip.append(node('i'),node('span','',stateText(row.state)));chip.querySelector('i').setAttribute('aria-hidden','true');
  const title=node('strong','dub-run-title',row.label||L('Adsız çalışma','Unnamed run'));
  const meta=node('span','dub-run-meta',metaLine(row));
  main.append(chip,title,meta);
  if(row.recovered||row.attempt>1){const tags=node('span','dub-run-tags');if(row.recovered)tags.append(node('em','',L('kurtarıldı','recovered')));if(row.attempt>1)tags.append(node('em','',L('deneme ','attempt ')+row.attempt));main.append(tags);}
  li.append(main);
  if(selected===row.id)li.append(renderDetail(row));
  return li;
 }
 // Source evidence (what the run was made from and whether it can be reopened) is its own flat band, apart from the tools below.
 const KIND={podcast:['Podcast bölümü','Podcast episode'],catalog:['Kütüphane videosu','Library video'],youtube:['YouTube videosu','YouTube video']};
 function renderSource(row){
  const source=row.source||{state:'none'},note=sourceNotes.get(row.id);
  if(source.state==='none'&&!note)return null;
  const band=node('section','dub-run-source');band.dataset.state=source.state;
  const what=node('div','dub-run-source-what');
  what.append(node('span','dub-run-source-label',L('Kaynak','Source')),node('strong','',source.state==='recorded'?L(...(KIND[source.kind]||['Kayıtlı kaynak','Recorded source'])):source.state==='legacy'?L('Eski kayıt: yalnız opak kimlik','Older record: opaque identity only'):L('Bu sürümün okuyamadığı kaynak bilgisi','Source information this version cannot read')));
  band.append(what);
  if(source.state==='recorded'){
   const busy=pending.has('source:'+row.id),open=button(busy?L('Açılıyor…','Opening…'):L('Kaynağı aç','Open source'),()=>openSource(row.id),'btn btn-primary btn-sm');
   open.dataset.sourceOpen='true';open.disabled=busy;band.append(open);
  }else if(source.state==='legacy'){
   band.append(node('p','dub-run-note',L('Bu eski kayıt başka bir bölümü veya dosyayı yeniden açacak adres tutmaz. Özgün kaynağı kendin aç, sonra yeni üretim başlat; kayıt ve sesi korunur.','This older record has no locator to reopen another episode or file. Open the original source yourself, then start a new generation; the record and its audio are kept.')));
  }else if(source.state==='unsupported'){
   band.append(node('p','dub-run-note',L('Bu kayıttaki kaynak bilgisi farklı bir uygulama sürümünce yazılmış; kullanılmıyor, kayıt değişmeden kalır.','The source information in this record was written by a different app version; it is not used and the record stays unchanged.')));
  }
  if(note){
   const p=node('p','dub-run-message',note.text);p.dataset.tone=note.tone;p.setAttribute('role','status');band.append(p);
   if(note.next)band.append(node('p','dub-run-note',note.next));
   if(note.canOpenCurrent)band.append(button(L('Güncel sürümü başvuru için aç','Open the current version for reference'),()=>openSource(row.id,true),'btn btn-secondary btn-sm'));
  }
  return band;
 }
 function renderDetail(row){
  const box=node('div','dub-run-detail');
  box.addEventListener('keydown',event=>{
   if(event.key!=='Escape')return;
   const open=['current','pinned'].find(mode=>previews[mode]&&previews[mode].state!=='closed'&&box.querySelector(`[data-preview="${mode}"]`)?.contains(document.activeElement));
   if(open){dismissPreview(open,row.id);}else{closeDetail();render();focusRow(row.id);}
   event.preventDefault();event.stopPropagation();
  });
  if(detailState==='loading'){box.append(node('p','dub-run-note',L('Ayrıntılar yükleniyor…','Loading details…')));return box;}
  if(detailState==='error'||!detail){box.append(node('p','dub-run-note',L('Ayrıntılar okunamadı. Listeyi yenileyip tekrar dene.','Details could not be read. Refresh the list and try again.')));return box;}
  const facts=node('dl','dub-run-facts'),add=(k,v)=>{if(v===undefined||v===null||v==='')return;facts.append(node('dt','',k),node('dd','',v));};
  if(row.reason&&reasonText(row.reason.code))add(L('Neden','Why'),reasonText(row.reason.code));
  add(L('Altyazı','Subtitle'),row.label);add(L('Aralık','Range'),rangeText(row.pinned?.range));
  for(const key of ['profile','verification','timingMode','grouping'])if(row.pinned?.[key]!==undefined)add(fieldName(key),valueText(row.pinned[key]));
  if(detail.dictionary)add(L('Sözlük','Dictionary'),detail.dictionary+L(' kayıt',' entries'));
  if(row.error)add(L('Hata bilgisi','Error detail'),row.error);
  box.append(facts);
  const sourceBand=renderSource(row);if(sourceBand)box.append(sourceBand);
  for(const item of detail.why||[]){const p=node('p','dub-run-why',part(item.text));p.dataset.code=item.code;box.append(p);}
  if(detail.newerResult)box.append(node('p','dub-run-why',L('Bu işin daha yeni bir denemesi tamamlandı; önceki sonuç ayrı bir kayıt olarak durur.','A newer attempt of this run completed; the earlier result stays as its own record.')));
  const message=messages.get(row.id);if(message){const p=node('p','dub-run-message',message.text);p.dataset.tone=message.tone;p.setAttribute('role','status');box.append(p);}
  if(audio)box.append(audio);
  const actions=node('div','dub-run-actions');
  if(['running','running-elsewhere'].includes(row.state))box.append(node('p','dub-run-note',row.state==='running'?L('Bu üretim şu an çalışıyor; ilerleme ana üretim çubuğunda.','This generation is running now; progress is in the main production bar.'):L('Başka bir uygulama örneğinde çalışıyor; buradan dokunulmaz.','It is running in another app instance; it is not touched from here.')));
  if(row.recoverable)actions.append(button(L('Çıktıyı kurtar','Recover the output'),()=>recover(row.id),'btn btn-secondary btn-sm'));
  if(row.output.state==='valid'&&!['running','running-elsewhere'].includes(row.state))actions.append(button(L('Dinle (yalnız inceleme)','Listen (review only)'),()=>listen(row.id)));
  if(loadable===true)actions.append(button(L('Bu bölüme yükle','Load into this section'),()=>loadIntoSection(row.id),'btn btn-secondary btn-sm'));
  if(loadable===false)box.append(node('p','dub-run-note',L('Bu sonuç şu anki altyazı/aralık/kaynakla eşleşmiyor; yalnız dinlenebilir.','This result does not match the current subtitle/range/source; it can only be listened to.')));
  if(row.retryable){
   if(active)box.append(node('p','dub-run-note',L('Başka bir üretim çalışıyor; yeniden deneme önizlemesi bitince açılır.','Another production is running; retry previews open when it finishes.')));
   else for(const mode of ['pinned','current'])if(!previews[mode]||previews[mode].state==='closed')actions.append(button(MODES[mode].title()+'…',()=>preview(row.id,mode)));
  }
  if(row.unconfirmedOutput)box.append(node('p','dub-run-note',L('Ses dosyası var ama tamamlandığı kanıtlı değil: tamamlanmış sayılmaz, kurtarılamaz; yalnız dinlenebilir.','An audio file exists but its completion is unproven: it does not count as finished and cannot be recovered; it can only be listened to.')));
  if(actions.childElementCount)box.append(actions);
  const previewsBox=node('div','dub-run-previews');
  for(const mode of ['pinned','current'])if(previews[mode]&&previews[mode].state!=='closed')previewsBox.append(renderPreview(row,mode));
  if(previewsBox.childElementCount)box.append(previewsBox);
  return box;
 }
 const reasonText=code=>({'instance-gone':L('uygulama örneği kapandı','the app instance is gone'),'heartbeat-stale':L('bildirim durdu','it stopped reporting'),'legacy-record':L('eski kayıt','old record'),'instance-unknown':L('örnek bilgisi yok','no instance record'),'unsettled-in-this-session':L('bitiş kaydı yazılmadı','no final record was written'),'exit-after-complete':L('işçi tamamlandı dedi, sonra hata koduyla kapandı','the worker reported completion, then exited with an error')}[code]||'');
 function renderPreview(row,mode){
  const slot=previews[mode],panel=node('section','dub-run-preview');panel.dataset.preview=mode;panel.dataset.mode=mode;
  const heading=node('h5','',MODES[mode].title());heading.tabIndex=-1;panel.append(heading);
  if(slot.state==='loading'){panel.append(node('p','dub-run-note',L('Kaynak ve seçenekler doğrulanıyor…','Verifying the source and options…')));return panel;}
  if(slot.state==='refused'){
   panel.append(node('p','dub-run-message',slot.error||L('Önizleme açılamadı.','The preview could not be opened.')));if(slot.next)panel.append(node('p','dub-run-note',slot.next));
   const bar=node('div','dub-run-actions');bar.append(button(L('Yeniden önizle','Preview again'),()=>preview(row.id,mode)),button(L('Kapat','Close'),()=>dismissPreview(mode,row.id)));panel.append(bar);return panel;
  }
  const plan=slot.plan;panel.append(node('p','dub-run-note',MODES[mode].lead()));
  const facts=node('dl','dub-run-facts'),add=(k,v)=>{if(v===undefined||v===null||v==='')return;facts.append(node('dt','',k),node('dd','',v));};
  add(L('Kaynak ve iz','Source and track'),plan.source?.label+' · '+L('doğrulandı','verified'));add(L('Aralık','Range'),rangeText(plan.source?.range));
  add(L('Ses','Voice'),(plan.voice?.name||L('kayıtlı referans','saved reference'))+(plan.voice?.state==='changed'?' · '+L('değişti','changed'):' · '+L('aynı','same')));
  add(L('Profil','Profile'),(plan.mode==='current'?plan.current:plan.pinned)?.profile?valueText((plan.mode==='current'?plan.current:plan.pinned).profile):'');
  add(L('Sözlük','Dictionary'),plan.dictionary?plan.dictionary+L(' kayıt',' entries'):'');
  panel.append(facts);
  if(plan.differences?.length){const diff=node('ul','dub-run-diff');for(const item of plan.differences){const used=mode==='current'?item.current:item.pinned,other=mode==='current'?item.pinned:item.current;diff.append(node('li','',item.field==='voice'?fieldName('voice')+': '+L('referans değişti','reference changed'):fieldName(item.field)+': '+valueText(used)+' '+L('(kullanılacak)','(will be used)')+' · '+valueText(other)+' '+(mode==='current'?L('(özgün)','(original)'):L('(güncel)','(today)'))));}panel.append(node('p','dub-run-note',L('Özgün iş ile güncel ayarlar arasındaki anlamlı farklar:','Meaningful differences between the original run and today\'s settings:')),diff);}
  else panel.append(node('p','dub-run-note',L('Özgün seçenekler ile güncel ayarlar arasında anlamlı fark yok.','No meaningful difference between the original options and today\'s settings.')));
  for(const item of plan.unrebuildable||[])panel.append(node('p','dub-run-warn',part(item.text)));
  panel.append(node('p','dub-run-note',part(plan.determinism)));
  const tech=node('details','dub-run-tech');tech.append(node('summary','',L('Sürüm ayrıntıları','Version details')),node('p','',L('Deneme ','Attempt ')+plan.technical?.attempt+' · '+L('seçenek sürümü ','options ')+plan.technical?.optionsVersion+' · '+L('iz sürümü ','track ')+plan.technical?.trackVersion));panel.append(tech);
  const bar=node('div','dub-run-actions');
  const live=slot.token&&!slot.sending&&!['started','replayed'].includes(slot.status);
  const confirm=button(slot.sending?L('Gönderiliyor…','Sending…'):MODES[mode].confirm(),()=>approve(row.id,mode),'btn btn-primary btn-sm');confirm.dataset.mode=mode;confirm.disabled=!live;
  confirm.setAttribute('aria-label',MODES[mode].confirm()+' — '+MODES[mode].title());
  if(slot.status==='unknown'){confirm.textContent=L('Aynı onayı yeniden gönder (tek üretim)','Resend the same approval (one generation)');}
  bar.append(confirm);
  if(slot.status==='consumed')bar.append(button(L('Yeni önizleme','New preview'),()=>preview(row.id,mode)));
  else if(!['started','replayed','sending'].includes(slot.status))bar.append(button(L('Yeniden önizle','Preview again'),()=>preview(row.id,mode)));
  bar.append(button(L('Kapat','Close'),()=>dismissPreview(mode,row.id)));panel.append(bar);
  const status=node('p','dub-run-message');status.setAttribute('role','status');
  const lines={sending:L('İstek gönderiliyor…','Sending the request…'),started:L('Üretim başlatıldı; henüz tamamlanmadı. İlerleme ana üretim çubuğunda.','The generation was started; it is not finished yet. Progress is in the main production bar.'),
   replayed:L('Bu onay zaten kullanılmıştı: aynı üretim, yeniden başlatılmadı.','This approval was already used: the same generation, not started again.'),pending:L('Bu yeniden deneme zaten başlıyor.','This retry is already starting.'),busy:(slot.error||L('Başka bir üretim çalışıyor.','Another production is running.'))+' '+L('Bitince aynı düğme çalışır.','The same button works when it finishes.'),
   unknown:L('Sonuç bilinmiyor: uygulama yanıt vermedi. Başarılı da başarısız da sayılmadı. Durumu listeden kontrol et veya aynı onayı güvenle yeniden gönder.','Result unknown: the app did not answer. It is counted neither as success nor as failure. Check the list or safely resend the same approval.'),
   consumed:(slot.error||'')+' '+L('Bu onay tüketildi; yeni önizleme gerekir.','This approval is used up; a new preview is needed.')+(slot.next?' '+slot.next:'')}[slot.status];
  if(lines){status.textContent=lines;status.dataset.tone=['started','replayed'].includes(slot.status)?'ok':slot.status==='sending'?'info':'bad';panel.append(status);}
  return panel;
 }
 function render(){
  const attention=runs.filter(row=>['interrupted','uncertain','running','running-elsewhere','failed','partial','output-missing'].includes(row.state)).length;
  section.dataset.state=!loaded&&loading?'loading':listError&&!loaded?'error':loaded&&!runs.length?'empty':'ready';
  count.textContent=loaded?String(runs.length):'';count.hidden=!loaded;
  refreshButton.disabled=loading;refreshButton.textContent=loading?L('Yükleniyor…','Loading…'):L('Yenile','Refresh');
  const parts=[];
  if(listError)parts.push(loaded?L('Liste yenilenemedi; son geçerli liste gösteriliyor.','The list could not be refreshed; showing the last valid list.'):L('Çalışmalar okunamadı. Yenile’ye bas.','Runs could not be read. Press Refresh.'));
  if(extra.unreadable.length)parts.push(extra.unreadable.length+L(' kayıt okunamadı; dosyalar korunuyor, diğer çalışmalar kullanılabilir.',' record(s) could not be read; the files are kept and other runs stay usable.'));
  if(extra.orphans.length)parts.push(extra.orphans.length+L(' ses dosyasının iş kaydı yok; kaynakları ve zaman eksenleri bilinmediği için hiçbir şeye bağlanmaz.',' audio file(s) have no run record; their source and timeline are unknown, so nothing is attached.'));
  if(active)parts.push(L('Bir üretim çalışıyor; bitene kadar yeni üretim başlatılamaz.','A production is running; no new one can start until it finishes.'));
  say(parts.join(' '));
  const summary=section.querySelector('#dubRunsSummary');summary.textContent=attention?attention+L(' dikkat gerektiriyor',' need attention'):'';summary.hidden=!attention;
  const rows=runs.map(renderRow);
  if(!rows.length)rows.push(Object.assign(node('li','dub-run-empty',loading?L('Çalışmalar yükleniyor…','Loading runs…'):listError?'':L('Henüz kayıtlı bir üretim yok. Bir dublaj ürettiğinde burada görünür.','No saved productions yet. A dubbing you generate shows up here.')),{}));
  list.replaceChildren(...rows);
  list.setAttribute('aria-busy',loading?'true':'false');
 }
 // ---------- lifecycle ----------
 section.querySelector('#dubRunsRefresh').addEventListener('click',()=>void refresh());
 section.addEventListener('toggle',()=>{if(section.open&&!loaded&&!loading)void refresh();});
 const reset=()=>{epoch++;listSeq++;detailSeq++;closeDetail();for(const key of Object.keys(previews))previews[key]=null;pending.clear();messages.clear();sourceNotes.clear();render();};
 if(dialog){
  new MutationObserver(()=>{
   if(dialog.open){epoch++;void refresh();}      // a newly opened panel always shows the service's current truth
   else reset();                                   // closing drops everything in flight; the service keeps working
  }).observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 let timer=null;
 window.api.onDubEvent?.(event=>{
  // Progress and terminal events only trigger a re-read; their payload is never trusted for run state.
  if(!dialog?.open||!['start','done','error','cancelled'].includes(event?.type))return;
  clearTimeout(timer);timer=setTimeout(()=>void refresh(),250);
 });
 window.addEventListener('ui-locale:changed',()=>render());
 // Used by the assistant's "open this run": it only selects, lists or previews; it never approves, recovers or plays.
 async function focusRun(id,target){
  if(!dialog?.open)return {ok:false,code:'closed'};
  section.open=true;await refresh();
  if(!runs.some(row=>row.id===id))return {ok:false,code:'unknown-run'};
  if(selected!==id)await select(id);else await reloadDetail(id);
  if(selected!==id||detailState!=='ready')return {ok:false,code:'detail-unavailable',message:L('Ayrıntılar yüklenemedi.','Details could not be loaded.')};
  const out={ok:true,selected:true};
  if(target==='result'){await listen(id);out.audioReady=!!audio&&audio.paused!==false&&audio.autoplay===false;out.ok=out.audioReady;if(!out.ok)out.message=messages.get(id)?.text||'';}
  if(target==='retry_preview'){await preview(id,'pinned');out.previewReady=previews.pinned?.state==='ready';out.ok=out.previewReady;if(!out.ok)out.message=previews.pinned?.error||'';}
  return out;
 }
 window.DubRunsUI=Object.freeze({refresh,select,focusRun,state:()=>({epoch,runs:runs.map(row=>row.id),selected,active})});
 render();
})();
