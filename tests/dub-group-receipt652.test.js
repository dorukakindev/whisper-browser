'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/dub-generator-ui'),'utf8');
test('group listen cannot return successful acceptance after the dialog or output changes during play()',async()=>{
 const a=source.indexOf('  async function listenSelectedGroup(){'),b=source.indexOf('  listenGroup.onclick=',a);
 for(const reason of ['close','output','generation','current','workspace','normal']){
  let release;const c={current:null,workspaceBusy:false,output:{url:'voice.wav'},modal:{open:true},groupPlayGeneration:0,rangeEnd:null,results:new Map([['group',{audioStart:2,audioEnd:4}]]),el:()=>({value:'group'}),metadataReady:async()=>true,status:()=>{},stopGroupPreview:()=>{c.groupPlayGeneration++;},Number,groupAudio:{duration:10,currentTime:0,play:()=>new Promise(r=>release=r)}};
  vm.createContext(c);vm.runInContext(source.slice(a,b),c);const pending=c.listenSelectedGroup();await new Promise(setImmediate);
  if(reason==='close')c.modal.open=false;if(reason==='output')c.output={url:'next.wav'};if(reason==='generation')c.groupPlayGeneration++;
  if(reason==='current')c.current={id:'next-job'};if(reason==='workspace')c.workspaceBusy=true;
  release();assert.equal(await pending,reason==='normal','obsolete '+reason+' must not be a successful assistant listen');
 }
});
