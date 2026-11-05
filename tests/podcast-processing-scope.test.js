'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Scope=require('../src/renderer/podcast-task-scope');
test('podcast interval syntax accepts seconds and clock values and rejects invalid or out-of-duration scopes',()=>{
 for(const [a,b]of [[30,42],['0:30','0:42'],['00:00:30.100','00:00:42.100']]){const range=Scope.normalize({start:a,end:b},60);assert.equal(range.end-range.start,12);assert(Object.isFrozen(range));}
 assert.equal(Scope.normalize(null),null);for(const range of [{start:'',end:12},{start:0,end:0},{start:-1,end:12},{start:0,end:'0:99'},{start:0,end:61},{start:0,end:Infinity}])assert.throws(()=>Scope.normalize(range,60));
});
test('RSS explicit intervals are validated before acquisition and forwarded without changing full-episode requests',async()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/player-source-catalog-integration'),'utf8'),a=source.indexOf('  async function runPodcastTask('),b=source.indexOf('  async function loadPublisherTranscript(',a),calls=[];
 const audio={mediaKey:'rss:one',generation:1,sourceVersion:'v1'},player={workspaceMode:'player',mediaKey:audio.mediaKey,generation:1,workspaceAudio:audio};const ctx={player,document:{getElementById:()=>({duration:60})},window:{PodcastTaskScope:Scope},t:(_tr,en)=>en,generatePodcast:async config=>{calls.push(config);return {queued:true};},translatePodcastTranscript:async()=>{throw Error('wrong operation');}};vm.runInNewContext(source.slice(a,b)+';globalThis.run=runPodcastTask;',ctx);
 await ctx.run({operation:'transcribe-translate',range:{start:'0:30',end:'0:42'}});assert.equal(calls[0].range.start,30);assert.equal(calls[0].range.end,42);await assert.rejects(ctx.run({operation:'transcribe',range:{start:0,end:61}}));assert.equal(calls.length,1);await ctx.run({operation:'transcribe'});assert.equal(calls[1].range,null);await assert.rejects(ctx.run({operation:'translate',range:{start:0,end:12}}),/transcribe/i);
});
