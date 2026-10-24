(() => {
 'use strict';
 let pending=null;
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;
 const changed=()=>document.dispatchEvent(new Event('assistant-page-task-changed'));
 const isCurrent=task=>task.scope===aiSourceScope()&&task.thread===window.AssistantWorkspace?.activeId();
 function status(){return pending&&isCurrent(pending)?pending:null;}
 async function handle(question){
  const intent=window.AssistantPageIntent?.match(question);
  if(!intent||globalAssistantContext()||player.workspaceMode!=='browser'||!player.browserActiveTabId||!/^https?:/i.test(player.browserPageUrl||''))return false;
  if(pending)return false;
  const task={scope:aiSourceScope(),thread:window.AssistantWorkspace?.activeId(),tabId:player.browserActiveTabId,cancelled:false};
  aiChatAdd('user',question);
  task.job={chatQuestion:question,chatContext:{},bubble:aiChatAdd('ai',t('Starting page translation…','Sayfa çevirisi başlatılıyor…'),'is-loading')};
  pending=task;window.AssistantWorkspace?.begin(task.job);changed();
  let message='',state='complete';
  try{
   const result=await handleBrowserPageTranslationAction({ensureVisible:true,targetLanguage:intent.targetLanguage||undefined,isCancelled:()=>task.cancelled||!isCurrent(task)});
   if(task.cancelPromise)await task.cancelPromise;
   if(task.cancelled&&!task.cancelSucceeded){state='failed';message=task.cancelError||t('Page translation could not be stopped. Check the page toolbar.','Sayfa çevirisi durdurulamadı. Sayfa araç çubuğunu kontrol et.');}
   else if(task.cancelled){state='stopped';message=t('Page translation stopped. You can start it again from the page toolbar.','Sayfa çevirisi durduruldu. Sayfa araç çubuğundan yeniden başlatabilirsin.');}
   else if(!isCurrent(task)){state='stopped';message=t('The source changed. The result belongs to the previous page.','Kaynak değişti. İşlem önceki sayfaya aittir.');}
   else if(!result?.ok&&!result?.partial){state='failed';message=result?.error||t('Page translation could not start.','Sayfa çevirisi başlatılamadı.');}
   else if(result?.running)message=t('Page translation is already running; I kept it running. Follow its progress in the page toolbar.','Sayfa çevirisi zaten çalışıyor; durdurmadım. İlerlemeyi sayfa araç çubuğundan takip edebilirsin.');
   else if(result?.shown)message=t('The existing page translation is now visible. The original is available from the page toolbar.','Hazır sayfa çevirisi gösteriliyor. Sayfa araç çubuğundan özgün metne dönebilirsin.');
   else if(result?.partial||result?.failed>0||result?.completion?.pending>0)message=t('Page translation is partial. Translated blocks are visible on the page; inspect pending or failed blocks in the page translation report.','Sayfa kısmen çevrildi. Çevrilen bloklar sayfada görünüyor; kalan veya başarısız blokları sayfa çeviri raporundan inceleyebilirsin.');
   else message=t('Page translation is ready on the page. Use the page toolbar to compare it with the original.','Sayfa çevirisi sayfanın üzerinde hazır. Sayfa araç çubuğundan özgün metinle karşılaştırabilirsin.');
  }catch(error){state='failed';message=String(error?.message||t('Page translation failed.','Sayfa çevirisi başarısız oldu.'));}
  finally{
   task.job.bubble.classList.remove('is-loading');if(state!=='complete')task.job.bubble.classList.add('ai-msg-err');task.job.bubble.textContent=message;
   window.AssistantWorkspace?.finish(task.job,message,state);if(pending===task)pending=null;changed();
  }
  return true;
 }
 async function cancel(){const task=status();if(!task||task.cancelPromise)return;task.cancelled=true;task.cancelPromise=(async()=>{const result=await window.api.clearBrowserPageTranslation(task.tabId).catch(()=>null);task.cancelSucceeded=!!result?.ok;if(!task.cancelSucceeded)task.cancelError=result?.error||t('Stopping failed. Check the page toolbar.','Durdurma başarısız. Sayfa araç çubuğunu kontrol et.');changed();})();await task.cancelPromise;}
 document.addEventListener('browser-page-translation-changed',()=>{const task=status();if(!task||task.cancelled)return;const message=player.browserPagePaused?t('Page translation paused. Resume from the page toolbar.','Sayfa çevirisi duraklatıldı. Sayfa araç çubuğundan sürdürebilirsin.'):t('Translating the page','Sayfa çevriliyor')+' · '+player.browserPageTranslated+' '+t('blocks ready','blok hazır');task.job.bubble.textContent=message;window.AssistantWorkspace?.partial(task.job,message);changed();});
 window.AssistantPageCommands=Object.freeze({handle,cancel,status,busy:()=>!!pending});
})();
