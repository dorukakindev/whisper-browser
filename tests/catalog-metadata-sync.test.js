'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createMetadataClient}=require('../src/catalog-discovery');const {createMetadataSync}=require('../src/catalog-metadata-sync');
const key='fixture-token-not-a-real-credential';
const clientFor=rows=>createMetadataClient(async()=>new Response(JSON.stringify({results:rows,total_pages:1})),{language:()=> 'en-US'});
test('Automatic title matching requires a unique exact title and any supplied year; ambiguity and remakes are not guessed',async()=>{
 const item={kind:'film',title:'A Film',year:1980};
 assert.equal(await clientFor([{id:1,title:'A Film',release_date:'1980-02-01'}]).resolve(item,key,{automatic:true}),1);
 assert.equal(await clientFor([{id:1,title:'Translated',original_title:'A Film',release_date:'1980-02-01'}]).resolve(item,key,{automatic:true}),1);
 for(const rows of [[{id:1,title:'A Film',release_date:'2000-01-01'}],[{id:1,title:'A Film 2',release_date:'1980-01-01'}],[{id:1,title:'A Film',release_date:'1980-01-01'},{id:2,title:'A Film',release_date:'1980-01-02'}]])await assert.rejects(clientFor(rows).resolve(item,key,{automatic:true}),{code:'ambiguous'});
 assert.equal(await clientFor([{id:1,title:'A Film',release_date:'1980-01-01'}]).resolve({...item,year:null},key,{automatic:true}),1);
 await assert.rejects(clientFor([{id:1,title:'A Film',release_date:'1980-01-01'},{id:2,title:'A Film',release_date:'2000-01-01'}]).resolve({...item,year:null},key,{automatic:true}),{code:'ambiguous'});
 await assert.rejects(clientFor([]).resolve({...item,year:null},key,{automatic:true}),{code:'ambiguous'});
});
test('Metadata detail includes directors, backdrop, ratings and explicit English fallback for unavailable localized summary',async()=>{
 const urls=[];const client=createMetadataClient(async u=>{urls.push(new URL(u));return new Response(JSON.stringify(urls.length===1?{title:'Film',credits:{crew:[{job:'Director',name:'Director'}]},backdrop_path:'/back.jpg',vote_average:8.2,vote_count:10}:{overview:'English summary'}));},{language:()=> 'tr-TR'});
 const data=await client.detail({kind:'film'},1,key);assert.deepEqual(data.patch.directors,['Director']);assert.equal(data.patch.backdrop,'/back.jpg');assert.equal(data.patch.tmdbRating,8.2);assert.equal(data.patch.synopsis,'English summary');assert.equal(urls[1].searchParams.get('language'),'en-US');
});
async function idle(job){const deadline=Date.now()+5000;while(job.snapshot().running){if(Date.now()>deadline)throw Error('Metadata sync did not settle');await new Promise(setImmediate);}assert.equal(job.snapshot().running,false);}
function harness(t,complete){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'metadata-sync-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const rows=[{id:'one',title:'One',year:1980},{id:'two',title:'Two',year:1981}];const settings={apiKey:key,language:'en-US'};const job=createMetadataSync({store:()=>({list:()=>rows,get:id=>rows.find(row=>row.id===id)}),settings:()=>settings,userData:()=>dir,complete});return {job,rows,dir,settings};}
test('One worker, stop aborts active completion, settings close is unrelated, retry resumes and attempts do not persist secrets',async t=>{
 let calls=0,aborted=false;const h=harness(t,async(id,signal)=>{calls++;if(calls===1){await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));signal.throwIfAborted();}return {ok:true};});
 h.job.start();h.job.start();assert.equal(calls,1);h.job.cancel();await idle(h.job);assert(aborted);h.job.start();assert.equal(calls,1,'A stopped job does not restart from a library refresh');h.job.start({retry:true});await idle(h.job);assert.equal(calls,3);assert.equal(h.job.snapshot().updated,2);assert(!fs.readFileSync(path.join(h.dir,'catalog-metadata-attempts.json'),'utf8').includes(key));h.job.start();assert.equal(calls,3,'Repeated renders do not refetch unavailable optional fields');
});
test('401/429 stop the batch instead of hammering the provider; a changed credential can retry',async t=>{
 let calls=0;const h=harness(t,async()=>{calls++;throw Object.assign(Error('Rejected'),{status:401});});h.job.start();await idle(h.job);assert.equal(calls,1);assert.equal(h.job.snapshot().issue,'auth');h.settings.apiKey+='-new';h.job.start();await idle(h.job);assert.equal(calls,2);
});

test('English imported aliases resolve even when the metadata display language is Turkish',async()=>{
 const client=createMetadataClient(async url=>new Response(JSON.stringify({total_pages:1,results:[{id:42,title:new URL(url).searchParams.get('language')==='en-US'?'All My Good Countrymen':'Yerelleştirilmiş ad',original_title:'Všichni dobří rodáci',release_date:'1969-07-04'}]})),{language:()=> 'tr-TR'});
 assert.equal(await client.resolve({kind:'film',title:'All My Good Countrymen',year:1969},key,{automatic:true}),42);
});
