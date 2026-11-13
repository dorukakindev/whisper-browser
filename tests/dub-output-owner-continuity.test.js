'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
function fixture(mode){
  const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'}),w=dom.window,el=id=>w.document.getElementById(id);
  let media={mode,tabId:'video',mediaKey:'source-A',source:'source-A',generation:1,visible:true,hasMedia:true},event,request;
  const attached=[];
  w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};w.syncBrowserOcclusion=()=>{};
  w.BrowserDubAudioUI={context:()=>({...media}),attachGenerated:async(file,expected)=>{
    // Match the production browser-dub-ui attachment ownership gate.
    if(['mode','tabId','mediaKey','generation','mediaId'].some(key=>media[key]!==expected[key]))return false;
    attached.push({file,context:{...media}});return true;
  }};
  const proof=()=>({id:request.id,name:'source-A.wav',url:'file:///source-A.wav'});
  w.api={dubConfig:async()=>({ok:true,ready:true,reference:'voice.wav'}),latestDub:async query=>({ok:true,output:query.id===request?.id&&query.source==='source-A'?proof():null}),
    selectFile:async()=> 'C:/source-A.srt',planDub:async()=>({ok:true,sourceHash:'source-hash',groups:[{key:'1',text:'Complete original speech.',start:0,end:2000,seconds:2}]}),
    onDubEvent:callback=>event=callback,startDub:async value=>{request=value;return {ok:true};}};
  el('dubGeneratorDialog').showModal=()=>el('dubGeneratorDialog').open=true;
  w.DubRunInfo=require('../src/renderer/dub-run-info');w.eval(fs.readFileSync(require.resolve('../src/renderer/dub-generator-ui'),'utf8'));
  return {w,el,attached,setMedia:value=>media={...media,...value},proof,
    async start(){await w.DubGeneratorUI.prepareCurrent();el('dubChooseSrt').click();await tick();el('dubGeneratorStart').click();await tick();assert(request);},
    async finish(){event({id:request.id,type:'done',name:'source-A.wav',url:'file:///source-A.wav',quality:{groups:[{key:'1',group:1,status:'review'}]}});await tick();},
    close:()=>w.close()};
}
for(const mode of ['player','browser'])test(`Completed ${mode} speech stays owned by its original source on manual use`,async()=>{
  const h=fixture(mode);
  try{
    await h.start();h.setMedia({mediaKey:'source-B',source:'source-B',generation:2});await h.finish();
    assert.equal(h.el('dubGeneratedPreview').getAttribute('src'),'file:///source-A.wav','keep completed audio available for listening');
    h.el('dubGeneratorUse').click();await tick();
    assert.equal(h.attached.length,0,'finishing the old source must not authorize attaching its speech to a new source');
    h.setMedia({mediaKey:'source-A',source:'source-A',generation:1});h.el('dubGeneratorUse').click();await tick();
    assert.equal(h.attached.length,1,'the original source can still use its completed audio');
  }finally{h.close();}
});
test('A generated-output proof cannot attach after the source changes while it loads',async()=>{
  const h=fixture('browser');
  try{
    await h.start();await h.finish();let reply;
    h.w.api.latestDub=()=>new Promise(resolve=>reply=resolve);
    h.el('dubGeneratorUse').click();await tick();
    h.setMedia({generation:2});reply({ok:true,output:h.proof()});await tick();
    assert.equal(h.attached.length,0,'even a valid saved source proof cannot authorize an obsolete page generation');
  }finally{h.close();}
});
test('A pending Use locks new production until its owned attachment settles',async()=>{
  const h=fixture('player');
  try{
    await h.start();await h.finish();let reply;const oldProof=h.proof();
    h.w.api.latestDub=()=>new Promise(resolve=>reply=resolve);
    h.el('dubGeneratorUse').click();await tick();
    assert.equal(h.el('dubGeneratorStart').disabled,true,'pending attachment must lock generation');
    assert.equal(h.w.DubGeneratorUI.experience().busy,true);
    h.el('dubGeneratorStart').click();await tick();
    assert.equal(h.proof().id,oldProof.id,'a disabled start must not create a new production');
    reply({ok:true,output:oldProof});await tick();
    assert.equal(h.attached.length,1,'the still-current owned result can attach once');
    assert.equal(h.w.DubGeneratorUI.experience().busy,false);
    assert.equal(h.el('dubGeneratorUse').disabled,false,'the attachment lock clears after its result settles');
  }finally{h.close();}
});
test('An explicitly imported project remains manually usable without a production log id',async()=>{
  const h=fixture('player');
  try{
    await h.w.DubGeneratorUI.prepareCurrent();
    h.w.dispatchEvent(new h.w.CustomEvent('dub-workspace:loaded',{detail:{name:'Chosen project',url:'file:///chosen-project.wav'}}));
    h.w.api.latestDub=()=>{throw Error('Imported project must not require a generated-output log');};
    h.el('dubGeneratorUse').click();await tick();
    assert.equal(h.attached.length,1);assert.equal(h.attached[0].file.url,'file:///chosen-project.wav');
  }finally{h.close();}
});
