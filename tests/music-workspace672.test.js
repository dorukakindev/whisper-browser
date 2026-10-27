'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('all 500 saved discoveries remain selectable after the source picker loads them',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-saved-'));try{const rows=Array.from({length:500},(_,i)=>({id:String(i+1),title:'Track '+i,artist:'Artist',artistId:1,url:'https://www.deezer.com/track/'+(i+1)}));fs.writeFileSync(path.join(dir,'music-discovery-list.json'),JSON.stringify(rows));const catalog=require('../src/music-online').createOnline({userData:()=>dir});const result=await catalog.handle({op:'list'});assert.equal(result.results.length,500);assert.equal(catalog.snapshot(['1'])[0].title,'Track 0');assert.equal(catalog.snapshot(['500'])[0].title,'Track 499');assert.throws(()=>catalog.snapshot(['invented']));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
