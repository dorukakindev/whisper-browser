'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const manifest=require('../src/assistant-context-manifest'),registry=require('../src/assistant-capabilities');
function setup(){
 let effects=0;const player={workspaceMode:'browser',browserPageUrl:'https://www.youtube.com/watch?v=fixture',browserPageTitle:'Test',browserTime:3,browserTracks:[],cues:[],browserWhisperRange:null};
 const sandbox={window:{AssistantContextManifest:manifest,AssistantCapabilities:{validate:(n,a,c)=>registry.validate(n,JSON.parse(JSON.stringify(a)),c)},UiLocale:{get:()=> 'en'},AssistantWorkspace:{activeId:()=> 'thread',toolContext:()=>({rows:[]})},AssistantSourceContext:{pageKey:()=> 'page'},AppSettingsUI:{open:async()=>{effects++;}}},document:{getElementById:()=>null},player,state:{},globalAssistantContext:()=>null,browserTabState:()=>({id:'A',generation:1}),currentBrowserYoutubeUrl:()=>player.browserPageUrl,aiSourceScope:()=> 'scope',currentBrowserWhisperRange:()=>player.browserWhisperRange};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-app-actions'),'utf8'),sandbox);
 return {player,actions:sandbox.window.AssistantAppActions,effects:()=>effects};
}
test('AppActions checks source and range before dispatching a real adapter',async()=>{
 const h=setup(),owner=h.actions.snapshot();
 await h.actions.execute('open_settings',{section:'general'},owner);assert.equal(h.effects(),1);
 await assert.rejects(h.actions.execute('open_settings',{section:'general'},owner,{deadline:Date.now()-1}),/expired/);assert.equal(h.effects(),1);
 h.player.browserWhisperRange={start:5,end:20};
 await assert.rejects(h.actions.execute('open_settings',{section:'general'},owner),/changed/);assert.equal(h.effects(),1);
 await assert.rejects(h.actions.execute('open_settings',{section:'general',token:'forbidden'},h.actions.snapshot()),/Invalid/);assert.equal(h.effects(),1);
});
test('Agent UI pagehide unsubscribes and its idle state does not occupy media state',()=>{
 const listeners={},window={api:{assistantAgentRun:()=>{},onAssistantAgentEvent:()=>()=>{window.unsubscribed=true;}},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/assistant-agent-ui'),'utf8'),{window,document:{addEventListener:()=>{}}});
 assert.equal(window.AssistantAgentUI.busy(),false);assert.equal(window.AssistantAgentUI.status(),null);listeners.pagehide();assert.equal(window.unsubscribed,true);
});
