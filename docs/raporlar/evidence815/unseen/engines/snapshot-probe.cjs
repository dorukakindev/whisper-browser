'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),out=process.env.R815_ENGINE_OUT?path.resolve(process.env.R815_ENGINE_OUT):path.join(root,'.tmp/unseen815-engines'),source=path.join(root,'src/renderer/renderer.js'),text=fs.readFileSync(source,'utf8');
const begin=text.indexOf('async function capturePlayerFrame() {'),end=text.indexOf('// ---- altyazı görünümü',begin),code=text.slice(begin,end);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function run(mode){
 const entered=deferred(),decode=deferred(),reply=deferred(),observations={drawn:[],subtitles:[],saved:[],osd:[]};
 const player={workspaceMode:'player',mediaKey:'synthetic-A',generation:1,subsHidden:false,activeIdx:0,cues:[{text:'Subtitle A'}],subStyle:{}};
 const video={videoWidth:640,videoHeight:360,currentTime:12};
 class Image{constructor(){this.naturalWidth=640;this.naturalHeight=360;}async decode(){entered.resolve();await decode.promise;}}
 const ctx={drawImage(frame){observations.drawn.push(frame.src);},measureText(s){return{width:s.length*10};},strokeText(){},fillText(s){observations.subtitles.push(s);}};
 const document={createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,CONTROLLED_CANVAS'};}};
 const sandbox={player,Image,document,$:()=>video,osd:s=>observations.osd.push(s),logLine(){},window:{NativePlayerUI:{active:()=>true},api:{nativePlayer:async()=>{if(mode==='before-response')await reply.promise;return {ok:true,image:'data:image/png;base64,SOURCE_A'};},saveImage:async v=>{observations.saved.push(v);return{ok:true,path:'synthetic.png'};}}}};
 vm.runInNewContext(code+'\nthis.capture=capturePlayerFrame;',sandbox,{filename:source});
 const pending=sandbox.capture();
 const switchSource=()=>{player.mediaKey='synthetic-B';player.generation=2;player.cues=[{text:'Subtitle B'}];video.currentTime=45;};
 if(mode==='before-response'){switchSource();reply.resolve();decode.resolve();}
 else {await entered.promise;if(mode==='during-decode')switchSource();decode.resolve();}
 await pending;return observations;
}
(async()=>{const stable=await run('stable'),before=await run('before-response'),during=await run('during-decode');assert.equal(stable.saved.length,1);assert.deepEqual(stable.subtitles,['Subtitle A']);assert.match(stable.saved[0].suggestedName,/synthetic_A_12s/);assert.equal(before.saved.length,0);assert.equal(during.saved.length,1);assert.deepEqual(during.drawn,['data:image/png;base64,SOURCE_A']);assert.deepEqual(during.subtitles,['Subtitle B']);assert.match(during.saved[0].suggestedName,/synthetic_B_45s/);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'snapshot-results.json'),JSON.stringify({sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),execution:'Original capturePlayerFrame, controlled Image decode barrier/canvas/API; no actual native player or screenshot pixels',stable,beforeResponse:before,duringDecode:during},null,2));console.log('UE04 verified with stable and early-switch negative controls');})().catch(e=>{console.error(e);process.exitCode=1;});
