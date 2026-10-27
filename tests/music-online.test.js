'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {safeUrl,track,createOnline}=require('../src/music-online');
const row=id=>({id,title:'Known',artist:{id:3,name:'Artist'},link:`https://www.deezer.com/track/${id}`,preview:'https://cdnt-preview.dzcdn.net/track.mp3?hdnea=temporary'});
test('remote URLs are restricted by purpose, no local endpoints',()=>{assert.equal(safeUrl('https://127.0.0.1/a','preview'),'');assert.equal(safeUrl('https://evil.test/track/1','link'),'');assert.equal(track({...row(1),id:NaN}),null);assert(!JSON.stringify(track(row(1))).includes('hdnea'));});
test('explicit identity, recommendation and fresh preview; saved list contains no signed audio URL',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-online-')),routes=[];
 const service=createOnline({userData:()=>dir,fetchImpl:async url=>{routes.push(url);return new Response(JSON.stringify(url.includes('search?')?{data:[row(1)]}:url.includes('/radio')?{data:[row(2),row(2)]}:row(2)));}});
 try{await assert.rejects(()=>service.handle({op:'preview',id:'invented'}));const seeds=await service.handle({op:'search',query:'Known'});assert.equal(seeds.results.length,1);const hits=await service.handle({op:'discover',id:'1'});assert.equal(hits.results.length,1);assert.equal(hits.results[0].evidence,'catalog');assert((await service.handle({op:'preview',id:'2'})).url.includes('hdnea'));await service.handle({op:'save',id:'2'});assert(!fs.readFileSync(path.join(dir,'music-discovery-list.json'),'utf8').includes('hdnea'));assert.equal((await service.handle({op:'list'})).results.length,1);assert(routes.every(u=>u.startsWith('https://api.deezer.com/')));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('preview comparison snapshots exact IDs and only reads bounded allowlisted audio',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-preview-'));let phase='valid',audioReads=0;
 const service=createOnline({userData:()=>dir,fetchImpl:async url=>{
  if(url.includes('search?'))return new Response(JSON.stringify({data:[row(1),row(2)]}));
  if(url.startsWith('https://api.deezer.com/'))return new Response(JSON.stringify({...row(Number(url.split('/').at(-1))),preview:phase==='unsafe'?'https://127.0.0.1/private':'https://cdnt-preview.dzcdn.net/sample.mp3'}));
  audioReads++;return new Response(Buffer.alloc(500),{headers:phase==='oversize'?{'content-length':'9000000'}:{}});
 }});
 try{
  await service.handle({op:'search',query:'known'});assert.throws(()=>service.snapshot(['invented']));assert.throws(()=>service.snapshot(['1','1']));assert.throws(()=>service.snapshot(Array(9).fill('1')));
  const rows=service.snapshot(['1']);const signal=new AbortController().signal;
  phase='unsafe';await assert.rejects(()=>service.samples(rows,dir,signal,()=>{}),/No previews/);assert.equal(audioReads,0);
  phase='oversize';await assert.rejects(()=>service.samples(rows,dir,signal,()=>{}));assert(!fs.existsSync(path.join(dir,'1.mp3')));
  phase='valid';const result=await service.samples(rows,dir,signal,()=>{});assert.equal(result.tracks[0].id,'1');assert.equal(fs.statSync(result.tracks[0].path).size,500);assert(!JSON.stringify(result).includes('sample.mp3'));
  const aborted=new AbortController();aborted.abort();await assert.rejects(()=>service.samples(rows,dir,aborted.signal,()=>{}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
