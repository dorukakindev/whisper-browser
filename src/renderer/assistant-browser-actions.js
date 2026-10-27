(() => {
 'use strict';
 const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en,check=r=>{if(!r?.ok)throw Error(r?.error||t('Browser action failed.','Tarayıcı işlemi başarısız.'));return r;};
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const stale=()=>isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner),guard=()=>{if(stale())throw Error(t('The source changed.','Kaynak değişti.'));};guard();const state=check(await window.api.getBrowserState());guard();
  const tabs=(state.tabs||[]).map(row=>({id:row.id,title:String(row.title||'').slice(0,180),active:row.id===state.activeTabId,pinned:!!row.pinned}));
  if(name==='get_browser_tabs')return {status:'completed',tabs:tabs.slice(0,50),activeTabId:state.activeTabId,note:t('Tab identities only; background pages were not read.','Yalnız sekme kimlikleri; arka plan sayfaları okunmadı.')};
  let result;
  if(['select_tab','close_tab'].includes(args.operation)){if(!tabs.some(row=>row.id===args.tab_id))throw Error('Unknown current tab.');result=args.operation==='select_tab'?await window.api.activateBrowserTab(args.tab_id):await window.api.closeBrowserTab(args.tab_id,false);}
  else if(args.operation==='new_tab')result=await window.api.createBrowserTab();
  else if(args.operation==='open_url'){let tabId=state.activeTabId;if(!tabId){const created=check(await window.api.createBrowserTab());tabId=created.activeTabId||created.tab?.id;guard();}document.getElementById('openPlayer')?.click();result=await window.api.navigateBrowser(tabId,args.url);}
  else{const command={back:'back',forward:'forward',reload:'reload',find:'find',zoom:'zoom-set'}[args.operation];if(args.operation==='back'&&!state.canGoBack||args.operation==='forward'&&!state.canGoForward)throw Error(t('No history in that direction.','Bu yönde geçmiş yok.'));result=await window.api.browserCommand(state.activeTabId,command,args.operation==='find'?{text:args.text,token:Date.now(),next:false,forward:true}:args.value);}
  check(result);return {status:'completed',operation:args.operation,note:t('The browser action was confirmed. A navigation or closed tab changes assistant context; read the new source before the next task.','Tarayıcı işlemi doğrulandı. Gezinme veya sekme kapanması asistan bağlamını değiştirir; sonraki işlemden önce yeni kaynağı oku.')};
 }
 window.AssistantBrowserActions=Object.freeze({execute});
})();
