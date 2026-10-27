'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./fsync-utils');
function store(userData){
 const file=()=>path.join(userData(),'music-preferences.json');
 function read(){
  if(!fs.existsSync(file()))return [];
  if(fs.statSync(file()).size>300000)throw Error('Music preferences are too large / Müzik tercihleri çok büyük.');
  const data=JSON.parse(fs.readFileSync(file(),'utf8'));
  if(data.version!==1||!Array.isArray(data.hidden)||data.hidden.length>500)throw Error('Invalid music preferences / Müzik tercihleri geçersiz.');
  return data.hidden.filter(r=>['local','deezer'].includes(r?.provider)&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=128).map(r=>({provider:r.provider,id:r.id,title:String(r.title||'').slice(0,300)}));
 }
 function set(provider,id,title,hidden){
  if(!['local','deezer'].includes(provider)||typeof id!=='string'||!id||id.length>128||typeof hidden!=='boolean')throw Error('Invalid music preference');
  const rows=read().filter(r=>r.provider!==provider||r.id!==id);
  if(hidden)rows.push({provider,id,title:String(title||'').slice(0,300)});
  if(rows.length>500)throw Error('Hidden track limit: 500 / Gizlenen parça sınırı: 500');
  atomicWriteFileSync(file(),JSON.stringify({version:1,hidden:rows}));return rows;
 }
 return {read,set};
}
module.exports={store};
