'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerMediaShelf}=require('../src/media-shelf-service');
test('playlist creation preserves reviewed order and rejects an unknown ID atomically',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-playlist-'));let handler;
 try{const file=path.join(dir,'media-shelf.json');fs.writeFileSync(file,JSON.stringify({version:1,music:[{id:'a',title:'A'},{id:'b',title:'B'}],books:[],stations:[],podcasts:[],playlists:[],diary:[]}));
  registerMediaShelf({ipcMain:{handle:(name,fn)=>handler=fn},authorized:()=>true,userData:()=>dir});
  const before=fs.readFileSync(file,'utf8');assert.equal((await handler({},{action:'playlist-save',name:'Bad',ids:['b','invented']})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal((await handler({},{action:'playlist-save',name:'İncelenen liste',ids:['b','a','b']})).ok,true);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).playlists[0].tracks,['b','a']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
