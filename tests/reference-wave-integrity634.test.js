'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{prepareVoiceReference}=require('../src/voice-reference');
test('A successful reference process exit cannot accept empty, truncated or fake PCM audio',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reference-integrity-'));
 try{const valid=require('./helpers/wav-fixture')();for(const data of [Buffer.alloc(0),valid.subarray(0,48),Buffer.from('not a wave file'.repeat(10))]){
  const reference=path.join(root,'referans.wav'),transcript=path.join(root,'referans.txt'),child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();fs.writeFileSync(reference,data);fs.writeFileSync(transcript,'Spoken reference.');
  const result=prepareVoiceReference({source:'input.wav',start:0,end:5,reference,transcript,appRoot:root,python:'fixture',ffmpeg:'fixture',spawn:()=>child,terminate:async()=>true,environment:()=>({}),onProcess(){},status(){},isCancelled:()=>false});
  const rejected=assert.rejects(result,/Reference preparation failed/);child.emit('close',0);await rejected;
 }}finally{fs.rmSync(root,{recursive:true,force:true});}
});
