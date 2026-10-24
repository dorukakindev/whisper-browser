'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {atomicWriteFileSync} = require('./fsync-utils');
// One bounded worker. The renderer can leave Settings without canceling the job.
function createMetadataSync({store, settings, userData, complete, now = Date.now}) {
  let controller = null, revision = '', attempts = null;
  let state = {running:false, done:0, updated:0, total:0, unmatched:0, failed:0, noPoster:0, version:0, issue:'', current:'', stopped:false};
  const file = () => path.join(userData(), 'catalog-metadata-attempts.json');
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const fingerprint = item => digest([item.id,item.title,item.originalTitle,item.year,item.imdbId,item.tmdbId,settings().language,digest(settings().apiKey||'') ]);
  function cache() {
    if (!attempts) { try { attempts=JSON.parse(fs.readFileSync(file(),'utf8')); } catch { attempts={}; } }
    if (!attempts || typeof attempts!=='object' || Array.isArray(attempts)) attempts={};
    return attempts;
  }
  function persist() { try { atomicWriteFileSync(file(),JSON.stringify(Object.fromEntries(Object.entries(cache()).slice(-10000)))); } catch {} }
  const missing = item => (!item.posterPath || !fs.existsSync(item.posterPath)) || !item.synopsis || !item.directors?.length || !item.runtime;
  function snapshot() { return {...state,configured:!!settings().apiKey}; }
  function cancel() { if(controller){state.stopped=true;controller.abort();}return snapshot(); }
  function start({retry=false}={}) {
    const config=settings(), nextRevision=digest([config.apiKey||'',config.language]);
    if(controller){if(revision!==nextRevision)cancel();return snapshot();}
    if(!config.apiKey)return snapshot();
    if(revision===nextRevision && !retry && (state.stopped || state.issue==='auth' || state.issue==='rate'))return snapshot();
    if(revision && revision!==nextRevision) attempts={};
    revision=nextRevision;
    const rows=store().list().filter(item=>missing(item)&&(retry || !(Number(cache()[fingerprint(item)]) > now()-86400000)));
    if(!rows.length)return snapshot();
    const worker = new AbortController();controller=worker;
    state={...state,running:true,done:0,updated:0,total:rows.length,unmatched:0,failed:0,noPoster:0,issue:'',current:'',stopped:false};
    void (async()=>{
      try {
        for(const row of rows){
          if(worker.signal.aborted)break;
          if(digest([settings().apiKey||'',settings().language])!==revision){worker.abort();break;}
          const current=store().get(row.id);if(!current){state.done++;continue;}
          state.current=current.title;
          try{
            const result=await complete(current.id,worker.signal);
            if(worker.signal.aborted)break;
            if(!result?.ok)throw Error('Metadata completion failed');
            if(!result.skipped){state.updated++;state.version++;if(result.item?.hasPoster===false)state.noPoster++;}
          }catch(error){
            if(worker.signal.aborted)break;
            if(error.code==='ambiguous')state.unmatched++;else state.failed++;
            state.issue=error.status===401?'auth':error.status===429?'rate':error.code==='ambiguous'?'match':'connection';
            if(error.status===401||error.status===429)break; // No hammering a rejected/rate-limited provider.
          }
          const latest=store().get(row.id);if(latest)cache()[fingerprint(latest)]=now();
          state.done++;
          if(state.done%10===0)persist();
          await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);worker.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,120);worker.signal.addEventListener('abort',finish,{once:true});});
        }
      }finally{persist();if(controller===worker){controller=null;state.running=false;state.current='';if(digest([settings().apiKey||'',settings().language])!==revision)start();}}
    })();
    return snapshot();
  }
  return {start,cancel,snapshot};
}
module.exports={createMetadataSync};
