'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const ROOT=path.resolve(__dirname,'../..'),core=require(path.join(ROOT,'src/workspace-package')),runDir=fs.mkdtempSync(path.join(__dirname,'backup-fixtures-')),profile=path.join(runDir,'profile'),backups=path.join(runDir,'backups');fs.mkdirSync(profile);fs.mkdirSync(backups);
const stamp=Date.UTC(2026,9,1);let now=stamp;
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const schedulePath=path.join(profile,'media-backup-schedule.json'),catalogPath=path.join(profile,'media-catalog.json');
fs.writeFileSync(catalogPath,JSON.stringify({version:1,items:[]}));const goodName='whisper-auto-'+new Date(stamp).toISOString().replace(/[:.]/g,'-')+'.wbp';core.exportPackage(profile,path.join(backups,goodName));core.readPackage(path.join(backups,goodName));
fs.writeFileSync(schedulePath,JSON.stringify({every:'daily',dir:backups,last:stamp}));fs.writeFileSync(catalogPath,'{');
const file=path.join(ROOT,'src/media-tools-service.js'),moduleBox={exports:{}},timeouts=[];
const context={module:moduleBox,exports:moduleBox.exports,require:createRequire(file),__dirname:path.dirname(file),__filename:file,Date:Clock,console,process,Buffer,fetch,AbortController,AbortSignal,TextDecoder,setInterval:()=>({unref(){}}),clearInterval(){},setTimeout:fn=>{timeouts.push(fn);return{unref(){}};},clearTimeout(){}};
vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});moduleBox.exports.registerMediaTools({app:{getPath:()=>profile,on(){}},ipcMain:{handle(){}},authorized:()=>true,dialog:{},owner:()=>null,catalogStore:()=>({})});assert.equal(timeouts.length,1);
async function main(){const runs=[];for(let day=1;day<=7;day++){now=stamp+day*86400000;timeouts[0]();let schedule;for(let i=0;i<1000;i++){await new Promise(r=>setImmediate(r));schedule=JSON.parse(fs.readFileSync(schedulePath,'utf8'));if(schedule.last===now)break;}assert.equal(schedule.last,now);assert.equal(schedule.error,'');runs.push({day,error:schedule.error,reportedSuccess:schedule.last===now});}
 const names=fs.readdirSync(backups).filter(n=>n.endsWith('.wbp'));let readable=0;for(const name of names){try{core.readPackage(path.join(backups,name));readable++;}catch{}}
 assert.equal(names.length,7);assert.equal(readable,0);assert.equal(fs.existsSync(path.join(backups,goodName)),false);
 const result={head:'55bfcca53a995e1217edb547655a50720ff59320',id:'XROOT03',method:'Original registerMediaTools module VM, controlled daily clock/timer, real filesystem and core export/read',initialValidBackup:true,days:runs,retained:names.length,readable,initialGoodRemoved:true,sourceCorruptedSynthetically:true};fs.writeFileSync(path.join(__dirname,'auto-backup-observations.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
