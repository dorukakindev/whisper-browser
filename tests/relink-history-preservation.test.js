'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createWatchLibraryStore,canonicalWatchKey}=require('../src/watch-library-store');
const {BrowserNoteStore}=require('../src/browser-note-store');
test('reviewed relink preserves sessions, supports repeat after undo, and rejects changed notes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relink-history-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWatchLibraryStore({filePath:path.join(dir,'watch-library.json')});
 const notes=new BrowserNoteStore(path.join(dir,'browser-notes.json'));
 const oldPath=path.join(dir,'old.mp4'),newPath=path.join(dir,'new.mp4');
 const oldKey=canonicalWatchKey('file:'+oldPath),newKey=canonicalWatchKey('file:'+newPath);
 store.upsert({key:oldKey,title:'Original',localPath:oldPath,sourceRef:oldPath,position:6,duration:26,firstWatched:1000,lastWatched:2000,session:{id:'session-1',watchSeconds:18}});
 notes.upsert({id:'note-1',mediaId:oldKey,source:'Original quote',note:'My note',mediaUrl:oldPath,start:3,end:4,createdAt:1000,updatedAt:2000});
 const original=structuredClone(store.loadAll()[0]),originalNotes=notes.list();
 const code=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
 const start=code.indexOf('async function relinkLibraryItem('),end=code.indexOf("ipcMain.handle('library:relink'",start);
 const context={loadWatchLibraryAll:()=>store.loadAll(),watchLibraryStore:()=>store,watchIndex:()=>null,ensureBrowserNotesReady:()=>notes,
  mediaFileAccess:{inspect:value=>value,grant:()=>true},saveWatchLibrary:(rows,options)=>{store.replaceItems(rows,options);return true;},structuredClone};
 vm.createContext(context);vm.runInContext(code.slice(start,end),context);
 const move=()=>context.relinkLibraryItem(oldKey,newPath,null,true);
 const first=await move();
 assert.deepEqual(store.loadAll()[0].sessions,original.sessions);
 assert.equal(store.loadAll()[0].totalWatchSeconds,18);
 assert.equal(store.loadAll()[0].firstWatched,1000);
 await first.undo.apply();
 assert.deepEqual(store.loadAll(),[original]);
 assert.deepEqual(notes.list(),originalNotes);
 const replaceItems=store.replaceItems;
 let failOnce=true;
 store.replaceItems=(rows,options)=>{
  const result=replaceItems(rows,options);
  if(failOnce){failOnce=false;throw Error('Injected post-write failure');}
  return result;
 };
 await assert.rejects(move,/post-write failure/);
 assert.deepEqual(store.loadAll(),[original]);
 assert.deepEqual(notes.list(),originalNotes);
 store.replaceItems=replaceItems;
 const second=await move();
 assert.deepEqual(store.loadAll()[0].sessions,original.sessions);
 assert.equal(store.loadAll()[0].key,newKey);
 notes.upsert({...notes.get('note-1'),note:'New user edit',updatedAt:3000});
 const before=JSON.stringify([store.loadAll(),notes.list()]);
 await assert.rejects(async()=>second.undo.apply(),/notes changed/);
 assert.equal(JSON.stringify([store.loadAll(),notes.list()]),before);
});
