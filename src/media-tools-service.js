'use strict';
// Original integration. No Luna source is bundled.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const { run } = require('./browser-media-tools');
const text = (v, limit=2000) => String(v ?? '').replace(/\0/g,'').trim().slice(0,limit);
function reviewRows(raw) {
  if (typeof raw !== 'string' || raw.length > 120000) throw Error('Use at most 120,000 characters.');
  let rows;
  if (raw.trim().startsWith('[')) { rows=JSON.parse(raw); if (!Array.isArray(rows)) throw Error('Expected a review array.'); }
  else rows=raw.split(/\n\s*\n/).map(body=>({text:body}));
  const parsed=rows.slice(0,100).map((row,i)=>({id:text(row.id,80)||String(i+1),author:text(row.author,120),text:text(row.text,4000),spoiler:!!row.spoiler})).filter(r=>r.text.length>=8);
  if(new Set(parsed.map(r=>r.id)).size!==parsed.length)throw Error('Review IDs must be unique.');return parsed;
}
function verifyDecision(raw, reviews) {
  if (!raw || !Array.isArray(raw.points) || !raw.points.length || raw.points.length>16) throw Error('Analysis needs 1–16 supported points.');
  return {summary:text(raw.summary,3000), fit:text(raw.fit,2000), points:raw.points.map(row=>{
    const source=reviews.find(r=>r.id===row.id), quote=text(row.quote,800);
    if (!source || quote.length<8 || !source.text.includes(quote)) throw Error('A review quote could not be verified.');
    return {id:row.id,quote,reason:text(row.reason,1500),kind:['praise','criticism','debate'].includes(row.kind)?row.kind:'debate'};
  }),at:Date.now()};
}
function tonight(items, history=[], options={}) {
  const max=Math.max(0,Math.min(300,Number(options.minutes)||0));
  const moods={tense:/thriller|crime|horror|gerilim|suç|korku/i,light:/comedy|family|komedi|aile/i,deep:/drama|documentary|belgesel/i,epic:/adventure|fantasy|science fiction|macera|fantastik|bilim/i,heart:/romance|romantik/i};
  const normalize=key=>String(key||'').startsWith('file:')?String(key).replace(/\\/g,'/').toLowerCase():String(key||'');
  const seen=new Map();for(const row of history){const key=normalize(row.key);if(!seen.has(key)||Number(row.lastWatched||0)>Number(seen.get(key).lastWatched||0))seen.set(key,row);}
  const watched=source=>source?seen.get(normalize(source.watchKey||'file:'+source.value)):null;
  const recent=new Set(options.recent||[]);
  const rows=[];
  for (const item of items) {
    const episode=item.kind==='series'?[...(item.episodes||[])].sort((a,b)=>a.season-b.season||a.number-b.number).find(ep=>ep.source&&ep.watchStatus!=='completed'&&!watched(ep.source)?.completed):null;
    const source=episode?.source || (item.kind==='film'?item.source:null);
    if (!source || source.type!=='local' || source.imported || item.watchStatus==='completed' || watched(source)?.completed) continue;
    const progress=watched(source),number=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
    const duration=number(progress?.duration)||number(episode?0:item.runtime)*60;
    const position=Math.min(duration||Infinity,number(progress?.position));
    const remaining=duration?Math.max(0,duration-position):0;
    if(duration&&remaining===0)continue;
    if (max && (!remaining || remaining>max*60)) continue;
    const runtime=duration/60;
    const mood=!!moods[options.mood]?.test((item.genres||[]).join(' '));
    rows.push({itemId:item.id,episodeId:episode?.id||'',title:item.title,year:item.year,runtime:Math.ceil(runtime),remaining:Math.ceil(remaining/60),position,duration,episode:episode?`S${episode.season} E${episode.number}`:'',mood,
      score:(mood?5:0)+(episode?2:0)+(item.favorite?1:0)-(recent.has(item.id)?10:0),source:source.value});
  }
  return rows.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,8);
}
function registerMediaTools({app,ipcMain,authorized,dialog,owner,catalogStore,ffprobe,fetchImpl=fetch}) {
  const root=()=>app.getPath('userData'), file=()=>path.join(root(),'media-enrichment.json');
  const read=()=>{if(!fs.existsSync(file()))return {version:1,titles:{}};if(fs.statSync(file()).size>16000000)throw Error('Media notes exceed 16 MB.');const value=JSON.parse(fs.readFileSync(file(),'utf8'));if(value.version!==1||!value.titles||typeof value.titles!=='object'||Array.isArray(value.titles))throw Error('Media notes are damaged. Original file was preserved.');return value;};
  const save=value=>{const json=JSON.stringify(value);if(Buffer.byteLength(json)>16000000)throw Error('Media notes exceed 16 MB.');atomicWriteFileSync(file(),json);};
  let scan=null, backingUp=false,scheduleIntent=0;const jobs=new Map();
  const scheduleFile=()=>path.join(root(),'media-backup-schedule.json');
  let schedule={every:'off',dir:'',last:0,error:''};
  try{if(fs.existsSync(scheduleFile())&&fs.statSync(scheduleFile()).size<8192){const raw=JSON.parse(fs.readFileSync(scheduleFile(),'utf8'));if(['off','daily','weekly'].includes(raw.every)&&typeof raw.dir==='string')schedule={every:raw.every,dir:raw.dir.slice(0,4000),last:Number.isFinite(raw.last)&&raw.last>0&&raw.last<=Date.now()?raw.last:0,error:''};}}catch{}
  const saveSchedule=()=>atomicWriteFileSync(scheduleFile(),JSON.stringify(schedule));
  async function autoBackup(){
    if(backingUp||schedule.every==='off'||!schedule.dir||Date.now()-schedule.last<(schedule.every==='weekly'?7:1)*86400000)return;
    backingUp=true;
    try{const dir=await fs.promises.realpath(schedule.dir);const name='whisper-auto-'+new Date().toISOString().replace(/[:.]/g,'-')+'.wbp';require('./workspace-package').exportPackage(root(),path.join(dir,name));
      const names=(await fs.promises.readdir(dir)).filter(n=>/^whisper-auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.wbp$/.test(n)).sort().reverse();
      for(const old of names.slice(7)){const target=path.join(dir,old);const stat=await fs.promises.lstat(target);if(stat.isFile()&&!stat.isSymbolicLink())await fs.promises.unlink(target);}
      schedule.last=Date.now();schedule.error='';
    }catch(e){schedule.error=e.message;}finally{backingUp=false;try{saveSchedule();}catch(e){schedule.error=e.message;}}
  }
  const backupTimer=setInterval(()=>void autoBackup(),3600000);backupTimer.unref?.();
  // No network and no startup file selection; only a previously chosen directory is used.
  const firstBackup=setTimeout(()=>void autoBackup(),60000);firstBackup.unref?.();
  const known = id=>{const item=catalogStore().get(id);if(!item)throw Error('Choose a library title first.');return item;};
  async function health(job) {
    const rows=[], hashes=new Map(), items=catalogStore().list();
    job.phase='inspect';job.hashed=0;job.hashTotal=0;
    const all=items.flatMap(item=>[{...item,source:item.source},...(item.episodes||[]).map(ep=>({...ep,title:item.title+' · '+ep.title,source:ep.source}))]).filter(r=>r.source?.type==='local');
    job.total=all.length;
    for(const row of all){
      if(job.cancel.signal.aborted)break;
      const source=row.source.value, facts={id:row.id,title:row.title,path:source,issues:[]};
      if(row.source.imported){facts.issues.push('unverified');rows.push(facts);job.done++;job.rows=rows.slice();continue;}
      if(!items.some(item=>(item.imdbId||item.tmdbId)&&(item.source?.value===source||item.episodes?.some(ep=>ep.source?.value===source))))facts.issues.push('unmatched');
      try {
        const stat=await fs.promises.stat(source);if(!stat.isFile())throw Error('not a file');
        if(/(?:^|[ ._-])sample(?:[ ._-]|$)/i.test(path.basename(source)))facts.issues.push('sample');
        // Full SHA-256 for same-size candidates only; streaming, cancellable, no deletion.
        const real=await fs.promises.realpath(source),identity=process.platform==='win32'?real.toLowerCase():real;
        const group=hashes.get(stat.size)||[];let candidate=group.find(r=>r.identity===identity);if(!candidate){candidate={path:real,identity,rows:[]};group.push(candidate);}candidate.rows.push(facts);hashes.set(stat.size,group);
        const stem=path.basename(source,path.extname(source));const side=(await fs.promises.readdir(path.dirname(source))).some(name=>name.toLowerCase().startsWith(stem.toLowerCase()+'.')&&/\.(srt|ass|ssa|vtt)$/i.test(name));
        if(!side){try{const probe=JSON.parse(await run(ffprobe(),['-v','error','-select_streams','s','-show_entries','stream=index','-of','json',source],undefined,job.cancel.signal,12000));if(!probe.streams?.length)facts.issues.push('no-subtitles');}catch(e){if(job.cancel.signal.aborted)break;facts.issues.push('probe-failed');}}
      } catch(error) {facts.issues.push(['ENOENT','ENOTDIR'].includes(error.code)?'missing':'probe-failed');}
      rows.push(facts);job.done++;job.rows=rows.slice();await new Promise(resolve=>setImmediate(resolve));
    }
    const candidates=[...hashes.values()].filter(group=>group.length>1);
    job.phase='hash';job.hashTotal=candidates.reduce((n,group)=>n+group.length,0);
    for(const group of candidates){
      const digest=new Map();
      for(const candidate of group){
        if(job.cancel.signal.aborted)break;
        try{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(candidate.path,{signal:job.cancel.signal}))hash.update(chunk);
          const key=hash.digest('hex'),same=digest.get(key);
          if(same){for(const row of [...same.rows,...candidate.rows])if(!row.issues.includes('duplicate'))row.issues.push('duplicate');}else digest.set(key,candidate);
        }catch{if(!job.cancel.signal.aborted)for(const row of candidate.rows)row.issues.push('probe-failed');}
        if(!job.cancel.signal.aborted)job.hashed++;
      }
      if(job.cancel.signal.aborted)break;
    }
    job.rows=rows;job.state=job.cancel.signal.aborted?'cancelled':'done';
  }
  const handle=async(event,input={})=>{
    if(!authorized(event))return {ok:false,error:'Unauthorized request.'};
    try {
      if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid request.');
      const action=input.action;
      if(action==='assistant-export'){if(typeof input.text!=='string'||input.text.length>8000000)throw Error('Conversation export exceeds 8 MB.');const content=input.text;if(!content)throw Error('No conversation to export.');const selected=await dialog.showSaveDialog(owner(),{defaultPath:'Whisper-conversation.md',filters:[{name:'Markdown / text',extensions:['md','txt']}]});if(selected.canceled)return {ok:true,canceled:true};atomicWriteFileSync(selected.filePath,'\uFEFF'+content);return {ok:true};}
      if(action==='backup-status')return {ok:true,value:{...schedule}};
      if(action==='backup-schedule'){
        if(!['off','daily','weekly'].includes(input.every))throw Error('Invalid backup interval.');
        if(backingUp)throw Error('A backup is being written. Wait until it finishes before changing its schedule.');const intent=++scheduleIntent;
        if(input.every==='off'){schedule.every='off';saveSchedule();return {ok:true};}
        const selected=await dialog.showOpenDialog(owner(),{properties:['openDirectory']});if(selected.canceled||intent!==scheduleIntent)return {ok:true,canceled:true};
        const directory=await fs.promises.realpath(selected.filePaths[0]);if(intent!==scheduleIntent)return {ok:true,canceled:true};if(backingUp)throw Error('A backup started while choosing a folder. Try again after it finishes.');if(!(await fs.promises.stat(directory)).isDirectory())throw Error('Choose a backup directory.');if(intent!==scheduleIntent)return {ok:true,canceled:true};if(backingUp)throw Error('A backup started while validating the folder. Try again after it finishes.');
        schedule={every:input.every,dir:directory,last:0,error:''};saveSchedule();await autoBackup();return {ok:true,value:{...schedule}};
      }
      if(action==='health-start'){if(scan?.state==='running')return {ok:true,id:scan.id};const job={id:randomUUID(),cancel:new AbortController(),state:'running',done:0,total:0,rows:[]};scan=job;void health(job).catch(e=>{job.state='failed';job.error=e.message;});return {ok:true,id:job.id};}
      if(action==='health-status'||action==='health-stop'){if(scan?.id!==input.id)throw Error('Scan expired.');if(action==='health-stop')scan.cancel.abort();return {ok:true,id:scan.id,state:scan.state,done:scan.done,total:scan.total,phase:scan.phase,hashed:scan.hashed,hashTotal:scan.hashTotal,rows:scan.rows,error:scan.error};}
      if(action==='reviews-stop'){jobs.get(input.id)?.abort();return {ok:true};}
      if(action==='reviews-file'){const picked=await dialog.showOpenDialog(owner(),{properties:['openFile'],filters:[{name:'Reviews TXT / JSON',extensions:['txt','json']}]});if(picked.canceled)return {ok:true,canceled:true};const target=picked.filePaths[0];if(fs.statSync(target).size>500000)throw Error('Review file is too large.');return {ok:true,reviews:reviewRows(fs.readFileSync(target,'utf8').replace(/^\uFEFF/,''))};}
      if(action==='reviews-fetch'){
        known(input.itemId);const url=new URL(input.url);if(url.protocol!=='https:'||url.hostname!=='letterboxd.com'||url.port||url.username||url.password||!/^\/film\/[a-z0-9-]+\/(?:reviews\/)?$/.test(url.pathname)||url.search||url.hash)throw Error('Use a public https://letterboxd.com/film/title/reviews/ address.');
        if(jobs.size)throw Error('A review request is already running.');const id=text(input.id,80);if(!id)throw Error('Request ID required.');const controller=new AbortController();jobs.set(id,controller);
        try{const response=await fetchImpl(url.href,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),redirect:'error',credentials:'omit'});if(!response.ok)throw Error('Review site returned HTTP '+response.status+'. Paste or import reviews instead.');let html='',bytes=0;const decoder=new TextDecoder();for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>3000000)throw Error('Review page too large.');html+=decoder.decode(chunk,{stream:true});if(html.length>3000000)throw Error('Review page too large.');}
          const strip=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
          html+=decoder.decode();
          const reviews=[...html.matchAll(/<div\b[^>]*class=["'][^"']*\bjs-review-body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].slice(0,50).map((m,i)=>({id:String(i+1),text:strip(m[1]).slice(0,4000),author:'',spoiler:/spoiler/i.test(m[0]+html.slice(Math.max(0,m.index-500),m.index))})).filter(r=>r.text.length>=8);
          if(!reviews.length)throw Error('No readable reviews found. The site may require access or its format changed; paste or import reviews.');return {ok:true,reviews,url:url.href};
        }finally{jobs.delete(id);}
      }
      if(action==='decision-get'){known(input.itemId);const data=read();return {ok:true,value:(Object.hasOwn(data.titles,input.itemId)?data.titles[input.itemId]:{})};}
      if(['decision-save','feedback-save'].includes(action)){
        known(input.itemId);const data=read(),previous=Object.hasOwn(data.titles,input.itemId)?data.titles[input.itemId]:{};
        if(action==='feedback-save'){const feedback={reaction:['like','neutral','dislike'].includes(input.reaction)?input.reaction:'neutral',note:text(input.note),aspects:Array.isArray(input.aspects)?input.aspects.filter(k=>require('./media-taste').ASPECTS.includes(k)):[],at:Date.now()};data.titles[input.itemId]={...previous,feedback};}
        else{const reviews=reviewRows(JSON.stringify(input.reviews)),analysis=verifyDecision(input.analysis,reviews);data.titles[input.itemId]={...previous,history:[{analysis,reviews},...(previous.history||[])].slice(0,8)};}
        save(data);return {ok:true,value:data.titles[input.itemId]};
      }
      if(action==='backup-export'){
        const picked=await dialog.showSaveDialog(owner(),{defaultPath:'Whisper-media-'+new Date().toISOString().slice(0,10)+'.wbp',filters:[{name:'Workspace backup',extensions:['wbp']}]});if(picked.canceled)return {ok:true,canceled:true};return {ok:true,...require('./workspace-package').exportPackage(root(),picked.filePath)};
      }
      if(action==='audio-get')return {ok:true,value:read().audio||{film:'off',music:'off',voice:'dialogue'}};
      if(action==='audio-save'){const data=read();const values={};for(const k of ['film','music','voice'])values[k]=['off','night','dialogue','guard'].includes(input.value?.[k])?input.value[k]:'off';data.audio=values;save(data);return {ok:true,value:values};}
      throw Error('Unsupported media tool.');
    } catch(error){return {ok:false,error:error.name==='AbortError'?'Cancelled.':error.message};}
  };
  ipcMain.handle('media-tools:request',handle);app.on('before-quit',()=>{clearInterval(backupTimer);clearTimeout(firstBackup);scan?.cancel.abort();for(const job of jobs.values())job.abort();});return {handle};
}
module.exports={registerMediaTools,reviewRows,verifyDecision,tonight};
