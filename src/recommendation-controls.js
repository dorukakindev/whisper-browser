'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('./personal-collection'),{atomicWriteFileSync}=require('./fsync-utils'),{DOMAINS}=require('./media-domains'),{features,cosine}=require('./personal-recommendations');
const fold=s=>String(s||'').trim().toLocaleLowerCase('en'),key=r=>JSON.stringify([r.domain,r.id]);
function franchiseAnnotator(entries=[]){
 const parent=new Map(),aliases=new Map(),related=new Set(),find=id=>{if(!parent.has(id))parent.set(id,id);let root=id;while(parent.get(root)!==root)root=parent.get(root);let node=id;while(parent.get(node)!==node){const next=parent.get(node);parent.set(node,root);node=next;}return root;};
 for(const entry of entries){const graph=entry.graph;if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))continue;const nodes=new Map(graph.nodes.map(n=>[n.id,n]));for(const n of graph.nodes)if(['anime','manga'].includes(n.domain)&&/^anilist:(anime|manga):[1-9]\d*$/.test(n.id||'')){find(n.id);if(/^[1-9]\d*$/.test(n.malId||''))aliases.set('mal:'+n.domain+':'+n.malId,n.id);}
  for(const e of graph.edges){if(!['PREQUEL','SEQUEL','PARENT','SIDE_STORY','SPIN_OFF','SAME_UNIVERSE'].includes(e.type)||!nodes.has(e.from)||nodes.get(e.from)?.domain!==nodes.get(e.to)?.domain||!parent.has(e.from)||!parent.has(e.to))continue;const a=find(e.from),b=find(e.to);if(a!==b)parent.set(a<b?b:a,a<b?a:b);related.add(e.from);related.add(e.to);}}
 return rows=>rows.map(row=>{const id=aliases.get('mal:'+row.domain+':'+row.providerId)||'anilist:'+row.domain+':'+row.metadata?.providerId;if(!related.has(id))return row;return {...row,metadata:{...(row.metadata||{genres:row.genres||[],themes:row.themes||[],directors:row.directors||[],studios:row.studios||[]}),franchiseId:find(id),franchiseSource:'cached-anilist-relations'}};});
}
function filtersOf(raw={}){
 const keys=['finishedOnly','maxMinutes','formats','yearFrom','yearTo','avoid'];if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!keys.includes(k)))throw Error('Invalid recommendation conditions. / Geçersiz öneri koşulları.');
 const f={finishedOnly:false,maxMinutes:null,formats:[],yearFrom:null,yearTo:null,avoid:[],...raw};
 if(typeof f.finishedOnly!=='boolean'||f.maxMinutes!==null&&(!Number.isFinite(f.maxMinutes)||f.maxMinutes<1||f.maxMinutes>10000))throw Error('Invalid duration condition. / Geçersiz süre koşulu.');
 for(const k of ['formats','avoid'])if(!Array.isArray(f[k])||f[k].length>24||f[k].some(v=>typeof v!=='string'||!v.trim()||v.length>100))throw Error('Invalid topic/format condition. / Geçersiz konu/format koşulu.');
 for(const k of ['yearFrom','yearTo'])if(f[k]!==null&&(!Number.isInteger(f[k])||f[k]<1880||f[k]>2200))throw Error('Invalid year condition. / Geçersiz yıl koşulu.');if(f.yearFrom!==null&&f.yearTo!==null&&f.yearFrom>f.yearTo)throw Error('Conflicting years. / Çelişen yıllar.');return f;
}
function rank(rows,diversity='balanced',penalty=()=>0,explain=false){
 if(!['off','balanced','varied'].includes(diversity))throw Error('Invalid diversity setting. / Geçersiz çeşitlilik ayarı.');
 const weight={off:0,balanced:.15,varied:.45}[diversity],pool=rows.slice(),chosen=[],base=rows.slice().sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0)||String(a.title).localeCompare(String(b.title))),baseline=new Map(base.map((r,i)=>[r,i+1]));
 const overlap=(a,b)=>Math.max(cosine(features(a),features(b)),a.metadata?.franchiseId&&a.metadata.franchiseId===b.metadata?.franchiseId?1:0);
 while(pool.length){
  const factors=r=>{const repeated=penalty(r),similar=chosen.map(c=>({id:c.id,value:overlap(r,c)})).sort((a,b)=>b.value-a.value)[0],diversityPenalty=weight*(similar?.value||0);return {repeatPenalty:repeated,diversityPenalty,similarTo:diversityPenalty>0?similar.id:null,adjustedScore:(Number(r.score)||0)-repeated-diversityPenalty};};
  const scored=new Map(pool.map(r=>[r,factors(r)]));pool.sort((a,b)=>scored.get(b).adjustedScore-scored.get(a).adjustedScore||String(a.title).localeCompare(String(b.title)));const row=pool.shift();chosen.push(explain?{...row,rankingReason:{baseRank:baseline.get(row),finalRank:chosen.length+1,baseScore:Number(row.score)||0,...scored.get(row)}}:row);
 }
 return chosen;
}

function conditionReasons(row,f){
 const m=row.metadata||row,year=m.year||row.year,minutes=m.duration||row.runtime,format=m.format||row.format||(row.domain==='film'?'FILM':''),status=String(m.status||row.releaseStatus||'').toUpperCase(),reasons=[];
 if(f.finishedOnly&&!['FINISHED','ENDED','RELEASED'].includes(status))reasons.push(status?'unfinished':'status-unknown');
 if(f.maxMinutes!==null&&(!(minutes>0)||minutes>f.maxMinutes))reasons.push(minutes>0?'duration-over':'duration-unknown');
 if(f.formats.length&&!f.formats.some(v=>fold(v)===fold(format)))reasons.push(format?'format-mismatch':'format-unknown');
 if((f.yearFrom!==null||f.yearTo!==null)&&!(year>0))reasons.push('year-unknown');
 else if(f.yearFrom!==null&&year<f.yearFrom||f.yearTo!==null&&year>f.yearTo)reasons.push('year-outside');
 const topics=[...(m.genres||[]),...(m.themes||[]).filter(v=>typeof v==='string'||!v.isMediaSpoiler&&!v.isGeneralSpoiler).map(v=>typeof v==='string'?v:v.name)].map(fold);
 if(f.avoid.length&&(!topics.length||f.avoid.some(v=>topics.includes(fold(v)))))reasons.push(topics.length?'topic-avoided':'topics-unknown');return reasons;
}
function matches(row,f){return conditionReasons(row,f).length===0;}

function validate(data){if(data?.version!==1||!Array.isArray(data.entries)||data.entries.length>2000||Buffer.byteLength(JSON.stringify(data))>2000000||new Set(data.entries.map(key)).size!==data.entries.length||data.entries.some(r=>!DOMAINS.includes(r.domain)||typeof r.id!=='string'||!r.id||r.id.length>500||!Number.isSafeInteger(r.shownAt)||!Number.isSafeInteger(r.shownCount)||r.shownCount<1||![null,'accurate','repeat','unsuitable'].includes(r.feedback)||r.deferUntil!==null&&(!Number.isSafeInteger(r.deferUntil)||r.deferUntil<0)))throw Error('Invalid recommendation history. / Geçersiz öneri geçmişi.');}
function create({root,now=Date.now}={}){
 const file=()=>path.join(typeof root==='function'?root():root,'recommendation-history.json');
 function read(){if(!fs.existsSync(file()))return {version:1,entries:[]};if(fs.statSync(file()).size>2000000)throw Error('Recommendation history limit. / Öneri geçmişi sınırı.');const d=JSON.parse(fs.readFileSync(file(),'utf8'));validate(d);return d;}
 function write(d){validate(d);atomicWriteFileSync(file(),JSON.stringify(d));}
 function list(){const d=read();return {...d,revision:C.hash(d)};}
 function record(rows,domain){if(!DOMAINS.includes(domain)||rows.length>24)throw Error('Invalid recommendation batch.');const d=read();let excluded=0;for(const r of rows){const id={id:r.id,domain},old=d.entries.find(v=>key(v)===key(id));if(old){old.shownAt=now();old.shownCount++;}else if(d.entries.length<2000)d.entries.push({...id,title:String(r.title||r.id).slice(0,500),shownAt:now(),shownCount:1,feedback:null,deferUntil:null});else excluded++;}write(d);return {excluded,...list()};}
 function change(input,callback){const d=read();if(input.revision!==C.hash(d))throw Error('Recommendation history changed; reload. / Öneri geçmişi değişti; yenile.');const row=d.entries.find(r=>key(r)===key(input));if(!row)throw Error('Only a previously shown recommendation can be changed. / Yalnız gösterilmiş öneri değiştirilebilir.');callback(row);write(d);return list();}
 function feedback(input){if(![null,'accurate','repeat','unsuitable'].includes(input.feedback))throw Error('Choose recommendation feedback. / Öneri geri bildirimi seç.');return change(input,r=>{r.feedback=input.feedback;r.feedbackAt=now();});}
 function defer(input){if(![0,1,7,30,90].includes(input.days))throw Error('Choose a deferral period. / Erteleme süresi seç.');return change(input,r=>{r.deferUntil=input.days?now()+input.days*86400000:null;});}
 function apply(rows,{domain,filters={},diversity='balanced',repeat='reduce',limit=18,historySnapshot=null,asOf=now()}={}){
  if(!DOMAINS.includes(domain)||!['reduce','show'].includes(repeat)||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Invalid recommendation controls. / Geçersiz öneri kontrolleri.');
  const f=filtersOf(filters),history=new Map((historySnapshot||read().entries).filter(r=>r.domain===domain).map(r=>[r.id,r])),reasons={conditions:0,deferred:0,unsuitable:0},conditionCounts={};
  const pool=rows.filter(r=>{const old=history.get(r.id);if(old?.deferUntil>asOf){reasons.deferred++;return false;}if(old?.feedback==='unsuitable'){reasons.unsuitable++;return false;}const failed=conditionReasons(r,f);if(failed.length){reasons.conditions++;for(const reason of failed)conditionCounts[reason]=(conditionCounts[reason]||0)+1;return false;}return true;});
  const selected=rank(pool,diversity,r=>repeat==='reduce'?Math.min(history.get(r.id)?.shownCount||0,5)*.08+(history.get(r.id)?.feedback==='repeat'?.2:0):0,true).slice(0,limit);
  return {rows:selected.map(r=>({...r,recommendationHistory:history.get(r.id)||null})),controls:{filters:f,diversity,repeat,excluded:reasons,conditionCounts,sample:rows.length,metadataOnly:true}};
 }
 function removalPreview(input){
  const d=read();if(input.revision!==C.hash(d))throw Error('Recommendation history changed; reload. / Öneri geçmişi değişti; yenile.');
  if(!DOMAINS.includes(input.domain)||!Array.isArray(input.ids)||!input.ids.length||input.ids.length>100||new Set(input.ids).size!==input.ids.length)throw Error('Select 1–100 history rows in one pool. / Bir havuzdan 1–100 geçmiş satırı seç.');
  const entries=input.ids.map(id=>d.entries.find(r=>r.id===id&&r.domain===input.domain));if(entries.some(r=>!r))throw Error('History selection changed. / Geçmiş seçimi değişti.');
  return {revision:input.revision,domain:input.domain,entries,impact:{records:entries.length,feedback:entries.filter(r=>r.feedback).length,activeDeferrals:entries.filter(r=>r.deferUntil>now()).length,ratingsChanged:false,watchStatusChanged:false}};
 }
 function removeShown(input){const preview=removalPreview(input),d=read(),ids=new Set(input.ids);if(C.hash(d)!==input.revision)throw Error('Recommendation history changed; reload. / Öneri geçmişi değişti; yenile.');d.entries=d.entries.filter(r=>r.domain!==input.domain||!ids.has(r.id));write(d);return {removed:preview.entries.length,...list()};}
 return {list,record,feedback,defer,apply,removalPreview,removeShown};
}
module.exports={create,validate,filtersOf,rank,matches,conditionReasons,franchiseAnnotator};
