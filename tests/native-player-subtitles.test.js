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
