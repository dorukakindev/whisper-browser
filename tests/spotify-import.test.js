'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {address,parse,create}=require('../src/spotify-import');
const id='4uLU6hMCjMI75M1A2tKUQC',other='0123456789ABCDEFGHIJKL';
const entity={name:'İncelenen liste',trackList:[{title:'Bir',subtitle:'Sanatçı',duration:123000,uri:'spotify:track:'+id},{title:'İki',subtitle:'İkinci',duration:210000,uri:'spotify:track:'+other}]};
const html=e=>`<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{state:{data:{entity:e}}}}})}</script>`;
const body=html(entity),url='https://open.spotify.com/playlist/'+id;
test('Spotify URL and bounded metadata parser reject other origins and preserve track order',()=>{
 for(const bad of ['http://open.spotify.com/track/'+id,'https://open.spotify.com.evil.test/track/'+id,'https://x@open.spotify.com/track/'+id,'https://open.spotify.com:444/track/'+id,'https://127.0.0.1/track/'+id,'https://open.spotify.com/track/short'])assert.throws(()=>address(bad));
 assert.equal(address('https://open.spotify.com/intl-tr/track/'+id+'?si=tracking').url,'https://open.spotify.com/track/'+id);
 const result=parse(body,address(url));assert.deepEqual(result.tracks.map(t=>t.title),['Bir','İki']);assert.equal(result.tracks[0].duration,123);assert.equal(result.limited,true);assert.throws(()=>parse('<h1>private</h1>',address(url)));
 assert.equal(parse(html({name:'Large',trackList:Array(105).fill(entity.trackList[0])}),address(url)).tracks.length,100);
});
test('Spotify import binds review to owner and known matches; rejects arbitrary stream destinations',async()=>{
 let args;const s=create({fetchImpl:async()=>new Response(body),python:()=> 'python',run:async(exe,a)=>{args=a;return a.includes('--flat-playlist')?JSON.stringify({entries:[{id:'abcdefghijk',title:'Bir',duration:124},{id:'lmnopqrstuv',title:'Other',duration:400}]}):JSON.stringify({url:'https://127.0.0.1/private'});}});
 const d=await s.read(url,1);await assert.rejects(()=>s.match(d.token,0,2));const m=await s.match(d.token,0,1);assert.equal(m.hits[0].id,'abcdefghijk');assert(args.includes('--ignore-config'));assert(args.at(-1).startsWith('ytsearch3:'));
 await s.match(d.token,1,1);assert.throws(()=>s.selection(d.token,[{index:0,videoId:'invented'}],1));assert.throws(()=>s.selection(d.token,[{index:0,videoId:'abcdefghijk'},{index:0,videoId:'abcdefghijk'}],1));
 const picked=s.selection(d.token,[{index:1,videoId:'abcdefghijk'},{index:0,videoId:'abcdefghijk'}],1);assert.deepEqual(picked.tracks.map(t=>t.title),['Bir','İki']);assert(picked.tracks.every(t=>t.youtubeUrl==='https://www.youtube.com/watch?v=abcdefghijk'));await assert.rejects(()=>s.stream(m.hits[0].url));s.forget(d.token);assert.throws(()=>s.selection(d.token,[],1));
});
test('Spotify read cancellation releases its slot and bounds the response',async()=>{
 let started;const ready=new Promise(r=>started=r);const s=create({fetchImpl:async(u,{signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}});const pending=s.read(url,1);await ready;s.cancel();await assert.rejects(()=>pending);
 const large=create({fetchImpl:async()=>new Response('x'.repeat(3000001))});await assert.rejects(()=>large.read(url,1));
});
test('Spotify main review saves original order atomically and leaves local music and playlists intact',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{registerMediaShelf}=require('../src/media-shelf-service');const root=fs.mkdtempSync(path.join(os.tmpdir(),'spotify-review-'));let handle;
 try{
  const file=path.join(root,'media-shelf.json'),initial={version:1,music:[{id:'local',title:'Keep'}],playlists:[{id:'old',name:'Keep order',tracks:['local']}],books:[],stations:[],podcasts:[],diary:[],personalField:'preserved'};fs.writeFileSync(file,JSON.stringify(initial));
  registerMediaShelf({ipcMain:{handle:(name,fn)=>handle=fn},authorized:()=>true,userData:()=>root,fetchImpl:async()=>new Response(body),pythonPath:()=> 'python',musicRun:async()=>JSON.stringify({entries:[{id:'abcdefghijk',title:'Match',duration:124}]})});
  const event={sender:{id:1}},call=payload=>handle(event,payload),d=await call({action:'spotify-read',url});assert(d.ok);await call({action:'spotify-match',token:d.token,index:0});await call({action:'spotify-match',token:d.token,index:1});
  const before=fs.readFileSync(file,'utf8');assert.equal((await call({action:'spotify-save',token:d.token,choices:[{index:0,videoId:'fake'}]})).ok,false);assert.equal(fs.readFileSync(file,'utf8'),before);
  const saved=await call({action:'spotify-save',token:d.token,name:'Yeni liste',choices:[{index:1,videoId:'abcdefghijk'},{index:0,videoId:'abcdefghijk'}]});assert(saved.ok);const after=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(after.music,initial.music);assert.deepEqual(after.playlists,initial.playlists);assert.equal(after.personalField,'preserved');assert.deepEqual(after.linkedPlaylists[0].tracks.map(r=>r.title),['Bir','İki']);assert.equal((await call({action:'spotify-save',token:d.token,choices:[]})).ok,false);
  assert((await call({action:'spotify-remove',id:saved.id})).ok);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).linkedPlaylists.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
