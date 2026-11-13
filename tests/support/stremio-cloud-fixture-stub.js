// Synthetic catalog data for the existing renderer fixture, never personal account content.
(() => {
 const prior=window.api;
 const items=Array.from({length:12},(_,i)=>({id:'cloud-parent-'+i,type:'other',addonKey:'cloud',name:['Night Train · 1080p','Coastal Stories · S02E03','The Mountain · 2160p'][i%3]+' · '+(i+1),poster:'',genres:[],year:2024}));
 const fx=window.__cloud={calls:[]};
 const request=async input=>{
  fx.calls.push({action:input.action,type:input.type,id:input.id,refresh:input.refresh});
  if(input.action==='catalogs')return {ok:true,catalogs:['Torrents','Usenet','WebDL'].map((name,i)=>({addonKey:'cloud',addonName:'Torrentio TB',type:'other',id:'library-'+i,name:'TorBox '+name,searchOnly:false,genres:[],paged:true}))};
  if(input.action==='catalog')return {ok:true,items:input.catalogId==='library-0'?items:[],hasMore:false};
  if(input.action==='meta'&&input.type==='other')return {ok:true,meta:{...items.find(x=>x.id===input.id),description:'Synthetic cloud library fixture. Files keep separate source identities.',videos:[{id:'cloud-file-1',title:'Night.Train.1080p.mkv',available:true,hasInlineStreams:true},{id:'cloud-file-2',title:'Bonus.Feature.mkv',available:false}]}};
  if(['library-list','history-list','continue-list'].includes(input.action))return {ok:true,items:[]};
  if(input.action==='library-has')return {ok:true,saved:false};
  if(input.action==='rating-get')return {ok:true,rating:null};
  return prior.stremio(input);
 };
 window.api=new Proxy({}, {get(_t,key){return key==='stremio'?request:prior[key];}});
})();
