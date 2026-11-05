'use strict';
const {chunksOf}=require('./feed-translation');
const {sourceVersion}=require('./podcast-session');

// Publisher prose uses the configured text translator, never invented cue times.
function createPodcastTextTranslation({store,translate,createTranslator}){
 const running=new Set();
 return async function start(input,signal){
  const entry=store.entry(input.entryId),version=sourceVersion(entry),source=entry.podcastWorkspace?.sourceVersion===version?entry.podcastWorkspace.transcript:null;
  if(entry.kind!=='podcast'||input.sourceVersion!==version||source?.state!=='untimed'||source.status==='partial'||!source.text?.trim()||source.text.length>50000||input.expectedTranscriptText!==source.text)throw Error('Load a complete untimed podcast transcript first / Önce tam bir zamansız podcast metni yükleyin.');
  if(entry.spoiler==='marked'&&!entry.spoilerAllowed)throw Error('Show the spoiler source before translating / Çevirmeden önce spoiler içeren metni gösterin.');
  if(running.has(entry.id))throw Error('Podcast translation already running / Podcast çevirisi zaten çalışıyor.');
  const targetLanguage=String(input.targetLanguage||'tr');if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(targetLanguage))throw Error('Invalid translation language / Geçersiz çeviri dili.');
  const translator=createTranslator?createTranslator({targetLanguage}):translate;
  if(typeof translator!=='function')throw Error('Translation provider unavailable / Çeviri sağlayıcısı kullanılamıyor.');
  const current=()=>{signal.throwIfAborted();const row=store.entry(entry.id),track=row.podcastWorkspace?.transcript;if(sourceVersion(row)!==version||row.podcastWorkspace?.sourceVersion!==version||track?.state!=='untimed'||track.status==='partial'||track.text!==source.text)throw Error('Podcast transcript changed / Podcast metni değişti.');};
  running.add(entry.id);
  try{
   const parts=[];
   for(const text of chunksOf(source.text)){current();const result=await translator(text,signal);current();if(typeof result!=='string'||!result.trim()||result.length>14000)throw Error('Invalid translation result / Geçerli bir çeviri sonucu alınamadı.');parts.push(result.trim());}
   const text=parts.join('\n\n');if(text.length>100000)throw Error('Translation exceeds storage limit / Çeviri saklama sınırını aşıyor.');
   current();const translation={state:'untimed',format:'plain',provenance:'user',status:'complete',language:targetLanguage,text};
   store.podcastWorkspace(entry.id,version,{translation});
   return {sourceVersion:version,translation,sourceTranscriptText:source.text};
  }finally{running.delete(entry.id);}
 };
}
module.exports={createPodcastTextTranslation};
