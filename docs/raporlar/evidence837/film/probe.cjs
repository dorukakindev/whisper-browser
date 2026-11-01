'use strict';
const auditOut=require('node:path').resolve(__dirname,'../../../../.tmp/audit837-replay/film');require('node:fs').mkdirSync(auditOut,{recursive:true});
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../../..'),out=path.join(auditOut,'run-'+Date.now());fs.mkdirSync(out,{recursive:true});
const {createMediaCatalogStore}=require(path.join(repo,'src/media-catalog-store'));
const {registerMediaShelf}=require(path.join(repo,'src/media-shelf-service'));
const {registerMediaDiscovery}=require(path.join(repo,'src/media-discovery-service'));
const quiz=require(path.join(repo,'src/taste-quiz'));
async function fixture(name,csv,items){
 const dir=path.join(out,name);fs.mkdirSync(dir);const file=path.join(dir,'diary.csv');fs.writeFileSync(file,csv);
 const catalog=createMediaCatalogStore({filePath:path.join(dir,'catalog.json')});items.forEach(item=>catalog.upsert(item));let handle;
 registerMediaShelf({ipcMain:{handle:(name,fn)=>handle=fn},authorized:()=>true,dialog:{showOpenDialog:async()=>({filePaths:[file]})},owner:()=>null,userData:()=>dir,pythonPath:()=>path.join(repo,'backend/venv/Scripts/python.exe'),catalogStore:()=>catalog});
 const preview=await handle({},{action:'letterboxd-preview'});assert.equal(preview.ok,true,JSON.stringify(preview));const applied=await handle({},{action:'letterboxd-apply',token:preview.token});assert.equal(applied.ok,true,JSON.stringify(applied));const state=await handle({},{action:'list'});assert.equal(state.ok,true);
 return {dir,catalog,preview,applied,state};
}
(async()=>{
 const csv='Date,Name,Year,Rating,Watched Date\n2026-01-01,Original Film,2020,1,2026-01-01\n';
 const item={kind:'film',title:'Yerel Film',originalTitle:'Original Film',year:2020,ratings:{personal:'9'},genres:['Drama'],directors:['Director']};
 const alias=await fixture('alias',csv,[item]);const canonical=await fixture('canonical',csv,[{...item,title:'Original Film'}]);
 assert.equal(alias.preview.matches,1);assert.equal(alias.state.taste.average,1);assert.equal(alias.state.taste.metadataMatched,0);assert.equal(alias.state.taste.genres.length,0);assert.equal(canonical.state.taste.average,4.5);assert.equal(canonical.state.taste.metadataMatched,1);
 const repeat=await fixture('rewatch','Date,Name,Year,Rating,Watched Date\n2026-01-01,Repeat Film,2020,5,2026-01-01\n2026-02-01,Repeat Film,2020,5,2026-02-01\n',[{kind:'film',title:'Repeat Film',year:2020,genres:['Drama'],directors:['Director']}]);
 const single=await fixture('single','Date,Name,Year,Rating,Watched Date\n2026-01-01,Repeat Film,2020,5,2026-01-01\n',[{kind:'film',title:'Repeat Film',year:2020,genres:['Drama'],directors:['Director']}]);
 async function discovery(f){let handle;registerMediaDiscovery({ipcMain:{handle:(name,fn)=>handle=fn},authorized:()=>true,catalogStore:()=>f.catalog,userData:()=>f.dir,fetchImpl:async()=>new Response(JSON.stringify({metas:[{id:'tt1234567',name:'Candidate',genres:['Drama']}]}),{status:200})});return handle({},{action:'personal',kind:'film'});}
 const recommendation=await discovery(repeat),singleRecommendation=await discovery(single);assert.equal(recommendation.ok,true);assert.equal(recommendation.rows[0].profileBecause.count,2);assert.equal(singleRecommendation.rows[0].because,'Repeat Film');
 const answers={version:1,answers:['human',null,null,null,null,null]},candidate={id:'pending',kind:'film',title:'Pending',genres:['Drama'],watchStatus:'planned'};
 const repeatedQuiz=quiz.recommend(answers,[candidate],repeat.state.taste),singleQuiz=quiz.recommend(answers,[candidate],single.state.taste);assert.equal(repeatedQuiz[0].supported.length,1);assert.equal(singleQuiz[0].supported.length,0);
 const result={head:'9b3f9e462abaebfd1e3a321fcb72e9594b8c7533',alias:{preview:alias.preview,applied:alias.applied,storedPersonal:alias.catalog.list()[0].ratings.personal,average:alias.state.taste.average,metadataMatched:alias.state.taste.metadataMatched,genres:alias.state.taste.genres},canonicalControl:{average:canonical.state.taste.average,metadataMatched:canonical.state.taste.metadataMatched,genres:canonical.state.taste.genres},rewatch:{catalogTitles:repeat.catalog.list().length,diaryRows:JSON.parse(fs.readFileSync(path.join(repeat.dir,'media-shelf.json'))).diary.length,genre:repeat.state.taste.genres[0],recommendation:recommendation.rows[0],quiz:repeatedQuiz[0]},singleControl:{genre:single.state.taste.genres[0],recommendation:singleRecommendation.rows[0],quiz:singleQuiz[0]},limits:'Real Python parser, IPC handlers, catalog and shelf disk writes, taste profile, discovery and quiz. Dialog/network are synthetic adapters; no native UI/site/model acceptance.'};
 fs.writeFileSync(path.join(auditOut,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
