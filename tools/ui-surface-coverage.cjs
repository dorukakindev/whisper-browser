'use strict';
// Inventory is evidence of declared surfaces, never evidence of rendered visits.
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
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
function summarize(declared,runs){
 const visited=new Map();
 for(const run of runs)for(const id of run.visibleSurfaceIds||[]){if(!run.screenshot||run.blocked)continue;const states=visited.get(id)||[];states.push({locale:run.locale,theme:run.theme,width:run.width,screenshot:run.screenshot});visited.set(id,states);}
 const rows=declared.map(row=>({...row,status:visited.has(row.id)?'VISITED':'UNVISITED',evidence:visited.get(row.id)||[],reason:visited.has(row.id)?null:row.document==='index.html'?'No visible capture recorded by a surface preparer.':'Separate window is outside this runner; use its native Electron test.'}));
 return {declared:rows.length,visited:rows.filter(r=>r.status==='VISITED').length,unvisited:rows.filter(r=>r.status==='UNVISITED').map(r=>r.id),rows,dynamicScope:'Only declared data-ui-surface roots are inventoried; unmarked runtime dialogs are not claimed as covered.'};
}
module.exports={inventory,summarize};
