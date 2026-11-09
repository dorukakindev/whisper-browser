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
  function speechResult(output,en){
    if(!output?.url)return '';
    const s=output.settings||{},states=(output.quality?.groups||[]).map(row=>row.speechEditing?.natural).filter(Boolean);
    if(s.speechSourceStatus==='unavailable'||states.length&&states.every(state=>state==='source_unavailable'))
      return en?'Original text could not be matched; the existing Turkish text was preserved.':'Kaynak metin eşleştirilemedi; mevcut Türkçe metin korundu.';
    if(states.includes('editor_failed'))return en?'Some speech edits were unavailable; the existing Turkish wording was preserved for those groups.':'Bazı konuşma düzenlemeleri uygulanamadı; bu gruplarda mevcut Türkçe metin korundu.';
    if(states.includes('source_unavailable'))return en?'Some groups had no matching original text; their Turkish wording was preserved.':'Bazı gruplarda kaynak metin eşleştirilemedi; bu grupların Türkçesi korundu.';
    if(states.includes('source_reviewed'))return en?'Speech wording was prepared with source meaning checks.':'Konuşma metni kaynak anlamı denetlenerek hazırlandı.';
    return '';
  }
  function verificationSummary(output,en){
    if(!output?.url)return '';
    if(output.qualityUnavailable)return en?'Speech verification is unavailable. Listen before using this output.':'Ses doğrulama kaydı yok. Bu çıktıyı kullanmadan önce dinleyin.';
    const rows=output.quality?.groups;
    if(!Array.isArray(rows)||!rows.length)return '';
    const failed=rows.filter(row=>row.status==='failed').length;
    const review=rows.filter(row=>row.status!=='ready'&&row.status!=='failed').length;
    if(failed)return en?`${failed} ${failed===1?'group':'groups'} could not be generated; those sections may be silent. Review groups before using the audio.`:`${failed} grup üretilemedi; bu bölümler sessiz olabilir. Sesi kullanmadan önce grupları kontrol edin.`;
    if(review)return en?`${review} ${review===1?'group needs':'groups need'} a listening check. Open Review groups to hear or regenerate them.`:`${review} grup dinleme kontrolü gerektiriyor. Dinlemek veya yeniden üretmek için Grupları dinle bölümünü açın.`;
    const verified=rows.filter(row=>row.verification?.status==='passed').length;
    if(verified===rows.length)return en?`Text checks passed against the supplied subtitles for ${rows.length===1?'the group':'all '+rows.length+' groups'}. This does not verify the original transcription. Naturalness still needs listening.`:`${rows.length} grubun tamamı altyazıya göre metin denetiminden geçti. Bu, özgün konuşmanın doğru çözümlendiğini kanıtlamaz. Doğallığı dinleyerek değerlendirin.`;
    return en?`${rows.length} ${rows.length===1?'group is':'groups are'} ready; ${verified} ${verified===1?'has':'have'} a passed text check. Unchecked groups are not verified readings.`:`${rows.length} grup hazır; ${verified} grubun metin denetimi geçti. Denetlenmeyen grupların doğru okunduğu doğrulanmadı.`;
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
    const scope=validRange?time(r.start)+' → '+time(r.end):'';
    add(en?'Scope':'Kapsam',output.sample===true?[(en?'Short sample':'Kısa örnek'),s.positionSample?scope:''].filter(Boolean).join(' · '):scope||(en?'All subtitle cues':'Altyazının tamamı'));
    add(en?'Grouping':'Gruplama',({anlatim:en?'Sentence flow':'Cümle akışı',akici:en?'Flowing blocks':'Akıcı bloklar',cumle:en?'Sentence groups':'Cümle grupları',satir:en?'Subtitle rows':'Altyazı satırları'})[s.grouping]);
    add(en?'Quality':'Kalite',Number.isSafeInteger(s.steps)&&s.steps>0&&s.steps<=100?s.steps+(en?' steps':' adım'):'');
    add(en?'Verification':'Doğrulama',({fast:en?'Audio checks':'Ses denetimi',balanced:en?'Selective text checks':'Seçili metin denetimi',detailed:en?'Full text checks':'Tam metin denetimi'})[s.verification]);
    add(en?'Timing':'Zamanlama',s.timingMode==='video'?(en?'Keep full speech; synchronize video speed':'Konuşmayı tam tut; video hızını eşleştir'):s.timingMode==='clip'?(en?'Fixed video; overflowing speech may be cut':'Sabit video; taşan konuşma kesilebilir'):'');
    add(en?'Groups':'Gruplar',counts(output.metrics,en));
    const editing=(output.quality?.groups||[]).map(row=>row.speechEditing?.natural).filter(Boolean);
    if(editing.length){const reviewed=editing.filter(value=>value==='source_reviewed').length,unchanged=editing.filter(value=>value==='unchanged').length;add(en?'Speech editing':'Konuşma düzenlemesi',en?`${reviewed} source-reviewed · ${unchanged} unchanged`:`${reviewed} kaynak anlamı denetlenen · ${unchanged} değiştirilmeden korunan`);}
    return rows;
  }
  function activityLabel(g,en){
    const verification=g.stage==='verification', editing=g.stage==='text_edit';
    const label=verification?(en?'Whisper check / queue':'Whisper denetimi / sıra')
      : editing?(en?'Text preparation':'Metin hazırlığı'):(en?'Speech generation':'Ses üretimi');
    const attempt=editing?'':(en?'attempt ':'deneme ')+g.attempt+' · ';
    return (en?'Group ':'Grup ')+g.group+' · '+label+' · '+attempt+Math.floor(g.elapsed)+(en?' s elapsed':' sn geçti')+' · '+(verification?(en?'request limit (excludes queue) ':'istek sınırı (sıra hariç) '):(en?'timeout ':'zaman aşımı '))+g.limit+(en?' s':' sn');
  }
  return {counts,recipe,speechResult,verificationSummary,activityLabel};
});
