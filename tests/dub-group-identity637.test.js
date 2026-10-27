"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {findTestPython}=require('./python-runtime'),Model=require('../src/renderer/dub-workspace-model'),registry=require('../src/assistant-capabilities');
test('A real 100-cue short-line plan identity remains usable in the quality workspace and exact assistant tools',()=>{
 const python=findTestPython();assert(python);const result=cp.spawnSync(python,['-c',"import sys,json;sys.path.insert(0,'tools/voxcpm2');from dub_plan import make_groups;g=make_groups([(i*100,i*100+100,'bu' if i%2 else 'o') for i in range(100)],mode='cumle')[0];print(json.dumps({'key':','.join(map(str,g['source_ids'])),'text':g['text'],'start':g['start']/1000,'end':g['end']/1000}))"],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);const g=JSON.parse(result.stdout);assert(g.key.length>200&&g.key.length<=2000);
 const row={key:g.key,text:g.text,status:'ready',sourceStart:g.start,sourceEnd:g.end,audioStart:0,audioEnd:12,verification:{status:'passed'}};
 assert.equal(Model.groups([row])[0].key,g.key,'A valid generated quality group must not disappear');
 assert.equal(registry.validate('get_voice_status',{group_id:g.key},{kind:'video'}).group_id,g.key);
 for(const operation of ['open','listen','regenerate'])assert.equal(registry.validate('voice_group',{group_id:g.key,operation},{kind:'video'}).group_id,g.key);
 assert.throws(()=>Model.groups([{...row,key:'9'.repeat(2001)}]));assert.throws(()=>registry.validate('voice_group',{group_id:'9'.repeat(2001),operation:'listen'},{kind:'video'}));
});
