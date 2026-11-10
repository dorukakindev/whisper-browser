'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {atomicWriteFileSync,fsyncDirectory}=require('./fsync-utils'),{safeTarget}=require('./workspace-safe-path');
const digest=b=>createHash('sha256').update(b).digest('hex'),done=s=>['committed','rolled-back'].includes(s);
const base=root=>safeTarget(root,'.workspace-restore');
function directory(root,id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid recovery identity. / Geçersiz kurtarma kimliği.');return safeTarget(base(root),id);}
function current(root,name){const file=safeTarget(root,name);try{if(fs.statSync(file).size>256*1024*1024)throw Error('Recovery target too large. / Kurtarma hedefi çok büyük.');return digest(fs.readFileSync(file));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function write(root,tx){atomicWriteFileSync(safeTarget(directory(root,tx.id),'journal.json'),JSON.stringify(tx));}
function read(root,id){
 const file=safeTarget(directory(root,id),'journal.json');if(fs.statSync(file).size>8000000)throw Error('Recovery journal too large. / Kurtarma günlüğü çok büyük.');
 const tx=JSON.parse(fs.readFileSync(file,'utf8'));
 if(tx.version!==1||tx.id!==id||!['preparing','prepared','applying','committed','rolled-back','rollback-failed'].includes(tx.state)||!Array.isArray(tx.files)||tx.files.length>20000)throw Error('Invalid recovery journal. / Geçersiz kurtarma günlüğü.');
 const names=new Set();for(const r of tx.files){if(!require('./workspace-package').allowed(r.name)||names.has(r.name.toLowerCase())||!(/^[a-f0-9]{64}$/).test(r.after)||r.before!==null&&!(/^[a-f0-9]{64}$/).test(r.before))throw Error('Invalid recovery entry. / Geçersiz kurtarma kaydı.');names.add(r.name.toLowerCase());}
 return tx;
}
function list(root){
 if(!fs.existsSync(base(root)))return [];const result=[];
 for(const ent of fs.readdirSync(base(root),{withFileTypes:true})){if(!/^[a-f0-9-]{36}$/.test(ent.name))continue;try{const tx=read(root,ent.name);result.push({id:tx.id,state:tx.state,created:tx.created,count:tx.files.length});}catch{result.push({id:ent.name,state:'unreadable',count:0});}}
 return result.sort((a,b)=>(b.created||0)-(a.created||0));
}
function prepare(root,changes){
 if(list(root).some(r=>!done(r.state)))throw Error('An unfinished restore needs review first. / Önce yarım kalan geri yüklemeyi incele.');
 if(changes.reduce((n,c)=>n+(c.previous?.length||0),0)>180000000)throw Error('Recovery copy limit. / Kurtarma kopyası sınırı.');
 const tx={version:1,id:randomUUID(),state:'preparing',created:Date.now(),files:changes.map(c=>({name:c.name,before:c.previous===null?null:digest(c.previous),after:digest(c.bytes)}))};
 // Validate names before making a recovery directory or touching destinations.
 for(const r of tx.files){if(!require('./workspace-package').allowed(r.name))throw Error('Invalid recovery target. / Geçersiz kurtarma hedefi.');safeTarget(root,r.name);if(current(root,r.name)!==r.before)throw Error('Restore destination changed. / Geri yükleme hedefi değişti.');}
 const dir=directory(root,tx.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 try{write(root,tx);for(let i=0;i<changes.length;i++)if(changes[i].previous!==null)atomicWriteFileSync(safeTarget(dir,i+'.before'),changes[i].previous);tx.state='prepared';write(root,tx);}
 catch(error){throw Object.assign(Error('Recovery copy failed; destination unchanged. / Kurtarma kopyası başarısız; hedef değişmedi.'),{cause:error});}
 return tx;
}
function preview(root,id){
 const tx=read(root,id),files=tx.files.map(r=>{const hash=current(root,r.name);return {name:r.name,revision:hash,state:hash===r.before?'original':hash===r.after?'applied':'conflict'};});
 return {id,state:tx.state,files,revision:digest(JSON.stringify([tx,files]))};
}
function recover(root,id,revision,{commitWriteFailed=false}={}){
 const tx=read(root,id),review=preview(root,id);if(done(tx.state)&&!(commitWriteFailed&&tx.state==='committed'))throw Error('Recovery already resolved. / Kurtarma zaten sonuçlandı.');
 if(review.revision!==revision||review.files.some(r=>r.state==='conflict'))throw Error('Recovery target changed; review again. / Kurtarma hedefi değişti; yeniden incele.');
 // Verify every recovery copy before changing even the first destination.
 let bytesTotal=0;const copies=tx.files.map((r,i)=>{if(r.before===null||review.files[i].state==='original')return null;const file=safeTarget(directory(root,id),i+'.before');bytesTotal+=fs.statSync(file).size;if(bytesTotal>180000000)throw Error('Recovery copy limit. / Kurtarma kopyası sınırı.');const bytes=fs.readFileSync(file);if(digest(bytes)!==r.before)throw Error('Recovery copy integrity failed. / Kurtarma kopyasının bütünlüğü bozuk.');return bytes;});
 try{for(let i=tx.files.length-1;i>=0;i--){const r=tx.files[i],revision=current(root,r.name);if(revision===r.before)continue;if(revision!==r.after)throw Error('Recovery destination changed. / Kurtarma hedefi değişti.');const file=safeTarget(root,r.name);if(copies[i]===null){fs.unlinkSync(file);fsyncDirectory(path.dirname(file));}else atomicWriteFileSync(file,copies[i]);}tx.state='rolled-back';write(root,tx);}
 catch(error){tx.state='rollback-failed';try{write(root,tx);}catch{}throw Object.assign(Error('Rollback incomplete; recovery copies kept. / Geri dönüş eksik; kurtarma kopyaları korundu.'),{cause:error});}
 return {restored:tx.files.length};
}
function apply(root,tx,buffers){
 try{
  if(buffers.length!==tx.files.length||tx.files.some((r,i)=>digest(buffers[i])!==r.after||current(root,r.name)!==r.before))throw Error('Restore plan changed. / Geri yükleme planı değişti.');
  tx.state='applying';write(root,tx);
  for(let i=0;i<tx.files.length;i++){if(current(root,tx.files[i].name)!==tx.files[i].before)throw Error('Restore destination changed. / Geri yükleme hedefi değişti.');atomicWriteFileSync(safeTarget(root,tx.files[i].name),buffers[i]);}
  tx.state='committed';write(root,tx);
 }catch(error){try{recover(root,tx.id,preview(root,tx.id).revision,{commitWriteFailed:tx.state==='committed'});}catch(rollback){throw Object.assign(Error('Restore failed and needs recovery review. / Geri yükleme başarısız; kurtarma incelemesi gerekiyor.'),{cause:error,recoveryId:tx.id,rollback});}throw error;}
 return tx.files.length;
}
module.exports={prepare,apply,list,preview,recover};
