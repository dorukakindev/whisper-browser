'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {versionKey}=require('../src/media-hub-service');
const {safeFile,registerMediaTorrents}=require('../src/media-torrents');
test('Version grouping keeps episodes and folders separate without merging playback identities',()=>{
 assert.equal(versionKey('Film.2025.1080p.WEB-DL.mkv'),versionKey('Film.2025.2160p.BluRay.mp4'));
 assert.notEqual(versionKey('Series.S01E01.1080p.mkv'),versionKey('Series.S01E02.1080p.mkv'));
 assert.notEqual(versionKey('a/Film.1080p.mkv'),versionKey('b/Film.1080p.mkv'));
});
test('Torrent paths reject Windows device aliases and corrupt index cannot be overwritten',async()=>{
 for(const name of ['../a.mp4','a/../b.mp4','NUL.mp4','foo /bar.mp4','C:/a.mp4'])assert.throws(()=>safeFile({name,length:100},0));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'torrent-index-')),file=path.join(dir,'torrent-library.json');fs.writeFileSync(file,'corrupt data');
 try{
  const service=registerMediaTorrents({app:{getPath:()=>dir,whenReady:()=>Promise.resolve(),on(){}},ipcMain:{handle(){}},authorized:()=>true,protocol:{handle(){}},enginePath:()=>path.join(dir,'not-installed.exe')});
  const r=await service.handler({}, {action:'preview',magnet:'anything'});assert.equal(r.ok,false);assert.match(r.error,/preserved/);assert.equal(fs.readFileSync(file,'utf8'),'corrupt data');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
