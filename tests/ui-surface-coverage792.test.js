'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fs=require('node:fs'),os=require('node:os'),{createHash}=require('node:crypto'),{PNG}=require('pngjs');
const {inventory,summarize}=require('../tools/ui-surface-coverage.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'coverage794-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const png=PNG.sync.write({width:2,height:2,data:Buffer.alloc(16,255)});
 fs.writeFileSync(path.join(root,'dub.png'),png);return {root,png};
}
test('UI coverage includes the assistant document and cannot claim uncaptured roots',t=>{
 const {root,png}=fixture(t);
 const roots=inventory(path.resolve(__dirname,'..'));assert(roots.some(r=>r.id==='assistant-overlay.html:#panel'));assert(roots.some(r=>r.id==='index.html:#dubGeneratorDialog'));
 const summary=summarize(roots,[{visibleSurfaceIds:['index.html:#dubGeneratorDialog'],locale:'en',theme:'dark',width:800,screenshot:'dub.png'},{visibleSurfaceIds:['assistant-overlay.html:#panel']}],{evidenceRoot:root});
 assert.equal(summary.visited,1);assert(summary.unvisited.includes('assistant-overlay.html:#panel'));assert.equal(summary.declared,summary.unvisited.length+1);
 const proof=summary.rows.find(r=>r.id==='index.html:#dubGeneratorDialog').evidence[0];
 assert.equal(proof.bytes,png.length);assert.equal(proof.sha256,createHash('sha256').update(png).digest('hex'));assert.equal(proof.pixelWidth,2);
});
test('missing, empty, corrupt and truncated screenshot artifacts cannot count as visits',t=>{
 const {root,png}=fixture(t),declared=[{id:'x',document:'index.html'}];
 fs.writeFileSync(path.join(root,'empty.png'),'');fs.writeFileSync(path.join(root,'not-png.png'),'x'.repeat(80));
 fs.writeFileSync(path.join(root,'truncated.png'),png.subarray(0,33));
 const corrupt=Buffer.from(png);corrupt[corrupt.length-1]^=1;fs.writeFileSync(path.join(root,'corrupt.png'),corrupt);
 for(const screenshot of ['missing.png','empty.png','not-png.png','truncated.png','corrupt.png']){
  const result=summarize(declared,[{screenshot,visibleSurfaceIds:['x']}],{evidenceRoot:root});
  assert.equal(result.visited,0,screenshot);assert.deepEqual(result.unvisited,['x']);assert.equal(result.blockedArtifacts.length,1);
 }
});
test('shared captures cover nested roots once and repeated capture hashes remain explicit',t=>{
 const {root}=fixture(t),declared=[{id:'x',document:'index.html'},{id:'nested',document:'index.html'}];
 const run={screenshot:'dub.png',locale:'en',theme:'dark',width:800,visibleSurfaceIds:['x','nested']};
 const result=summarize(declared,[run,{...run,locale:'tr'}],{evidenceRoot:root});
 assert.equal(result.visited,2);assert.equal(result.blockedArtifacts.length,0);assert.equal(result.duplicateCaptures.length,1);
 assert.equal(result.rows[0].evidence.length,2);
});
