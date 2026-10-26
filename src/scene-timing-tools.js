(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SceneTimingTools=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
function context(value){const result={};for(const [key,max] of [['summary',2000],['terms',1500],['characters',1500]])result[key]=String(value?.[key]||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);return result;}
function signature(cues){return JSON.stringify(cues.map(c=>[c.start,c.end,c.text]));}
function propose(cues,{shots=[],fps=24,lo=0,hi=Infinity}={}){
 const frame=1/([24,25,30,50,60].includes(Number(fps))?Number(fps):24),gap=2*frame;
 const next=cues.map(c=>({...c})),changes=[];
 const cuts=shots.filter(Number.isFinite).sort((a,b)=>a-b);
 function nearest(t){let a=0,b=cuts.length;while(a<b){const m=(a+b)>>1;if(cuts[m]<t)a=m+1;else b=m;}return [cuts[a-1],cuts[a]].filter(Number.isFinite).sort((x,y)=>Math.abs(x-t)-Math.abs(y-t))[0];}
 for(let i=0;i<next.length;i++){
  const c=next[i],before=cues[i];if(c.start<lo||c.end>hi)continue;
  const cut=nearest(c.start);let reason=[];
  // Only extend into existing silence; never trim spoken content or move another cue.
  if(Number.isFinite(cut)&&cut<=c.start&&c.start-cut<=.12&&cut>=Math.max(0,(next[i-1]?.end??-gap)+gap)&&cut>=lo&&c.end-cut<=7){c.start=cut;reason.push('cut');}
  const following=next[i+1];if(following){const silence=following.start-c.end;if(silence>=3*frame&&silence<=11*frame){const end=following.start-gap;if(end<=hi&&end-c.start<=7){c.end=end;reason.push('gap');}}}
  if(c.start!==before.start||c.end!==before.end)changes.push({index:i,before:{start:before.start,end:before.end},after:{start:c.start,end:c.end},reason});
 }
 return{base:signature(cues),cues:next,changes};
}
return{context,signature,propose};});
