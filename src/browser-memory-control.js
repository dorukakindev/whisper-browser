'use strict';
const {browserTabUnloadDecision}=require('./browser-tab-resources');
function createBrowserMemoryReclaimer({tabs,activeId,unload,now=Date.now}){let pending=null;
 function reclaim(){if(pending)return pending;pending=(async()=>{const candidates=tabs().filter(tab=>tab.view&&tab.lifecycle==='background'&&now()-(Number(tab.lastActivatedAt)||now())>=300000&&browserTabUnloadDecision(tab,{activeTabId:activeId()}).allowed).sort((a,b)=>(a.lastActivatedAt||0)-(b.lastActivatedAt||0));const results=[];for(const tab of candidates.slice(0,2)){const result=await unload(tab.id);results.push({id:tab.id,ok:result?.ok===true,reason:result?.reason||'',error:result?.error||''});}return {ok:true,considered:candidates.length,unloaded:results.filter(row=>row.ok).length,results};})().finally(()=>{pending=null;});return pending;}
 return {reclaim};
}
function browserCompatibilityStatus(){return {extensions:{status:'partial-native',arbitraryChromeExtensions:false,adapterInstalled:false,userscripts:'separate-local-manager',knownLimitations:['No general Chrome Web Store compatibility','Extension tabs/windows/actions, worker lifecycle and permissions need per-extension validation','No downloads no-op or cloud-storage alias shim is installed']},profiles:{status:'existing-default-only',privateMode:false},history:{mode:'bounded-url-title-only',maxEntries:40,opaquePageState:false,postReplay:false},memory:{mode:'explicit-bounded-reclaim',maxTabsPerAction:2,idleMinutes:5,backgroundThrottlingChanged:false}};}
module.exports={createBrowserMemoryReclaimer,browserCompatibilityStatus};
