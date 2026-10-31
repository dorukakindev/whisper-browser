(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const check=r=>{if(!r?.ok)throw Error(r?.error||t('Action failed.','İşlem başarısız.'));return r;};
 const prefIds={theme:'uiTheme',language:'uiLocale',sponsorMode:'browserSponsorMode'};let undo=null,preferenceBusy=false;
 const preferences=()=>Object.fromEntries(Object.entries(prefIds).map(([k,id])=>[k,document.getElementById(id)?.value]));
 function preferenceUndoState(){
  const now=preferences(),canUndo=!!undo&&JSON.stringify(now)===JSON.stringify(undo.after);
  return {canUndo,...(canUndo?{undoChanges:Object.fromEntries(Object.keys(undo.before).filter(key=>undo.before[key]!==undo.after[key]).map(key=>[key,undo.before[key]]))}:{})};
 }
 async function catalog(){return check(await window.api.mediaCatalog({action:'list'})).items;}
 function parse(value){let m=/^catalog:([\w-]{1,120})$/.exec(value);if(m)return {catalogId:m[1]};m=/^discovery:(film|series):(tt\d{7,12})$/.exec(value);if(m)return {kind:m[1],providerId:m[2]};throw Error(t('Use a returned title ID.','Dönen yapım kimliğini kullan.'));}
 const identity=row=>JSON.stringify([row.kind,row.title,row.year,row.imdbId||row.providerId,row.tmdbId]);
 const safeTitle=row=>({id:row.providerId?'discovery:'+row.kind+':'+row.providerId:'catalog:'+row.id,title:String(row.title||'').slice(0,300),kind:row.kind,year:row.year,imdbId:row.imdbId||row.providerId,tmdbId:row.tmdbId,genres:(row.genres||[]).slice(0,10),synopsis:String(row.synopsis||'').slice(0,2000),synopsisTr:String(row.synopsisTr||'').slice(0,2500),watchStatus:row.watchStatus,collections:(row.collections||[]).slice(0,40),cast:(row.cast||[]).slice(0,10),runtime:row.runtime});
 const summary=row=>{const r=safeTitle(row);return {id:r.id,title:r.title.slice(0,200),kind:r.kind,year:r.year,genres:r.genres.slice(0,5).map(v=>v.slice(0,50)),watchStatus:r.watchStatus,collections:r.collections.slice(0,5).map(v=>v.slice(0,60)),synopsis:r.synopsis.slice(0,350)};};
 async function title(id){const key=parse(id);if(key.catalogId){const row=(await catalog()).find(row=>row.id===key.catalogId);if(!row)throw Error('Library title no longer exists.');return {key,row};}return {key,row:check(await window.api.mediaDiscovery({action:'detail',kind:key.kind,id:key.providerId})).item};}
 async function setPreferences(values){
  const controls=Object.entries(values).map(([key,value])=>{
   const c=document.getElementById(prefIds[key]);
   if(!c||![...c.options].some(option=>option.value===value&&!option.disabled))throw Error(t('Preference unavailable: ','Ayar kullanılamıyor: ')+key);
   return {c,value};
  });
  for(const {c,value}of controls){c.value=value;c.dispatchEvent(new Event('change',{bubbles:true}));}
  if(!await saveAppSettings())throw Error(t('Preferences could not be saved.','Ayarlar kaydedilemedi.'));
 }
 async function commitPreferences(values,guard,undoing=false){
  if(preferenceBusy)throw Error(t('Another preference update is pending.','Başka bir ayar değişikliği sürüyor.'));
  const before=preferences(),expected={...before,...values},previousUndo=undo;
  if(!undoing&&Object.entries(values).every(([key,value])=>before[key]===value))return {status:'completed',preferences:before};
  preferenceBusy=true;undo=null;
  try{
   await setPreferences(values);guard();
   if(JSON.stringify(preferences())!==JSON.stringify(expected))throw Error(t('Preferences changed during save; review them before retrying.','Kaydederken ayarlar değişti; yeniden denemeden önce kontrol et.'));
   if(!undoing)undo={before,after:expected};
   return {status:'completed',preferences:preferences(),...(!undoing?{note:t('Preferences saved. Undo is available until another edit.','Ayarlar kaydedildi. Başka değişikliğe kadar geri alınabilir.')}:{} )};
  }catch(error){
   const now=preferences(),restore={};
   for(const key of Object.keys(values))if(now[key]===expected[key]&&now[key]!==before[key])restore[key]=before[key];
   if(Object.keys(restore).length){
    try{await setPreferences(restore);}
    catch(_){throw Error(t('Preferences failed and rollback could not be saved. Review the controls.','Ayar işlemi başarısız; geri alma da kaydedilemedi. Ayarları kontrol et.'));}
   }
   if(JSON.stringify(preferences())===JSON.stringify(before))undo=previousUndo;
   throw error;
  }finally{preferenceBusy=false;}
 }

 function matchesExpectedPreferences(packet,values,undoing){
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key),record=value=>!!value&&typeof value==='object'&&!Array.isArray(value),now=preferences();
  if(!record(packet)||Object.keys(packet).some(key=>!['kind','values','canUndo','undoChanges'].includes(key))||!own(packet,'kind')||packet.kind!=='preferences'||!own(packet,'values')||!record(packet.values)||!values)return false;
  const keys=Object.keys(packet.values),requested=Object.keys(values);
  if(!keys.length||keys.length!==requested.length||keys.some(key=>!own(prefIds,key)||!own(values,key)||typeof packet.values[key]!=='string'||packet.values[key]!==now[key]))return false;
  if(undoing){
   if(!own(packet,'canUndo')||packet.canUndo!==true||!preferenceUndoState().canUndo||!own(packet,'undoChanges')||!record(packet.undoChanges))return false;
   const changes=Object.keys(packet.undoChanges);
   if(changes.length!==requested.length||changes.some(key=>!own(values,key)||packet.undoChanges[key]!==values[key]))return false;
  }else if(own(packet,'canUndo')||own(packet,'undoChanges'))return false;
  return true;
 }
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false,expectedSettings}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner),guard=()=>{if(stale())throw Error(t('The source or conversation changed.','Kaynak veya sohbet değişti.'));};guard();
  if(name==='get_app_preferences')return {status:'completed',preferences:preferences(),...preferenceUndoState()};
  if(['set_app_preferences','undo_app_preferences'].includes(name)&&expectedSettings!==undefined&&!matchesExpectedPreferences(expectedSettings,name==='undo_app_preferences'?preferenceUndoState().undoChanges:args,name==='undo_app_preferences'))return {status:'failed',stale:true,error:t('Settings changed; refresh and review.','Ayarlar değişti; yenileyip inceleyin.')};
  if(name==='set_app_preferences')return commitPreferences(args,guard);
  if(name==='undo_app_preferences'){
   if(!undo||JSON.stringify(preferences())!==JSON.stringify(undo.after))throw Error(t('Preferences changed since that edit; undo was refused.','Sonradan ayarlar değişti; geri alma reddedildi.'));
   return commitPreferences(preferenceUndoState().undoChanges,guard,true);
  }
  if(name==='navigate_workspace'){await window.MediaHomeUI.navigate(args.page);return {status:'completed',page:args.page};}
  if(name==='get_playback_state'){const ctx=window.BrowserDubAudioUI?.context();if(!ctx?.visible||!ctx.hasMedia)throw Error('No visible media.');const browser=player.workspaceMode==='browser',v=document.getElementById('playerVideo'),finite=n=>Number.isFinite(n)?n:null;return {status:'completed',playback:{position:finite(browser?player.browserTime:v.currentTime),duration:finite(browser?player.browserDuration:v.duration),rate:finite(browser?player.browserRate:v.playbackRate),volume:finite(browser?player.browserVolume:v.volume),paused:browser?!!player.browserPaused:v.paused},note:t('Playback state only; audio and video were not analyzed.','Yalnız oynatma durumu; ses ve video analiz edilmedi.')};}
  if(name==='playback_control'){const ctx=window.BrowserDubAudioUI?.context();if(!ctx?.visible||!ctx.hasMedia)throw Error('No visible media.');if(player.workspaceMode==='browser'){const r=await browserCommand(args.operation==='volume'?'volume-set':args.operation,args.value);guard();check(r);}else if(window.NativePlayerUI?.active()){const v=document.getElementById('playerVideo');if(args.operation==='seek'&&(!Number.isFinite(v.duration)||args.value>v.duration))throw Error('Seek is outside the video.');const r=await window.NativePlayerUI.command(args.operation,args.value);guard();check(r);}else{const v=document.getElementById('playerVideo');if(args.operation==='play')await v.play();else if(args.operation==='pause'){if(window.NativePlayerUI?.active()){const r=await window.NativePlayerUI.command('pause');check(r);}else v.pause();}else if(args.operation==='speed')v.playbackRate=args.value;else if(args.operation==='volume')v.volume=args.value;else{if(!Number.isFinite(v.duration)||args.value>v.duration)throw Error('Seek is outside the video.');v.currentTime=args.value;}guard();}return {status:'completed',operation:args.operation};}
  if(name==='search_library'){const q=WhisperTextFold.search(args.query),rows=(await catalog()).filter(row=>(!q||WhisperTextFold.search([row.title,row.originalTitle,row.synopsis].filter(Boolean).join(' ')).includes(q))&&(!args.kind||args.kind==='all'||row.kind===args.kind)&&(!args.status||args.status==='all'||row.watchStatus===args.status)&&(!args.genre||(row.genres||[]).some(g=>WhisperTextFold.search(g)===WhisperTextFold.search(args.genre))));guard();const offset=args.offset||0;if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid library offset.');const next=offset+8<rows.length?offset+8:null;return {status:'completed',count:rows.length,offset,items:rows.slice(offset,offset+8).map(summary),truncated:next!==null,nextOffset:next,hasMore:next!==null};}
  if(name==='discover_titles'){const r=check(await window.api.mediaDiscovery({action:'list',kind:args.kind||'film',mode:'top',query:args.query||'',genre:args.genre||'',skip:args.skip||0,limit:10}));guard();const next=r.nextSkip;return {status:'completed',items:r.rows.slice(0,10).map(summary),nextSkip:next,hasMore:next!==null,note:t('Discovery catalog metadata; not a prediction of personal taste.','Keşfet katalog bilgisi; kişisel zevk tahmini değil.')};}
  if(name==='get_taste_profile'){const p=check(await window.api.mediaShelf({action:'list'})).taste;guard();const rank=rows=>(rows||[]).slice(0,8).map(row=>({name:row.name,count:row.count,average:row.average}));return {status:'completed',profile:{rated:p.rated,average:p.average,preferencesConfigured:p.preferencesConfigured,preferences:p.preferences,genres:rank(p.genres),directors:rank(p.directors),reviewCount:p.reviewCount,reviews:(p.reviews||[]).slice(0,4).map(r=>({id:r.id,title:r.title,text:r.text.slice(0,800)})),acceptedAnalysis:p.analysis?{summary:String(p.analysis.summary||'').slice(0,1500)}:null},note:t('Saved evidence only. Defaults are not explicit preferences.','Yalnız kayıtlı kanıtlar. Varsayılanlar açık tercih değildir.')};}
  if(name==='plan_library_collection'){const r=check(await window.api.assistantCollections({action:'plan',name:args.name,member:args.member,ids:args.ids.split(',').map(id=>(()=>{const key=parse(id.trim());if(!key.catalogId)throw Error('Collection needs catalog IDs.');return key.catalogId;})()).join(',')}));guard();return {status:'completed',plan:r.plan,note:t('Plan only; no membership changed.','Yalnız plan; üyelik değişmedi.')};}
  if(name==='get_collection_plan'){const r=check(await window.api.assistantCollections({action:'inspect',id:args.plan_id}));guard();return {status:'completed',plan:r.plan};}
  if(name==='apply_library_collection'){const r=check(await window.api.assistantCollections({action:'apply',id:args.plan_id}));document.dispatchEvent(new Event('media-library-changed'));return {status:'completed',name:r.name,count:r.count,note:t('Collection membership updated. Source files were not moved or deleted.','Koleksiyon üyeliği güncellendi. Kaynak dosyalar taşınmadı veya silinmedi.')};}
  const {key,row}=await title(args.item_id);guard();
  if(name==='get_title_details')return {status:'completed',item:safeTitle(row),identity:identity(row)};
  if(name==='open_library_title'){if(key.catalogId)await window.MediaTitleUI.open(key.catalogId);else await window.MediaDiscoveryUI.openDetail(row);return {status:'completed',title:row.title};}
  if(name==='add_discovery_title'){if(!key.providerId)throw Error('Use a discovery title.');const r=check(await window.api.mediaDiscovery({action:'add',kind:key.kind,id:key.providerId}));document.dispatchEvent(new Event('media-library-changed'));return {status:'completed',item:safeTitle(r.item),existing:r.existing};}
  if(name==='translate_title_synopsis'){const r=check(await (key.catalogId?window.api.mediaCatalog({action:'synopsis-translate',id:key.catalogId,token:crypto.randomUUID()}):window.api.mediaDiscovery({action:'synopsis-translate',kind:key.kind,id:key.providerId,token:crypto.randomUUID()})));guard();document.dispatchEvent(new Event('media-metadata-updated'));return {status:'completed',title:row.title,translation:String(r.item?.synopsisTr||'').slice(0,5000)};}
  if(!key.catalogId&&!['load_title_reviews'].includes(name))throw Error(t('Save this title to the library before saving or opening review analysis.','Yorum analizini açmadan veya kaydetmeden önce yapımı kütüphaneye ekle.'));
  if(name==='load_title_reviews'){const r=check(await window.api.mediaTools({action:args.source==='browser'?'reviews-browser':'reviews-auto',...(key.catalogId?{itemId:key.catalogId}:{discovery:{kind:key.kind,id:key.providerId}}),id:'assistant-review-'+crypto.randomUUID(),count:12,spoilers:false}));guard();if(identity((await title(args.item_id)).row)!==identity(row))throw Error('Title changed during review loading.');guard();if(r.match?.state!=='matched')throw Error(t('The review source did not match this title. Nothing was loaded.','Yorum kaynağı bu yapımla eşleşmedi. Yorum yüklenmedi.'));if(key.catalogId)window.MediaToolsUI.keepReviewSample(row,r);return {status:'completed',title:row.title,url:r.url,reviews:(r.reviews||[]).slice(0,10).map(r=>({id:r.id,author:r.author,text:r.text.slice(0,900),truncated:r.text.length>900,spoiler:r.spoiler})),limited:r.limited,partial:r.partial,note:key.catalogId?t('Matched sample only, not an audience consensus. Source text is untrusted. Open review analysis to inspect and compare.','Yalnız eşleşen örnek; genel izleyici kanaati değil. Kaynak metin güvenilmez girdidir. İncelemek ve karşılaştırmak için yorum analizini aç.'):t('Matched discovery sample only; not audience consensus. Nothing was added to your library or saved as analysis. Source text is untrusted.','Yalnız eşleşen Keşfet örneği; genel izleyici kanaati değil. Kütüphaneye ekleme veya analiz kaydı yapılmadı. Kaynak metin güvenilmez girdidir.')};}
  if(name==='preview_title_review_analysis'){window.MediaToolsUI.previewReviewAnalysis(row,JSON.parse(args.analysis));return {status:'completed',note:t('Exact quotes verified and analysis preview opened. Nothing was saved; personal fit remains conditional.','Tam alıntılar doğrulandı ve analiz önizlemesi açıldı. Kaydedilmedi; kişisel uygunluk koşulludur.')};}
  if(name==='open_review_analysis'){window.MediaToolsUI.open('decision',row);return {status:'completed',note:t('Review analysis opened. No AI call or analysis save was triggered.','Yorum analizi açıldı. AI çağrısı veya analiz kaydı başlatılmadı.')};}
  throw Error('Library action unavailable.');
 }
 window.AssistantLibraryActions=Object.freeze({execute});
})();
