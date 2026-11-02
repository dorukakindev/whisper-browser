'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../src/assistant-media-selection'),Q=require('../src/assistant-library-query');
const film=(id,extra={})=>({id,title:'Film '+id,kind:'film',year:2020,runtime:90,watchStatus:'planned',ratings:{personal:0,imdb:'8/10'},personalMedia:{reaction:null},genres:['Drama'],directors:['Director'],synopsis:'Saved catalog synopsis',...extra});
const filters={and:[{field:'kind',op:'eq',value:'film'},{field:'runtime_minutes',op:'lte',value:100}]};

test('selection preserves typed query counts and exact IDs for compare and collection without writes or scores',()=>{
 const rows=[film('b'),film('a'),film('unknown',{runtime:null}),film('excluded',{runtime:140}),film('../private')],args={filters,limit:2},r=S.prepare(rows,{preferencesConfigured:false,preferences:{weights:{pace:3}}},args),q=Q.query(rows,args);
 assert.equal(r.query.total,q.total);assert.equal(r.query.unknown,1);assert.equal(r.query.excluded,1);assert.equal(r.query.unaddressable,1);
 assert.deepEqual(r.candidates.map(i=>i.item_id),['catalog:a','catalog:b']);assert.equal(r.candidates[0].personal_rating,0);assert.equal(r.candidates[0].reaction,null);assert(r.candidates[0].missingMetadata.includes('reaction'));
 assert.deepEqual(r.continuation.comparison.eligible_item_ids,['catalog:a','catalog:b']);assert.equal(r.continuation.comparison.ready,true);assert.equal(r.continuation.collection.ids,'catalog:a,catalog:b');assert.deepEqual(r.continuation.collection.required,['name']);
 assert.equal(r.profile.preferences,null);assert.match(r.ordering,/not personal fit/);assert(!JSON.stringify(r).includes('recommendationScore'));
});

test('selection is page-bounded with revision-bound continuation, never conflating page IDs with all matches',()=>{
 const rows=Array.from({length:15},(_,i)=>film(String(i).padStart(2,'0'))),first=S.prepare(rows,null,{}),next=S.prepare(rows,null,first.query.next);
 assert.equal(first.candidates.length,6);assert.equal(first.query.total,15);assert.equal(first.continuation.collection.ids.split(',').length,6);assert.equal(next.candidates[0].item_id,'catalog:06');assert.equal(first.profile.available,false);
 assert.throws(()=>S.prepare([...rows,film('new')],null,first.query.next),/snapshot changed/i);assert.throws(()=>S.validate({limit:9}),/limit/);assert.throws(()=>S.validate({filters:{and:[{field:'source',op:'eq',value:'secret'}]}}),/Unsupported/);
});

test('saved evidence remains evidence with explicit scales, unknowns and preferences kept separate',()=>{
 const r=S.prepare([film('a',{kind:null,year:null,runtime:null,genres:[],directors:[],synopsis:null})],{preferencesConfigured:true,preferences:{weights:{pace:5,story:0,constructor:3,sound:'4'},avoid:['sound','invented'],note:'My saved preference'},rated:3,average:4,reviewCount:2,genres:[{name:'Drama',count:3,average:4}]});
 assert.deepEqual(r.profile.preferences,{weights:{story:0,pace:5},avoid:['sound'],note:'My saved preference'});assert.equal(r.profile.average,4);assert.equal(r.profile.units.average,'0–5 saved rating statistics');assert.equal(r.continuation.comparison.ready,false);assert(r.candidates[0].missingMetadata.includes('synopsis'));assert.equal(r.candidates[0].reviewEvidence,'not-read');assert(r.limitations.some(s=>s.includes('not an atomic')));
 const empty=S.prepare([],{});assert.equal(empty.continuation.collection.ready,false);assert.equal(empty.continuation.comparison.ready,false);
});

test('malformed and oversized saved evidence cannot leak private fields or inflate the bounded result',()=>{
 const rows=Array.from({length:8},(_,i)=>film('id'+i,{title:'T'.repeat(5000),synopsis:'s'.repeat(10000),source:{value:'C:/private.mp4'},posterPath:'C:/private.jpg',personalMedia:{note:'private note'},genres:Array(100).fill('g'.repeat(1000)),directors:Array(100).fill('d'.repeat(1000)),collections:Array(100).fill('c'.repeat(1000))}));
 const r=S.prepare(rows,{preferencesConfigured:true,preferences:{weights:{pace:Infinity},note:'n'.repeat(10000)},genres:Array(99).fill({name:'x'.repeat(10000),count:1,average:99}),directors:Array(99).fill({name:'x'.repeat(10000),count:1,average:4}),apiKey:'private secret'},{limit:8}),json=JSON.stringify(r);
 assert(json.length<16000,'output must stay bounded: '+json.length);assert(!json.includes('C:/private'));assert(!json.includes('private note'));assert(!json.includes('private secret'));assert(r.candidates.every(i=>i.metadataShortened));assert.equal(r.profile.genres[0].average,null);assert.deepEqual(r.profile.preferences.weights,{});
});

function renderer(t,{catalog=async()=>({ok:true,items:[film('a'),film('b')]}),shelf=async()=>({ok:true,taste:{preferencesConfigured:false}})}={}){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window,calls=[];t.after(()=>w.close());w.api={mediaCatalog:async args=>{calls.push(['catalog',args]);return catalog(args);},mediaShelf:async args=>{calls.push(['taste',args]);return shelf(args);}};w.eval(fs.readFileSync(require.resolve('../src/assistant-library-query'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/assistant-media-selection'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-selection-actions'),'utf8'));return {w,calls};
}

test('renderer uses only existing catalog/taste read owners and validates before IPC',async t=>{
 const {w,calls}=renderer(t);let checks=0;const run=args=>w.AssistantSelectionActions.execute('prepare_media_selection',args,{guard:()=>checks++});const r=await run({filters});assert.equal(r.candidates.length,2);assert.equal(r.profile.preferences,null);assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['catalog',{action:'list'}],['taste',{action:'list'}]]);assert(checks>=4);
 await assert.rejects(run({limit:20}),/limit/);await assert.rejects(run({invented:'secret'}),/Invalid/);assert.equal(calls.length,2);
});

test('source ownership changes abort before taste reads or returning evidence',async t=>{
 let resolve,current=true;const {w,calls}=renderer(t,{catalog:()=>new Promise(r=>resolve=r)}),guard=()=>{if(!current)throw Error('Source or conversation changed.');};
 const pending=w.AssistantSelectionActions.execute('prepare_media_selection',{}, {guard});current=false;resolve({ok:true,items:[film('a')]});await assert.rejects(pending,/changed/);assert.equal(calls.length,1);
});

test('failed taste read does not fabricate an empty profile or return partial success',async t=>{
 const {w}=renderer(t,{shelf:async()=>({ok:false,error:'Taste read failed'})});await assert.rejects(w.AssistantSelectionActions.execute('prepare_media_selection',{}, {guard(){}}),/Taste read failed/);
});

test('exact search-result subsets keep typed counts and revision-bound pagination within the requested IDs',()=>{
 const rows=[film('a'),film('b'),film('c',{runtime:140}),film('d',{runtime:null}),film('outside')],item_ids=['catalog:d','catalog:c','catalog:b','catalog:a'];
 const first=S.prepare(rows,null,{item_ids,filters,limit:1});
 assert.equal(first.selectionScope.kind,'selected-catalog-subset');assert.equal(first.selectionScope.catalogRowCount,5);assert.equal(first.selectionScope.selectedRowCount,4);assert.equal(first.query.inspected,4);assert.equal(first.query.total,2);assert.equal(first.query.excluded,1);assert.equal(first.query.unknown,1);
 assert.deepEqual(first.candidates.map(i=>i.item_id),['catalog:a']);assert.deepEqual(first.query.next.item_ids,item_ids);
 const next=S.prepare(rows,null,first.query.next);assert.deepEqual(next.candidates.map(i=>i.item_id),['catalog:b']);assert.equal(next.continuation.collection.ids,'catalog:b');assert.equal(next.query.next,null);
 const changed=rows.map(row=>row.id==='b'?{...row,runtime:80}:row);assert.throws(()=>S.prepare(changed,null,first.query.next),/snapshot changed/i);
 assert.throws(()=>S.prepare(rows.filter(r=>r.id!=='b'),null,first.query.next),/no longer exists/);
});

test('foreign, duplicate, malformed and missing selection IDs cannot silently select other library rows',()=>{
 for(const item_ids of [[],Array(9).fill('catalog:a'),['catalog:a','catalog:a'],['a'],['catalog:../private'],['discovery:film:tt1234567'],[7],null])assert.throws(()=>S.validate({item_ids}),/catalog item_ids/);
 assert.throws(()=>S.prepare([film('a')],null,{item_ids:['catalog:missing']}),/no longer exists/);
 assert.throws(()=>S.prepare([film('a'),film('a')],null,{item_ids:['catalog:a']}),/Duplicate/);
 assert.deepEqual(S.validate({item_ids:['catalog:a']}).item_ids,['catalog:a']);
});

test('genre search IDs bridge to current taste and collection candidates through the existing read-only renderer dispatch',async t=>{
 const rows=[film('thriller-a',{genres:['Thriller']}),film('thriller-b',{genres:['Thriller']}),film('thriller-c',{genres:['Thriller']}),film('watched',{genres:['Thriller'],watchStatus:'completed'}),film('drama')];
 const {w,calls}=renderer(t,{catalog:async()=>({ok:true,items:rows}),shelf:async()=>({ok:true,taste:{preferencesConfigured:true,preferences:{weights:{story:5}},rated:2}})});
 w.AssistantAppActions={current:()=>true};w.eval(fs.readFileSync(require.resolve('../src/text-fold'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-library-actions'),'utf8'));
 const search=await w.AssistantLibraryActions.execute('search_library',{genre:'Thriller',status:'planned'},{}),item_ids=search.items.map(i=>i.id);
 assert.equal(item_ids.length,3);
 const selected=await w.AssistantLibraryActions.execute('prepare_media_selection',{item_ids,limit:3},{});
 assert.deepEqual(JSON.parse(JSON.stringify(selected.candidates.map(i=>i.item_id))),['catalog:thriller-a','catalog:thriller-b','catalog:thriller-c']);assert.equal(selected.profile.preferences.weights.story,5);assert.equal(selected.selectionScope.catalogRowCount,5);assert.equal(selected.query.total,3);
 assert.equal(selected.continuation.collection.ids,'catalog:thriller-a,catalog:thriller-b,catalog:thriller-c');assert(calls.every(([owner,args])=>['catalog','taste'].includes(owner)&&args.action==='list'));
 await assert.rejects(w.AssistantLibraryActions.execute('prepare_media_selection',{item_ids:['catalog:deleted']},{}),/no longer exists/);
 const before=calls.length;await assert.rejects(w.AssistantLibraryActions.execute('prepare_media_selection',{item_ids:['discovery:film:tt1234567']},{}),/catalog item_ids/);assert.equal(calls.length,before);
});
