(function(root){
  'use strict';
  const finite = (n, a, b) => Number.isFinite(n) && n >= a && n <= b;
  function mix(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
    const result = {};
    for (const [key, fallback] of Object.entries({voice:1,background:.75,music:.75,ambience:.75,duckAmount:.35}))
      result[key] = finite(value[key],0,1) ? value[key] : fallback;
    result.duck = value.duck !== false;
    return result;
  }
  function safeText(value) {
    return typeof value === 'string' && value.length <= 16000
      && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      && !/^\s*\d+:\d{2}:\d{2}[,.]\d{1,3}\s+-->/m.test(value);
  }
  function groups(value) {
    if (!Array.isArray(value) || value.length > 5000) throw new Error('Invalid dubbing timeline.');
    const keys=new Set();
    return value.map((r,i) => {
      if (!r || typeof r.key !== 'string' || !r.key.trim() || r.key.length > 200 || !safeText(r.text) || (r.displayText !== undefined && !safeText(r.displayText))
          || ![r.sourceStart,r.sourceEnd,r.audioStart,r.audioEnd].every(n => finite(n,0,172800))
          || r.sourceEnd <= r.sourceStart || r.audioEnd < r.audioStart
          || (r.audioEnd === r.audioStart && r.status !== 'failed')) throw new Error('Invalid dubbing timeline.');
      if(keys.has(r.key))throw new Error('Invalid dubbing timeline.');
      keys.add(r.key);
      let speechRanges;
      if (Array.isArray(r.speechRanges) && r.speechRanges.length <= 100
          && r.speechRanges.every((p,i,a) => Array.isArray(p) && p.length===2 && p.every(n=>finite(n,r.audioStart,r.audioEnd+.00001)) && p[1]>p[0] && (!i || p[0]>=a[i-1][1]))) speechRanges=r.speechRanges.map(p=>[...p]);
      const verificationStatus = ['passed','review','not_checked','unavailable'].includes(r.verification?.status)
        ? r.verification.status : r.verification == null ? 'not_checked' : 'unavailable';
      const status = r.status === 'failed' ? 'failed' : r.status !== 'ready'
        || ['review','unavailable'].includes(verificationStatus) || r.verification?.review === true ? 'review' : 'ready';
      return {displayText:typeof r.displayText==='string' && r.displayText.length<=16000?r.displayText:r.text,
        ...(speechRanges ? {speechRanges} : {}),key:r.key,group:i+1,text:r.text,sourceStart:r.sourceStart,sourceEnd:r.sourceEnd,
        audioStart:r.audioStart,audioEnd:r.audioEnd,status,
        stretch:finite(r.stretch,1,10000)?r.stretch:1,rewritten:r.rewritten===true,naturalEdited:r.naturalEdited===true,
        verification:{...r.verification,status:verificationStatus}};
    });
  }
  function duckAt(rows,time) {
    let envelope = 0;
    for (const r of rows || []) {
      if (r.status === 'failed') continue;
      for (const [start,end] of r.speechRanges || [[r.audioStart,r.audioEnd]]) {
        if(time<start || time>end+.35)continue;
        envelope = Math.max(envelope,Math.min(1,(time-start)/.08,(end+.35-time)/.35));
      }
    }
    return Math.max(0,envelope);
  }
  const api={mix,groups,duckAt};
  if(typeof module !== 'undefined' && module.exports) module.exports=api; else root.DubWorkspaceModel=api;
})(typeof window==='undefined'?globalThis:window);
