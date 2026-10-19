'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {EventEmitter}=require('node:events');
const session=require('../src/browser-session-store');
const {normalizeReaderPreferences}=require('../src/browser-reader');
const {splitBrowserBounds}=require('../src/browser-tab-layout');
const packages=require('../src/browser-session-package');
const {waitForMangaPosition}=require('../src/browser-library-tools');
const {createBrowserDownloads}=require('../src/browser-downloads');
const {BrowserClosedTabHistory}=require('../src/browser-tab-history');
const {terminateProcessTree}=require('../src/process-lifecycle');
const tab=(id,url='https://fixture.test/watch')=>({id,url});

test('476-01: successful taskkill still has a watchdog until the child really closes',()=>{
 const proc=Object.assign(new EventEmitter(),{pid:42,exitCode:null,signalCode:null});
 let kills=0,watchdog,active=false;
 proc.kill=()=>{kills++;return true;};
 const killer=new EventEmitter();
 terminateProcessTree(proc,{platform:'win32',spawn:()=>killer,setTimeoutFn:fn=>{watchdog=fn;active=true;return 1;},clearTimeoutFn:()=>{active=false;}});
 killer.emit('exit',0);
 assert.equal(active,true);
 watchdog();
 assert.equal(kills,1);
});
test('476-02: missing restored tab ids are assigned stable unique identities',()=>{
 const raw={tabs:[tab(''),tab('', 'https://fixture.test/two'),tab('restored-1')]};
 const result=session.normalizeBrowserSession(raw);
 assert.equal(result.tabs.every(t=>!!t.id),true);
 assert.equal(new Set(result.tabs.map(t=>t.id)).size,3);
 assert.deepEqual(session.normalizeBrowserSession(result).tabs.map(t=>t.id),result.tabs.map(t=>t.id));
 const long=session.normalizeBrowserSession({tabs:[tab('x'.repeat(128)),tab('x'.repeat(128))]});
 assert.equal(long.tabs.every(t=>t.id.length<=128),true);
 assert.deepEqual(session.normalizeBrowserSession(long).tabs.map(t=>t.id),long.tabs.map(t=>t.id));
});
test('476-03: fallback active tab cannot also be the secondary split pane',()=>{
 const result=session.normalizeBrowserSession({version:8,tabs:[tab('one'),tab('two')],activeTabId:'gone',splitSecondaryTabId:'one'});
 assert.equal(result.activeTabId,'one');
 assert.equal(result.splitSecondaryTabId,'');
});
test('476-04: UTF-8 BOM session JSON remains recoverable',()=>{
 const io={readFileSync:file=>{
  if(file.endsWith('.bak')) throw Object.assign(new Error('missing'),{code:'ENOENT'});
  return '\uFEFF'+JSON.stringify({version:8,tabs:[tab('one')],activeTabId:'one'});
 }};
 assert.equal(session.readBrowserSessionWithStatus('fixture.json',io).session.tabs.length,1);
});
test('476-05: null reader preferences do not abort tab recovery',()=>{
 assert.deepEqual(normalizeReaderPreferences(null),normalizeReaderPreferences());
 assert.equal(session.normalizeSessionTab({...tab('one'),readerPreferences:null}).id,'one');
});
test('476-06: nonfinite split bounds are rejected before reaching Electron',()=>{
 for(const key of ['x','y','width','height']) assert.equal(splitBrowserBounds({x:0,y:0,width:800,height:600,[key]:Infinity}),null);
});
test('476-07: malformed package variant is skipped without aborting valid tabs',()=>{
 const raw=packages.createBrowserSessionPackage({session:{tabs:[tab('one')]},now:0});
 raw.payload.variants=[null];
 raw.checksum='sha256:'+packages.checksumPayload(raw.payload);
 const result=packages.inspectBrowserSessionPackage(raw);
 assert.equal(result.session.tabs.length,1);
 assert.equal(result.variants.length,0);
 assert.equal(result.warnings.length,1);
});
test('476-08: a late manga scan result respects cancellation during the scan',async()=>{
 let canceled=false;
 const result=await waitForMangaPosition({scan:async()=>{canceled=true;return {status:'found',match:'old'};},isCanceled:()=>canceled});
 assert.equal(result.status,'canceled');
});
test('476-09: destroyed download setup does not leak a scheduler admission',()=>{
 const ses=new EventEmitter(); let cancels=0,prevented=false;
 const downloads=createBrowserDownloads({scheduler:{enqueue:()=> 'running',cancel:()=>{cancels++;}}});
 downloads.attach(ses);
 assert.doesNotThrow(()=>ses.emit('will-download',{preventDefault(){prevented=true;}},{setSaveDialogOptions(){throw Error('destroyed');}}));
 assert.equal(cancels,1);assert.equal(prevented,true);assert.equal(downloads.activeCount(),0);
});
test('476-10: closed-tab nested edit snapshots do not alias the live source',()=>{
 const history=new BrowserClosedTabHistory();
 const timing={start:1,end:2};
 history.push({...tab('one'),subtitleEdits:[{timingOverride:timing}]});
 timing.start=99;
 assert.equal(history.pop().subtitleEdits[0].timingOverride.start,1);
});
