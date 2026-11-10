'use strict';
// Explicit local import: first file/current user values win, all source variants survive.
const fs=require('node:fs'),path=require('node:path'),C=require('../src/personal-collection');
const [root,...files]=process.argv.slice(2);
if(!root||!path.isAbsolute(root)||!files.length)throw Error('Usage: node tools/import-mal-library.js ABSOLUTE_PROFILE XML_OR_GZIP_FILES...');
const incoming=files.flatMap(file=>C.parseMal(fs.readFileSync(file),path.basename(file)));
const target=path.join(root,'personal-collection.json');
if(fs.existsSync(target))fs.copyFileSync(target,target+'.before-import-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);
const result=C.merge(root,incoming),rows=C.read(root).rows;
if(rows.length!==result.total||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Import verification failed.');
console.log(JSON.stringify({...result,anime:rows.filter(r=>r.domain==='anime').length,manga:rows.filter(r=>r.domain==='manga').length,rated:rows.filter(r=>r.rating!=null).length,sourceRecords:incoming.length}));
