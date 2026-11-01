'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'../../../..');
const outputBase=path.resolve(process.env.AUDIT830_OUT||path.join(root,'.uiprev/audit830-assistant-'+Date.now()));fs.mkdirSync(outputBase,{recursive:true});
const reply=message=>new Response(JSON.stringify({choices:[{message,finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});
async function scenario(count){
 const handlers=new Map(),app=new EventEmitter(),sender=new EventEmitter(),events=[],received=[];let queryNumber=0,turn=0,closed=0,loaded='';
 sender.id=830;sender.isDestroyed=()=>false;sender.send=(_channel,packet)=>events.push(packet);
 const producer=require(path.join(root,'src/assistant-browser-research')).createResearch({openPage:async()=>{
  const n=++queryNumber;
  return {load:async url=>{loaded=url;},read:async kind=>kind==='results'?{links:[1,2,3].map(i=>({url:`https://source${n}-${i}.example/article`,title:`Source ${n}-${i}`}))}:{url:loaded,title:`Article ${n}`,text:`Verified excerpt for ${loaded}`,truncated:false},close:async()=>{closed++;}};
 }});
 require(path.join(root,'src/assistant-agent-service')).register({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},authorized:()=>true,getConfig:()=>({endpoint:'https://fixture.example/v1',model:'fixture'}),researchWeb:(query,signal)=>producer(query,{signal}),fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);turn++;
  if(turn===1)return reply({role:'assistant',tool_calls:Array.from({length:count},(_,i)=>({id:'r'+i,function:{name:'research_web',arguments:JSON.stringify({query:'Public controlled question '+(i+1)})}}))});
  received.push(...body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)));
  return reply({role:'assistant',content:'The requested sources were inspected.'});
 }});
 const result=await handlers.get('assistant:agentRun')({sender},{requestId:'research-'+count,question:'Compare these public sources.',owner:{kind:'page',owner:'public-fixture-page',thread:'thread-a',tabId:'a',generation:1,title:'Fixture'}});
 app.emit('will-quit');assert(result.ok,result.error);assert.equal(received.length,count);assert.equal(closed,count);assert(!events.some(row=>row.type==='proposal'||row.type==='action'));
 return {count,queryNumber,closed,result,tools:received.map((row,i)=>({search:i+1,status:row.status,sourceKind:row.sourceKind,text:row.text,passages:row.passages,sourceUrls:row.sources?.map(s=>s.url)}))};
}
(async()=>{
 const positive=await scenario(1),limit=await scenario(5);
 assert.equal(positive.tools[0].sourceKind,'web_page_excerpts');assert.equal(positive.tools[0].passages.length,3);assert.equal(positive.tools[0].sourceUrls[0],'https://source1-1.example/article');
 const fifth=limit.tools[4];assert.equal(fifth.status,'completed');assert.equal(fifth.passages.length,0);assert.equal(fifth.sourceKind,'provider_synthesis');assert(fifth.text.includes('[W1]'));assert(fifth.text.includes('https://source5-1.example/article'));assert(!fifth.sourceUrls.some(url=>url.includes('source5-')));assert.equal(fifth.sourceUrls[0],'https://source1-1.example/article');
 // At the cap, search four still retains its one canonical surviving source.
 assert.equal(limit.tools[3].passages.length,1);assert.equal(limit.tools[3].passages[0].id,'W10');assert(!limit.tools[3].text.includes('source4-2'));
 const output={head:process.env.AUDIT830_HEAD,classification:'Confirmed recurrence of R815-B98 through R829 text fallback; not a newly discovered root.',positive,limit,assertions:'PASS: real browser research producer, agent service and provider tool consumer; one-search and fourth-search controls; five-search recurrence; no network, credentials, profile or mutations'};
 fs.writeFileSync(path.join(outputBase,'result.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({head:output.head,positive:{passages:positive.tools[0].passages.length},fifth,assertions:output.assertions},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
