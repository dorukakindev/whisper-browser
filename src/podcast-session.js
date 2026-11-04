'use strict';
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Queries may contain rotating access credentials. They are neither episode identity
// nor evidence of different bytes and must not escape into the public binding.
function resourceIdentity(value){try{const u=new URL(value);return u.protocol+'//'+u.host+u.pathname;}catch{return 'unknown';}}
function episodeIdentity(entry){return hash(entry.externalId?['feed-guid',entry.feedId,entry.externalId]:['local-entry',entry.id]);}
function declaredSource(entry){const e=entry.enclosures?.find(e=>/^audio\//.test(e.type));return {resource:e?resourceIdentity(e.url):'unknown',mime:e?.type||'unknown',declaredLength:Number.isSafeInteger(e?.length)&&e.length>0?e.length:'unknown'};}
function validateAudioEvidence(e){
 if(!e||!Number.isInteger(e.revision)||e.revision<1||!/^[a-f0-9]{64}$/.test(e.declaration)||!(e.etag==='unknown'||typeof e.etag==='string'&&e.etag.length<=500&&!/[\r\n\0]/.test(e.etag))||!Number.isSafeInteger(e.length)||e.length<1||!/^[a-f0-9]{64}$/.test(e.sha256)||e.probe!=='unknown')throw Error('Invalid podcast audio evidence.');return e;
}
function sourceBinding(entry){const declaration=declaredSource(entry),known=entry.podcastAudioEvidence;const e=known?.declaration===hash(declaration)?known:null;return {episodeIdentity:episodeIdentity(entry),revision:e?.revision||entry.podcastSourceRevision||0,...declaration,etag:e?.etag||'unknown',length:e?.length||'unknown',sha256:e?.sha256||'unknown',probe:e?.probe||'unknown',fingerprintStatus:e?'download-verified':'unknown'};}
// Unknown means there is no byte-identity claim, even when this key is stable.
function sourceVersion(entry){return hash(sourceBinding(entry));}
function audioEvidence(entry,result){const previous=entry.podcastAudioEvidence;const next={revision:Math.max(entry.podcastSourceRevision||0,previous?.revision||1),declaration:hash(declaredSource(entry)),etag:result.etag||'unknown',length:result.bytes,sha256:result.sha256,probe:'unknown'};if(previous&&['declaration','etag','length','sha256'].some(k=>previous[k]!==next[k]))next.revision++;return validateAudioEvidence(next);}
function spotifyEpisode(value){let u;try{u=new URL(value);}catch{throw Error('Choose a Spotify episode URL.');}if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||!/^\/episode\/[A-Za-z0-9]{22}$/.test(u.pathname)||u.username||u.password)throw Error('Choose a Spotify episode URL.');return 'https://open.spotify.com'+u.pathname;}
function validateTimedText(text){
 if(typeof text!=='string'||text.length>500000)throw Error('Podcast transcript exceeds storage limit.');
 const time=v=>{const parts=v.replace(',','.').split(':').map(Number);if(parts.length<2||parts.length>3||parts.some(n=>!Number.isFinite(n)||n<0)||parts.at(-1)>=60||parts.at(-2)>=60)return NaN;return parts.reduce((n,p)=>n*60+p,0);};
 const lines=text.split(/\r?\n/).filter(line=>line.includes('-->'));if(!lines.length||lines.length>50000)throw Error('Invalid timed podcast transcript.');
 for(const line of lines){const m=/^\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})(?:\s.*)?$/.exec(line);if(!m||!Number.isFinite(time(m[1]))||!Number.isFinite(time(m[2]))||time(m[2])<=time(m[1]))throw Error('Invalid podcast cue timing.');}
 return true;
}
function validateWorkspace(w){
 if(!w||typeof w.sourceVersion!=='string'||!/^[a-f0-9]{64}$/.test(w.sourceVersion)||!Number.isFinite(w.position)||w.position<0||w.position>31536000||!Number.isFinite(w.rate)||w.rate<.25||w.rate>4)throw Error('Invalid podcast workspace.');
 if(w.previous){if(w.previous.previous)throw Error('Nested podcast history is not supported.');validateWorkspace(w.previous);}
 if(w.spotifyUrl&&spotifyEpisode(w.spotifyUrl)!==w.spotifyUrl)throw Error('Invalid Spotify binding.');
 for(const t of [w.transcript,w.translation].filter(Boolean)){if(!['timed','untimed'].includes(t.state)||typeof t.text!=='string'||t.text.length>500000||!['vtt','srt','plain'].includes(t.format)||!['publisher','asr','user'].includes(t.provenance))throw Error('Invalid saved podcast transcript.');if(t.state==='timed'){if(t.format==='plain')throw Error('Plain podcast transcript has no timing.');validateTimedText(t.text);}}
 return w;
}
module.exports={sourceVersion,sourceBinding,episodeIdentity,resourceIdentity,audioEvidence,validateAudioEvidence,spotifyEpisode,validateWorkspace,validateTimedText};
