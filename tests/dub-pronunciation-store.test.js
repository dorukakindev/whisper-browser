'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createStore}=require('../src/dub-pronunciation-store');
test('source pronunciation persists, overrides only that source, and leaves globals untouched',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-pronunciation-')),file=path.join(root,'scoped.json');
 try{
  const a='media-'+'a'.repeat(64),b='media-'+'b'.repeat(64),global=[{from:'Newton',to:'Nyutın'}],before=JSON.stringify(global),store=createStore(file);
  assert.deepEqual(store.resolve(a,global).pronunciations,global);
  const entries=[{from:'Newton',to:'Nyuton'},{from:'Gaia',to:'Gaya'}];store.save(a,entries,global);
  assert.deepEqual(createStore(file).resolve(a,global),{entries,pronunciations:entries,scope:'source'});
  assert.deepEqual(store.resolve(b,global).pronunciations,global);assert.equal(JSON.stringify(global),before);
  store.save(a,[],global);assert.deepEqual(store.resolve(a,global).pronunciations,global);
  assert.throws(()=>store.save('__proto__',entries,global));
  fs.writeFileSync(file,'{"version":99,"sources":{}}');const bad=fs.readFileSync(file);
  assert.throws(()=>store.save(a,entries,global),/damaged/);assert.deepEqual(fs.readFileSync(file),bad);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('combined source and global entry bounds fail before replacing the stored dictionary',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-pronunciation-')),file=path.join(root,'scoped.json');
 try{
  const key='subtitle-'+'c'.repeat(64),store=createStore(file),global=Array.from({length:100},(_,i)=>({from:'Name'+i,to:'Word'+i}));
  store.save(key,[{from:'Name0',to:'Override'}],global);const before=fs.readFileSync(file);
  assert.throws(()=>store.save(key,[{from:'Extra',to:'Other'}],global));assert.deepEqual(fs.readFileSync(file),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
