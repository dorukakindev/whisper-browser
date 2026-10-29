'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {inventory,summarize}=require('../tools/ui-surface-coverage.cjs');
test('UI coverage includes the assistant document and cannot claim uncaptured roots',()=>{
 const roots=inventory(path.resolve(__dirname,'..'));assert(roots.some(r=>r.id==='assistant-overlay.html:#panel'));assert(roots.some(r=>r.id==='index.html:#dubGeneratorDialog'));
 const summary=summarize(roots,[{visibleSurfaceIds:['index.html:#dubGeneratorDialog'],locale:'en',theme:'dark',width:800,screenshot:'dub.png'},{visibleSurfaceIds:['assistant-overlay.html:#panel']}]);
 assert.equal(summary.visited,1);assert(summary.unvisited.includes('assistant-overlay.html:#panel'));assert.equal(summary.declared,summary.unvisited.length+1);
});
