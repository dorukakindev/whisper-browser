(function(root,factory){if(typeof module==='object')module.exports=factory();else root.AssistantRunSteps=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 function clean(value){return (Array.isArray(value)?value:[]).slice(-40).filter(row=>row&&typeof row.id==='string'&&/^[\w-]{1,100}$/.test(row.id)&&typeof row.name==='string'&&/^[a-z_]{1,100}$/.test(row.name)&&['running','completed','failed','blocked','proposed','accepted','stopped'].includes(row.state)).map(row=>({id:row.id,name:row.name,state:row.state,...(Number.isFinite(row.elapsedMs)&&row.elapsedMs>=0?{elapsedMs:Math.min(row.elapsedMs,3600000)}:{})}));}
 return Object.freeze({clean});
});
