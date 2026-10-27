'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const registry=require('../src/assistant-capabilities');
test('music tools reject unrelated fields, invented operations and partial ranges',()=>{
 for(const args of [{operation:'find_local',source_id:'x',start:2},{operation:'choose_file',source_id:'x'},{operation:'search_online',query:'x',track_id:'invented'},{operation:'shell'},{operation:'cancel'}])assert.throws(()=>registry.validate('music_action',args,{}));
 assert.throws(()=>registry.validate('music_action',{operation:'set_music_intent',weight:1},{}));assert.throws(()=>registry.validate('music_action',{operation:'propose_playlist',track_id:'x'},{}));assert.equal(registry.validate('music_action',{operation:'set_music_intent',query:'calm guitar',weight:.35,diverse:true},{}).weight,.35);
 assert.equal(registry.validate('music_action',{operation:'find_local',source_id:'x',start:2,end:12},{}).end,12);
 assert.throws(()=>registry.validate('music_action',{operation:'hide_match',track_id:'x'},{}));assert.equal(registry.validate('music_action',{operation:'add_reference',source_id:'x',start:0,end:5},{}).end,5);
 assert.equal(registry.validate('music_action',{operation:'rank_online',source_id:'x',start:2,end:12},{}).source_id,'x');
 assert.throws(()=>registry.validate('music_action',{operation:'rank_online',query:'invented'},{}));
});
test('music library projection is paged and does not expose paths',async()=>{
 const window={AssistantAppActions:{current:()=>true},api:{mediaShelf:async()=>({ok:true,music:Array.from({length:18},(_,i)=>({id:'id'+i,title:'Song',path:'private',url:'signed'}))})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-music-actions'),'utf8'),{window});
 const result=await window.AssistantMusicActions.execute('list_music_library',{},{});assert.equal(result.items.length,16);assert.equal(result.nextOffset,16);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('signed'));
 window.AssistantAppActions.current=()=>false;await assert.rejects(()=>window.AssistantMusicActions.execute('list_music_library',{},{}),/changed/);
});

test('music transport actions are typed and carry current player context without opening analysis',async()=>{
 assert.throws(()=>registry.validate('music_action',{operation:'set_queue_shuffle'},{}));assert.throws(()=>registry.validate('music_action',{operation:'set_queue_repeat',repeat_mode:'forever'},{}));assert.throws(()=>registry.validate('music_action',{operation:'queue_next',source_id:'invented'},{}));assert.equal(registry.validate('music_action',{operation:'set_queue_shuffle',selected:false},{}).selected,false);
 let seen;const window={AssistantAppActions:{current:()=>true},MusicAnalysisUI:{read:async()=>({open:false})},MediaShelfUI:{musicContext:()=>({queueCount:2,repeat:'all'}),executeMusic:async a=>{seen=a;return {queueCount:2};}}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-music-actions'),'utf8'),{window});const context=await window.AssistantMusicActions.execute('get_music_context',{},{});assert.equal(context.open,false);assert.equal(context.player.queueCount,2);const result=await window.AssistantMusicActions.execute('music_action',{operation:'queue_next'},{});assert.equal(seen.operation,'queue_next');assert.equal(result.player.queueCount,2);
});

test('catalog selection tools require exact identities and reject unrelated arguments',()=>{
 assert.throws(()=>registry.validate('music_action',{operation:'select_online_match',selected:true},{}));assert.throws(()=>registry.validate('music_action',{operation:'use_online_reference',track_id:'1',url:'https://private'},{}));assert.equal(registry.validate('music_action',{operation:'select_online_match',track_id:'1',selected:false},{}).selected,false);assert.equal(registry.validate('music_action',{operation:'use_online_reference',track_id:'1'},{}).track_id,'1');
});
