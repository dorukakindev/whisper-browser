/* Saved-podcast source cards: validation, wording and reopening.
   Data only: no paths, URLs, HTML or file access. The same module is loaded by the
   renderer (cards) and the main process (thread persistence), like other UMD helpers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AssistantPodcastSources=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const ID=/^P[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 const text=(value,max)=>typeof value==='string'&&!value.includes('\0')?value.slice(0,max):'';
 const seconds=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10000000;
 const clock=value=>{const m=Math.floor(value/60),s=Math.floor(value-m*60);return m+':'+String(s).padStart(2,'0');};
 function cleanLocator(l){
  if(!l||l.action!=='podcast-search-resolve'||!/^[a-f0-9]{64}$/.test(l.token||''))return null;
  if(typeof l.query!=='string'||!l.query||l.query.length>200||typeof l.episode!=='string'||!l.episode||l.episode.length>256)return null;
  const showName=text(l.showName,160);
  return {action:'podcast-search-resolve',query:l.query,...(showName?{showName}:{}),...(['source','translation'].includes(l.role)?{role:l.role}:{}),episode:l.episode,token:l.token};
 }
 function cleanOne(c){
  if(!c||c.kind!=='podcast'||!ID.test(c.id||''))return null;
  const locator=cleanLocator(c.locator);
  if(!locator)return null;
  if(!['source','translation'].includes(c.role)||typeof c.quote!=='string'||!c.quote.trim()||c.quote.includes('\0'))return null;
  const timed=c.timed===true;
  if(timed&&(!seconds(c.seconds)||!seconds(c.end)||c.end<c.seconds))return null;
  const limit=Number.isInteger(c.scope?.limit)&&c.scope.limit>=1&&c.scope.limit<=50?c.scope.limit:6;
  return {id:c.id,kind:'podcast',usage:['cited','found','carried'].includes(c.usage)?c.usage:'found',
   show:text(c.show,200),episode:text(c.episode,300),role:c.role,timed,seconds:timed?c.seconds:null,end:timed?c.end:null,
   quote:c.quote.slice(0,2000),locator,scope:{limit,more:c.scope?.more===true}};
 }
 const clean=raw=>Array.isArray(raw)?raw.slice(0,40).flatMap(c=>{const row=cleanOne(c);return row?[row]:[];}):[];
 // Hide only the service's exact, redundant source appendix in the visual answer.
 // Stored/copied text and the source cards remain complete; unknown text is never removed.
 function presentation(raw,cards,actions=[],tr=false){
  const text=String(raw||''),known=clean(cards);
  const proposalIds=new Set((actions||[]).map(a=>a.proposalId).filter(id=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id||'')));
  const readable=value=>value.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g).map((part,index)=>index%2?part:part.replace(/\bproposalId:\s*([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\b/gi,(full,id)=>proposalIds.has(id)?(tr?'onay kartı aşağıda':'review card below'):full)).join('');
  for(const [heading,tr]of [['Saved podcast sources',false],['Kayıtlı podcast kaynakları',true]]){
   const marker='\n\n'+heading+'\n',at=text.lastIndexOf(marker);if(at<0)continue;
   const tail=text.slice(at+marker.length),verification=tr?'\n\nUygulama doğrulaması: ':'\n\nApplication verification: ',end=tail.indexOf(verification);
   let rest=end<0?tail:tail.slice(0,end);const used=new Set();
   const lines=known.map(c=>[c.id,[`[${c.id}] ${c.show} · ${c.episode}`,c.role==='translation'?(tr?'Çeviri':'Translation'):(tr?'Özgün':'Original'),c.timed?`${c.seconds.toFixed(1)}–${c.end.toFixed(1)} s`:(tr?'Salt okunur':'Read only'),c.quote].join(' · ')]);
   while(rest){const match=lines.find(([id,line])=>!used.has(id)&&(rest===line||rest.startsWith(line+'\n')));if(!match)break;used.add(match[0]);rest=rest.slice(match[1].length);if(rest.startsWith('\n'))rest=rest.slice(1);}
   if(!rest&&used.size)return readable(text.slice(0,at)+(end<0?'':tail.slice(end)));
  }
  return readable(text);
 }
 function describe(c,tr=false){
  const t=(en,trText)=>tr?trText:en,full=[c.show||'Podcast',c.episode].filter(Boolean).join(' · ');
  const role=c.role==='translation'?t('Translation','Çeviri'):t('Original','Özgün');
  const timing=c.timed?clock(c.seconds)+'–'+clock(c.end):t('Read-only text · no verified time','Salt okunur metin · doğrulanmış zaman yok');
  const query='“'+c.locator.query+'”';
  const scope=c.scope.more?t('Search '+query+': first '+c.scope.limit+' matches shown, more exist','Arama '+query+': ilk '+c.scope.limit+' eşleşme gösterildi, daha fazlası var'):t('Search '+query+': complete result','Arama '+query+': tam sonuç');
  return {label:full.length>80?full.slice(0,79)+'…':full,title:full.slice(0,300),meta:role+' · '+timing,scope,action:c.timed?'seek':'text'};
 }
 // Opens one saved passage through the existing resolver and opener. The exact search
 // token is checked before opening and again immediately before any seek.
 async function reveal(c,{mediaShelf,open,isCancelled=()=>false,locale='en'}={}){
  const t=(en,trText)=>locale==='tr'?trText:en;
  const unavailable={state:'unavailable',note:t('The passage could not be opened. Nothing was changed.','Pasaj açılamadı. Hiçbir şey değişmedi.')};
  const stale={state:'stale',note:t('This saved source was changed or removed. Nothing was opened; search again.','Bu kayıtlı kaynak değişmiş veya silinmiş. Hiçbir şey açılmadı; yeniden ara.')};
  const cancelled={state:'cancelled',note:t('Cancelled because the conversation or source changed.','Sohbet veya kaynak değiştiği için iptal edildi.')};
  const card=cleanOne(c);
  if(!card||typeof mediaShelf!=='function'||typeof open!=='function')return unavailable;
  let failure=null;
  const resolve=async()=>{
   let response;
   try{response=await mediaShelf({...card.locator,locale});}catch(error){failure='unavailable';throw error;}
   if(!response?.ok||response.row?.token!==card.locator.token){failure=response?.ok||response?.sourceChanged===true?'stale':'unavailable';throw Error('Saved passage unavailable.');}
   failure=null;return response.row;
  };
  let row;
  try{row=await resolve();}catch(_){return failure==='stale'?stale:unavailable;}
  if(isCancelled())return cancelled;
  const receipt={};
  try{await open(row,{beforeSeek:resolve,receipt,isCancelled});}catch(_){/* reported below from the receipt */}
  if(receipt.mode==='seek')return {state:'opened',note:t('Moved to ','Şu konuma gidildi: ')+clock(card.seconds)+'.'};
  if(receipt.mode==='read-only')return {state:'read-only',note:receipt.reason==='missing'?t('The episode is no longer in your library. The saved quote is shown read-only.','Bölüm artık kitaplığında yok. Kayıtlı alıntı salt okunur gösteriliyor.'):row.timed===false?t('Opened as read-only text. This passage has no verified time, so nothing was sought.','Salt okunur metin olarak açıldı. Bu pasajın doğrulanmış zamanı yok; konuma gidilmedi.'):t('Opened as read-only text. Its audio copy or time could not be verified, so nothing was sought.','Salt okunur metin olarak açıldı. Ses kopyası veya zaman bağı doğrulanamadı; konuma gidilmedi.')};
  if(isCancelled())return cancelled;
  if(failure==='stale')return stale;
  return {state:'unconfirmed',note:t('The episode may be open, but its audio or time anchor could not be confirmed, so no seek was made.','Bölüm açılmış olabilir, ancak ses veya zaman bağı doğrulanamadığı için konuma gidilmedi.')};
 }
 // One controller per window owns the open state of every podcast source card: a card that is
 // already opening ignores a repeat click, a newer click owns the card, and an answer that arrives
 // after the conversation was switched is reported as cancelled on its own card only.
 function createController({mediaShelf,open,workspace,locale=()=>'en',onChange=()=>{},limit=200}){
  const states=new Map(),owners=new Map();let navigation=0;
  const set=(id,value)=>{states.delete(id);states.set(id,value);while(states.size>limit)states.delete(states.keys().next().value);onChange(id,value);};
  return {
   state:id=>states.get(id)||null,
   async click(id,card){
    if(states.get(id)?.state==='opening')return states.get(id);
    const key=workspace.key(),thread=workspace.activeId(key)||'',owner=Symbol('open'),ticket=++navigation;
    let opening=false;
    const cancelled=()=>ticket!==navigation||(workspace.activeId(key)||'')!==thread||(!opening&&workspace.key()!==key);
    owners.set(id,owner);set(id,{state:'opening',note:''});
    let result;
    // Resolving a quote must not navigate away from a newer source. Once the actual
    // opener starts, its own intentional source transition is allowed; its existing
    // generation/binding guards and this navigation ticket still protect every seek.
    try{result=await reveal(card,{mediaShelf,open:async(row,options)=>{if(cancelled())return false;opening=true;return open(row,options);},locale:locale(),isCancelled:cancelled});}
    catch(_){result={state:'unavailable',note:locale()==='tr'?'Pasaj açılamadı. Hiçbir şey değişmedi.':'The passage could not be opened. Nothing was changed.'};}
    if(owners.get(id)===owner)set(id,result);
    return result;
   }
  };
 }
 return Object.freeze({clean,cleanOne,cleanLocator,presentation,describe,reveal,clock,createController});
});
