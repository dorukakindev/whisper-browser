'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{normalize,fromSpotify}=require('../src/music-source-version');
test('version provenance rejects signed streams and external URLs, marks meaningful duration differences only',()=>{
 const url='https://www.youtube.com/watch?v=abcdefghijk';assert.deepEqual(fromSpotify({youtubeUrl:url,youtubeTitle:'Live',youtubeDuration:480,duration:220}),{url,title:'Live',duration:480,sourceDuration:220,durationMismatch:true});
 assert.equal(normalize({url,duration:240,sourceDuration:245}).durationMismatch,false);assert.equal(normalize({url,duration:240}).durationMismatch,false);
 for(const url of ['https://fixture.googlevideo.com/audio?sig=private','javascript:alert(1)','https://example.com/','https://www.youtube.com/watch?v=abcdefghijk&token=private'])assert.equal(normalize({url}),null);
 const safe=normalize({url,duration:Infinity,sourceDuration:-2,title:'x'.repeat(400),apiKey:'private'});assert.equal(safe.duration,0);assert.equal(safe.sourceDuration,0);assert.equal(safe.title.length,300);assert(!JSON.stringify(safe).includes('private'));
});
test('service exposes the reviewed version without leaking signed stream metadata',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'version698-'));try{
 const file=path.join(dir,'fixture.wav');fs.writeFileSync(file,require('./helpers/wav-fixture')());const service=require('../src/music-analysis-service').createService({userData:()=>dir});
 const source=service.remember(file,{title:'Track',origin:'spotify-youtube-excerpt',reviewedVersion:{url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Studio',duration:250,sourceDuration:245,private:'secret'}});assert.equal(source.reviewedVersion.title,'Studio');assert(!JSON.stringify(source).includes('secret'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
