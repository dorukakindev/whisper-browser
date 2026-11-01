(() => {
 'use strict';
 let active=false;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const checkedIds=detail=>{if(!Array.isArray(detail?.ids)||!detail.ids.length||detail.ids.length>3||detail.ids.some(id=>typeof id!=='string'||!id||id.length>200))throw Error(t('Choose one to three Content Network sources.','Bir ila üç İçerik Ağı kaynağı seç.'));return [...new Set(detail.ids)];};
 async function request(action,values){const result=await window.api.recallRequest({action,...values});if(!result?.ok)throw Error(result?.error||t('Content Network request failed.','İçerik Ağı işlemi başarısız.'));return result;}
 async function ask(detail={}){
  const ids=checkedIds(detail),prepared=await request('context',{ids,scopes:detail.scopes||{}});
  return window.AssistantFeedSources.attachPrepared(prepared,{page:'recall',ids,prompt:detail.prompt||t('Explain only these selected Content Network sources. Cite their supplied R IDs. Distinguish metadata, quoted evidence and uncertainty. Graph links do not prove personal preferences.','Yalnız seçili İçerik Ağı kaynaklarını açıkla. Verilen R kimlikleriyle kaynak göster. Metadata, alıntı kanıtı ve belirsizliği ayır. Ağ bağlantısı kişisel beğeni kanıtı değildir.')});
 }
 async function analyze(detail={}){
  if(active||window.AssistantAgentUI?.busy?.())throw Error(t('Wait for the current assistant analysis.','Geçerli asistan analizini bekle.'));
  if(!['knowledge','taste'].includes(detail.mode))throw Error(t('Choose knowledge or explicit-like analysis.','Bilgi veya açık beğeni analizini seç.'));
  const ids=checkedIds(detail);active=true;
  try{
   const prepared=await request('analysis-prepare',{ids,mode:detail.mode,scopes:detail.scopes||{}}),evidence=window.AssistantRecallContract.normalize(prepared);
   const question=detail.mode==='taste'?t('Propose cautious taste hypotheses in this one domain: positive support only from explicit likes, selected dislike/mixed sources only as counter-evidence. Use exact source quotes; do not infer sensitive attributes. Save only proposals for review.','Bu tek alanda temkinli zevk hipotezleri öner: olumlu destek yalnız açık beğeniden, seçili olumsuz/karışık tepkiler yalnız karşı kanıt olsun. Birebir kaynak alıntıları kullan; hassas kişisel özellik çıkarma. Yalnız inceleme önerileri hazırla.'):t('Extract source-supported entities and knowledge relationships from these selected snapshots. Metadata is not the full work. Do not infer preferences. Save only proposals for review.','Seçili anlık görüntülerden kaynakla desteklenen varlık ve bilgi ilişkilerini çıkar. Metadata tam eser değildir. Beğeni çıkarımı yapma. Yalnız inceleme önerileri hazırla.');
   const context=await window.AssistantFeedSources.attachPrepared(prepared,{page:'recall',ids,prompt:question,recallAnalysis:evidence}),owner=window.AssistantAppActions.snapshot(),scope=aiSourceScope();
   const result=await window.AssistantAgentUI.send(question,context,[],scope,null,{responseContract:'recall-analysis'});
   if(!result?.ok)throw Error(result?.error||t('Analysis was not completed.','Analiz tamamlanmadı.'));
   if(!window.AssistantAppActions.current(owner)||window.AssistantFeedSources.context()?.id!==context.id)throw Error(t('The selected source scope changed. Analysis was not saved.','Seçili kaynak kapsamı değişti. Analiz kaydedilmedi.'));
   const analysis=window.AssistantRecallContract.parseAnswer(result.text,evidence);
   // The original explicit Analyze click authorizes creating review proposals.
   // The main Recall service rechecks source/reaction revisions and exact quotes;
   // nothing here accepts an assertion, changes a like, or marks content watched.
   const saved=await request('analysis-commit',{token:prepared.token,result:analysis,model:typeof assistantProviderSelection==='function'?String(assistantProviderSelection().model||'').slice(0,200):''});
   document.dispatchEvent(new Event('media-recall-updated'));document.dispatchEvent(new CustomEvent('media-recall-analysis-complete',{detail:{mode:detail.mode}}));
   if(typeof osd==='function')osd(t('Source-verified analysis saved as proposals for review.','Kaynağı doğrulanan analiz inceleme önerileri olarak kaydedildi.'));return saved;
  }finally{active=false;}
 }
 async function reveal(nodeId){
  if(typeof nodeId!=='string'||!nodeId||nodeId.length>200)throw Error(t('Source node is unavailable.','Kaynak düğüm bulunamadı.'));
  const {node}=await request('node',{id:nodeId});if(!node)throw Error(t('Source node is unavailable.','Kaynak düğüm bulunamadı.'));
  if(window.MediaHomeUI?.openRecallNode)return window.MediaHomeUI.openRecallNode(nodeId);
  // Meaningful safe fallback while the main page is in another workspace.
  const dialog=document.createElement('dialog');dialog.className='mx-dialog media-surface';const heading=document.createElement('h2'),scope=document.createElement('p'),body=document.createElement('p'),close=document.createElement('button');heading.textContent=node.title||t('Content Network source','İçerik Ağı kaynağı');scope.textContent=String(node.scope||'')+' · '+t('Original source node; not a new model assertion.','Özgün kaynak düğümü; yeni model iddiası değildir.');body.className='rn-snippet';body.textContent=String(node.text||'').slice(0,10000);close.type='button';close.className='mh-action';close.textContent=t('Close','Kapat');close.onclick=()=>dialog.close();dialog.append(heading,scope,body,close);dialog.onclose=()=>{dialog.remove();if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();};document.body.append(dialog);dialog.showModal();if(typeof syncBrowserOcclusion==='function')void syncBrowserOcclusion();
 }
 const fail=error=>{if(typeof osd==='function')osd(error.message);document.dispatchEvent(new CustomEvent('media-recall-assistant-error',{detail:{message:String(error.message)}}));};
 document.addEventListener('media-recall-assistant',event=>{void ask(event.detail).catch(fail);});
 document.addEventListener('media-recall-analysis',event=>{void analyze(event.detail).catch(fail);});
 window.AssistantRecallSources=Object.freeze({ask,analyze,reveal,busy:()=>active});
})();
