const fs=require('fs'),path=require('path'),vm=require('vm'),http=require('http'),crypto=require('crypto');
const {createRequire}=require('module');
const {JSDOM}=require('jsdom');
const root=process.cwd(),dir=process.env.R815_SUBSCRIPTIONS_OUT||path.join(root,'.tmp/unseen815-subscriptions'),renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
fs.mkdirSync(dir,{recursive:true});
const io=require(path.join(root,'src/subscriptions-io.js'));
const block=renderer.slice(renderer.indexOf("const ST_SUBS_KEY ="),renderer.indexOf('async function stSearchLoadMore()'));
const section=renderer.slice(renderer.indexOf('async function renderSmartTubeSection('),renderer.indexOf('// ----- Trend kategori'));
const tick=()=>new Promise(r=>setImmediate(r));
const id=n=>'UC'+String(n).padStart(22,'0');
function fixture(api={},initial=[]){
 const dom=new JSDOM('<div id="stGrid"></div>',{url:'https://fixture.invalid'}), logs=[];
 dom.window.localStorage.setItem('stSubscriptions',JSON.stringify(initial));
 dom.window.SubscriptionIO=io;dom.window.api=api;
 const c=vm.createContext({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,osd:s=>logs.push(s),openAppDialog:async()=>'',navigateBrowser(){},openInvidiousChannelPage(){},buildSmartTubeCard:()=>dom.window.document.createElement('article'),Date,setTimeout:()=>0,clearTimeout(){},$:s=>dom.window.document.getElementById(s),setSmartTubeStatus(){},youtubeLoggedIn:false,stSectionSeq:0,stActiveHomeRequestId:null});
 vm.runInContext(block+'\n'+section,c);return {c,dom,logs,grid:dom.window.document.getElementById('stGrid'),run:s=>vm.runInContext(s,c)};
}
(async()=>{
 const out={head:process.env.AUDIT_HEAD||'db65f2e7f6e7b50649c440cb183cb88863ebf241',headProvenance:process.env.AUDIT_HEAD?'caller read-only git rev-parse HEAD':'fixed audited baseline; inspect source hashes for revision compatibility',runtime:{node:process.version,platform:process.platform},sources:{},tests:{}};
 for(const p of ['src/subscriptions-io.js','src/subscription-feed.js','src/renderer/renderer.js','src/main.js'])out.sources[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
 const imported=Array.from({length:501},(_,i)=>({authorId:id(i),author:'Synthetic '+i}));
 let f=fixture({importSubscriptions:async()=>({ok:true,text:JSON.stringify(imported),fileName:'synthetic.json'})});
 f.run('renderStSubsPanel(document.getElementById("stGrid"))');
 [...f.grid.querySelectorAll('.st-subs-head button')].find(b=>b.textContent==='İçe aktar').click();await tick();await tick();
 const persisted=JSON.parse(f.dom.window.localStorage.getItem('stSubscriptions'));
 out.tests.importLimit={live:f.run('stSubs.length'),persisted:persisted.length,message:f.logs,missing:id(500)};f.dom.window.close();
 const reloaded=fixture({},persisted);out.tests.importLimit.reloadCount=reloaded.run('stSubs.length');reloaded.dom.window.close();
 async function add(value){let f=fixture();f.c.openAppDialog=async()=>value;f.run('renderStSubsPanel(document.getElementById("stGrid"))');f.grid.querySelector('button').click();await tick();const r={count:f.run('stSubs.length'),messages:f.logs};f.dom.window.close();return r;}
 out.tests.unicode={bare:await add('@çağrı'),url:await add('https://www.youtube.com/@çağrı')};
 f=fixture();f.run('stSubToggle({handle:"@NewsFeed"});stSubToggle({handle:"@newsfeed"});');out.tests.caseIdentity={live:f.run('stSubs.length'),parser:io.parseSubscriptions(JSON.stringify([{handle:'@NewsFeed'},{handle:'@newsfeed'}])).subs.length};f.dom.window.close();
 out.tests.caseIdentity.exactDuplicate=io.parseSubscriptions(JSON.stringify([{handle:'@newsfeed'},{handle:'@newsfeed'}])).subs.length;
 const opml=io.exportSubscriptions([{handle:'@newsfeed',author:'Synthetic'}],[],'opml');out.tests.opml={text:opml.text,ownRoundTrip:io.parseSubscriptions(opml.text).subs};
 out.tests.opml.ucidControl=io.exportSubscriptions([{authorId:id(1)}],[],'opml').text;
 let calls=0;f=fixture({subsRssFeed:async()=>{calls++;return {ok:true,videos:[],errors:0}}},[{authorId:id(1)}]);
 await f.run('renderSmartTubeSection("subscriptions")');await tick();await f.run('renderSmartTubeSection("subscriptions",{force:true})');await tick();out.tests.forceRefresh={requests:calls,cache:JSON.parse(JSON.stringify(f.run('stSubsFeedCache'))),visible:f.grid.textContent};f.run('stSubsFeedCache.at=0');await f.run('renderSmartTubeSection("subscriptions",{force:true})');await tick();out.tests.forceRefresh.expiredCacheRequests=calls;f.dom.window.close();
 // Original main handler; only sender/online dependencies and transport destination are controlled.
 const server=http.createServer((req,res)=>{res.writeHead(503,{'content-type':'text/plain'});res.end('synthetic upstream outage');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let requests=0;
 try{
  let handler;const start=main.indexOf("ipcMain.handle('subs:rssFeed',"),end=main.indexOf("ipcMain.handle('settings:export'",start);
  const c=vm.createContext({ipcMain:{handle:(name,fn)=>handler=fn},authorizedBrowserSender:()=>true,networkOnline:()=>true,require:createRequire(path.join(root,'src/main.js')),URL,AbortController,setTimeout,clearTimeout,Buffer,fetch:async(url,opts)=>{requests++;return fetch('http://127.0.0.1:'+server.address().port+'/?'+new URL(url).searchParams,opts)},readResponseBufferLimited:async r=>Buffer.from(await r.arrayBuffer())});
  vm.runInContext(main.slice(start,end),c);const response=await handler({}, {channels:[{authorId:id(1)}]});
  f=fixture({subsRssFeed:async()=>response},[{authorId:id(1)}]);f.run('renderStSubsPanel(document.getElementById("stGrid"))');await tick();out.tests.allFailures={requests,response,visible:f.grid.textContent,cache:f.run('stSubsFeedCache')};f.dom.window.close();
 }finally{await new Promise(r=>server.close(r));}
 const assert=require('assert/strict');
 assert.equal(out.tests.importLimit.live,501);assert.equal(out.tests.importLimit.persisted,500);
 assert.equal(out.tests.unicode.bare.count,0);assert.equal(out.tests.unicode.url.count,1);
 assert.equal(out.tests.caseIdentity.live,2);assert.equal(out.tests.caseIdentity.exactDuplicate,1);
 assert.match(out.tests.opml.text,/channel_id="/);
 assert.equal(out.tests.forceRefresh.requests,1);assert.equal(out.tests.forceRefresh.expiredCacheRequests,2);
 assert.equal(out.tests.allFailures.response.ok,true);assert.equal(out.tests.allFailures.response.errors,1);assert.match(out.tests.allFailures.visible,/Akışta video yok/);
 out.assertions='PASS: five strict bug behaviors and countercontrols; OPML output observation is excluded from strict count';
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out.tests,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
