'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function fixture(t){
 const dom=new JSDOM('<select id="uiTheme"><option>system</option><option>dark</option><option>light</option></select><select id="uiLocale"><option>en</option><option>tr</option></select><select id="browserSponsorMode"><option>off</option><option>ask</option><option>auto</option></select>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.AssistantAppActions={current:()=>true};w.UiLocale={get:()=> 'en'};
 const read=()=>({theme:w.document.getElementById('uiTheme').value,language:w.document.getElementById('uiLocale').value,sponsorMode:w.document.getElementById('browserSponsorMode').value});
 let disk=read(),rejectNext=false,pending;
 w.saveAppSettings=async()=>{if(pending)return pending();if(rejectNext){rejectNext=false;return false;}disk=read();return true;};
 w.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/assistant-library-actions.js'),'utf8'));
 return {w,read,disk:()=>disk,reject:()=>{rejectNext=true;},defer:fn=>{pending=fn;},resume:()=>{pending=null;},run:(name,args={})=>w.AssistantLibraryActions.execute(name,args,{})};
}
test('failed assistant preference undo keeps the applied state and allows retry',async t=>{
 const h=fixture(t);await h.run('set_app_preferences',{theme:'dark'});h.reject();
 await assert.rejects(h.run('undo_app_preferences'),/saved|rollback/i);
 assert.equal(h.read().theme,'dark');assert.equal(h.disk().theme,'dark');assert.equal((await h.run('get_app_preferences')).canUndo,true);
 await h.run('undo_app_preferences');assert.equal(h.read().theme,'system');assert.equal(h.disk().theme,'system');assert.equal((await h.run('get_app_preferences')).canUndo,false);
});
test('failed preference write restores only its own fields and retains newer human edits',async t=>{
 const h=fixture(t);let resolve;h.defer(()=>new Promise(done=>{resolve=done;}));
 const update=h.run('set_app_preferences',{theme:'dark'});await Promise.resolve();
 h.w.document.getElementById('uiLocale').value='tr';h.resume();resolve(false);
 await assert.rejects(update,/saved|rollback/i);
 assert.deepEqual(h.read(),{theme:'system',language:'tr',sponsorMode:'off'});assert.deepEqual(h.disk(),h.read());
});
