// Behavioral regression derived from the corresponding report reproducer.
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.AUDIT822_OUT||path.join(root,'.uiprev/audit822-search-'+Date.now());
fs.mkdirSync(out,{recursive:true});
const {WatchIndex}=require(path.join(root,'src/watch-index'));
const {runBrowserPageIndexCapture}=require(path.join(root,'src/browser-page-index'));
const {unifiedLibrarySearch}=require(path.join(root,'src/browser-library-tools'));
const index=new WatchIndex(path.join(out,'index.sqlite'));
index.clearPages();
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
const block=(s,a,b)=>{const x=s.indexOf(a),y=s.indexOf(b,x);assert(x>=0&&y>x);return s.slice(x,y)};
const handlers=new Map(),context={watchIndex:()=>index,unifiedLibrarySearch,browserTabsSnapshot:()=>[],browserPlacesSnapshot:()=>({bookmarks:[]}),loadWatchLibrary:()=>[],authorizedBrowserSender:e=>e.allowed,ipcMain:{handle:(n,fn)=>handlers.set(n,fn)}};
vm.createContext(context);
vm.runInContext(block(main,'function searchUnifiedBrowserLibrary(','function saveWatchLibraryCollectionMutation(')+block(main,"ipcMain.handle('library:searchUnified'","ipcMain.handle('library:collections:list'"),context);
const line=preload.split('\n').find(l=>l.trim().startsWith('searchUnifiedLibrary:'));
const api=vm.runInNewContext('({'+line.trim()+'})',{ipcRenderer:{invoke:(channel,request)=>handlers.get(channel)({allowed:true},request)}});
(async()=>{
 const pages=[['upper','IŞIK'],['lower','ışık'],['ascii-upper','LIGHT'],['ascii-lower','light']];
 const captures=[];
 for(const [id,title] of pages){
  const webContents={isDestroyed:()=>false,executeJavaScriptInIsolatedWorld:async()=>({ok:true,url:'https://audit.example/'+id,title,blocks:[{text:'Bu sayfada saklanan açıklayıcı sentetik bir paragraf vardır.'}]})};
  const view={webContents},tab={view,generation:1};
  captures.push(await runBrowserPageIndexCapture({tab,view,webContents,tabGeneration:1,indexGeneration:1,isEnabled:()=>true,currentIndexGeneration:()=>1,script:'controlled capture result',upsertPage:p=>index.upsertPage(p),now:()=>1234}));
 }
 assert(captures.every(x=>x.ok));
 const results=[];
 for(const query of ['IŞIK','ışık','LIGHT','light']){
  const response=await api.searchUnifiedLibrary(query,'pages',160);
  assert(response.ok);results.push({query,count:response.results.length,titles:response.results.map(x=>x.title),urls:response.results.map(x=>x.url)});
 }
 assert.equal(results[0].count,2);assert.equal(results[1].count,2);assert.equal(results[2].count,2);assert.equal(results[3].count,2);
 const denied=await handlers.get('library:searchUnified')({allowed:false},{query:'LIGHT',scope:'pages'});assert.equal(denied.ok,false);
 const all=await api.searchUnifiedLibrary('ışık','all',160);assert.equal(all.results.length,2);
 const persisted=index.db.prepare('SELECT title,url FROM pages ORDER BY url').all();assert.equal(persisted.length,4);
 const result={captures,persisted,results,allScopeCount:all.results.length,unauthorizedRejected:true,limits:'Actual SQLite FTS5, capture module, unified reducer, unchanged main function/handler and preload method. Capture result/session stores controlled; no native window/site/DOM capture.'};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('regression passed');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>index.close());
