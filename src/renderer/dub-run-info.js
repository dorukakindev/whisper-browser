(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DubRunInfo=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const basename=value=>typeof value==='string'?value.split(/[\\/]/).pop().slice(0,250):'';
  const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
  function counts(metrics,en){
    const cached=count(metrics?.cached_groups),generated=count(metrics?.generated_groups);
    if(cached===null&&generated===null)return '';
    const parts=[];
    if(cached!==null)parts.push((en?'From cache: ':'Önbellekten: ')+cached);
    if(generated!==null)parts.push((en?'Newly generated: ':'Yeni üretilen: ')+generated);
    return parts.join(' · ');
  }
  function recipe(output,en){
    if(!output?.url)return [];
    const s=output.settings,rows=[],add=(label,value)=>{if(value)rows.push([label,value]);};
    add(en?'Audio':'Ses',basename(output.name));
    add(en?'Subtitle':'Altyazı',basename(output.subtitle));
    add(en?'Reference':'Referans',basename(s?.referenceName)||(en?'Not recorded for this output':'Bu çıktı için kaydedilmemiş'));
    // Never substitute current UI controls for an older output's settings.
    if(!s){add(en?'Settings':'Ayarlar',en?'No saved production settings':'Kayıtlı üretim ayarı yok');return rows;}
    const r=output.range||s.range;
    const time=n=>`${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,'0').replace(/\.00$/,'')}`;
    const validRange=r&&Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.start>=0&&r.end>r.start;
    add(en?'Scope':'Kapsam',output.sample===true?(en?'Short sample':'Kısa örnek'):validRange?time(r.start)+' → '+time(r.end):en?'All subtitle cues':'Altyazının tamamı');
    add(en?'Grouping':'Gruplama',({akici:en?'Flowing blocks':'Akıcı bloklar',cumle:en?'Sentence groups':'Cümle grupları',satir:en?'Subtitle rows':'Altyazı satırları'})[s.grouping]);
    add(en?'Quality':'Kalite',Number.isSafeInteger(s.steps)&&s.steps>0&&s.steps<=100?s.steps+(en?' steps':' adım'):'');
    add(en?'Verification':'Doğrulama',({fast:en?'Audio checks':'Ses denetimi',balanced:en?'Selective text checks':'Seçili metin denetimi',detailed:en?'Full text checks':'Tam metin denetimi'})[s.verification]);
    add(en?'Timing':'Zamanlama',s.timingMode==='video'?(en?'Keep full speech; synchronize video speed':'Konuşmayı tam tut; video hızını eşleştir'):s.timingMode==='clip'?(en?'Fixed video; overflowing speech may be cut':'Sabit video; taşan konuşma kesilebilir'):'');
    add(en?'Groups':'Gruplar',counts(output.metrics,en));
    return rows;
  }
  return {counts,recipe};
});
