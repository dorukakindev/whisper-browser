'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'../..'),core=require(path.join(ROOT,'src/workspace-package')),dir=fs.mkdtempSync(path.join(__dirname,'load-fixtures-')),profile=path.join(dir,'profile');fs.mkdirSync(profile);const posters=path.join(profile,'catalog-posters');fs.mkdirSync(posters);
const count=12,perFile=8*1024**2;
for(let i=0;i<count;i++)fs.writeFileSync(path.join(posters,'synthetic-noise-'+i+'.png'),crypto.randomBytes(perFile));
const output=path.join(dir,'large.wbp'),before=process.memoryUsage(),start=performance.now();let timerAt;
setTimeout(()=>{timerAt=performance.now();const data={head:'55bfcca53a995e1217edb547655a50720ff59320',kind:'improvement-evidence-not-bug',fixture:'12 synthetic binary blobs with .png names, not real user posters',inputBytes:count*perFile,report:report,exportMs:elapsed,timerDelayMs:timerAt-start,rssBefore:before.rss,rssAfter:after.rss,rssDelta:after.rss-before.rss,archiveReadable:readable,method:'Original synchronous exportPackage on installed Node; zero-delay timer queued before export; whole process RSS, not Electron memory claim'};fs.writeFileSync(path.join(__dirname,'backup-load-observations.json'),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data,null,2));},0);
const report=core.exportPackage(profile,output),elapsed=performance.now()-start,after=process.memoryUsage();const readable=core.readPackage(output).files.length===count;
