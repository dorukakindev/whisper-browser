'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {parseTimedBlocks,cleanCueText}=require('./browser-subtitles');
const {cuesToSrt}=require('./browser-asset-store');
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=value=>cleanCueText(value).replace(/\s+/gu,' ').trim();
const ms=value=>Math.round(value*1000);
function canonicalOriginals(rows) {
  if(!Array.isArray(rows)||!rows.length||rows.length>20000)return null;
  if(rows.some(row=>!row||!Number.isSafeInteger(row.startMs)||!Number.isSafeInteger(row.endMs)
    ||row.startMs<0||row.endMs<=row.startMs||typeof row.text!=='string'||row.text.length>12000))return null;
  return rows.map(row=>({startMs:row.startMs,endMs:row.endMs,text:row.text.normalize('NFC')}));
}
function groupEvidence(bytes,groups,translated,originals,guidance={}) {
  if(!Array.isArray(groups)||!groups.length||groups.length>5000||translated.length!==originals.length)return null;
  const joined=[];
  for(const group of groups) {
    if(typeof group?.key!=='string'||!/^\d+(?:,\d+)*$/.test(group.key))continue;
    const ids=group.key.split(',').map(Number);
    if(ids.some((id,i)=>!Number.isSafeInteger(id)||id<1||id>translated.length||(i&&id<=ids[i-1])))continue;
    const rows=ids.map(id=>translated[id-1]);
    // Plan text must actually belong to these subtitle ordinals. Unknown SDH
    // transformations deliberately leave that group without source evidence.
    if(text(rows.map(row=>row.text).join(' '))!==text(group.text))continue;
    if(ids.some(id=>!originals[id-1]?.text))continue;
    const first=ids[0]-1,last=ids.at(-1)-1;
    joined.push({key:group.key,text:group.text,original:ids.map(id=>originals[id-1].text).join(' '),
      originalBefore:originals.slice(Math.max(0,first-2),first).map(row=>row.text).join(' '),
      originalAfter:originals.slice(last+1,last+3).map(row=>row.text).join(' '),
      before:translated.slice(Math.max(0,first-2),first).map(row=>row.text).join(' '),
      after:translated.slice(last+1,last+3).map(row=>row.text).join(' '),
      speaker:[...new Set(ids.map(id=>originals[id-1].speaker).filter(Boolean))].join(', ')});
  }
  return joined.length?{subtitleHash:hash(bytes),groups:joined,
    terminology:typeof guidance.terminology==='string'?guidance.terminology.slice(0,3000):'',
    roles:typeof guidance.roles==='string'?guidance.roles.slice(0,1500):''}:null;
}
function fromMetadata(bytes,groups,metadata) {
  if(metadata?.sourceContextVersion!==1||metadata.subtitleHash!==hash(bytes)||!/^[a-f0-9]{64}$/.test(metadata.sourceHash||''))return null;
  const originals=canonicalOriginals(metadata.originalCues);
  if(!originals||hash(JSON.stringify(originals))!==metadata.originalHash)return null;
  // subtitle_entries_hash uses Python JSON floats for second values. Recreate
  // that small canonical contract, including the .0 on integral seconds.
  const seconds=value=>value%1000===0?`${value/1000}.0`:String(value/1000);
  const canonical='['+originals.map(row=>`{"s":${seconds(row.startMs)},"e":${seconds(row.endMs)},"t":${JSON.stringify(row.text)}}`).join(',')+']';
  if(hash(canonical)!==metadata.sourceHash)return null;
  const translated=parseTimedBlocks(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(translated.length!==originals.length||!Array.isArray(metadata.cues)||metadata.cues.length!==originals.length)return null;
  if(translated.some((cue,i)=>ms(cue.start)!==originals[i].startMs||ms(cue.end)!==originals[i].endMs
    ||text(cue.text)!==text(metadata.cues[i]?.text)))return null;
  // Failed/partial source rows cannot license an editorial rewrite.
  return groupEvidence(bytes,groups,translated,originals.map((row,i)=>metadata.cues[i].status==='completed'?row:{...row,text:''}),metadata.speechGuidance);
}
function fromBrowserDocuments(bytes,groups,translation,source,guidance) {
  if(translation?.role!=='translation'||source?.role!=='source'||translation.mediaId!==source.mediaId
    ||translation.sourceTrackId!==source.trackId||!translation.sourceHash||translation.sourceHash!==source.sourceHash
    ||!Array.isArray(source.cues)||!Array.isArray(translation.cues)
    ||source.cues.length>20000||translation.cues.length>20000)return null;
  if(hash(JSON.stringify(source.cues.map(cue=>[cue.start,cue.end,cue.text])))!==source.sourceHash)return null;
  if(!Buffer.from('\uFEFF'+cuesToSrt(translation.cues),'utf8').equals(bytes))return null;
  const originals=[];
  for(const cue of translation.cues) {
    const id=String(cue.cueId||'').replace(/^web-tr-/,'');
    const matches=source.cues.filter(row=>String(row.cueId||row.id)===id
      &&ms(row.start)===ms(cue.start)&&ms(row.end)===ms(cue.end));
    if(matches.length!==1) originals.push({text:''});
    else originals.push(matches[0]);
  }
  return groupEvidence(bytes,groups,translation.cues,originals,guidance);
}
function createSourceResolver({getAssetStore=()=>null,getIndex=()=>null,guidance=()=>({})}={}) {
  return async function resolveSourceContext({srt,subtitleBytes,preparedGroups}) {
    if(!Buffer.isBuffer(subtitleBytes)||subtitleBytes.length>4_000_000||!Array.isArray(preparedGroups))return null;
    // This is the selected authorized artifact's own sidecar. No path embedded
    // in metadata is followed; symlinks/reparse redirects are rejected.
    try {
      const sidecar=srt+'.meta.json',stat=fs.lstatSync(sidecar);
      if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=8_000_000
        &&path.dirname(fs.realpathSync(sidecar))===path.dirname(fs.realpathSync(srt))) {
        const result=fromMetadata(subtitleBytes,preparedGroups,JSON.parse(fs.readFileSync(sidecar,'utf8')));
        if(result)return result;
      }
    } catch (_) {}
    const store=getAssetStore(),index=getIndex();
    if(!store||!index)return null;
    const ids=[...new Set(index.listTrackAssetPaths())].slice(0,5000);
    // Prefer the selected owned asset, then bounded historical candidates.
    // Keep one document at a time; large libraries need not be held in memory.
    const selected=ids.find(id=>store.assetPaths(id)?.srtPath===srt);
    // An exact asset path is an authoritative reverse lookup. Exported copies
    // may use canonical bytes, but cannot justify scanning an entire library.
    const candidates=selected?[selected]:ids.slice(0,128);
    for(const id of candidates) {
      const saved=store.getTrack(id),translation=saved.ok?saved.document:null;
      if(translation?.role!=='translation')continue;
      if(!Buffer.from('\uFEFF'+cuesToSrt(translation.cues),'utf8').equals(subtitleBytes))continue;
      for(const sourceId of ids.filter(value=>value.split(':')[0]===id.split(':')[0])) {
        const original=store.getTrack(sourceId),source=original.ok?original.document:null;
        if(source?.role!=='source'||source.mediaId!==translation.mediaId||source.trackId!==translation.sourceTrackId)continue;
        const result=fromBrowserDocuments(subtitleBytes,preparedGroups,translation,source,guidance(translation));
        if(result)return result;
      }
    }
    return null;
  };
}
module.exports={createSourceResolver,fromMetadata,fromBrowserDocuments};
