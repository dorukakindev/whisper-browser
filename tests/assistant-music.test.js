'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const registry=require('../src/assistant-capabilities');
test('music tools reject unrelated fields, invented operations and partial ranges',()=>{
 for(const args of [{operation:'find_local',source_id:'x',start:2},{operation:'choose_file',source_id:'x'},{operation:'search_online',query:'x',track_id:'invented'},{operation:'shell'},{operation:'cancel'}])assert.throws(()=>registry.validate('music_action',args,{}));
 assert.equal(registry.validate('music_action',{operation:'find_local',source_id:'x',start:2,end:12},{}).end,12);
});
test('music library projection is paged and does not expose paths',async()=>{
 const window={AssistantAppActions:{current:()=>true},api:{mediaShelf:async()=>({ok:true,music:Array.from({length:18},(_,i)=>({id:'id'+i,title:'Song',path:'private',url:'signed'}))})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-music-actions'),'utf8'),{window});
 const result=await window.AssistantMusicActions.execute('list_music_library',{},{});assert.equal(result.items.length,16);assert.equal(result.nextOffset,16);assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('signed'));
 window.AssistantAppActions.current=()=>false;await assert.rejects(()=>window.AssistantMusicActions.execute('list_music_library',{},{}),/changed/);
});
