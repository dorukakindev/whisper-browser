(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 let pending=null;
 const changed=()=>document.dispatchEvent(new Event('assistant-media-task-changed'));
 const current=task=>task.scope===aiSourceScope()&&task.thread===window.AssistantWorkspace?.activeId();
 async function handle(question){
  const intent=window.AssistantMediaIntent?.match(question);if(!intent)return false;if(pending)return false;
  const context=globalAssistantContext(),task={scope:aiSourceScope(),thread:window.AssistantWorkspace?.activeId(),cancelled:false};pending=task;changed();
  aiChatAdd('user',question);const job={chatQuestion:question,chatContext:{},bubble:aiChatAdd('ai',t('Checking the selected title…','Seçili yapım kontrol ediliyor…'),'is-loading')};window.AssistantWorkspace?.begin(job);
  let message='',status='complete';
  try{
   if(!context||context.type!=='library-title')throw Error(t('Open a library film or series first so I can use the exact title.','Doğru yapımı kullanabilmem için önce kütüphaneden bir film veya dizi aç.'));
   const id=context.catalogId||context.id;const catalog=await window.api.mediaCatalog({action:'list'});if(!catalog?.ok)throw Error(catalog?.error||t('Library unavailable.','Kütüphane okunamadı.'));
   const item=catalog.items.find(row=>row.id===id);if(!item)throw Error(t('This selection no longer identifies a library title. Open its title page again.','Seçim artık bir kütüphane kaydını tanımlamıyor. Yapım sayfasını yeniden aç.'));
   if(intent.question&&!window.AssistantMediaIntent.selectedRequest(intent.question,item.title))throw Error(t('This command can use the selected title only. Open the intended film page first.','Bu komut yalnız seçili yapımı kullanabilir. Önce istediğin film sayfasını aç.'));
   const guard=()=>{if(task.cancelled||!current(task))throw Error(t('The selection changed or the command was cancelled.','Seçim değişti veya komut iptal edildi.'));};guard();
   const request=async(action,values={})=>{const r=await window.api.mediaCatalog({action,id:item.id,...values});if(!r?.ok)throw Error(r?.error||t('The action failed.','İşlem başarısız oldu.'));return r;};
   if(intent.kind==='watchlist'){
    if(item.watchStatus==='watching'||item.watchStatus==='completed')message=t('This title is already being watched or marked watched. Its status was kept.','Bu yapım izleniyor veya izlendi olarak kayıtlı. Mevcut durumu korudum.');
    else{await request('save',{item:{id:item.id,watchStatus:'planned'}});message=t('Added to your watchlist: ','İzleme listene eklendi: ')+item.title;document.dispatchEvent(new Event('media-library-changed'));}
   }else if(intent.kind==='similar'){
    const result=await request('metadata-recommendations',{page:1});guard();
    message=result.rows.length?t('TMDB recommendations for ','Şu yapım için TMDB önerileri: ')+item.title+'\n\n'+result.rows.slice(0,5).map(r=>'• '+r.title+(r.year?' ('+r.year+')':'')).join('\n')+'\n\n'+t('These are TMDB recommendations, not a personal taste prediction. Open the title page to preview and add them.','Bunlar TMDB önerileridir; kişisel zevk tahmini değildir. Yapım sayfasında inceleyip ekleyebilirsin.'):t('TMDB returned no recommendations for this title.','TMDB bu yapım için öneri döndürmedi.');
   }else{
    const result=await request('metadata-watch',intent.region?{region:intent.region}:{});guard();
    const labels={flatrate:t('Subscription','Abonelik'),free:t('Free','Ücretsiz'),ads:t('With ads','Reklamlı'),rent:t('Rent','Kiralama'),buy:t('Buy','Satın alma')};
    const lines=Object.entries(result.watch.groups).filter(([,rows])=>rows.length).map(([key,rows])=>(labels[key]||key)+': '+rows.map(r=>r.name).join(', '));
    message=item.title+' · '+result.watch.region+'\n\n'+(lines.join('\n')||t('No availability information in the selected country. I did not substitute another country.','Seçili ülke için izleme bilgisi yok. Başka ülke sonuçları kullanmadım.'))+'\n\n'+t('Source: JustWatch / TMDB. Availability can change; this does not start playback.','Kaynak: JustWatch / TMDB. Erişim bilgisi değişebilir; bu işlem oynatma başlatmaz.');
   }
  }catch(error){status=task.cancelled||!current(task)?'stopped':'failed';message=String(error?.message||t('Action failed.','İşlem başarısız oldu.'));}
  finally{job.bubble.classList.remove('is-loading');if(status!=='complete')job.bubble.classList.add('ai-msg-err');job.bubble.textContent=message;window.AssistantWorkspace?.finish(job,message,status);if(pending===task)pending=null;changed();}
  return true;
 }
 window.AssistantMediaCommands=Object.freeze({handle,busy:()=>!!pending,status:()=>pending&&current(pending)?pending:null,cancel:()=>{if(pending)pending.cancelled=true;}});
})();
