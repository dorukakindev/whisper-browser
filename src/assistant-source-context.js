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
  if(selection?.workspace==='podcast')return JSON.stringify(['podcast',selection.episodeIdentity,selection.sourceVersion]);
  if(selection)return JSON.stringify(['global',selection.workspace,selection.page,selection.id,selection.chapter]);
  if(player.workspaceMode==='browser'&&player.browserMediaSeen&&player.mediaKey)return JSON.stringify([player.workspaceMode,player.mediaKey]);
  const page=player.workspaceMode==='browser'&&pageKey(player.browserPageUrl);return page?JSON.stringify(['browser-page',page]):JSON.stringify([player.workspaceMode,player.mediaKey]);
 }
 function excerptKey(value,limit=8000){let hash=2166136261;const text=String(value||'').slice(0,limit);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16)+'-'+text.length;}
 function scope(player,selection,tab){
  if(selection?.workspace==='podcast')return JSON.stringify(['podcast',selection.episodeIdentity,selection.sourceVersion,selection.generation,selection.sourceTrack?.id,selection.sourceTrack?.revision]);
  if(selection){const parts=['global',selection.workspace,selection.page,selection.id,selection.catalogId,selection.chapter,selection.title,selection.synopsis,excerptKey(selection.excerpt),excerptKey(selection.selectedText)];if(selection.reviewAnalysis)parts.push(excerptKey(selection.reviewAnalysis,64000));if(selection.chapterRevision)parts.push(selection.chapterRevision);return JSON.stringify(parts);}
  return JSON.stringify([player.workspaceMode,player.mediaKey,player.generation,player.browserActiveTabId,player.workspaceMode==='browser'?tab?.generation:null,player.workspaceMode==='browser'?pageKey(player.browserPageUrl):null]);
 }
 function freezePodcast(snapshot, tracks, scopeName='watched'){
  if(!snapshot)return null;
  const source=tracks?.find(track=>track.role==='source')||tracks?.[0];
  const anchor=Object.freeze({episodeIdentity:snapshot.episodeIdentity,sourceVersion:snapshot.sourceVersion,generation:snapshot.generation,mediaKey:snapshot.mediaKey,sourceTrack:source?{id:source.id,revision:source.revision}:null,time:Number(snapshot.time)||0});
  const offset=Number(source?.offsetSeconds)||0;
  const timed=!!source&&source.timed!==false;
  const eligible=timed&&scopeName!=='selection'?(source?.cues||[]).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start&&(scopeName!=='watched'||c.end+offset<=anchor.time)):[];
  const cues=eligible.slice(-40).map((c,i)=>Object.freeze({id:'T'+(i+1),cueId:String(c.id??i),baslangic:c.start+offset,bitis:c.end+offset,metin:String(c.text||'').slice(0,1500),ceviri:''}));
  return Object.freeze({workspace:'podcast',page:'podcast',title:snapshot.title||'',episodeIdentity:anchor.episodeIdentity,sourceVersion:anchor.sourceVersion,generation:anchor.generation,sourceTrack:anchor.sourceTrack,podcastAnchor:anchor,transcript_evidence:{scope:scopeName,position:anchor.time,evidence:cues,eligibleCues:eligible.length,includedCues:cues.length,coverage:eligible.length>cues.length?'partial':'complete',limitations:scopeName==='selection'?['explicit-selection-required']:timed?['transcript-only','no-auto-seek',...(eligible.length>cues.length?['last-40-eligible-cues-only','do-not-claim-complete-summary']:[])]:['untimed-transcript-excluded']},note:!timed?'Untimed text cannot establish what has been heard. No timed transcript evidence is available.':undefined});
 }
 function podcastStillValid(context,snapshot){const a=context?.podcastAnchor;return !!a&&!!snapshot&&a.episodeIdentity===snapshot.episodeIdentity&&a.sourceVersion===snapshot.sourceVersion&&a.generation===snapshot.generation&&a.mediaKey===snapshot.mediaKey&&a.sourceTrack?.id===snapshot.sourceTrack?.id&&a.sourceTrack?.revision===snapshot.sourceTrack?.revision;}
 return Object.freeze({pageKey,conversation,scope,freezePodcast,podcastStillValid});
});
