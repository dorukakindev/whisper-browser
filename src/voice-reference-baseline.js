'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {atomicWriteFileSync}=require('./fsync-utils');
function audioHash(file){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>16*1024*1024)throw Error('Reference is too large for transcript comparison.');
 return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function save(reference,file,text){
 if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('Invalid reference transcript baseline.');
 atomicWriteFileSync(file,JSON.stringify({version:1,audioSha256:audioHash(reference),text}),{encoding:'utf8'});
}
function read(reference,file){
 try{
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>40000||fs.realpathSync(file)!==path.resolve(file))return null;
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.version!==1||typeof record.text!=='string'||!record.text.trim()||record.text.length>8000||record.audioSha256!==audioHash(reference))return null;
  return record.text;
 }catch{return null;}
}
module.exports={save,read};
