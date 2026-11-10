'use strict';
const S=require('./podcast-session');
function inspect(entry,binding){
 const current=entry?.kind==='podcast'&&entry.id===binding.entryId&&S.sourceVersion(entry)===binding.sourceVersion&&(!binding.episodeIdentity||S.episodeIdentity(entry)===binding.episodeIdentity),w=current&&entry.podcastWorkspace?.sourceVersion===binding.sourceVersion?entry.podcastWorkspace:null;
 const transcript=w?.transcript,translation=w?.translation,translationOnly=binding.outputRole==='translation';
 const transcriptMatches=!translationOnly||transcript?.state==='timed'&&transcript.text===binding.sourceTranscriptText;
 return {canResume:!!current&&!!transcriptMatches,state:!current?'source-changed':!transcriptMatches?'transcript-changed':'current',entryId:binding.entryId,title:entry?.title||'',sourceSaved:!!transcript?.text,translationSaved:!!translation?.text,translationComplete:!!translation?.text&&translation.status!=='partial',inputState:translationOnly?'materialize-saved-transcript':'reacquire-audio',coverage:binding.coverage||null,outputRole:translationOnly?'translation':'source',retryOnly:binding.retryOnly===true,targetLanguage:binding.targetLanguage||null,automatic:false,byteReuseVerified:false};
}
module.exports={inspect};
