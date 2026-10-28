(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JobSummary=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  // Keep only display fields: never retain credentials or prompts in the UI snapshot.
  function snapshot(options={},estimate=0){
    const result={estimate:options.translateOnly||options.reexport||options.syncSubs?0:Number(estimate)||0};
    for(const key of ['sourceType','input','youtube','model','engine','formats','task','translateTo','translateModel','clipStart','clipEnd'])result[key]=String(options[key]??'');
    for(const key of ['translate','translateOnly','translateForSpeech','reexport','syncSubs'])result[key]=options[key]===true;
    return Object.freeze(result);
  }
  function time(value){
    if(!/^\d+(?:\.\d+)?$/.test(value))return value;
    const seconds=Number(value);if(!Number.isFinite(seconds))return value;
    const millis=Math.round(seconds*1000),minutes=Math.floor(millis/60000),tail=String(Math.floor(millis%60000/1000)).padStart(2,'0');
    const fraction=String(millis%1000).padStart(3,'0').replace(/0+$/,'');
    return minutes+':'+tail+(fraction?'.'+fraction:'');
  }
  function describe(job,locale='en'){
    const choose=(tr,en)=>locale==='tr'?tr:en;
    const special=job.reexport||job.syncSubs;
    const translating=!special&&(job.translate||job.translateOnly);
    return {
      source:job.youtube?choose('YouTube bağlantısı','YouTube link'):job.sourceType==='youtube'?choose('YouTube bekleniyor','Waiting for YouTube'):(job.input.split(/[\\/]/).pop()||choose('Dosya bekleniyor','Waiting for file')),
      engine:job.translateOnly||special?choose('Transkripsiyon yapılmaz','No transcription'):[job.model,job.engine].filter(Boolean).join(' · '),
      output:job.formats.split(',').filter(Boolean).map(x=>x.toUpperCase()).join(' + '),
      translation:translating?[choose('Çeviri','Translation')+' → '+(job.translateTo||'—'),job.translateModel].filter(Boolean).join(' · '):(job.task==='translate'?'Whisper → English':choose('Kaynak altyazı','Source subtitles')),
      range:job.clipStart||job.clipEnd?(time(job.clipStart)||choose('Baştan','Start'))+' → '+(time(job.clipEnd)||choose('Sona kadar','End')):choose('Tam kaynak','Entire source'),
      mode:job.reexport?choose('Yeniden dışa aktar','Re-export'):job.syncSubs?choose('Altyazı senkronu','Subtitle synchronization'):translating?(job.translateForSpeech?choose('Seslendirmeye uygun çeviri','Speech-ready translation'):choose('Altyazı çevirisi','Subtitle translation')):job.task==='translate'?'Whisper → English':choose('Yalnız transkripsiyon','Transcription only')
    };
  }
  return {snapshot,describe};
});
