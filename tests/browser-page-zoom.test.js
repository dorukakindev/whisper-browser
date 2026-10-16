const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
const fn=source.slice(source.indexOf('function changeBrowserPageZoom('),source.indexOf('function readBrowserPlaces('));
const saved=[];const context={rememberBrowserZoom:(url,zoom)=>{saved.push({url,zoom});return {ok:true};}};vm.createContext(context);vm.runInContext(fn,context);
let zoom=1;const tab={view:{webContents:{getZoomFactor:()=>zoom,setZoomFactor:n=>{zoom=n;},getURL:()=> 'https://fixture.invalid/page'}}};
assert.equal(context.changeBrowserPageZoom(tab,'zoom-in').zoom,1.1);
assert.equal(context.changeBrowserPageZoom(tab,'zoom-out').zoom,1);
assert.equal(context.changeBrowserPageZoom(tab,'zoom-set',9).zoom,3);
assert.equal(context.changeBrowserPageZoom(tab,'zoom-set',.01).zoom,.5);
assert.equal(context.changeBrowserPageZoom(tab,'zoom-set','bad').ok,false);
assert.equal(context.changeBrowserPageZoom(tab,'zoom-reset').zoom,1);
assert.equal(saved.at(-1).url,'https://fixture.invalid/page');
assert.equal(tab.zoom,1);console.log('browser-page-zoom: step, bounds, reset, invalid value and site persistence passed');
const preload=fs.readFileSync(require('node:path').join(__dirname,'../src/browser-preload.js'),'utf8');
let wheel;const sent=[];
vm.runInNewContext(preload.slice(preload.lastIndexOf('// Handle only a real Ctrl+wheel')),{
 window:{addEventListener:(type,fn,opts)=>{assert.equal(type,'wheel');assert.equal(opts.passive,false);wheel=fn;}},
 ipcRenderer:{send:(...args)=>sent.push(args)},Number,
});
let blocked=0;const event={isTrusted:true,ctrlKey:true,deltaY:-120,preventDefault:()=>blocked++};
wheel({...event,isTrusted:false});wheel({...event,ctrlKey:false});assert.equal(sent.length,0);
wheel(event);wheel({...event,deltaY:120});assert.deepEqual(sent,[['browser:zoom-wheel','in'],['browser:zoom-wheel','out']]);assert.equal(blocked,2);
console.log('browser-page-zoom: only trusted Ctrl+wheel is consumed; normal/synthetic scrolling is untouched');
