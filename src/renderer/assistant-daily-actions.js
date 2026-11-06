(() => {
'use strict';const t=(en,tr)=>window.UiLocale?.get?.()==='tr'?tr:en;const names=new Set(['plan_watch_itinerary','open_watch_itinerary','get_evening_candidates','read_daily_library','open_daily_library','set_watchlist_section']);
async function execute(name,args,{guard,expectedSettings}){const request=async(action,extra={})=>{const r=await window.api.mediaTools({action,...extra});guard();if(!r?.ok)throw Error(r?.error||'Daily library unavailable');return r;};
 if(name==='plan_watch_itinerary'||name==='open_watch_itinerary'){
  const r=await request('daily-list');
  const draft=window.WhisperV3.buildRoute(r.watchlist,args.budget_minutes,args.break_minutes);
  const route={...draft,skipped:draft.skipped.slice(0,12)};
  if(name==='open_watch_itinerary'&&(expectedSettings?.kind!=='watch-itinerary'||expectedSettings.revision!==JSON.stringify(route))){
   return {status:'failed',stale:true,error:t('The itinerary changed. Ask for a new draft.','Rota değişti. Yeni bir taslak isteyin.')};
  }
  if(name==='open_watch_itinerary'){guard();window.WhisperV3.open('route',{budget:args.budget_minutes,breakMinutes:args.break_minutes,watchlist:r.watchlist});}
  return {status:'completed',route,opened:name==='open_watch_itinerary'};
 }
 if(name==='get_evening_candidates'){const r=await request('daily-tonight',{options:args});return {status:'completed',items:r.items.map(i=>({item_id:'catalog:'+i.id,title:i.title,runtime:i.runtime,year:i.year,reasons:i.reasons,playable:i.playable})),scope:r.scope,note:r.note};}
 if(name==='read_daily_library'){const r=await request('daily-list'),offset=args.offset||0,rows=r.watchlist.slice(offset,offset+20),next=offset+20<r.watchlist.length?offset+20:null;return {status:'completed',revision:r.revision,watchlist:rows.map(i=>({item_id:'catalog:'+i.id,title:i.title,section:i.bucket,kind:i.kind,year:i.year})),nextOffset:next,series:r.continuations.slice(0,20).map(i=>({item_id:'catalog:'+i.id,title:i.title,episode:i.episode,positionSeconds:i.positionSeconds})),seriesTruncated:r.continuations.length>20};}
 if(name==='open_daily_library'){guard();window.MediaDailyUI.open(args.tab);return {status:'completed',tab:args.tab,note:'Opened only; no playback or personal write.'};}
 if(name==='set_watchlist_section'){if(!/^catalog:[\w-]{1,120}$/.test(args.item_id))throw Error('Choose an existing saved watchlist catalog ID.');if(expectedSettings?.kind!=='daily-queue'||!expectedSettings.revision)throw Error('Review this list change through an action card first.');const current=await request('daily-list');if(current.revision!==expectedSettings.revision)return {status:'failed',stale:true,error:'Watchlist changed; review again.'};const id=args.item_id.slice(8);if(!current.watchlist.some(i=>i.id===id))throw Error('Title is no longer in the watchlist.');await request('daily-queue',{id,bucket:args.section,revision:current.revision});document.dispatchEvent(new Event('media-library-changed'));return {status:'completed',item_id:args.item_id,section:args.section,note:'Section saved. Reaction, watch status and episode position unchanged.'};}
 throw Error('Unknown daily action');}
window.AssistantDailyActions=Object.freeze({handles:name=>names.has(name),execute});
})();
