(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MediaSearchModel=api;})(globalThis,()=>{
  'use strict';
  const fold=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i');
  function groups(query,catalog,shelf,history){
    const q=fold(query).trim().slice(0,200);if(!q)return [];
    const categories=[['titles',catalog,row=>[row.title,row.originalTitle,row.year,row.synopsis]],['books',shelf?.books,row=>[row.title,row.author]],['music',shelf?.music,row=>[row.title,row.artist,row.album]],['history',history,row=>[row.title,row.sourceRef]]];
    return categories.map(([kind,source,fields])=>{let total=0;const rows=[];for(const row of Array.isArray(source)?source:[]){if(!row||!fields(row).some(v=>fold(v).includes(q)))continue;total++;if(rows.length<40)rows.push(row);}return {kind,rows,total};});
  }
  return Object.freeze({groups});
});
