'use strict';
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Metadata revisions and episode identity do not prove byte-identical audio.
function sourceVersion(entry){return hash([entry.id,entry.enclosures?.filter(e=>/^audio\//.test(e.type)).map(e=>[e.url,e.length||null,e.type])||[]]);}
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
module.exports={sourceVersion,spotifyEpisode,validateWorkspace,validateTimedText};
