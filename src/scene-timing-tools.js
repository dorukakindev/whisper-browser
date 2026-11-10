(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SceneTimingTools=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
function context(value){const result={};for(const [key,max] of [['summary',2000],['terms',1500],['characters',1500]])result[key]=String(value?.[key]||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);return result;}
function signature(cues){return JSON.stringify(cues.map(c=>[c.start,c.end,c.text,!!c.timingLocked]));}
// Read-only endpoint comparison. Transform functions may represent local offset or Browser scale/offset.
function effect(changes, toMedia = value => value) {
 const rows=changes.filter(c=>[c.before?.start,c.before?.end,c.after?.start,c.after?.end].every(Number.isFinite));
 if(!rows.length)return null;
 const first=rows.reduce((a,b)=>a.before.start<=b.before.start?a:b),last=rows.reduce((a,b)=>a.before.end>=b.before.end?a:b);
 const point=(row,edge)=>{const before=toMedia(row.before[edge]),after=toMedia(row.after[edge]);return {before,after,delta:after-before};};
 const start=point(first,'start'),end=point(last,'end');
 return [start.before,start.after,end.before,end.after].every(Number.isFinite)?{count:rows.length,start,end}:null;
}
function propose(cues,{shots=[],fps=24,lo=0,hi=Infinity}={}){
 const frame=1/([24,25,30,50,60].includes(Number(fps))?Number(fps):24),gap=2*frame;
 const next=cues.map(c=>({...c})),changes=[];
 const cuts=shots.filter(Number.isFinite).sort((a,b)=>a-b);
 function nearest(t){let a=0,b=cuts.length;while(a<b){const m=(a+b)>>1;if(cuts[m]<t)a=m+1;else b=m;}return [cuts[a-1],cuts[a]].filter(Number.isFinite).sort((x,y)=>Math.abs(x-t)-Math.abs(y-t))[0];}
 for(let i=0;i<next.length;i++){
  const c=next[i],before=cues[i];if(c.timingLocked||c.start<lo||c.end>hi)continue;
  const cut=nearest(c.start);let reason=[];
  // Only extend into existing silence; never trim spoken content or move another cue.
  if(Number.isFinite(cut)&&cut<=c.start&&c.start-cut<=.12&&cut>=Math.max(0,(next[i-1]?.end??-gap)+gap)&&cut>=lo&&c.end-cut<=7){c.start=cut;reason.push('cut');}
  const following=next[i+1];if(following){const silence=following.start-c.end;if(silence>=3*frame&&silence<=11*frame){const end=following.start-gap;if(end<=hi&&end-c.start<=7){c.end=end;reason.push('gap');}}}
  if(c.start!==before.start||c.end!==before.end)changes.push({index:i,before:{start:before.start,end:before.end},after:{start:c.start,end:c.end},reason});
 }
 return{base:signature(cues),cues:next,changes};
}
// Peaks are conservative amplitude envelopes, not a speech detector.
function silenceIntervals(points,{start=0,duration,threshold=.025,minDuration=.16}={}){
 if(!Array.isArray(points)||!points.length||!Number.isFinite(duration)||duration<=0)return [];
 const step=duration/points.length;if(step>.15)return []; // Too coarse to align subtitle edges safely.
 const out=[];let first=-1;
 for(let i=0;i<=points.length;i++){
  const silent=i<points.length&&Number.isFinite(points[i])&&Math.abs(points[i])<=threshold;
  if(silent&&first<0)first=i;
  if(!silent&&first>=0){if((i-first)*step>=minDuration)out.push({start:start+first*step,end:start+i*step});first=-1;}
 }
 return out;
}
function proposeSilence(cues,{silences=[],lo=0,hi=Infinity,maxShift=.25,gap=.04}={}){
 const next=cues.map(c=>({...c})),changes=[];
 const intervals=silences.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start).sort((a,b)=>a.start-b.start),byEnd=[...intervals].sort((a,b)=>a.end-b.end);
 const bound=(rows,key,value,upper=false)=>{let a=0,b=rows.length;while(a<b){const m=(a+b)>>1;if(rows[m][key]<value||(upper&&rows[m][key]===value))a=m+1;else b=m;}return a;};
 for(let i=0;i<next.length;i++){
  const c=next[i],before=cues[i];if(c.timingLocked||c.start<lo||c.end>hi)continue;
  // Expand outward to a nearby quiet edge. Never shorten the spoken interval.
  const prior=byEnd[bound(byEnd,'end',c.start,true)-1],following=intervals[bound(intervals,'start',c.end)];
  if(prior&&c.start-prior.end<=maxShift&&prior.end>=Math.max(lo,(next[i-1]?.end??-gap)+gap))c.start=prior.end;
  if(following&&following.start-c.end<=maxShift&&following.start<=Math.min(hi,(cues[i+1]?.start??Infinity)-gap))c.end=following.start;
  if(c.end-c.start>7){c.start=before.start;c.end=before.end;}
  if(c.start!==before.start||c.end!==before.end)changes.push({index:i,before:{start:before.start,end:before.end},after:{start:c.start,end:c.end},reason:['audio-silence']});
 }
 return {base:signature(cues),cues:next,changes};
}
return{context,signature,effect,propose,silenceIntervals,proposeSilence};});
