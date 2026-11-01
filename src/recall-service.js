'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{createRecallNetwork}=require('./recall-network'),{hash}=require('./media-source-mechanisms'),fold=require('./text-fold').search;
function registerRecall({app,ipcMain,authorized,userData=()=>app.getPath('userData'),catalogStore,feedStore,resolveSource,listExternalSources,now=()=>Date.now()}={}){
 let ownerCache=null;
 const root=()=>userData(),catalog=()=>typeof catalogStore==='function'?catalogStore():catalogStore;
 function ownerFile(name){if(ownerCache?.has(name))return ownerCache.get(name);const file=path.join(root(),name);if(!fs.existsSync(file))return {};if(fs.statSync(file).size>16000000)throw Error('Source owner exceeds the bounded read size.');const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));ownerCache?.set(name,value);return value;}
 const youtube=url=>{try{return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(new URL(url).hostname);}catch{return false;}};
 function feeds(){if(ownerCache?.has('@feeds'))return ownerCache.get('@feeds');const store=typeof feedStore==='function'?feedStore():feedStore;const value=store?.snapshot?.()||ownerFile('feeds.json');ownerCache?.set('@feeds',value);return value;}
 function resolve(ref){
  if(!ref||typeof ref.id!=='string'||ref.id.length>200)return null;
  if(ref.kind==='catalog'){const item=catalog()?.get(ref.id);if(!item)return null;const own=ownerFile('media-enrichment.json').titles?.[item.id]||{},feedback=own.feedback&&(!own.feedbackIdentity||require('./renderer/media-tools-model').decisionIdentityMatch(item,own.feedbackIdentity)!=='mismatch')?own.feedback:null,metadata=[item.title,item.year||'',...(item.genres||[]),...(item.directors||[]),item.synopsis||''].join('\n'),text=metadata+(feedback?.note?'\nUser note: '+feedback.note:'');return {id:'catalog:'+item.id,ref:{kind:'catalog',id:item.id},title:item.title,kind:item.kind,domain:'screen',text,scope:'metadata'+(feedback?.note?'-and-user-note':''),revision:hash(text),defaultLike:feedback?feedback.reaction==='like':!!item.favorite||Number(item.ratings?.personal)>=7,defaultValence:feedback?(feedback.reaction==='neutral'?'mixed':feedback.reaction):null,defaultReactionRevision:hash([item.favorite,item.ratings?.personal,feedback]),features:item.genres||[],directors:item.directors||[],consumed:item.watchStatus==='completed',runtime:item.runtime,year:item.year,imdbId:item.imdbId,tmdbId:item.tmdbId,sourceUrl:'',locator:{kind:'catalog',id:item.id}};}
  if(ref.kind==='feed'){const row=(feeds().entries||[]).find(e=>e.id===ref.id);if(!row)return null;const blocked=row.spoiler==='marked'&&!row.spoilerAllowed,text=blocked?'':row.text||row.summary||'';return {id:'feed:'+row.id,ref:{kind:'feed',id:row.id},title:row.title,kind:youtube(row.url)?'youtube':row.kind,domain:youtube(row.url)?'youtube':row.kind==='podcast'?'audio':row.kind==='video'?'youtube':'reading',text,scope:row.contentScope,revision:row.revision,features:blocked?[]:row.categories||[],directors:[],author:row.author,sourceUrl:row.url,scopeTruncated:row.textTruncated,spoilerBlocked:blocked,defaultLike:false,consumed:row.kind==='article'&&row.read,about:(row.links||[]).filter(l=>{const item=catalog()?.get(l.catalogId);return item&&String(item.imdbId||'')===String(l.imdbId||'')&&String(item.tmdbId||'')===String(l.tmdbId||'')&&String(item.year||'')===String(l.year||'');}).map(l=>l.catalogId),publishedAt:row.publishedAt,locator:{kind:'feed',id:row.id,revision:row.revision,url:row.url}};}
  const shelf=ownerFile('media-shelf.json');
  if(ref.kind==='shelf-review'){const row=[...(shelf.reviews||[]),...(shelf.diary||[])].find(r=>(r.recordId||require('./media-taste').reviewId(r))===ref.id&&(!r.recordState||r.recordState==='active'));if(!row)return null;const matches=catalog()?.list().filter(i=>i.kind!=='series'&&[i.title,i.originalTitle].some(n=>n&&fold(n)===fold(row.title))&&String(i.year||'')===String(row.year||''))||[];return {id:'review:'+ref.id,ref:{kind:'shelf-review',id:ref.id},title:row.title+' · Personal review',kind:'user-review',domain:'screen',text:row.review||'',scope:'user_review',revision:hash([row.review,row.rating,row.tags]),defaultLike:row.liked===true||Number(row.rating)>=3.5,defaultReactionRevision:hash([row.rating,row.liked]),features:row.tags||[],publishedAt:Date.parse(row.watchedDate||row.addedDate)||0,about:matches.length===1?[matches[0].id]:[],locator:{kind:'shelf-review',id:ref.id,uri:row.uri||''}};}
  if(ref.kind==='book'){const b=(shelf.books||[]).find(b=>b.id===ref.id);if(!b)return null;return {id:'book:'+b.id,ref:{kind:'book',id:b.id},title:b.title,kind:'book',domain:'books',text:[b.title,b.author].filter(Boolean).join('\n'),scope:'metadata',revision:hash([b.title,b.author,b.format]),features:[],defaultLike:false,locator:{kind:'book',id:b.id,chapter:b.chapter||0}};}
  if(ref.kind==='podcast'){for(const p of shelf.podcasts||[]){const e=p.episodes.find(e=>p.id+':'+hash(e.guid||e.url)===ref.id);if(e)return {id:'podcast:'+ref.id,ref:{kind:'podcast',id:ref.id},title:e.title,kind:'podcast',domain:'audio',text:[p.title,e.title,e.description||'',e.note?'User note: '+e.note:''].join('\n'),scope:e.description?'feed-summary-and-user-note':'metadata-and-user-note',revision:hash([e.guid,e.url,e.description,e.note]),features:[],defaultLike:false,consumed:e.duration>0&&e.position>=e.duration*.95,locator:{kind:'podcast',podcastId:p.id,url:e.url,guid:e.guid},publishedAt:Date.parse(e.published||e.date)||0};}return null;}
  if(resolveSource&&['browser','subtitle','notebook','youtube'].includes(ref.kind))return resolveSource(ref);
  return null;
 }
 function listSources(options={}){const refs=[...(listExternalSources?.()||[]).slice(0,20)];for(const item of catalog()?.list()||[])refs.push({kind:'catalog',id:item.id});for(const e of feeds().entries||[])refs.push({kind:'feed',id:e.id});const shelf=ownerFile('media-shelf.json'),seen=new Set();for(const row of [...(shelf.reviews||[]),...(shelf.diary||[])]){const id=row.recordId||require('./media-taste').reviewId(row);if(row.review&&!seen.has(id)){seen.add(id);refs.push({kind:'shelf-review',id});}}for(const b of shelf.books||[])refs.push({kind:'book',id:b.id});for(const p of shelf.podcasts||[])for(const e of p.episodes)refs.push({kind:'podcast',id:p.id+':'+hash(e.guid||e.url)});return refs.map(resolve).filter(Boolean).filter(s=>(!options.kind||s.ref.kind===options.kind)&&(!options.domain||s.domain===options.domain)&&(!options.query||fold(s.title).includes(fold(options.query))));}
 const store=createRecallNetwork(path.join(root(),'recall-network.json'),{resolve,listSources,now}),tokens=new Map();
 const owner=e=>String(e?.sender?.id||'main');
 function issue(event,kind,value){const token=randomUUID();tokens.set(token,{kind,owner:owner(event),value,expires:now()+600000});while(tokens.size>30)tokens.delete(tokens.keys().next().value);return token;}
 function take(event,id,kind){const p=tokens.get(id);if(!p||p.kind!==kind||p.owner!==owner(event)||p.expires<now())throw Error('Network preview expired.');tokens.delete(id);return p.value;}
 const schema={entities:[{key:'entity-key',label:'Theme name',kind:'theme|person|form'}],assertions:[{from:'provided nodeId or entity key',to:'provided nodeId or entity key',predicate:'about|supports|contradicts|mentions|related|same-form',sourceId:'provided R ID',quote:'exact source substring',start:'optional UTF-16 offset',end:'optional UTF-16 offset',unit:'utf16',reason:'bounded source-specific reason'}],hypotheses:[{text:'tentative explicit-like hypothesis; no sensitive personal attributes',support:[{sourceId:'provided R ID',quote:'exact source substring'}],counter:[]}]};
 const handle=async(event,input={})=>{if(!authorized(event))return {ok:false,error:'Unauthorized Content Network request.'};try{ownerCache=new Map();if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid Content Network request.');let result;switch(input.action){
  case 'catalog':{const page=store.availablePage(input);result={...page,rows:page.rows.map(({text,...s})=>s)};break;}
  case 'add':result=store.add(input.refs);break;
  case 'note-save':result=store.note(input);break;
  case 'graph':result=store.graph(input);break;
  case 'node':result={node:store.node(input.id)};break;
  case 'reaction':result=store.reaction(input.id,input);break;
  case 'consume':result=store.consume(input.id,input);break;
  case 'link-preview':{const a=store.source(input.from),b=store.source(input.to);result={token:issue(event,'link',{...input,fromRevision:a.revision,toRevision:b.revision}),from:{id:a.id,title:a.title},to:{id:b.id,title:b.title},predicate:input.predicate};break;}
  case 'link-confirm':{const p=take(event,input.token,'link');if(store.source(p.from).revision!==p.fromRevision||store.source(p.to).revision!==p.toRevision)throw Error('A source changed after the relationship preview.');result=store.link(p);break;}
  case 'edge':result={edge:store.edge(input.id)};break;
  case 'evidence':{const evidence=store.evidence(input.id);if(!evidence)throw Error('Evidence is unavailable.');result={evidence};break;}
  case 'edge-review':result={edge:store.edgeStatus(input.id,input.status)};break;
  case 'path':result=store.path(input.from,input.to);break;
  case 'context':result=store.context(input.ids,{scopes:input.scopes||{}});break;
  case 'analysis-prepare':{const mode=input.mode==='taste'?'taste':'knowledge',prepared={...store.context(input.ids,{taste:mode==='taste',scopes:input.scopes||{}}),mode};result={...prepared,token:issue(event,'analysis',prepared),schema};break;}
  case 'analysis-commit':result=store.commit(take(event,input.token,'analysis'),input.result,input.model||'');break;
  case 'hypotheses':result={rows:store.hypotheses(),runs:store.snapshot().runs};break;
  case 'hypothesis-review':result={hypothesis:store.hypothesisStatus(input.id,input.status)};break;
  case 'recommendations':result=store.recommend(input);break;
  case 'view-save':result={view:store.view(input)};break;
  case 'position':result={position:store.position(input.id,input.position||{})};break;
  case 'alias-unmerge':result=store.unmerge(input.from);break;
  case 'alias-merge':result=store.merge(input.from,input.to);break;
  case 'remove':if(!['network','derived'].includes(input.mode||'network'))throw Error('Choose network removal or source-derived data purge.');result=store.remove(input.id,input.mode);break;
  case 'export':result={document:store.export()};break;
  default:throw Error('Unsupported Content Network action.');
 }return {ok:true,...result};}catch(error){return {ok:false,error:String(error.message).slice(0,500)};}finally{ownerCache=null;}};
 ipcMain.handle('recall:request',handle);return {handle,store};
}
module.exports={registerRecall};
