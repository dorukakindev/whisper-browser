'use strict';
const preferenceLabels={theme:['Theme','Tema'],language:['Language','Dil'],sponsorMode:['Sponsor skipping','Sponsor atlama']};
const voiceLabels={profile:['Quality','Kalite'],concurrency:['Parallel groups','Paralel grup'],grouping:['Grouping','Gruplama'],verification:['Verification','Kontrol'],timingMode:['Timing','Zamanlama'],expression:['Delivery','Anlatım'],keepBackground:['Music and ambience','Müzik ve ortam'],followDelivery:['Follow original delivery (experimental)','Özgün anlatımı izle (deneysel)'],deliveryStrength:['Transfer strength','Aktarım gücü'],sample:['Short sample','Kısa örnek'],start:['Start (seconds)','Başlangıç (saniye)'],end:['End (seconds)','Bitiş (saniye)']};
function snapshot(name,args,state){
 if(state?.status!=='completed')throw Error('Current settings unavailable.');
 if(name==='undo_app_preferences'){
  const changes=state.undoChanges;
  if(state.canUndo!==true||!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length)throw Error('No unchanged preference edit to undo.');
  const undoChanges=Object.fromEntries(Object.keys(changes).sort().map(key=>[key,changes[key]]));
  return JSON.stringify({values:JSON.parse(snapshot('set_app_preferences',undoChanges,state)),canUndo:true,undoChanges});
 }
 const voice=name==='configure_voice_generation';
 if(voice&&(!state.voice||state.voice.sourceChanged||state.voice.busy))throw Error('Voice settings unavailable or busy.');
 const source=voice?{...state.voice.settings,...state.voice.range}:state.preferences,values={};
 for(const key of Object.keys(args).sort()){
  const unsetRange=voice&&['start','end'].includes(key)&&state.voice.range===null;
  const value=unsetRange?null:source?.[key];
  if(!Object.hasOwn(voice?voiceLabels:preferenceLabels,key)||!unsetRange&&typeof value!==typeof args[key]||typeof value==='number'&&!Number.isFinite(value))throw Error('Setting has no valid current value: '+key);
  values[key]=value;
 }
 return JSON.stringify(values);
}
function summary(name,args,identity,locale){
 if(name==='undo_app_preferences'){
  const target=JSON.parse(identity);
  return summary('set_app_preferences',target.undoChanges,JSON.stringify(target.values),locale);
 }
 const before=JSON.parse(identity),tr=locale==='tr',labels=name==='configure_voice_generation'?voiceLabels:preferenceLabels;
 const choices={theme:{dark:['Dark','Koyu'],light:['Light','Açık'],system:['System','Sistem']},language:{en:['English','İngilizce'],tr:['Turkish','Türkçe']},sponsorMode:{off:['Off','Kapalı'],ask:['Ask','Sor'],auto:['Automatic','Otomatik']},profile:{quality:['Quality','Kaliteli'],fast:['Fast','Hızlı']},grouping:{akici:['Flowing blocks','Akıcı bloklar'],anlatim:['Sentence flow','Cümle akışı'],cumle:['Sentences','Cümleler'],satir:['Separate lines','Ayrı satırlar']},verification:{fast:['Fast','Hızlı'],balanced:['Balanced','Dengeli'],detailed:['Detailed','Ayrıntılı']},timingMode:{video:['Preserve speech','Konuşmayı koru'],clip:['Fixed video','Sabit video']},expression:{reference:['Reference delivery','Referansın tonu'],calm:['Calm','Sakin'],warm:['Warm','Sıcak'],lively:['Lively','Canlı']},deliveryStrength:{gentle:['Gentle','Hafif'],balanced:['Balanced','Dengeli'],strong:['Strong','Belirgin']}};
 const display=(key,value)=>value===null?(tr?'Seçilmedi':'Not set'):typeof value==='boolean'?(value?(tr?'Açık':'On'):(tr?'Kapalı':'Off')):choices[key]?.[value]?.[tr?1:0]||String(value).slice(0,160);
 const rows=Object.keys(before).filter(key=>before[key]!==args[key]).map(key=>labels[key][tr?1:0]+': '+display(key,before[key])+' → '+display(key,args[key]));
 if(!rows.length)return tr?'İstenen ayarlar zaten etkin; değişiklik yok.':'Requested settings are already active; no changes.';
 if(name==='configure_voice_generation'){
  if(args.timingMode==='clip')rows.push(tr?'Sabit video; konuşma kesilebilir.':'Fixed video; speech may be trimmed.');
  if(args.timingMode==='video')rows.push(tr?'Konuşmayı korumak için video yavaşlatılabilir.':'Video may slow to preserve speech.');
  rows.push(tr?'Üretim başlamaz.':'Generation does not start.');
 }
 return rows.join('\n');
}
module.exports={snapshot,summary};
