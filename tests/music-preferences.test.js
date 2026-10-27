'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {store}=require('../src/music-preferences');
test('music feedback survives reopen, separates providers, restores exact IDs and projects no private fields',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-preferences-'));
 try{const s=store(()=>dir);assert.deepEqual(s.read(),[]);s.set('local','1','Türkçe şarkı',true);s.set('deezer','1','Another track',true);
  assert.equal(store(()=>dir).read().length,2);s.set('local','1','updated',true);assert.equal(s.read().length,2);s.set('local','1','',false);assert.deepEqual(s.read(),[{provider:'deezer',id:'1',title:'Another track'}]);
  assert.throws(()=>s.set('evil','1','track',true));assert.throws(()=>s.set('local','a'.repeat(129),'track',true));assert.throws(()=>s.set('local','1','track','true'));
  const file=path.join(dir,'music-preferences.json');fs.writeFileSync(file,JSON.stringify({version:1,hidden:[{provider:'deezer',id:'1',title:'Safe',path:'private.wav',url:'signed'}]}));assert(!JSON.stringify(s.read()).includes('private'));
  fs.writeFileSync(file,'{bad');assert.throws(()=>s.read());
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
