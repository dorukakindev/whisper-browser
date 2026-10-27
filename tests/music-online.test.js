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
