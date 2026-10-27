(()=>{
 'use strict';
 async function execute(name,args,owner,{deadline=Infinity,isCancelled=()=>false}={}){
  const guard=()=>{if(isCancelled()||Date.now()>=deadline||!window.AssistantAppActions.current(owner))throw Error('Music source or conversation changed');};guard();
  if(name==='list_music_library'){
   const data=await window.api.mediaShelf({action:'list'});guard();if(!data?.ok)throw Error(data?.error||'Music library unavailable');
   const offset=args.offset||0,rows=(data.music||[]),items=rows.slice(offset,offset+16).map(r=>({id:r.id,title:r.title,artist:r.artist,album:r.album,duration:r.duration}));return {status:'completed',items,total:rows.length,nextOffset:offset+16<rows.length?offset+16:null};
  }
  if(name==='get_music_context')return {status:'completed',...await window.MusicAnalysisUI.read(),note:'Only evidence=preview-clap or local-clap is audio-compared. Catalog results are unverified. Scores are model-space similarities, not probabilities. The assistant itself has not heard the audio.'};
  if(args.operation==='open'){window.MusicAnalysisUI.open();return {status:'completed',...await window.MusicAnalysisUI.read()};}
  const result=await window.MusicAnalysisUI.execute(args);guard();
  if(result.job?.state==='failed'&&['analyze','find_local','rank_online','prepare_model'].includes(args.operation))throw Error('Music job failed. Inspect the music panel for the exact cause.');
  return {status:['analyze','find_local','rank_online','prepare_model','cancel'].includes(args.operation)?'accepted':'completed',...result,note:'Read get_music_context to verify the result; accepted is not completed. Source files were not modified.'};
 }
 window.AssistantMusicActions=Object.freeze({execute});
})();
