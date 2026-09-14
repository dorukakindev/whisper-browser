(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BrowserAiContext=api;})(globalThis,()=>{
  const clock=seconds=>{const s=Math.max(0,Math.floor(seconds));return s>=3600?`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
  function context(rows,position,scope='watched'){
    const eligible=rows.filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.end)&&row.end>row.start);
    let index=eligible.findIndex(row=>row.start<=position&&row.end>position);
    if(index<0)for(let i=0;i<eligible.length;i++)if(eligible[i].end<=position)index=i;
    const row=eligible[index];
    const result={zaman:clock(position),modalities:['subtitle_text'],sinir:'Yalnız altyazı metni; görüntü ve ses analiz edilmedi.'};
    if(!row)return {...result,not:'Bu konum için altyazı bağlamı yok.'};
    const pack=r=>({zaman:clock(r.start),baslangic:r.start,bitis:r.end,metin:r.text});
    return {...result,cumle:row.text,mevcut_ceviri:row.translation||'',hedef:pack(row),
      onceki:eligible.slice(Math.max(0,index-3),index).map(pack),
      sonraki:scope==='watched'?[]:eligible.slice(index+1,index+4).map(pack)};
  }
  function sources(ctx){
    const result=[];
    for(const row of [ctx?.hedef,...(ctx?.onceki||[]),...(ctx?.sonraki||[]),...(ctx?.transcript_evidence?.evidence||[])]){
      if(row&&Number.isFinite(row.baslangic)&&row.baslangic>=0)result.push(row);
    }
    return result;
  }
  function citation(ctx,token){
    if(/^T\d+$/.test(token))return (ctx?.transcript_evidence?.evidence||[]).find(row=>row.id===token)||null;
    return sources(ctx).find(row=>row.zaman===token)||null;
  }
  return {context,citation,sources,clock};
});
