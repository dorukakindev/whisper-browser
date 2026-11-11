'use strict';
const {randomUUID,createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function create({resolve,notes,manifest,validateOwner,now=Date.now}){
 const previews=new Map();
 const check=owner=>{if(!validateOwner(owner))throw Error('Source or conversation changed. / Kaynak veya sohbet değişti.');};
 async function sources(sender,owner,cards){
  if(!Array.isArray(cards)||!cards.length||cards.length>8||new Set(cards.map(c=>c.id)).size!==cards.length||cards.filter(c=>c.nodeId).length>3)throw Error('Select 1–8 distinct evidence references.');
  const rows=[];for(const card of cards){check(owner);rows.push(await resolve(sender,owner,card));check(owner);}return rows;
 }
 async function handle(sender,input){const owner=manifest.clean(input.owner);check(owner);
  for(const [id,p]of previews)if(p.expires<=now())previews.delete(id);
  if(input.action==='mixed-inspect')return {ok:true,sources:await sources(sender,owner,input.cards),scope:'Only selected owner-verified passages. Quotations, translation, personal notes and draft interpretation remain separate.'};
  if(input.action==='mixed-preview'){
   const text=String(input.text||'').trim();if(!text||text.length>8000)throw Error('Review a draft of 1–8000 characters.');
   const rows=await sources(sender,owner,input.cards),token=randomUUID();previews.set(token,{sender,owner,cards:structuredClone(input.cards),rows,revision:digest(rows),text,expires:now()+600000,result:null,saving:false});while(previews.size>40)previews.delete(previews.keys().next().value);
   return {ok:true,token,text,sources:rows};
  }
  if(input.action==='mixed-save'){
   const p=previews.get(input.token);if(!p||p.sender!==sender||!manifest.same(p.owner,owner)||p.text!==input.text)throw Error('Preview changed or expired; review again.');
   if(p.result)return {...p.result,replayed:true};if(p.saving)throw Error('This confirmation is being saved.');p.saving=true;
   try{const rows=await sources(sender,owner,p.cards);if(digest(rows)!==p.revision)throw Error('Selected evidence changed; inspect and preview again.');check(owner);
    const source=rows.map(r=>'['+r.id+'] '+r.title+' · '+r.revision+'\n'+r.text).join('\n\n');
    p.result=notes.save({id:'research-comparison:'+input.token,mediaId:'research-comparison:'+input.token,mediaType:'research',mediaTitle:'Source comparison / Kaynak karşılaştırması',type:'note',timed:false,source:source.slice(0,4000),note:p.text,tags:['AI draft','Source comparison'],comparisonSources:rows.map(({id,kind,revision,title,text,translation,personalNote,locator,role,origin})=>({id,kind,revision,title,text,translation,personalNote,locator,role,origin})),links:[]},{expectRevision:'new'});const result=p.result;if(!result?.ok&&!result?.committed)p.result=null;return result;
   }finally{p.saving=false;}
  }
  throw Error('Unsupported evidence workbench action.');
 }
 return {handle};
}
module.exports={create};
