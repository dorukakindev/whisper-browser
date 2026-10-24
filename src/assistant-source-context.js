(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AssistantSourceContext=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function pageKey(value){
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';url.username='';url.password='';
   for(const key of [...url.searchParams.keys()])if(/^(?:utm_|fbclid$|gclid$|si$)/i.test(key))url.searchParams.delete(key);
   if(!/^#[!\/]/.test(url.hash))url.hash='';
   const source=url.href;let a=2166136261,b=5381;for(let i=0;i<source.length;i++){a=Math.imul(a^source.charCodeAt(i),16777619);b=Math.imul(b,33)^source.charCodeAt(i);}return (a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+source.length;
  }catch{return '';}
 }
 function conversation(player,selection){
  if(selection)return JSON.stringify(['global',selection.workspace,selection.page,selection.id,selection.chapter]);
  if(player.workspaceMode==='browser'&&player.browserMediaSeen&&player.mediaKey)return JSON.stringify([player.workspaceMode,player.mediaKey]);
  const page=player.workspaceMode==='browser'&&pageKey(player.browserPageUrl);return page?JSON.stringify(['browser-page',page]):JSON.stringify([player.workspaceMode,player.mediaKey]);
 }
 function scope(player,selection,tab){
  if(selection)return JSON.stringify(['global',selection.workspace,selection.page,selection.id,selection.catalogId,selection.chapter,selection.title,selection.synopsis]);
  return JSON.stringify([player.workspaceMode,player.mediaKey,player.generation,player.browserActiveTabId,player.workspaceMode==='browser'?tab?.generation:null,player.workspaceMode==='browser'?pageKey(player.browserPageUrl):null]);
 }
 return Object.freeze({pageKey,conversation,scope});
});
