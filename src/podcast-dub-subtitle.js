'use strict';
// A stored timed podcast transcript (SRT/VTT) becomes a dubbing SRT through the shared subtitle pipeline
// (parseSubtitlePayload + cuesToSrt). The pipeline is built for live captions: it sorts, repairs invalid end
// times, merges rolling duplicates and drops empty cues. A dubbing source must not be silently altered that way,
// so the result is proved against an independent scan of the ORIGINAL text. Any difference rejects the
// derivation instead of producing a file that merely looks usable. The stored original is never modified.
const {parseSubtitlePayload,cuesToSrt,cleanCueText}=require('./browser-subtitles');

const fail=(code,message)=>Object.assign(Error(message),{code});
const squash=value=>String(value).replace(/\s+/g,' ').trim();
const TIMING=/^\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})(?:\s.*)?$/;
const ms=(h,m,s,f)=>((Number(h||0)*60+Number(m))*60+Number(s))*1000+Number(String(f).padEnd(3,'0'));

// Independent scan of cue timing lines in source order (hours optional, NOTE/STYLE/REGION blocks skipped).
function scanCues(text){
  const rows=[];let unprovedBlock=false;
  for(const block of String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split(/\n[ \t]*\n/)){
    const lines=block.split('\n');
    if(!block.trim())continue;
    if(/^(?:WEBVTT|NOTE|STYLE|REGION)(?:[ \t]|$)/.test(lines[0]))continue;
    const index=lines.findIndex(line=>line.includes('-->'));
    if(index<0||index>1){unprovedBlock=true;continue;}
    const match=TIMING.exec(lines[index]);
    if(!match){unprovedBlock=true;continue;}
    const body=squash(cleanCueText(lines.slice(index+1).join('\n')));
    if(!body)continue; // non-speech cue: nothing to dub, not counted
    rows.push({start:ms(match[1],match[2],match[3],match[4]),end:ms(match[5],match[6],match[7],match[8]),text:body});
  }
  // Otherwise both scans can ignore the same malformed opening speech and
  // misleadingly agree on the surviving valid cues.
  if(unprovedBlock&&rows.length)throw fail('timing-not-preserved','Transcript contains unverified timing or speech blocks / Dökümde doğrulanamayan zaman veya konuşma satırları var.');
  return rows;
}

function deriveDubSrt(text){
  const raw=String(text||'');
  if(raw.length>4000000)throw fail('too-large','Transcript is too large / Döküm çok büyük.');
  const expected=scanCues(raw);
  if(!expected.length)throw fail('no-timed-cues','No valid timed cues / Geçerli zamanlı satır bulunamadı.');
  const srt=cuesToSrt(parseSubtitlePayload(raw).cues);
  const back=parseSubtitlePayload(srt).cues.map(cue=>({start:Math.round(cue.start*1000),end:Math.round(cue.end*1000),text:squash(cleanCueText(cue.text))}));
  const same=back.length===expected.length&&expected.every((row,index)=>Math.abs(back[index].start-row.start)<=1&&Math.abs(back[index].end-row.end)<=1&&back[index].text===row.text);
  if(!same)throw fail('timing-not-preserved','Transcript timing could not be preserved for dubbing / Dublaj için döküm zamanları korunamadı.');
  return {srt,cues:expected.length};
}
module.exports={deriveDubSrt,scanCues};
