'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{search}=require('../src/pdf-text-search');
test('PDF hits keep original 1-based page identity, Turkish offsets and a bounded excerpt',async()=>{
 const pages=['No matching text','Giriş: İSTANBUL örneği.','An İstanbul passage.'];
 const r=await search({numPages:3,getText:async n=>pages[n-1]},'istanbul');
 assert.deepEqual(r.matches.map(h=>h.page),[2,3]);assert.equal(pages[1].slice(r.matches[0].start,r.matches[0].end),'İSTANBUL');assert.equal(r.scanned,3);assert(!r.truncated);
});
test('PDF replacement cancels all old search results even when old extraction resolves late',async()=>{
 let valid=true,resolve;const pending=search({numPages:2,getText:()=>new Promise(done=>resolve=done)},'query',{isCurrent:()=>valid});valid=false;resolve('query');const r=await pending;assert(r.cancelled);assert.deepEqual(r.matches,[]);
});
test('Failed pages and search budgets are explicit, including a failure at the last scanned page',async()=>{
 const source={numPages:3,getText:async page=>{if(page===2)throw Error('page unavailable');return 'term term';}};
 const r=await search(source,'term');assert.deepEqual(r.failedPages,[2]);assert.deepEqual(r.matches.map(h=>h.page),[1,1,3,3]);
 const bounded=await search(source,'term',{maxPages:2});assert(bounded.truncated);assert.equal(bounded.scanned,2);
 const limited=await search(source,'term',{limit:1});assert.equal(limited.matches.length,1);assert(limited.truncated);
 const chars=await search(source,'term',{maxChars:5});assert(chars.truncated);assert.equal(chars.scanned,1);
 await assert.rejects(search({numPages:Infinity,getText:async()=>''},'term'),/source/);
});
