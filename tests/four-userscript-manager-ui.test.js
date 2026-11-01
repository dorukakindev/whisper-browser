'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),M=require('../src/userscript-model');
const source='// ==UserScript==\n// @name <img src=x onerror=evil()>\n// @namespace fixture\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\n';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('manager reviews exact source, blocks unsupported activation, invalidates edited preview and ignores closed-window responses',async t=>{
 const dom=new JSDOM('<button id="opener">Open</button>',{runScripts:'outside-only',url:'https://app.invalid'}),w=dom.window;t.after(()=>w.close());
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const calls=[],installed=[];let delayList=null,pickedSource=source;
 w.UiLocale={get:()=> 'en'};w.api={getBrowserState:async()=>({ok:true,activeTabId:'tab',tabs:[{id:'tab',url:'https://example.com/watch'}]}),userscriptsRequest:async input=>{
  calls.push(input);
  if(input.action==='list'){if(delayList)return delayList;return {ok:true,scripts:installed,pausedOrigins:[]};}
  if(input.action==='preview'){const code=input.pickfile?pickedSource:input.url?source:input.code,metadata=M.parseMetadata(code);return {ok:true,token:'exact-preview-token',existingId:input.id||null,script:{code,metadata},expansion:{sites:metadata.matches,grants:metadata.grants},blocked:metadata.blocked,warnings:metadata.warnings};}
  if(input.action==='revision')return {ok:true,code:source,revision:input.revision};
  if(input.action==='install'){assert.equal(input.confirm,true);assert.equal(input.token,'exact-preview-token');return {ok:true,reloadRequired:true};}
  if(input.action==='menus')return {ok:true,menus:[{id:'menu',tabId:'tab',scriptId:'fixture',label:'Fixture command'}]};
  return {ok:true};
 }};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/userscript-manager-ui.js'),'utf8'));
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text),click=text=>{const b=button(text);assert(b,'button '+text);b.click();};
 w.UserscriptManagerUI.open();await tick();click('New script');let area=w.document.querySelector('textarea');area.value=source;area.dispatchEvent(new w.Event('input'));click('Review changes');await tick();
 assert.equal(w.document.querySelector('.usm-review h3').textContent,'<img src=x onerror=evil()>');assert.equal(w.document.querySelectorAll('img').length,0);
 assert(button('Confirm install & enable').disabled);const consent=w.document.querySelector('.usm-consent input');consent.click();assert(!button('Confirm install & enable').disabled);
 area=w.document.querySelector('textarea');area.value=source+'// changed';area.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelector('.usm-review'),null);assert(!calls.some(c=>c.action==='install'));
 click('Review changes');await tick();w.document.querySelector('.usm-consent input').click();click('Confirm save disabled');await tick();assert.equal(calls.find(c=>c.action==='install').enabled,false);assert.match(w.document.querySelector('.usm-status').textContent,/no reload was started/);
 pickedSource=source.replace('// @grant none','// @grant unsafeWindow\n// @require https://example.com/dependency.js');click('Choose .user.js');await tick();assert.match(w.document.querySelector('.usm-blocked').textContent,/@require/);assert(!button('Confirm install & enable'));assert(button('Confirm save disabled').disabled);
 click('Close');click('Discard draft');
 let resolveList;delayList=new Promise(resolve=>resolveList=resolve);w.UserscriptManagerUI.open();await tick();click('Close');assert.equal(w.document.querySelector('dialog'),null);
 delayList=null;w.UserscriptManagerUI.open();await tick();resolveList({ok:true,scripts:[{id:'late',metadata:M.parseMetadata(source),enabled:true}],pausedOrigins:[]});await tick();assert(!w.document.querySelector('.usm-script'));
 click('Refresh page commands & errors');await tick();click('Fixture command');await tick();assert(calls.some(c=>c.action==='command'&&c.id==='menu'&&c.tabId==='tab'));
 click('Pause on this site');await tick();assert(calls.some(c=>c.action==='pause'&&c.origin==='https://example.com'&&c.paused));
 click('From HTTPS');const url=w.document.querySelector('input[type=url]');url.value='https://public.example/a.user.js?version=2';click('Fetch & preview this URL');await tick();assert(calls.some(c=>c.action==='preview'&&c.url===url.value));assert.equal(w.document.querySelector('textarea').value,source);assert.equal(w.document.querySelector('.usm-source-url').textContent,url.value);
 click('Close');click('Discard draft');installed.push({id:'fixture',code:source,metadata:M.parseMetadata(source),revision:'current',enabled:true,history:[{revision:'previous',updatedAt:0}],errors:[{at:0,message:'Controlled error'}]});w.UserscriptManagerUI.open();await tick();w.document.querySelector('.usm-script').click();assert.match(w.document.querySelector('.usm-blocked').textContent,/Controlled error/);click('Review restore');await tick();assert(calls.some(c=>c.action==='revision'&&c.id==='fixture'&&c.revision==='previous'));assert(button('Confirm restore & enable').disabled);w.document.querySelector('.usm-consent input').click();click('Confirm save disabled');await tick();assert.equal(calls.filter(c=>c.action==='install').at(-1).enabled,false);
});
