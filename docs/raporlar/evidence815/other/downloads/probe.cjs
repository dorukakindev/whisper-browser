'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const root = process.cwd();
const outBase = path.resolve(process.env.R815_DOWNLOADS_OUT || '.tmp/next815-downloads/runs');
fs.mkdirSync(outBase, {recursive:true});
const out = fs.mkdtempSync(path.join(outBase, 'run-'));
const sourceFiles = ['src/browser-downloads.js','src/main.js','src/preload.js','src/renderer/renderer.js'];
const sourceSha256 = Object.fromEntries(sourceFiles.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const { createBrowserDownloads } = require(path.join(root,'src/browser-downloads'));
class Item extends EventEmitter {
 constructor(saved) { super(); this.saved = saved; this.paused = false; }
 getFilename(){ return path.basename(this.saved); }
 getSavePath(){return this.saved;}
 getReceivedBytes(){return 12;}
 getTotalBytes(){return 12;}
 setSaveDialogOptions(options){this.options = options;}
 setSavePath(){throw Error('Native save dialog must remain in charge');}
 isPaused(){return this.paused;}
 canResume(){return true;}
 pause(){this.paused=true;}
 resume(){this.paused=false;this.emit('updated',{},'progressing');}
 cancel(){this.emit('done',{},'cancelled');}
}
class Node {
 constructor(){this.children=[];this.attributes={};this.listeners={};this.textContent='';this.classes=new Set();this.dataset={};this.classList={contains:x=>this.classes.has(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)};}
 setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];}
 addEventListener(k,v){this.listeners[k]=v;} append(...nodes){this.children.push(...nodes);}
 appendChild(node){this.append(node);} prepend(node){this.children.unshift(node);}
 remove(){this.removed=true;} contains(){return false;} focus(){}
}
(async()=>{
 const session=new EventEmitter(); const snapshots=[]; const saved=[]; let revealed=0;
 const manager=createBrowserDownloads({publish:s=>snapshots.push(s),exists:p=>fs.statSync(p).isFile(),reveal:()=>revealed++,saveRecords:r=>saved.push(r),delay:2});
 manager.attach(session);
 const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
 const start=main.indexOf("ipcMain.handle('browser:downloads'");
 const end=main.indexOf("ipcMain.handle('browser:reader'",start);
 assert(start>=0&&end>start);
 const handlers=new Map();
 vm.runInNewContext(main.slice(start,end),{ipcMain:{handle:(n,f)=>handlers.set(n,f)},authorizedBrowserSender:e=>e?.trusted===true,browserDownloads:manager});
 const handler=handlers.get('browser:downloads');
 const nodes=Object.fromEntries(['Panel','Toggle','Close','List','Status','Badge','Search','Filter','Count'].map(k=>['browserDownloads'+k,new Node()]));
 const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
 const rs=renderer.indexOf('const browserDownloadState ='); const re=renderer.indexOf("$('browserSessionExport')",rs);
 assert(rs>=0&&re>rs);
 const opened=[]; const calls=[];
 const ctx={console,$:id=>nodes[id],document:{createElement:()=>new Node(),activeElement:null},uiText:s=>s,setBrowserPlacesOpen(){},syncBrowserOcclusion(){},openLocalMedia:async p=>opened.push(p),window:{api:{browserDownloads:async(command,id)=>{const r=handler({trusted:true},{command,id});calls.push({command,id,result:r});return r;}}}};
 vm.createContext(ctx);
 const fsStart=renderer.indexOf('function foldSearch(value)');const fsEnd=renderer.indexOf('// Dil kodunu dosya adindan cikar',fsStart);
 assert(fsStart>=0&&fsEnd>fsStart);vm.runInContext(renderer.slice(fsStart,fsEnd),ctx);
 vm.runInContext(renderer.slice(rs,re),ctx);
 const cases=[];
 for(const extension of ['m4b','M4B','m4a','mp4','zip']){
  const file=path.join(out,'fixture.'+extension);fs.writeFileSync(file,'controlled-byte-fixture');
  const item=new Item(file);let prevented=false;session.emit('will-download',{preventDefault(){prevented=true;}},item);assert.equal(prevented,false);
  const id=manager.snapshot().items[0].id;item.emit('done',{},'completed');
  ctx.receiveBrowserDownloads(manager.snapshot()); ctx.renderBrowserDownloads();
  const row=nodes.browserDownloadsList.children.find(n=>n.children[0].textContent==='fixture.'+extension);
  assert(row);const button=row.children[4].children[3];const visible=!button.classList.contains('hidden');
  const before=opened.length;
  if(visible) await button.listeners.click();
  const result=visible?calls.filter(c=>c.command==='open-player'&&c.id===id).at(-1).result:handler({trusted:true},{command:'open-player',id});
  cases.push({extension,visible,result,error:row.children[5].textContent,playerOpened:opened.length>before});
 }
 assert(cases[0].visible&&cases[0].result.ok===false&&!cases[0].playerOpened);
 assert(cases[1].visible&&cases[1].result.ok===false&&!cases[1].playerOpened);
 assert(cases[2].visible&&cases[2].result.ok===true&&cases[2].playerOpened);
 assert(cases[3].visible&&cases[3].result.ok===true&&cases[3].playerOpened);
 assert(!cases[4].visible&&cases[4].result.ok===false);
 assert.equal(handler({}, {command:'list'}).ok,false);
 // Independent normal lifecycle counterchecks against the unchanged module.
 const liveItem=new Item(path.join(out,'cancelled.mp4'));session.emit('will-download',{preventDefault(){throw Error('Unexpected reject');}},liveItem);
 const liveId=manager.snapshot().items[0].id;
 assert(manager.action(liveId,'pause').ok);assert(manager.snapshot().items[0].paused);
 assert(manager.action(liveId,'resume').ok);assert(!manager.snapshot().items[0].paused);
 liveItem.emit('updated',{},'interrupted');assert(manager.snapshot().items[0].canResume);
 assert(manager.action(liveId,'resume').ok);assert(manager.action(liveId,'cancel').ok);
 assert.equal(manager.activeCount(),0);assert.equal(liveItem.listenerCount('updated'),0);
 const m4bid=manager.snapshot().items.find(r=>r.path.endsWith('fixture.m4b')).id;
 assert(manager.action(m4bid,'reveal').ok);assert.equal(revealed,1);
 const registry=JSON.parse(fs.readFileSync(path.join(root,'docs/audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json'),'utf8'));
 const registryMatches=registry.scenarios.filter(r=>r.sources.some(s=>sourceFiles.includes(s.trim()))).map(r=>({id:r.id,family:r.family,mechanism:r.mechanism,signature:r.signature,sources:r.sources,historical_status:r.historical_status}));
 const result={ok:true,head:process.env.R815_AUDIT_HEAD || null,sourceSha256,cases,counterchecks:{unauthorizedIPCRejected:true,m4aAndMp4Open:true,zipHiddenAndRejected:true,pauseResumeInterruptedCancel:true,revealM4bWorks:true,noActiveLeak:true,noUpdatedListenerLeak:true},registryMatches,limits:['Controlled DownloadItem EventEmitter and DOM facade; real module, IPC callback and renderer consumer unchanged.','No HTTP/Electron/native save dialog/codec decode/playback, start.bat, GPU or personal profile used.','Fixture bytes are not an encoded audiobook; rejection occurs before decoder.']};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,out,result:path.join(out,'result.json'),cases:cases.map(c=>({extension:c.extension,visible:c.visible,ok:c.result.ok,playerOpened:c.playerOpened}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
