'use strict';
const {chunksOf}=require('./feed-translation');
const {sourceVersion}=require('./podcast-session');
const {createHash}=require('node:crypto');

// Context follows the existing translateContext meaning: ±N text lines around each chunk, 0 = off.
// For untimed prose a "line" is one non-empty text line (publisher paragraph). The caller freezes the
// value when the job starts (no new default here: an absent value keeps the previous no-context behaviour).
// Each neighbour row and each side are budgeted so a wide setting cannot blow up the provider request.
const CONTEXT_LINES_MAX=20,CONTEXT_ROW_CHARS=700,CONTEXT_SIDE_CHARS=2400;
function contextLinesOf(value){
 if(value===undefined)return 0;
 if(!Number.isInteger(value)||value<0||value>CONTEXT_LINES_MAX)throw Error('Invalid translation context / Geçersiz çeviri bağlamı.');
 return value;
}
const rowsOf=chunk=>String(chunk).split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
const safeEdges=value=>value.replace(/^[\uDC00-\uDFFF]/,'').replace(/[\uD800-\uDBFF]$/,'').trim();
const tailOf=(row,budget=CONTEXT_ROW_CHARS)=>{const limit=Math.min(CONTEXT_ROW_CHARS,budget);if(row.length<=limit)return row;const cut=row.length-limit,piece=row.slice(cut);return safeEdges(/\s/.test(row[cut-1])?piece:piece.replace(/^\S+\s*/,''));};
const headOf=(row,budget=CONTEXT_ROW_CHARS)=>{const limit=Math.min(CONTEXT_ROW_CHARS,budget);if(row.length<=limit)return row;const piece=row.slice(0,limit);return safeEdges(/\s/.test(row[limit])?piece:piece.replace(/\s*\S+$/,''));};
// Read-only neighbours taken from the source text outside the chunk being translated, closest first.
function neighborContext(chunks,index,lines){
 const before=[],after=[];
 if(!lines)return {before,after};
 let used=0;
 for(let i=index-1;i>=0&&before.length<lines&&used<CONTEXT_SIDE_CHARS;i--){const rows=rowsOf(chunks[i]);for(let j=rows.length-1;j>=0&&before.length<lines&&used<CONTEXT_SIDE_CHARS;j--){const row=tailOf(rows[j],CONTEXT_SIDE_CHARS-used);if(row){before.unshift(row);used+=row.length;}}}
 used=0;
 for(let i=index+1;i<chunks.length&&after.length<lines&&used<CONTEXT_SIDE_CHARS;i++){for(const source of rowsOf(chunks[i])){if(after.length>=lines||used>=CONTEXT_SIDE_CHARS)break;const row=headOf(source,CONTEXT_SIDE_CHARS-used);if(row){after.push(row);used+=row.length;}}}
 return {before,after};
}
// Partial safeguard only: catches a verbatim copy of the ORIGINAL neighbour text in a result. A model that
// translates or paraphrases the context into the output is NOT detected here; the request structure and the
// provider prompt (neighbours are read-only fields, never the target) carry that contract.
const echoesContext=(result,context,chunk)=>[...context.before,...context.after].some(row=>row.length>=24&&result.includes(row)&&!chunk.includes(row));

// Publisher prose uses the configured text translator, never invented cue times.
function createPodcastTextTranslation({store,translate,createTranslator}){
 const running=new Set();
 return async function start(input,signal){
  const entry=store.entry(input.entryId),version=sourceVersion(entry),source=entry.podcastWorkspace?.sourceVersion===version?entry.podcastWorkspace.transcript:null;
  if(entry.kind!=='podcast'||input.sourceVersion!==version||source?.state!=='untimed'||source.status==='partial'||!source.text?.trim()||source.text.length>50000||input.expectedTranscriptText!==source.text)throw Error('Load a complete untimed podcast transcript first / Önce tam bir zamansız podcast metni yükleyin.');
  if(entry.spoiler==='marked'&&!entry.spoilerAllowed)throw Error('Show the spoiler source before translating / Çevirmeden önce spoiler içeren metni gösterin.');
  if(running.has(entry.id))throw Error('Podcast translation already running / Podcast çevirisi zaten çalışıyor.');
  const targetLanguage=String(input.targetLanguage||'tr');if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(targetLanguage))throw Error('Invalid translation language / Geçersiz çeviri dili.');
  const contextLines=contextLinesOf(input.contextLines);
  const translator=createTranslator?createTranslator({targetLanguage}):translate;
  if(typeof translator!=='function')throw Error('Translation provider unavailable / Çeviri sağlayıcısı kullanılamıyor.');
  const current=()=>{signal.throwIfAborted();const row=store.entry(entry.id),track=row.podcastWorkspace?.transcript;if(sourceVersion(row)!==version||row.podcastWorkspace?.sourceVersion!==version||track?.state!=='untimed'||track.status==='partial'||track.text!==source.text)throw Error('Podcast transcript changed / Podcast metni değişti.');};
  running.add(entry.id);
  try{
   const chunks=chunksOf(source.text);
   const identity=typeof translator.checkpointIdentity==='string'&&/^[a-f0-9]{64}$/.test(translator.checkpointIdentity)?translator.checkpointIdentity:null;
   const fingerprint=createHash('sha256').update(JSON.stringify([version,source.text,targetLanguage,contextLines,identity])).digest('hex');
   const saved=entry.podcastWorkspace?.textTranslationRecovery;
   const parts=identity&&saved?.fingerprint===fingerprint&&Array.isArray(saved.parts)&&saved.parts.length<=chunks.length&&saved.parts.every(p=>typeof p==='string'&&p.trim()&&p.length<=14000)?[...saved.parts]:[];
   const checkpoint=()=>store.podcastWorkspace(entry.id,version,{textTranslationRecovery:{fingerprint,parts:[...parts],targetLanguage,contextLines}});
   for(const [index,text] of chunks.entries()){if(index<parts.length)continue;current();const context=neighborContext(chunks,index,contextLines);const result=await translator(text,signal,context);current();if(typeof result!=='string'||!result.trim()||result.length>14000)throw Error('Invalid translation result / Geçerli bir çeviri sonucu alınamadı.');if(echoesContext(result,context,text))throw Error('Translation repeated neighbor context / Çeviri komşu bağlamı çıktıya taşıdı.');parts.push(result.trim());if(parts.join('\n\n').length>100000)throw Error('Translation exceeds storage limit / Çeviri saklama sınırını aşıyor.');checkpoint();}
   const text=parts.join('\n\n');if(text.length>100000)throw Error('Translation exceeds storage limit / Çeviri saklama sınırını aşıyor.');
   current();const translation={state:'untimed',format:'plain',provenance:'user',status:'complete',language:targetLanguage,text};
   store.podcastWorkspace(entry.id,version,{translation,textTranslationRecovery:null});
   return {sourceVersion:version,translation,sourceTranscriptText:source.text,contextLines};
  }finally{running.delete(entry.id);}
 };
}
module.exports={createPodcastTextTranslation};
