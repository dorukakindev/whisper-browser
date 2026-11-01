'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const r=require('../src/assistant-retrieval'),scan=require('../src/renderer/assistant-book-search').scan;
test('A842-04 catalog aliases are bounded, explicit metadata and do not invent translations',()=>{
 const items=[{id:'1994',title:'Esaretin Bedeli',originalTitle:'The Shawshank Redemption'},{id:'remake',title:'Other film',originalTitle:'Other'}];
 const queries=r.variants('Esaretin Bedeli özgürlük',items);assert.equal(queries.length,2);assert.match(queries[1],/The Shawshank Redemption/);assert.match(queries[1],/ozgurluk/);assert.deepEqual(r.variants('imaginary title',items),['imaginary title']);
});
test('A842-05 RRF uses ranks, retains source revision identities and never repeats a channel vote',()=>{
 const a={id:'p',sourceId:'a',sourceRevision:'one',text:'A',score:1000},b={id:'p',sourceId:'b',sourceRevision:'one',text:'B',score:.01};
 const rows=r.fuse([[a,b,a],[b,a]]);assert.equal(rows.length,2);assert.equal(rows[0].sourceId,'a');assert.equal(rows[0].channels.length,2);assert(rows[0].score<1);
 assert.equal(r.fuse([[a],[{...a,sourceRevision:'two'}]]).length,2);
});
test('A841-24/A842-21 filtering occurs before ranking and parent context, including spoiler end bound',()=>{
 const rows=[{id:'allowed',itemId:'film',sourceId:'s',sourceRevision:'v1',text:'anahtar',start:1,end:2},{id:'spoiler',itemId:'film',sourceId:'s',sourceRevision:'v1',text:'anahtar anahtar anahtar',start:4,end:8},{id:'other',itemId:'other',sourceId:'x',sourceRevision:'v1',text:'anahtar'}];
 const scope={itemIds:['film'],sourceIds:['s'],revisions:{s:'v1'},before:3};assert.deepEqual(r.multiSearch(rows,['anahtar'],{scope}).matches.map(row=>row.id),['allowed']);assert.equal(r.multiSearch(rows,['anahtar'],{scope:{...scope,revisions:{s:'v2'}}}).matches.length,0);
 assert.equal(r.parentContexts([{...rows[0],parentId:'parent',chunkId:'allowed'}],[{...rows[0],id:'parent',childIds:['allowed'],end:9}],{scope}).length,0);
});
test('A842-06 parent promotion requires strict majority, exact source revision and character budget',()=>{
 const parent={id:'parent',sourceId:'s',sourceRevision:'v',itemId:'f',page:2,text:'Complete bounded parent.',childIds:['one','two','three']};
 const hit=id=>({id,chunkId:id,parentId:'parent',sourceId:'s',sourceRevision:'v',itemId:'f',page:2,text:'match'});
 assert.equal(r.parentContexts([hit('one')],[parent]).length,0);const promoted=r.parentContexts([hit('one'),hit('two')],[parent]);assert.equal(promoted[0].text,parent.text);assert.deepEqual(promoted[0].evidenceIds,['one','two']);
 assert.equal(r.parentContexts([hit('one'),{...hit('two'),sourceRevision:'old'}],[parent]).length,0);assert.equal(r.parentContexts([hit('one'),hit('two')],[parent],{budget:2}).length,0);
});
test('A842-08 grouping keeps same-named films and revisions separate, with natural page/cue order',()=>{
 const grouped=r.groupEvidence([{id:'late',itemId:'first',sourceId:'source',sourceRevision:'v',page:1,offset:20},{id:'early',itemId:'first',sourceId:'source',sourceRevision:'v',page:1,offset:2},{id:'remake',itemId:'remake',sourceId:'source',sourceRevision:'v',page:1,offset:1},{id:'old',itemId:'first',sourceId:'source',sourceRevision:'old',page:1,offset:1}]);
 assert.equal(grouped.length,3);assert.deepEqual(grouped[0].matches.map(row=>row.id),['early','late']);
});
test('Actual book search returns bounded parent evidence and detects cancellation across queries',async()=>{
 const result=await scan({total:2,getText:async page=>page===1?'Opening. A named key is here. More surrounding evidence.':'Other chapter.',query:'named key'});assert.equal(result.matches.length,1);assert.equal(result.parentContexts.length,1);assert.equal(result.parentContexts[0].page,1);assert.equal(result.groups.length,1);assert(result.matches[0].id.startsWith('B1-'));assert.equal(result.parentContexts[0].evidenceIds[0],result.matches[0].id);
 let live=true;assert.throws(()=>r.multiSearch([{id:'p',text:'key'}],['key','second'],{current:()=>{const old=live;live=false;return old;}}),/changed/);
});
test('search_library runs filtered catalog alias ranking with real distinct IDs and unchanged paging',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.WhisperTextFold=require('../src/text-fold');w.AssistantRetrieval=r;w.AssistantAppActions={current:()=>true};w.api={mediaCatalog:async()=>({ok:true,items:[{id:'1994',title:'Esaretin Bedeli',originalTitle:'The Shawshank Redemption',kind:'film',watchStatus:'planned',genres:['Drama'],synopsis:'Freedom and hope'},{id:'remake',title:'The Shawshank Redemption',kind:'film',year:2026,watchStatus:'completed',genres:['Drama'],synopsis:'Different record'}]})};
 w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/assistant-library-actions.js'),'utf8'));
 const result=await w.AssistantLibraryActions.execute('search_library',{query:'Esaretin Bedeli özgürlük',status:'planned'},{});assert.equal(result.items.length,1);assert.equal(result.items[0].id,'catalog:1994');assert.equal(result.search.queries.length,2);assert.equal(result.search.method,'catalog-alias-lexical-rrf');
 const all=await w.AssistantLibraryActions.execute('search_library',{query:'Shawshank'},{});assert.equal(all.count,2);assert.equal(new Set(all.items.map(row=>row.id)).size,2);w.close();
});
