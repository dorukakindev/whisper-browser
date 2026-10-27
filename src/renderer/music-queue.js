// Pure playback order model. Queue entries remain distinct even when song IDs repeat.
((root)=>{
 'use strict';
 function create(random=Math.random){
  let rows=[],index=-1,original=null,repeat='off',sequence=0;
  const current=()=>rows[index]||null;
  function set(items,at=0){rows=items.map(r=>({...r,queueKey:String(++sequence)}));index=rows.length?Math.min(Math.max(0,at),rows.length-1):-1;original=null;return current();}
  function jump(at){if(!Number.isInteger(at)||at<0||at>=rows.length)return null;index=at;return current();}
  function next(auto=false){if(!rows.length)return null;if(auto&&repeat==='one')return current();if(index+1<rows.length)return jump(index+1);if(repeat==='all'||!auto)return jump(0);return null;}
  function previous(){return rows.length?jump(Math.max(0,index-1)):null;}
  function shuffle(on){if(!current()||on===!!original)return;const key=current().queueKey;if(on){original=rows.slice();const rest=rows.filter(r=>r.queueKey!==key);for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}rows=[current(),...rest];index=0;}else{rows=original;original=null;index=rows.findIndex(r=>r.queueKey===key);}}
  function edit(key,operation){const at=rows.findIndex(r=>r.queueKey===key);if(at<0)return false;const playing=current()?.queueKey;if(operation==='remove'&&key===playing)return false;const target=operation==='up'?at-1:at+1;if(operation==='remove')rows.splice(at,1);else if(['up','down'].includes(operation)&&target>=0&&target<rows.length)[rows[at],rows[target]]=[rows[target],rows[at]];else return false;original=null;index=rows.findIndex(r=>r.queueKey===playing);return true;}
  function append(items,next=false){const entries=items.map(r=>({...r,queueKey:String(++sequence)}));rows.splice(next?index+1:rows.length,0,...entries);if(index<0&&rows.length)index=0;original=null;}
  function clearUpcoming(){rows=rows.slice(0,index+1);original=null;}
  function snapshot(){return {rows:rows.slice(),index,shuffled:!!original,repeat};}
  return {set,jump,next,previous,shuffle,edit,append,clearUpcoming,current,snapshot,setRepeat:value=>{if(!['off','all','one'].includes(value))throw Error('Invalid repeat');repeat=value;}};
 }
 if(typeof module==='object'&&module.exports)module.exports={create};else root.MusicQueue=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
