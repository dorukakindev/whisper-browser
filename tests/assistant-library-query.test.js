'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('../src/assistant-library-query');
const entry=(id,values={})=>({id,title:'Title '+id,kind:'film',year:2020,runtime:90,watchStatus:'planned',personalMedia:{reaction:'like'},ratings:{personal:'9',imdb:'8.1'},...values});
const rows=()=>[entry('a'),entry('b',{runtime:null,personalMedia:{reaction:'neutral'},ratings:{personal:null,imdb:'n/a'}}),entry('c',{kind:'series',runtime:45,watchStatus:'completed',personalMedia:{reaction:'dislike'},ratings:{personal:'3',imdb:'8/10'}}),entry('d',{year:null,runtime:110,watchStatus:'completed',personalMedia:{reaction:null},ratings:{personal:'ham:91',imdb:null}}),entry('e',{year:2019,runtime:120,personalMedia:{reaction:null},ratings:{personal:'7',imdb:'7'}}),entry('f',{runtime:80,watchStatus:'completed',ratings:{personal:'8',imdb:'8'}}),entry('../private',{source:{value:'C:/private/movie.mp4'}})];
const and=(...terms)=>({filters:{and:terms}}),term=(field,op,value)=>({field,op,value});

test('typed AND uses the same predicate for list, total and unknown metadata without treating unknown as unwatched',()=>{
 const result=Q.query(rows(),and(term('kind','eq','film'),term('watch_status','eq','planned'),term('runtime_minutes','lte',100)));
 assert.deepEqual(result.items.map(i=>i.item_id),['catalog:a']);assert.equal(result.total,1);assert.equal(result.unknown,1);assert.equal(result.excluded,4);assert.equal(result.unaddressable,1);assert.equal(result.inspected,7);assert.equal(result.unknownByField.runtime_minutes,1);assert.equal(result.missingByField.runtime_minutes,1);
 const rating=Q.query(rows(),and(term('personal_rating','gte',7)));assert.equal(rating.total,3);assert.equal(rating.unknown,2);assert.equal(rating.items[0].personal_rating,9);
 const neutral=Q.query(rows(),and(term('reaction','eq','neutral')));assert.deepEqual(neutral.items.map(i=>i.item_id),['catalog:b']);assert.equal(neutral.unknown,2,'null is not neutral');
});

test('numeric units and explicit known scales are preserved; malformed raw metadata remains unknown',()=>{
 const result=Q.query([entry('zero',{ratings:{personal:'0',imdb:'8/10'},runtime:90}),entry('opaque',{ratings:{personal:'4/5',imdb:'8.2 stars'},runtime:'1h 30m'}),entry('blank',{year:'',runtime:0,ratings:{personal:'',imdb:null}})],and(term('imdb_rating','gte',8),term('runtime_minutes','lte',100)));
 assert.deepEqual(result.items.map(i=>i.item_id),['catalog:zero']);assert.equal(result.items[0].runtime_minutes,90);assert.equal(result.items[0].personal_rating,0);assert.equal(result.items[0].imdb_rating,8);assert.equal(result.unknown,2);assert.equal(result.units.runtime_minutes,'minutes');assert.equal(result.units.personal_rating,'0–10');
});

test('query pagination has stable real IDs, bounded projections and a reusable metadata revision',()=>{
 const library=Array.from({length:45},(_,i)=>entry('real-'+String(i).padStart(2,'0'),{source:{type:'local',value:'C:/private/movie.mp4'},posterPath:'C:/private/poster.png',personalMedia:{reaction:'like',note:'private note'}})).reverse(),first=Q.query(library,{limit:20}),second=Q.query(library,{offset:first.nextOffset,limit:20,snapshot_revision:first.snapshotRevision}),last=Q.query(library,{offset:second.nextOffset,limit:20,snapshot_revision:first.snapshotRevision});
 assert.equal(first.total,45);assert.equal(second.total,45);assert.equal(last.items.length,5);assert.equal(last.nextOffset,null);assert.equal(new Set([...first.items,...second.items,...last.items].map(i=>i.item_id)).size,45);assert.equal(JSON.stringify(first).includes('C:/private'),false);assert.equal(JSON.stringify(first).includes('private note'),false);assert.deepEqual(Q.query(library.slice().reverse(),{limit:20}).items,first.items);
 const changed=library.map(row=>row.id==='real-01'?{...row,runtime:88}:row);assert.throws(()=>Q.query(changed,{offset:20,snapshot_revision:first.snapshotRevision}),/changed|snapshot/i);
});

test('typed query rejects unsupported nesting, operators, unsafe values and oversized requests',()=>{
 for(const args of [{filters:{or:[]}},and({field:'source',op:'eq',value:'C:/secret'}),and(term('kind','gte','film')),and(term('runtime_minutes','gte','90')),and(term('kind','in',['film',2])),and(term('reaction','eq',null)),and(term('year','eq',2020.5)),{filters:{and:Array(21).fill(term('kind','eq','film'))}},{limit:21},{offset:-1},{offset:10001},{filters:{and:[],unknown:true}},{filters:{and:[{...term('kind','eq','film'),extra:true}]}},{filters:{and:[term('kind','in',[])]}},{filters:{and:[term('runtime_minutes','eq',Infinity)]}}, {unknown:'field'}])assert.throws(()=>Q.validate(args),/Invalid|Unsupported|Unknown|limit|filter|argument|query/i,JSON.stringify(args));
 assert.throws(()=>Q.query([entry('same'),entry('same')],{}),/duplicate|identity/i);
});

test('renderer query uses one existing catalog API snapshot, returns typed safe IDs and rejects invalid filters before IPC',async t=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());const calls=[];w.UiLocale={get:()=> 'en'};w.AssistantAppActions={current:()=>true};w.api={mediaCatalog:async input=>{calls.push(input);return {ok:true,items:rows()};}};w.eval(fs.readFileSync(require.resolve('../src/assistant-library-query'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-library-actions'),'utf8'));
 const args=and(term('kind','eq','film'),term('runtime_minutes','lte',100)),result=await w.AssistantLibraryActions.execute('query_media_library',args,{});assert.equal(result.status,'completed');assert.equal(result.total,2);assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{action:'list'}]);assert.deepEqual(JSON.parse(JSON.stringify(w.AssistantLibraryQuery.query(rows(),args))),Q.query(rows(),args));
 await assert.rejects(w.AssistantLibraryActions.execute('query_media_library',and(term('source','eq','secret')),{}),/Unsupported|Invalid/);assert.equal(calls.length,1);
});

test('renderer refuses a query result when source ownership changes while catalog read is pending',async t=>{
 const fs=require('node:fs'),{JSDOM}=require('jsdom'),dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());let current=true,resolve;w.AssistantAppActions={current:()=>current};w.api={mediaCatalog:()=>new Promise(r=>resolve=r)};w.eval(fs.readFileSync(require.resolve('../src/assistant-library-query'),'utf8'));w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-library-actions'),'utf8'));
 const pending=w.AssistantLibraryActions.execute('query_media_library',{},{});await new Promise(setImmediate);assert(resolve);current=false;resolve({ok:true,items:rows()});await assert.rejects(pending,/source or conversation changed/);
});

test('prototype property names cannot become query fields',()=>{
 for(const field of ['constructor','__proto__','toString',['year'],{field:'year'}])assert.throws(()=>Q.validate(and(term(field,'eq',2020))),/Unsupported|Invalid/);
});
