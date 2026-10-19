(function(root){
  'use strict';
  const finite = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
  function mix(value = {}) {
    const result = {};
    for (const [key, fallback] of Object.entries({voice:1,background:.75,music:.75,ambience:.75,duckAmount:.35}))
      result[key] = finite(value[key],0,1) ? value[key] : fallback;
    result.duck = value.duck !== false;
    return result;
  }
  function groups(value) {
    if (!Array.isArray(value) || value.length > 5000) throw new Error('Invalid dubbing timeline.');
    return value.map((r,i) => {
      if (!r || typeof r.key !== 'string' || r.key.length > 200 || typeof r.text !== 'string' || r.text.length > 16000
          || ![r.sourceStart,r.sourceEnd,r.audioStart,r.audioEnd].every(n => finite(n,0,172800))
          || r.sourceEnd <= r.sourceStart || r.audioEnd < r.audioStart) throw new Error('Invalid dubbing timeline.');
      return {key:r.key,group:i+1,text:r.text,sourceStart:r.sourceStart,sourceEnd:r.sourceEnd,
        audioStart:r.audioStart,audioEnd:r.audioEnd,status:['ready','review','failed'].includes(r.status)?r.status:'review',
        stretch:finite(r.stretch,1,10000)?r.stretch:1,rewritten:r.rewritten===true,
        verification:{status:['passed','review','not_checked','unavailable'].includes(r.verification?.status)?r.verification.status:'not_checked'}};
    });
  }
  function duckAt(rows,time) {
    let envelope = 0;
    for (const r of rows || []) {
      if (r.status === 'failed' || time < r.audioStart || time > r.audioEnd + .35) continue;
      envelope = Math.max(envelope,Math.min(1,(time-r.audioStart)/.08,(r.audioEnd+.35-time)/.35));
    }
    return Math.max(0,envelope);
  }
  const api={mix,groups,duckAt};
  if(typeof module !== 'undefined' && module.exports) module.exports=api; else root.DubWorkspaceModel=api;
})(typeof window==='undefined'?globalThis:window);
