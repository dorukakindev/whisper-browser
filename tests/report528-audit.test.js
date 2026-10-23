const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {terminateProcessTreeAndWait:stop}=require('../src/process-lifecycle');
const {editorText}=require('../src/dub-editor-request');
const {safeShortening}=require('../src/dub-text-guard');

test('an accepted signal without confirmed close allows a new stop attempt',async()=>{
  const proc=new EventEmitter();proc.pid=12345;proc.exitCode=null;proc.signalCode=null;
  const signals=[];proc.kill=signal=>{signals.push(signal);return true;};
  const options={platform:'linux',killFn:()=>false,waitMs:10};
  const first=stop(proc,options),overlap=stop(proc,options);
  assert.equal(first,overlap,'concurrent callers must share ownership of the stop attempt');
  assert.equal(await first,false);assert.equal(signals.length,1);
  const retry=stop(proc,options);assert.equal(signals.length,2,'retry must send a fresh signal');
  proc.emit('close',null,'SIGKILL');assert.equal(await retry,true);
  assert.equal(await stop(proc,options),true);assert.equal(signals.length,2);
});

test('known truncated editor answers cannot become an approved partial narration',()=>{
  const source='Deniz sakindi. İnsanlar kıyıda yürüyordu.';
  const prefix='Deniz sakindi.';
  assert.equal(safeShortening(source,prefix,{natural:true}),true,'text heuristics alone cannot prove completeness');
  for(const finish_reason of ['length','max_tokens','content_filter','tool_calls','function_call']){
    const text=editorText({choices:[{finish_reason,message:{content:prefix}}]});
    assert.equal(safeShortening(source,text,{natural:true}),false,finish_reason);
  }
  for(const finish_reason of ['stop','end_turn',undefined])assert.equal(editorText({choices:[{finish_reason,message:{content:source}}]}),source);
  for(const payload of [null,{}, {error:'provider failure'}, {choices:[{message:{content:[]}}]}])assert.equal(editorText(payload),'');
});


test('legacy merged source identities work without weakening known timing bounds',()=>{
  const {summarizeTranslationIntegrity:summary}=require('../src/browser-translation-integrity');
  const result={cueId:'a',text:'Birleşik çeviri.',start:0,end:2,coveredCueIds:['a','b']};
  const state={total:1,completed:1};
  for(const timing of [{},{start:null,end:null},{start:'',end:''}]){
    const sourceCues=[{id:'a',text:'one',...timing},{id:'b',text:'two',...timing}];
    assert.equal(summary({sourceCues,results:[result],state}).status,'complete');
  }
  const sourceCues=[{id:'a',text:'one'},{id:'b',text:'two',start:4,end:5}];
  assert.equal(summary({sourceCues,results:[result],state}).status,'partial');
  assert.equal(summary({sourceCues:[{id:'a',text:'one'},{id:'a',text:'two'}],results:[result],state}).status,'partial','ambiguous identity-only duplicates must stay incomplete');
});
