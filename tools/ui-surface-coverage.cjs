'use strict';
// Inventory is evidence of declared surfaces, never evidence of rendered visits.
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const {createHash}=require('node:crypto'),{PNG}=require('pngjs');
function inventory(root){
 const rows=[];
 for(const file of ['index.html','assistant-overlay.html','browser-mini.html']){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'src/renderer',file),'utf8'));
  const counts=new Map();
  for(const node of dom.window.document.querySelectorAll('details,section,dialog,aside,[role="dialog"],[data-ui-surface]')){
   const selector=node.id?'#'+node.id:node.getAttribute('data-ui-surface')?'[data-ui-surface="'+node.getAttribute('data-ui-surface')+'"]':null;
   if(!selector)continue;
   const key=file+':'+selector;if(counts.has(key))continue;counts.set(key,true);
   rows.push({id:key,document:file,selector,tag:node.tagName.toLowerCase()});
  }
  if(file!=='index.html')rows.push({id:file+':body',document:file,selector:'body',tag:'body'});
  dom.window.close();
 }
 return rows;
}
function screenshotEvidence(file,root){
 try{
  const full=path.resolve(root,file),stat=fs.statSync(full);
  if(!stat.isFile()||stat.size<33||stat.size>32*1024*1024)return {error:'Screenshot size is invalid.'};
  const bytes=fs.readFileSync(full);
  if(bytes.length!==stat.size||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR')return {error:'Screenshot is not a PNG.'};
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(!width||!height||width*height>16*1024*1024)return {error:'Screenshot dimensions are invalid.'};
  // Decode and check chunk CRCs: a valid signature alone is not visual evidence.
  PNG.sync.read(bytes,{checkCRC:true});
  return {bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),pixelWidth:width,pixelHeight:height};
 }catch{return {error:'Screenshot is missing, unreadable or corrupt.'};}
}
function summarize(declared,runs,{evidenceRoot=process.cwd()}={}){
 const visited=new Map(),blockedArtifacts=[],captures=new Map();
 for(const run of runs){
  if(!run.screenshot||run.blocked)continue;
  const proof=screenshotEvidence(run.screenshot,evidenceRoot);
  if(proof.error){blockedArtifacts.push({screenshot:run.screenshot,reason:proof.error});continue;}
  const state={locale:run.locale,theme:run.theme,width:run.width,screenshot:run.screenshot,...proof};
  const same=captures.get(proof.sha256)||[];same.push(state);captures.set(proof.sha256,same);
  for(const id of run.visibleSurfaceIds||[]){const states=visited.get(id)||[];states.push(state);visited.set(id,states);}
 }
 const rows=declared.map(row=>({...row,status:visited.has(row.id)?'VISITED':'UNVISITED',evidence:visited.get(row.id)||[],reason:visited.has(row.id)?null:row.document==='index.html'?'No visible capture recorded by a surface preparer.':'Separate window is outside this runner; use its native Electron test.'}));
 return {declared:rows.length,visited:rows.filter(r=>r.status==='VISITED').length,unvisited:rows.filter(r=>r.status==='UNVISITED').map(r=>r.id),rows,blockedArtifacts,duplicateCaptures:[...captures].filter(([,states])=>states.length>1).map(([sha256,states])=>({sha256,states})),dynamicScope:'Only declared data-ui-surface roots are inventoried; unmarked runtime dialogs are not claimed as covered.'};
}
module.exports={inventory,summarize};
