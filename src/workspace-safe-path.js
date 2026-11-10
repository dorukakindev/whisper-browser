'use strict';
const fs=require('node:fs'),path=require('node:path');
function safeTarget(root,name=''){
 const base=path.resolve(root),target=path.resolve(base,name);
 if(target!==base&&!target.startsWith(base+path.sep))throw Error('Invalid package target. / Geçersiz paket hedefi.');
 let node=path.parse(target).root;
 for(const segment of target.slice(node.length).split(path.sep).filter(Boolean)){
  node=path.join(node,segment);
  try{if(fs.lstatSync(node).isSymbolicLink())throw Error('Package target contains a link. / Paket hedefi bağlantı içeriyor.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return target;
}
module.exports={safeTarget};
