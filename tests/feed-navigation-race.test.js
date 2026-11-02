'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/renderer/media-home.js'),'utf8');
// Extract the actual callback, including its browser-ready and ownership checks.
const callbackStart=source.indexOf('const originRender=state.render',source.indexOf('feedsView=window.MediaFeedsUI.render'));
const callbackEnd=source.indexOf('\n      }});',callbackStart);
assert(callbackStart>=0&&callbackEnd>callbackStart,'Feed onOpen callback must be available');
const currentBody=source.slice(callbackStart,callbackEnd);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

async function navigationOrder(body){
 const run=new AsyncFunction('state','window','content','player','document','setWorkspaceMode','flushWatchState','showBrowserWorkspace','navigateBrowserFromAddress','requestAnimationFrame','t','request',body);
 const pending=new Map(),navigated=[],state={page:'feeds',render:1},player={openIntent:0,workspaceMode:'player',browserActiveTabId:''};
 const elements={playerLayer:{classList:{remove(){},contains(){return false;}}},browserAddress:{value:''}};
 const window={api:{feedsRequest:request=>new Promise(resolve=>pending.set(request.entryId,resolve))}};
 const document={getElementById:id=>elements[id]};
 const call=id=>run(state,window,{isConnected:true},player,document,mode=>player.workspaceMode=mode,async()=>{},async()=>{player.browserActiveTabId='controlled-tab';},async()=>{navigated.push(elements.browserAddress.value);return {ok:true};},resolve=>resolve(),english=>english,{entryId:id,mode:'source'});
 const first=call('A'),second=call('B');
 pending.get('B')({ok:true,entry:{url:'https://example.test/B'}});await second;
 pending.get('A')({ok:true,entry:{url:'https://example.test/A'}});await first;
 return navigated;
}

test('The actual feed onOpen ignores an older entry response after the newer source opened',async()=>{
 assert.deepEqual(await navigationOrder(currentBody),['https://example.test/B']);
});

test('Negative control reproduces A overwriting B when intent is allocated after the first await',async()=>{
 // Reconstruct only the former ticket placement in memory. Product files are
 // never changed, and the remaining callback is the same actual implementation.
 assert(currentBody.includes('const originRender=state.render,intent=++player.openIntent;'));
 assert(currentBody.includes('if(player.openIntent!==intent||state.page'));
 assert(currentBody.includes('const entry=result.entry;'));
 const originalBody=currentBody.replace('const originRender=state.render,intent=++player.openIntent;','const originRender=state.render;')
  .replace('if(player.openIntent!==intent||state.page', 'if(state.page')
  .replace('const entry=result.entry;','const entry=result.entry,intent=++player.openIntent;');
 assert.deepEqual(await navigationOrder(originalBody),['https://example.test/B','https://example.test/A']);
});
