(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrowserSubtitleReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const plain = cue => ({ start: Number(cue.start), end: Number(cue.end), text: String(cue.text || '') });
  const equal = (a, b) => a && b && a.start === b.start && a.end === b.end && a.text === b.text;
  function reconcile(cues, records) {
    const output = cues.map(cue => ({ ...cue })), conflicts = [];
    const byId=new Map(),byStart=new Map(),byEdited=new Map(),used=new Set();
    const append=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
    const exactKey=cue=>JSON.stringify([cue.start,cue.end,cue.text]);
    cues.forEach((cue,index)=>{
      const entry={cue,index};
      append(byId,String(cue.cueId||cue.id||''),entry);
      append(byStart,Math.floor(cue.start*500),entry);
      append(byEdited,exactKey(cue),entry);
    });
    const valid=value=>value&&typeof value.text==='string'&&Number.isFinite(value.start)&&Number.isFinite(value.end)&&value.start>=0&&value.end-value.start>=.08;
    for (const record of Array.isArray(records)?records.slice(0,1000):[]) {
      if (!valid(record?.base) || !valid(record?.edited)) continue;
      let matches = record.cueId ? byId.get(record.cueId)||[] : [];
      if(matches.length!==1){
        const bucket=Math.floor(record.base.start*500);
        matches=[-1,0,1].flatMap(offset=>byStart.get(bucket+offset)||[]).filter(({cue})=>
          Math.abs(cue.start-record.base.start)<.002&&Math.abs(cue.end-record.base.end)<.002);
      }
      if (matches.length !== 1) {
        // Dosyaya kaydedilmiş zaman düzeltmesi de yeniden açılabilmeli.
        matches = byEdited.get(exactKey(record.edited))||[];
      }
      if (matches.length !== 1) { conflicts.push({record,index:-1,reason:'Satır tekil eşleştirilemedi.'}); continue; }
      const {cue,index} = matches[0], incoming=plain(cue);
      if(used.has(index)){conflicts.push({record,index:-1,reason:'Aynı satıra birden çok düzeltme eşleşti.'});continue;}
      used.add(index);
      if (!equal(incoming,record.base) && !equal(incoming,record.edited)) {
        conflicts.push({record,index,incoming,reason:'Site bu satırı değiştirdi.'});
      }
      output[index]={...cue,...record.edited,sourceStart:cue.start,sourceEnd:cue.end};
    }
    return {cues:output.sort((a,b)=>a.start-b.start||a.end-b.end),conflicts};
  }
  function issues(channels, limit=22) {
    const found=[];
    const translations=channels.filter(item=>item.role==='translation');
    const intervals=translations.flatMap(item=>item.cues.filter(cue=>cue.text?.trim())).sort((a,b)=>a.start-b.start);
    const maxEnds=[];for(const cue of intervals)maxEnds.push(Math.max(maxEnds.at(-1)||-Infinity,cue.end));
    const covered=cue=>{let lo=0,hi=intervals.length;while(lo<hi){const mid=(lo+hi)>>1;if(intervals[mid].start<cue.end)lo=mid+1;else hi=mid;}return lo>0&&maxEnds[lo-1]>cue.start;};
    for(const channel of channels){
      const ordered=channel.cues.map((cue,index)=>({cue,index})).sort((a,b)=>a.cue.start-b.cue.start);
      let farthest=null;
      for(const {cue,index} of ordered){
        const duration=cue.end-cue.start, reasons=[];
        const cps=Array.from(String(cue.text||'').replace(/\s/g,'')).length/Math.max(.001,duration);
        if(duration<=0)reasons.push('Geçersiz süre');
        else if(cps>limit)reasons.push(`Hızlı okuma · ${Math.round(cps)} karakter/sn`);
        if(farthest&&farthest.end>cue.start+.02)reasons.push('Önceki satırla çakışıyor');
        if(!farthest||cue.end>farthest.end)farthest=cue;
        if(channel.role==='source'){
          if(translations.length&&!covered(cue))reasons.push('Çeviri eksik');
        }
        if(reasons.length)found.push({channel:channel.channel,index,start:cue.start,text:cue.text,reasons});
      }
    }
    return found.sort((a,b)=>a.start-b.start);
  }
  return {plain,equal,reconcile,issues};
});
