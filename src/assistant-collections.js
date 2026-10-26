'use strict';
const {randomUUID}=require('node:crypto');
function register({ipcMain,authorized,store,now=Date.now}){
 const plans=new Map();const identity=row=>JSON.stringify([row.kind,row.title,row.year,row.imdbId,row.tmdbId,row.collections]);
 ipcMain.handle('assistant:collections',async(event,input={})=>{if(!authorized(event))return {ok:false,error:'Unauthorized request.'};try{
  for(const [id,p] of plans)if(p.expires<now())plans.delete(id);
  if(input.action==='plan'){
   if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||typeof input.ids!=='string')throw Error('Invalid collection plan.');
   const ids=[...new Set(input.ids.split(',').map(v=>v.trim()).filter(Boolean))];if(!ids.length||ids.length>20)throw Error('Choose 1–20 exact library IDs.');const catalog=store(),items=ids.map(id=>{const row=catalog.get(id);if(!row)throw Error('Unknown library title.');return row;});
   if(plans.size>=50)throw Error('Too many collection plans.');const id=randomUUID(),plan={id,sender:event.sender.id,name:input.name.trim(),member:input.member!==false,items:items.map(row=>({id:row.id,title:row.title,identity:identity(row)})),expires:now()+600000};plans.set(id,plan);return {ok:true,plan:{id,name:plan.name,member:plan.member,items:plan.items.map(({id,title})=>({id:'catalog:'+id,title}))}};
  }
  const plan=plans.get(input.id);if(!plan||plan.sender!==event.sender.id)throw Error('Collection plan expired. Plan again.');
  if(input.action==='inspect')return {ok:true,plan:{id:plan.id,name:plan.name,member:plan.member,items:plan.items.map(({id,title})=>({id:'catalog:'+id,title}))}};
  if(input.action!=='apply')throw Error('Unsupported collection action.');const catalog=store(),patches=plan.items.map(item=>{const row=catalog.get(item.id);if(!row||identity(row)!==item.identity)throw Error('A title or membership changed. Plan again.');const collections=plan.member?[...new Set([...(row.collections||[]),plan.name])]:(row.collections||[]).filter(name=>name!==plan.name);if(collections.length>40)throw Error('Collection membership limit reached.');return {id:row.id,collections};});
  catalog.upsertMany(patches);plans.delete(plan.id);return {ok:true,name:plan.name,count:patches.length};
 }catch(error){return {ok:false,error:error.message};}});
 return {plans};
}
module.exports={register};
