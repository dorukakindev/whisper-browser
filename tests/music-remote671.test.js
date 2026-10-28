'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {create}=require('../src/music-remote-source');
test('online reference uses known catalog identity, bounded decode and removes temporary sources',async()=>{
 let args;const r=create({ffmpeg:()=> 'ffmpeg',run:async(exe,a)=>{args=a;fs.writeFileSync(a.at(-1),'decoded');}});
 const online={snapshot:ids=>{assert.deepEqual(ids,['known']);return [{id:'known',title:'Public preview',artist:'Artist'}];},samples:async(rows,folder)=>{const file=path.join(folder,'sample.mp3');fs.writeFileSync(file,'sample');return {tracks:[{path:file}]};}};
 const source=await r.prepare({kind:'deezer',id:'known'},online);assert.equal(source.metadata.origin,'deezer-preview');const again=await r.prepare({kind:'deezer',id:'known'},{});assert.equal(again.file,source.file);assert.equal(args[args.indexOf('-t')+1],'30');assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file,pipe');assert(fs.existsSync(source.file));assert(!fs.existsSync(path.join(path.dirname(source.file),'sample.mp3')));await r.release();assert(!fs.existsSync(source.file));await assert.rejects(()=>r.prepare({kind:'invented'},online));
});
test('cancelled source preparation cannot publish a partial reference',async()=>{
 let begin,folder;const ready=new Promise(r=>begin=r);const r=create({ffmpeg:()=> 'ffmpeg',run:async()=>{}}),online={snapshot:()=>[{}],samples:async(rows,dir,signal)=>{folder=dir;begin();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}};
 const pending=r.prepare({kind:'deezer',id:'known'},online);await ready;r.cancel();await assert.rejects(()=>pending);assert(!fs.existsSync(folder));
});

test('Spotify reference cache follows the current YouTube match and refuses removed imported tracks',async()=>{
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-rematch-'));
 const shelf=path.join(dir,'media-shelf.json'),request={kind:'spotify',playlistId:'playlist',id:'track'};
 let video='abcdefghijk',title='First title',downloads=0;
 const save=()=>fs.writeFileSync(shelf,JSON.stringify({linkedPlaylists:[{id:'playlist',tracks:[{id:'track',title,artist:'Artist',youtubeTitle:'Matched '+title,duration:200,youtubeDuration:300,youtubeUrl:'https://www.youtube.com/watch?v='+video}]}]}));
 const remote=create({userData:()=>dir,python:()=> 'python',ffmpeg:()=> 'ffmpeg',run:async(_cmd,args)=>{
  if(args.includes('yt_dlp')){downloads++;return JSON.stringify({url:'https://fixture.googlevideo.com/'+video});}
  fs.writeFileSync(args.at(-1),video);return '';
 }});
 try{
  save();const first=await remote.prepare(request);assert.equal(fs.readFileSync(first.file,'utf8'),'abcdefghijk');
  title='Corrected title';save();const renamed=await remote.prepare(request);assert.equal(renamed.metadata.title,title);assert.equal(downloads,1);assert.equal(renamed.metadata.reviewedVersion.title,'Matched Corrected title');assert.equal(renamed.metadata.reviewedVersion.durationMismatch,true);assert.equal(renamed.metadata.reviewedVersion.url,'https://www.youtube.com/watch?v=abcdefghijk');
  video='lmnopqrstuv';save();const changed=await remote.prepare(request);assert.equal(fs.readFileSync(changed.file,'utf8'),video);assert.notEqual(changed.file,first.file);assert.equal(downloads,2);
  fs.writeFileSync(shelf,JSON.stringify({linkedPlaylists:[]}));await assert.rejects(()=>remote.prepare(request),/Imported track missing/);
 }finally{await remote.release();fs.rmSync(dir,{recursive:true,force:true});}
});
