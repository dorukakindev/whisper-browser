 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const context=require('../src/local-subtitle-context');
test('local generated subtitle context survives serialization but rejects edited text and changed media',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'subtitle-context712-'));
 try{const media=path.join(root,'Türkçe video.mp4'),subtitle=path.join(root,'Çeviri.srt');fs.writeFileSync(media,'synthetic');fs.writeFileSync(subtitle,'1\n00:00:02,000 --> 00:00:05,000\nKütüphane açık.\n');const bytes=fs.readFileSync(subtitle),rows=context.build({source:'local',input:media,clipStart:'0:02',clipEnd:'0:10'},{outputs:[{path:subtitle}]});assert.equal(rows.length,1);const inputStat=context.snapshot(media);const history=JSON.parse(JSON.stringify([{subtitleContexts:rows}]));assert.deepEqual(context.read(history,subtitle,bytes)?.range,{start:2,end:10});assert.equal(context.read(history,subtitle,Buffer.from('edited')),null);fs.writeFileSync(media,'different source');assert.deepEqual(context.build({source:'local',input:media,inputStat,clipStart:2,clipEnd:10},{outputs:[{path:subtitle}]}),[]);assert.equal(context.read(history,subtitle,bytes),null);assert.equal(context.read([{}],subtitle,bytes),null);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('range parsing is bounded and local context builder ignores YouTube and open ended jobs',()=>{
 for(const [start,end] of [['0:61','2:00'],['2:00','1:00'],['-1','10'],['0','86401'],['2',null]])assert.equal(context.range({clipStart:start,clipEnd:end}),null);assert.deepEqual(context.range({clipStart:'0:02',clipEnd:'0:10'}),{start:2,end:10});assert.deepEqual(context.range({clipStart:'0:02.125',clipEnd:'0:10.5'}),{start:2.125,end:10.5});assert.deepEqual(context.build({source:'youtube',clipStart:2,clipEnd:10},{}),[]);
});

test('repair playback proof binds original subtitle bytes and current authorized media across restart',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'repair-playback-'));
 try{
  const media=path.join(root,'movie.mp4'),file=path.join(root,'original.srt');fs.writeFileSync(media,'media');fs.writeFileSync(file,'original text');
  const bytes=fs.readFileSync(file),proof=JSON.parse(JSON.stringify(context.repairPlaybackProof(file,bytes,media,x=>x,{start:2,end:6})));
  assert.deepEqual(context.verifyRepairPlayback(proof,media,file,bytes,x=>x),{start:2,end:6});
  assert.throws(()=>context.verifyRepairPlayback(proof,media,file,Buffer.from('edited'),x=>x),/source changed/);
  assert.throws(()=>context.verifyRepairPlayback(proof,media,file+'.other',bytes,x=>x),/source changed/);
  assert.throws(()=>context.verifyRepairPlayback(proof,media+'.other',file,bytes,x=>x),/source changed/);
  assert.throws(()=>context.verifyRepairPlayback(proof,media,file,bytes,()=>{throw Error('Unauthorized');}),/Unauthorized/);
  fs.writeFileSync(media,'different media');assert.throws(()=>context.verifyRepairPlayback(proof,media,file,bytes,x=>x),/media changed/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('queued repairs preserve clip provenance across serialization and reject changed video or source bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'repair-context-'));
 try{
  const media=path.join(root,'movie.mp4'),input=path.join(root,'staged.srt'),source=path.join(root,'source.srt'),output=path.join(root,'repair.srt');
  fs.writeFileSync(media,'original media');fs.writeFileSync(input,'approved subtitle');fs.writeFileSync(source,'source text');fs.writeFileSync(output,'repaired subtitle');
  const options=JSON.parse(JSON.stringify({translateOnly:true,translateRetryOnly:true,translateCueRange:'',input:source,translateExisting:input,
   subtitlePlayback:{mediaPath:media,range:{start:2,end:10},mediaStat:context.snapshot(media)}}));
  const capture=()=>context.translationSnapshot(options,file=>file),captured=capture();
  const build=()=>context.build({translateOnly:true,subtitlePlayback:captured},{outputs:[{path:output}]});
  const history=JSON.parse(JSON.stringify([{subtitleContexts:build()}]));
  const reopened=context.read(history,output,fs.readFileSync(output));assert.deepEqual(reopened.range,{start:2,end:10});
  const next={...options,input:output,translateExisting:output,subtitlePlayback:reopened};
  assert.deepEqual(context.build({translateOnly:true,subtitlePlayback:context.translationSnapshot(next,file=>file)},{outputs:[{path:input}]})[0].range,{start:2,end:10});
  fs.writeFileSync(source,'edited source during generation');assert.deepEqual(build(),[]);
  fs.writeFileSync(source,'source text');assert.equal(build().length,1);
  fs.writeFileSync(input,'edited during generation');assert.deepEqual(build(),[]);
  fs.writeFileSync(media,'different media after queueing');assert.throws(capture,/media changed/);
  assert.equal(context.read(history,output,fs.readFileSync(output)),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('local dub range follows the selected translation and is bound to the exact current paths',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/browser-dub-ui'),'utf8'),a=source.indexOf('  function selectedLocalSubtitleRange()'),b=source.indexOf('  function selectedBrowserSubtitle()',a),player={subPath:'C:/source.srt',localPath:'C:/movie.mp4',subtitleContext:{subtitlePath:'C:/source.srt',mediaPath:'C:/movie.mp4',range:{start:2,end:10}}},c={player};vm.createContext(c);vm.runInContext(source.slice(a,b),c);assert.equal(c.selectedLocalSubtitleRange().start,2);player.localPath='C:\\movie.mp4';assert.equal(c.selectedLocalSubtitleRange().start,2);player.localPath='C:/other.mp4';assert.equal(c.selectedLocalSubtitleRange(),null);player.localPath='C:/movie.mp4';player.subPath='C:/manual.srt';assert.equal(c.selectedLocalSubtitleRange(),null);player.sub2Role='translation';player.sub2Path='C:/translation.srt';player.subtitleContext2={subtitlePath:player.sub2Path,mediaPath:player.localPath,range:{start:3,end:7}};assert.equal(c.selectedLocalSubtitleRange().start,3);player.sub2Path='C:/new.srt';assert.equal(c.selectedLocalSubtitleRange(),null);
});

test('Translation-only output binds the authorized current video, never the input SRT or stale main-form range',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'caption-playback-'));try{
  const media=path.join(root,'Türkçe video.mp4'),source=path.join(root,'source.srt'),output=path.join(root,'translated.srt');fs.writeFileSync(media,'synthetic media');fs.writeFileSync(source,'source');fs.writeFileSync(output,'translated');
  const options={translateOnly:true,translateCueRange:'2.125:10.5',input:source,subtitlePlayback:{mediaPath:media,range:{start:2.125,end:10.5}}};let authorized='';
  const captured=context.translationSnapshot(options,file=>(authorized=file,media));assert.equal(authorized,media);
  const rows=context.build({source:'local',input:source,translateOnly:true,clipStart:99,clipEnd:100,subtitlePlayback:captured},{outputs:[{path:output}]});
  assert.equal(rows.length,1);assert.equal(rows[0].mediaPath,media);assert.deepEqual(rows[0].range,{start:2.125,end:10.5});
  assert.deepEqual(context.read([{subtitleContexts:rows}],output,fs.readFileSync(output)).range,{start:2.125,end:10.5});
  assert.deepEqual(context.build({source:'local',input:source,translateOnly:true,clipStart:2,clipEnd:10},{outputs:[{path:output}]}),[]);
  fs.writeFileSync(media,'replaced media, different size');assert.deepEqual(context.build({translateOnly:true,subtitlePlayback:captured},{outputs:[{path:output}]}),[]);
  assert.throws(()=>context.translationSnapshot(options,()=>{throw Error('Not authorized');}),/Not authorized/);
  assert.throws(()=>context.translationSnapshot({...options,subtitlePlayback:{mediaPath:media,range:{start:10,end:2}}},()=>media),/range/);
  assert.throws(()=>context.translationSnapshot({...options,translateCueRange:'2:10'},()=>media),/range/);
  assert.equal(context.translationSnapshot({translateOnly:true},()=>{throw Error('Should not authorize');}),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
