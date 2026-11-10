'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{safeTarget}=require('./workspace-safe-path'),{atomicWriteFileSync,fsyncDirectory}=require('./fsync-utils');
const hash=b=>createHash('sha256').update(b).digest('hex');
function create({root,modelRoots=[path.join(__dirname,'../models'),path.join(__dirname,'../backend/models')]}={}){
 const directory=()=>typeof root==='function'?root():root;
 function inspect(){
  const groups=new Map(['personal','history','cache','models','recovery','other'].map(id=>[id,{id,bytes:0,files:0,partial:false}]));let visited=0;
  function walk(file,category,depth=0){const group=groups.get(category);if(++visited>20000||depth>8){group.partial=true;return;}try{file=safeTarget(path.dirname(file),path.basename(file));const stat=fs.lstatSync(file);if(stat.isSymbolicLink())return;if(stat.isFile()){group.bytes+=stat.size;group.files++;}else if(stat.isDirectory())for(const name of fs.readdirSync(file))walk(path.join(file,name),category,depth+1);}catch(e){if(e.code!=='ENOENT')group.partial=true;}}
  const base=safeTarget(directory()),modelPaths=new Set(modelRoots.map(p=>path.resolve(p)));if(fs.existsSync(base))for(const name of fs.readdirSync(base)){const category=modelPaths.has(path.join(base,name))?'models':/^personal-candidates\.json$|cache/i.test(name)?'cache':/^history\.json$|^watch-library/.test(name)?'history':/^before-restore|^\.workspace-restore$|^maintenance-backups$/.test(name)?'recovery':require('./workspace-package').allowed(name)?'personal':'other';walk(path.join(base,name),category);}
  // Count only explicit, application-managed model roots; never scan the whole disk.
  for(const file of modelPaths)if(!file.startsWith(base+path.sep))walk(file,'models');
  return {categories:[...groups.values()],modelScope:'managed-roots-only',cleanup:[{id:'recommendation-cache',available:fs.existsSync(safeTarget(base,'personal-candidates.json'))}]};
 }
 function preview(scopes){
  if(!Array.isArray(scopes)||scopes.length!==1||scopes[0]!=='recommendation-cache')throw Error('Choose an available cleanup scope. / Kullanılabilir temizlik kapsamı seç.');
  const file=safeTarget(directory(),'personal-candidates.json');if(!fs.existsSync(file))return {scope:'recommendation-cache',files:[],bytes:0};if(fs.statSync(file).size>8000000)throw Error('Cache exceeds cleanup limit. / Önbellek temizlik sınırını aşıyor.');const bytes=fs.readFileSync(file);return {scope:'recommendation-cache',files:[{name:'personal-candidates.json',revision:hash(bytes)}],bytes:bytes.length};
 }
 function clean(plan){
  const fresh=preview([plan.scope]);if(JSON.stringify(fresh)!==JSON.stringify(plan))throw Error('Cleanup target changed; preview again. / Temizlik hedefi değişti; yeniden önizle.');
  if(!fresh.files.length)return {removed:0,bytes:0};const base=directory(),source=safeTarget(base,'personal-candidates.json'),backup=safeTarget(base,'maintenance-backups/'+randomUUID()+'/personal-candidates.json');atomicWriteFileSync(backup,fs.readFileSync(source));fs.unlinkSync(source);fsyncDirectory(base);return {removed:1,bytes:fresh.bytes,backupCreated:true};
 }
 return {inspect,preview,clean};
}
module.exports={create};
