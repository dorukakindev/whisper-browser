'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeNativeText,buildNativeText}=require('../src/native-player');
const fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const codes={start:'\u0092a0',stop:'\u0092a1'};
test('dual native text styles source white and translation gold with actual size floor',()=>{
 const normalized=normalizeNativeText({primary:'English',secondary:'Türkçe',primaryRole:'source',secondaryRole:'translation',fontSize:9,font:'serif',weight:700,outline:50});
 assert.equal(normalized.fontSize,18);
 const message=buildNativeText(normalized,codes,360);
 assert.match(message,/\\fs36\.00/);assert.match(message,/\\fnGeorgia/);assert.match(message,/\\b700/);
 assert.ok(message.indexOf('\\1c&HFFFFFF&')<message.indexOf('English'));
 assert.ok(message.indexOf('\\1c&H8DCCED&')<message.indexOf('Türkçe'));
 assert.ok(message.includes(codes.stop+'English'));
 const swapped=buildNativeText(normalizeNativeText({primary:'Çeviri',secondary:'Source',primaryRole:'translation',secondaryRole:'source'}),codes,720);
 assert.ok(swapped.indexOf('\\1c&H8DCCED&')<swapped.indexOf('Çeviri'));
 assert.ok(swapped.indexOf('Source')<swapped.indexOf('Çeviri'),'source remains above translation when physical channels swap');
});
test('subtitle text stays in escaped mode and cannot insert mpv controls or expand properties',()=>{
 const input='literal {\\an9} \\N ${path} \u0092a0{\\p1} \u0000\u001b';
 const normalized=normalizeNativeText({primary:input,secondary:'x'.repeat(2000)});
 assert.equal(normalized.secondary.length,750);assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(normalized.primary));
 const message=buildNativeText(normalized,codes,720);
 assert.ok(message.includes(codes.stop+'literal {\\an9} \\N ${path} a0{\\p1}'));
 assert.equal(message.split(codes.start).length-1,2,'only two trusted style regions');
 assert.equal(normalizeNativeText('${filename} {braces}').primary,'${filename} {braces}');
});
test('strict typed projection rejects arbitrary styles and structured coercion',()=>{
 for(const input of [{primary:{}},{primary:'x',font:'Arial}{\\p1}'},{primary:'x',primaryRole:'raw'},{primary:'x',fontSize:NaN},{primary:'x',ass:'{\\p1}'},['x']])assert.throws(()=>normalizeNativeText(input));
 assert.equal(normalizeNativeText({primary:'x',fontSize:500,weight:9999,outline:-1}).fontSize,80);
 assert.equal(normalizeNativeText(null).primary,'');
});
function harness(){
 const app=new EventEmitter();app.getPath=()=>'/synthetic';const module={exports:{}},sent=[];let hold=false;
 const code=fs.readFileSync(require.resolve('../src/native-player'),'utf8').replace('return {stop:requestStop,handler};','return {stop:requestStop,handler,testOwn:s=>{session=s;}};');
 vm.runInNewContext(code,{module,process:{platform:'win32',env:{}},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,require(name){if(name==='node:fs')return{existsSync:()=>false};if(name==='./settings-security')return{withoutSecretEnv:x=>x};if(name==='./process-lifecycle')return{};return require(name);}});
 const service=module.exports.registerNativePlayer({app,ipcMain:{handle(){}},authorized:()=>true,owner:()=>null});
 const session={key:'m',generation:1,bounds:{height:360},state:{duration:10},pending:new Map(),socket:{writable:true,write(json){const packet=JSON.parse(json);sent.push(packet.command);if(!hold)queueMicrotask(()=>{const pending=session.pending.get(packet.request_id);clearTimeout(pending.timer);session.pending.delete(packet.request_id);pending.resolve(packet.command[1]==='osd-ass-cc/0'?codes.start:packet.command[1]==='osd-ass-cc/1'?codes.stop:null);});}}};
 service.testOwn(session);return{service,sent,session,hold:()=>hold=true};
}
test('existing text allowlist emits explicit raw command, caches trusted gates and rejects stale owner',async()=>{
 const h=harness(),request=value=>h.service.handler({},{action:'command',key:'m',generation:1,command:'text',value});
 assert.equal((await request({primary:'${path} {\\p1}',secondary:'Çeviri'})).ok,true);
 assert.deepEqual(h.sent[0],['get_property','osd-ass-cc/0']);assert.deepEqual(h.sent[1],['get_property','osd-ass-cc/1']);
 assert.equal(h.sent[2][0],'raw');assert.equal(h.sent[2][1],'show-text');assert.equal(h.sent[2][3],700);assert.ok(h.sent[2][2].includes(codes.stop+'${path} {\\p1}'));
 assert.equal((await request({primary:'Next line'})).ok,true);assert.equal(h.sent.length,4);
 const before=h.sent.length;assert.equal((await h.service.handler({},{action:'command',key:'old',generation:0,command:'text',value:'stale'})).ok,false);assert.equal(h.sent.length,before);
 assert.equal((await request('legacy {literal} ${path}')).ok,true);assert.equal(h.sent.at(-1)[2],'legacy {literal} ${path}');
});
test('an old subtitle request cannot paint after owner changes while ASS gates load',async()=>{
 const h=harness();h.hold();const pending=h.service.handler({},{action:'command',key:'m',generation:1,command:'text',value:{primary:'old'}});
 h.service.testOwn({...h.session,key:'new'});
 for(const [id,item]of h.session.pending){clearTimeout(item.timer);item.resolve(id===1?codes.start:codes.stop);}h.session.pending.clear();
 assert.equal((await pending).ok,false);assert.equal(h.sent.length,2,'no show-text after owner replacement');
});
test('renderer projection follows source roles, user font settings and all subtitle visibility modes',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<!doctype html><body><video id="playerVideo"></video><div id="subtitleOverlay"></div><div id="subtitleOverlay2"></div></body>');
 const player={subRole:'translation',sub2Role:'source',subStyle:{size:33,font:'mono',weight:700,outline:45}};
 let mode='both';dom.window.api={nativePlayer(){},onNativePlayer(){}};
 Object.defineProperty(dom.window.document.getElementById('subtitleOverlay'),'innerText',{value:'Türkçe'});Object.defineProperty(dom.window.document.getElementById('subtitleOverlay2'),'innerText',{value:'English'});
 const source=fs.readFileSync(require.resolve('../src/renderer/native-player-ui'),'utf8').replace('state:()=>({...sample}),command,layout','state:()=>({...sample}),command,layout,subtitleProjection');
 vm.runInNewContext(source,{window:dom.window,document:dom.window.document,player,Event:dom.window.Event,MutationObserver:dom.window.MutationObserver,currentSubtitleMode:()=>mode});
 const project=dom.window.NativePlayerUI.subtitleProjection;
 assert.equal(project().primaryRole,'translation');assert.equal(project().secondaryRole,'source');assert.equal(project().fontSize,33);assert.equal(project().font,'mono');
 mode='source';assert.equal(project().primary,'');assert.equal(project().secondary,'English');
 mode='translation';assert.equal(project().primary,'Türkçe');assert.equal(project().secondary,'');
 mode='off';assert.equal(project().primary,'');assert.equal(project().secondary,'');
 dom.window.close();
});


test('Player Pro native properties use the nested value packet, clamp values and refuse unknown or stale writes',async()=>{
 const h=harness(),request=value=>h.service.handler({},{action:'command',key:'m',generation:1,command:'vprop',value});
 for(const [name,value,want]of [['brightness',12,12],['video-zoom',99,2],['audio-delay',-.25,-.25],['video-rotate',90,90],['video-aspect-override',-1,-1]]){const r=await request({name,value});assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(h.sent.at(-1),['set_property',name,want]);}
 const count=h.sent.length;assert.equal((await request({name:'script',value:'unsafe'})).ok,false);assert.equal((await request({name:'brightness',value:'NaN'})).ok,false);assert.equal((await h.service.handler({},{action:'command',key:'old',generation:0,command:'vprop',value:{name:'brightness',value:10}})).ok,false);assert.equal(h.sent.length,count);
});

test('Fable OYN-05: native text updates from DOM changes without waiting for the keep-alive',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<body><video id="playerVideo"></video><div id="subtitleOverlay">first</div><div id="subtitleOverlay2"></div></body>'),w=dom.window,packets=[];
 const player={mediaKey:'',generation:0,workspaceMode:'player',subRole:'source',sub2Role:'translation'};w.api={nativePlayer:async q=>{packets.push(q);return {ok:true};},onNativePlayer(){}};
 const source=fs.readFileSync(require.resolve('../src/renderer/native-player-ui'),'utf8').replace('let active=false','let active=true');vm.runInNewContext(source,{window:w,document:w.document,player,Event:w.Event,MutationObserver:w.MutationObserver,currentSubtitleMode:()=> 'both'});
 w.NativePlayerUI.syncSubtitles();assert.equal(packets.at(-1).value.primary,'first');w.document.getElementById('subtitleOverlay').textContent='second';await new Promise(setImmediate);assert.equal(packets.filter(q=>q.command==='text').at(-1).value.primary,'second');const before=packets.filter(q=>q.command==='text').length;player.mediaKey='new';w.document.getElementById('subtitleOverlay').textContent='stale';await new Promise(setImmediate);assert.equal(packets.filter(q=>q.command==='text').length,before);dom.window.close();
 assert(fs.readFileSync(require.resolve('../src/native-player'),'utf8').includes("'--sid=no'"));
});

test('Fable OYN-02: live native bounds exclude Stremio controls at the side or bottom',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/native-player-ui'),'utf8'),code=source.slice(source.indexOf(' function bounds()'),source.indexOf(' let layoutKey='));
 let dock={width:380,height:450,left:1210,top:110},visible=true;const c={active:true,video:{getBoundingClientRect:()=>({x:100,y:100,left:100,top:100,width:1500,height:800})},document:{querySelector:()=>visible?{getBoundingClientRect:()=>dock}:null}};vm.createContext(c);vm.runInContext(code,c);
 assert.equal(c.bounds().width,1098);assert.equal(c.bounds().height,800);dock={width:1450,height:280,left:110,top:600};assert.equal(c.bounds().height,488);assert.equal(c.bounds().width,1500);visible=false;assert.equal(c.bounds().height,800);assert.equal(c.bounds().width,1500);
});


test('DUB-03: authorized native speed supports adaptive slowdown below the UI preference floor',async()=>{
 const h=harness(),request=value=>h.service.handler({},{action:'command',key:'m',generation:1,command:'speed',value});
 for(const [value,expected]of [[.125,.125],[.001,.0625],[20,4]]){assert.equal((await request(value)).ok,true);assert.deepEqual(h.sent.at(-1),['set_property','speed',expected]);}
 const count=h.sent.length;assert.equal((await h.service.handler({},{action:'command',key:'old',generation:0,command:'speed',value:.125})).ok,false);assert.equal(h.sent.length,count,'stale source cannot change effective native speed');
});

test('Fable OYN-06: read-only work references keep native video live while other open menus still occlude it',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="playerLayer"></div><div id="playerWorkspaceV3"><details class="sx-work-tracks" open><summary>Earlier edition</summary></details></div>'),d=dom.window.document;
 const source=fs.readFileSync(require.resolve('../src/renderer/native-player-ui'),'utf8'),code=source.slice(source.indexOf(' function layout(){'),source.indexOf(' async function start(){')),packets=[];
 const c={active:true,assistantOpen:false,player:{workspaceMode:'player'},layoutKey:'',freeze:null,freezing:false,freezeAttempted:true,key:'fixture',generation:1,fitWorkspace(){},bounds:()=>({x:0,y:0,width:640,height:360}),document:{getElementById:id=>d.getElementById(id),querySelector:selector=>d.querySelector(selector.replace(', .mk-popup:popover-open',''))},window:{api:{nativePlayer:q=>{packets.push(q);return Promise.resolve({ok:true});}}}};
 vm.createContext(c);vm.runInContext(code,c);c.layout();assert.equal(packets.at(-1).action,'layout');assert.equal(packets.at(-1).hidden,false);
 const unsafe=d.createElement('details');unsafe.open=true;d.getElementById('playerWorkspaceV3').append(unsafe);c.freezeAttempted=true;c.layout();assert.equal(packets.at(-1).hidden,true,'existing menu/modal occlusion must remain');dom.window.close();
});
