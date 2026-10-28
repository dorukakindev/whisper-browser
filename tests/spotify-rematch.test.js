'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('saved track rematch binds owner and current record, preserves identity, order and personal fields',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spotify-rematch699-'));let handler;const file=path.join(dir,'media-shelf.json');
 const track={id:'saved-track',spotifyId:'4uLU6hMCjMI75M1A2tKUQC',title:'Original track',artist:'Artist',duration:220,youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',youtubeTitle:'Old live',youtubeDuration:480,favorite:true,position:42,personalNote:'keep'};
 const initial={version:1,music:[],books:[],stations:[],podcasts:[],playlists:[{id:'mix',tracks:['keep']}],diary:[],linkedPlaylists:[{id:'saved-list',name:'Keep playlist',tracks:[{...track},{id:'other',title:'Keep other'}]}],custom:'keep'};
 fs.writeFileSync(file,JSON.stringify(initial));let fetches=0;
 require('../src/media-shelf-service').registerMediaShelf({ipcMain:{handle:(name,fn)=>handler=fn},authorized:()=>true,userData:()=>dir,fetchImpl:async()=>{fetches++;throw Error('No Spotify network needed')},pythonPath:()=> 'python',musicRun:async()=>JSON.stringify({entries:[{id:'lmnopqrstuv',title:'New studio',duration:221}]})});
 const call=(action,fields={},owner=1)=>handler({sender:{id:owner}},{action,...fields});
 try{
  const draft=await call('spotify-rematch-read',{playlistId:'saved-list',id:track.id});assert(draft.ok);assert.equal(draft.tracks[0].title,track.title);assert.equal(fetches,0);
  assert.equal((await call('spotify-match',{token:draft.token,index:0},2)).ok,false);assert((await call('spotify-match',{token:draft.token,index:0})).ok);
  assert.equal((await call('spotify-save',{token:draft.token,choices:[{index:0,videoId:'lmnopqrstuv'}]})).ok,false,'rematch token cannot create another playlist');
  assert.equal((await call('spotify-rematch-save',{token:draft.token,choices:[{index:0,videoId:'invented'}]})).ok,false);assert.deepEqual(JSON.parse(fs.readFileSync(file)),initial);
  assert((await call('spotify-rematch-save',{token:draft.token,choices:[{index:0,videoId:'lmnopqrstuv'}]})).ok);
  const saved=JSON.parse(fs.readFileSync(file)),updated=saved.linkedPlaylists[0].tracks[0];assert.deepEqual(updated,{...track,youtubeUrl:'https://www.youtube.com/watch?v=lmnopqrstuv',youtubeTitle:'New studio',youtubeDuration:221});saved.linkedPlaylists[0].tracks[0]={...track};assert.deepEqual(saved,initial);
  assert.equal((await call('spotify-rematch-save',{token:draft.token,choices:[{index:0,videoId:'lmnopqrstuv'}]})).ok,false,'consumed review cannot apply twice');
  const next=await call('spotify-rematch-read',{playlistId:'saved-list',id:track.id});await call('spotify-match',{token:next.token,index:0});const changed=JSON.parse(fs.readFileSync(file));changed.linkedPlaylists[0].tracks[0].youtubeUrl=track.youtubeUrl;fs.writeFileSync(file,JSON.stringify(changed));assert.equal((await call('spotify-rematch-save',{token:next.token,choices:[{index:0,videoId:'lmnopqrstuv'}]})).ok,false,'concurrent rematch must not be overwritten');
  changed.linkedPlaylists=[];fs.writeFileSync(file,JSON.stringify(changed));assert.equal((await call('spotify-rematch-save',{token:next.token,choices:[{index:0,videoId:'lmnopqrstuv'}]})).ok,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
