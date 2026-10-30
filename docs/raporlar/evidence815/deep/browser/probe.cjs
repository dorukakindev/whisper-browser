const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const {BrowserReadingList}=require('../../src/browser-reading-list');
const source=fs.readFileSync(path.join(__dirname,'../../src/main.js'),'utf8');
function fn(name){const re=new RegExp('^(?:async )?function '+name+'\\(','m');const start=source.search(re);assert(start>=0,name);const end=source.indexOf('\n}',start)+2;return source.slice(start,end);}
const results=[];
function record(id,data){results.push({id,...data});console.log(id,JSON.stringify(data));}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function env(extra={}){const context=vm.createContext({path,Buffer,console,dt:(tr,en)=>en,mainWindow:{},app:{getPath:()=>__dirname},browserExportTitle:()=> 'Page-A',...extra});return context;}
function store(name,io){const dir=path.join(__dirname,'fixture-'+name);fs.mkdirSync(dir,{recursive:true});return new BrowserReadingList(dir,io);}
function add(s){const plan=s.prepare({url:'https://fixture.example/a',title:'Fixture A'});fs.writeFileSync(plan.filePath,'KNOWN-GOOD-ARCHIVE');s.commit(plan.entry);return plan;}
(async()=>{
 // Export ownership: same wc navigates while native save dialog is pending.
 for(const [name,format] of [['saveBrowserPageArchive','MHTML'],['saveBrowserPagePdf','PDF']]){
  let page='A',saved='';const dialog=deferred();
  const wc={isDestroyed:()=>false,savePage:async()=>{saved=page},printToPDF:async()=>Buffer.from(saved=page)};
  const ctx=env({dialog:{showSaveDialog:()=>dialog.promise},writeBufferAtomic:()=>{}});vm.runInContext(fn(name),ctx);
  const pending=ctx[name]({id:'tab-A',generation:1,view:{webContents:wc}});page='B';dialog.resolve({filePath:path.join(__dirname,'export.'+format.toLowerCase())});const outcome=await pending;
  assert.equal(saved,'B');assert.equal(outcome.ok,true);record('BR-EXPORT-SOURCE-'+format,{outcome,savedPage:saved,requestedPage:'A'});
 }
 // Refresh writes directly over sole retained archive. Inject native savePage partial-write+failure.
 {const s=store('refresh-loss'),p=add(s);const ctx=env({browserReadingList:()=>s});vm.runInContext(fn('saveBrowserPageToReadingList'),ctx);
  const out=await ctx.saveBrowserPageToReadingList({view:{webContents:{isDestroyed:()=>false,savePage:async(target)=>{fs.writeFileSync(target,'PARTIAL');throw Error('ENOSPC fixture')}}}},{filePath:p.filePath,entry:p.entry});
  assert.equal(out.ok,false);assert.equal(fs.readFileSync(p.filePath,'utf8'),'PARTIAL');record('BR-READING-REFRESH-LOSS',{outcome:out,retainedBytes:fs.readFileSync(p.filePath,'utf8'),indexStillClaimsBytes:s.get(p.entry.id).entry.sizeBytes});}
 // Locked archive deletion drops UI/index record, silently leaves private archive.
 {let locked='';const io=new Proxy(fs,{get(t,k){if(k==='unlinkSync')return file=>{if(file===locked)throw Object.assign(Error('EPERM fixture'),{code:'EPERM'});return t.unlinkSync(file)};return t[k]}});const s=store('locked-delete',io),p=add(s);locked=p.filePath;const out=s.remove(p.entry.id);assert(out.ok);assert(fs.existsSync(p.filePath));assert.equal(s.list().length,0);record('BR-READING-LOCKED-DELETE',{outcome:out,fileRemains:true,listCount:s.list().length,cleanupWarnings:s.cleanupWarnings});}
 // Pending refresh resurrects entry removed in another UI action.
 {const s=store('resurrection'),p=add(s);const d=deferred();const ctx=env({browserReadingList:()=>s});vm.runInContext(fn('saveBrowserPageToReadingList'),ctx);const pending=ctx.saveBrowserPageToReadingList({view:{webContents:{isDestroyed:()=>false,savePage:async(target)=>{await d.promise;fs.writeFileSync(target,'REFRESHED')}}}},{filePath:p.filePath,entry:p.entry});assert(s.remove(p.entry.id).ok);d.resolve();const out=await pending;assert(out.ok);assert(s.get(p.entry.id));record('BR-READING-REMOVAL-RESURRECTION',{outcome:out,listCount:s.list().length});}
 // Full-page export silently caps 45,000 CSS px at 30,000.
 {let clip;let attached=false;const wc={debugger:{isAttached:()=>attached,attach:()=>attached=true,detach:()=>attached=false,sendCommand:async(cmd,opt)=>cmd==='Page.getLayoutMetrics'?{cssContentSize:{width:1000,height:45000}}:(clip=opt.clip,{data:Buffer.from('fixture-image').toString('base64')})}};const ctx=env({browserDebuggerAttachPromise:null,browserDebuggerReady:false,browserDebuggerAttachAttempts:new WeakMap(),nativeImage:{createFromBuffer:buf=>({bytes:buf.length,isEmpty:()=>false})}});vm.runInContext(fn('captureBrowserFullPage'),ctx);await ctx.captureBrowserFullPage(wc);assert.equal(clip.height,30000);record('BR-CAPTURE-FULL-TRUNCATION',{pageHeight:45000,captureClip:clip,missingCSSPixels:15000});}
 // Capture overlap: page-global restoration slot is overwritten by a second request.
 {const dom=new JSDOM('<div class="ytp-chrome-bottom">controls</div>',{runScripts:'outside-only'}),w=dom.window,el=w.document.querySelector('div');const shots=[];const frame={executeJavaScript:async script=>script==='probe'?{bounds:{x:0,y:0,width:640,height:360}}:w.eval(script)};const wc={mainFrame:frame,getZoomFactor:()=>1,capturePage:()=>{const d=deferred();shots.push(d);return d.promise}};const ctx=env({browserFrames:()=>[frame],withTimeout:p=>p,buildBrowserMediaProbeScript:()=> 'probe',rankBrowserMediaCandidates:x=>x});vm.runInContext(fn('captureBrowserVideoFrame'),ctx);const tab={view:{webContents:wc,getBounds:()=>({width:800,height:600})}};const a=ctx.captureBrowserVideoFrame(tab,false);while(shots.length<1)await Promise.resolve();const b=ctx.captureBrowserVideoFrame(tab,false);while(shots.length<2)await Promise.resolve();shots[0].resolve({});await a;shots[1].resolve({});await b;assert.equal(el.style.visibility,'hidden');record('BR-CAPTURE-OVERLAP-HIDDEN',{finalVisibility:el.style.visibility,initialVisibility:''});dom.window.close();}
 // Video partially scrolled above/left viewport: clip dimensions include offscreen extent.
 {let rect;const frame={executeJavaScript:async script=>script==='probe'?{bounds:{x:-100,y:-80,width:640,height:360}}:0};const wc={mainFrame:frame,getZoomFactor:()=>1,capturePage:async r=>(rect=r,{})};const ctx=env({browserFrames:()=>[frame],withTimeout:p=>p,buildBrowserMediaProbeScript:()=> 'probe',rankBrowserMediaCandidates:x=>x});vm.runInContext(fn('captureBrowserVideoFrame'),ctx);await ctx.captureBrowserVideoFrame({view:{webContents:wc,getBounds:()=>({width:800,height:600})}},false);assert.equal(rect.width,640);assert.equal(rect.height,360);record('BR-CAPTURE-NEGATIVE-BOUNDS',{actual:rect,expected:{x:0,y:0,width:540,height:280},extraAdjacentPixels:{width:100,height:80}});}
 fs.writeFileSync(path.join(__dirname,'observations.json'),JSON.stringify({head:'6b3df86e35db8bc3271440f06c779cfb0acb2c22',platform:process.platform,node:process.version,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
