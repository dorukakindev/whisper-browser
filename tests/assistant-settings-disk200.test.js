'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),security=require('../src/settings-security');
const {SafeSecretStore}=require('../src/secret-store');
const {renameSyncResilient,fsyncDirectory}=require('../src/fsync-utils');
const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
const main=fs.readFileSync(require.resolve('../src/main.js'),'utf8');
// Isolate production declarations without booting Electron or reading a user profile.
function declaration(source,name){
 const start=source.indexOf('function '+name+'(');assert(start>=0,name+' exists');
 const next=source.indexOf('\n}',start);assert(next>start,name+' has a closing declaration');
 return source.slice(start,next+2);
}
function fixture(t,surface){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-settings200-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'settings.json'),secrets=new SafeSecretStore({filePath:path.join(dir,'secrets.json')});
 let failWrites=0,attempts=0,afterSave=null,gate=null,current=true;
 const io=Object.create(fs);
 io.writeFileSync=(target,...args)=>{attempts++;if(failWrites){failWrites--;throw Error('Injected settings disk write failure');}return fs.writeFileSync(target,...args);};
 const sandbox={fs:io,path,renameSyncResilient,fsyncDirectory,sanitizeSettings:security.sanitizeSettings,settingsPath:()=>file,getSettingsSecretStore:()=>secrets};
 vm.createContext(sandbox);
 vm.runInContext(declaration(main,'writeJsonAtomic')+'\n'+declaration(main,'saveSettings'),sandbox);
 const dom=new JSDOM('<select id="uiTheme"><option>system</option><option>dark</option><option>light</option></select><select id="uiLocale"><option>en</option><option>tr</option></select><select id="browserSponsorMode"><option>off</option><option>ask</option><option>auto</option></select>',{runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;
 Object.assign(w,{$:id=>w.document.getElementById(id),UiLocale:{get:()=> 'en'},AssistantAppActions:{current:()=>current},AssistantWorkflowSettings:require('../src/assistant-workflow-settings'),player:{workspaceMode:'local'},logLine:()=>{},providerApiKeyProfilesEdited:{translate:false,manga:false}});
 // Limit the payload to the real non-secret UI serializer; no credentials or private profile.
 w.appSettingsPayload=()=>({ui:w.collectUiSettings()});
 w.api={saveSettings:async payload=>{if(gate)await gate();const result=sandbox.saveSettings(JSON.parse(JSON.stringify(payload)));if(afterSave)afterSave(result);return result;}};
 w.eval('let _settingsSaveWarningShown=false;\nconst PERSIST_VALUE_CONTROLS='+JSON.stringify(security.PERSIST_VALUE_CONTROLS)+';\nconst PERSIST_CHECKBOX_CONTROLS='+JSON.stringify(security.PERSIST_CHECKBOX_CONTROLS)+';\n'+declaration(renderer,'collectUiSettings')+'\nasync '+declaration(renderer,'saveAppSettings'));
 w.eval(fs.readFileSync(require.resolve('../src/renderer/assistant-'+(surface==='workflow'?'workflow':'library')+'-actions.js'),'utf8'));
 const run=(name,values)=>surface==='workflow'?w.AssistantWorkflowActions.execute({set:'configure_workflow',undo:'undo_workflow_settings',get:'get_workflow_settings'}[name],{domain:'appearance',...(values?{changes_json:JSON.stringify(values)}:{})},{}):w.AssistantLibraryActions.execute({set:'set_app_preferences',undo:'undo_app_preferences',get:'get_app_preferences'}[name],values||{},{});
 const change=values=>Object.fromEntries(Object.entries(values).map(([key,value])=>[surface==='workflow'?{theme:'uiTheme',language:'uiLocale'}[key]:key,value]));
 const read=()=>JSON.parse(JSON.stringify(w.collectUiSettings()));
 const disk=()=>JSON.parse(fs.readFileSync(file,'utf8')).ui;
 assert.equal(sandbox.saveSettings({ui:read()}).ok,true);
 return {w,run,set:v=>run('set',change(v)),read,disk,fail:n=>{failWrites=n;},attempts:()=>attempts,after:fn=>{afterSave=fn;},gate:fn=>{gate=fn;},current:v=>{current=v;},canUndo:async()=>(await run('get')).canUndo};
}
for(const surface of ['workflow','preferences']){
 test('P025 '+surface+': persisted change, failed undo, saved rollback, retry',async t=>{
  const h=fixture(t,surface),original=h.read();assert.deepEqual(h.disk(),original);
  await h.set({theme:'dark'});const applied=h.read();assert.equal(applied.uiTheme,'dark');assert.deepEqual(h.disk(),applied);assert.equal(await h.canUndo(),true);
  const attempts=h.attempts();h.fail(1);
  await assert.rejects(h.run('undo'),/could not be saved/);
  assert.equal(h.attempts()-attempts,2,'one failed write and one actual rollback write');
  assert.deepEqual(h.read(),applied);assert.deepEqual(h.disk(),applied);assert.equal(await h.canUndo(),true);
  await h.run('undo');assert.deepEqual(h.read(),original);assert.deepEqual(h.disk(),original);assert.equal(await h.canUndo(),false);
 });
 test('P025 '+surface+': failed rollback reports disk divergence and invalidates undo',async t=>{
  const h=fixture(t,surface),original=h.read();await h.set({theme:'dark'});const applied=h.read();
  // Undo reaches disk, then the owner changes and the compensating write fails.
  h.after(result=>{if(result.ok){h.after(null);h.current(false);h.fail(1);}});
  await assert.rejects(h.run('undo'),/rollback could not be saved/);
  assert.deepEqual(h.read(),applied);assert.deepEqual(h.disk(),original);
  h.current(true);assert.equal(await h.canUndo(),false,'unsaved rollback cannot advertise a valid undo');
  await h.set({theme:'light'});assert.equal(h.read().uiTheme,'light');assert.deepEqual(h.disk(),h.read());assert.equal(await h.canUndo(),true);
 });
 test('P025 '+surface+': successful in-flight save retains newer manual edits when rolling back',async t=>{
  const h=fixture(t,surface);let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  h.gate(()=>{h.gate(null);entered();return new Promise(resolve=>{release=resolve;});});
  const update=h.set({theme:'dark',language:'tr'});await started;
  assert.equal(h.read().uiTheme,'dark');assert.equal(h.disk().uiTheme,'system');
  h.w.document.getElementById('uiTheme').value='light';release();
  await assert.rejects(update,/changed (while|during) sav/);
  assert.equal(h.read().uiTheme,'light','same field manual edit survives');assert.equal(h.read().uiLocale,'en','assistant-owned field rolls back');
  assert.deepEqual(h.disk(),h.read());assert.equal(await h.canUndo(),false);
 });
}

function approved(surface,values){return surface==='workflow'?{kind:'workflow',domain:'appearance',values:Object.fromEntries(Object.entries(values).map(([key,value])=>[{theme:'uiTheme',language:'uiLocale'}[key],value]))}:{kind:'preferences',values};}
function guardedSet(h,surface,expectedSettings,values={theme:'dark'}){
 return surface==='workflow'?h.w.AssistantWorkflowActions.execute('configure_workflow',{domain:'appearance',changes_json:JSON.stringify(Object.fromEntries(Object.entries(values).map(([key,value])=>[{theme:'uiTheme',language:'uiLocale'}[key],value])))},{},{expectedSettings}):h.w.AssistantLibraryActions.execute('set_app_preferences',values,{},{expectedSettings});
}
for(const surface of ['workflow','preferences']){
 test('P024 '+surface+': transport-gap manual drift refuses mutation but unrelated drift remains allowed',async t=>{
  const h=fixture(t,surface),packet=approved(surface,{theme:'system'}),disk=h.disk(),attempts=h.attempts();let events=0;
  h.w.document.addEventListener('change',()=>events++);
  // The packet is the approved main-process precheck; a human edits before renderer dispatch.
  h.w.document.getElementById('uiTheme').value='light';
  const stale=await guardedSet(h,surface,packet);
  assert.equal(stale.status,'failed');assert.equal(stale.stale,true);assert.match(stale.error,/refresh and review/);
  assert.equal(h.read().uiTheme,'light');assert.deepEqual(h.disk(),disk);assert.equal(h.attempts(),attempts);assert.equal(events,0);
  h.w.document.getElementById('uiTheme').value='system';
  h.w.document.getElementById('uiLocale').value='tr';
  assert.equal((await guardedSet(h,surface,packet)).status,'completed');
  assert.equal(h.read().uiTheme,'dark');assert.equal(h.read().uiLocale,'tr');assert.deepEqual(h.disk(),h.read());
 });
 test('P024 '+surface+': malformed internal snapshots fail closed before writes',async t=>{
  const h=fixture(t,surface),before=h.read(),attempts=h.attempts(),valid=approved(surface,{theme:'system'});
  const invalid=[null,{},[],{...valid,kind:'voice'},{...valid,values:{}},{...valid,values:{apiKey:'secret'}},{...valid,values:{constructor:'system'}},{...valid,values:{...valid.values,extra:'x'}},{...valid,values:{...valid.values},unexpected:true}];
  if(surface==='workflow')invalid.push({...valid,domain:'transcription'},{...valid,canUndo:true});
  for(const packet of invalid){const result=await guardedSet(h,surface,packet);assert.equal(result.status,'failed');assert.equal(result.stale,true);}
  assert.deepEqual(h.read(),before);assert.deepEqual(h.disk(),before);assert.equal(h.attempts(),attempts);
 });
}
test('P024 workflow: undo binds the approved destination even when current values match',async t=>{
 const h=fixture(t,'workflow');await h.set({theme:'dark'});
 const state=await h.run('get'),packet={kind:'workflow',domain:'appearance',values:{uiTheme:'dark'},canUndo:true,undoChanges:JSON.parse(JSON.stringify(state.undoChanges))};
 await h.set({theme:'light'});await h.set({theme:'dark'});
 const before=h.read(),attempts=h.attempts(),args={domain:'appearance'};
 const stale=await h.w.AssistantWorkflowActions.execute('undo_workflow_settings',args,{},{expectedSettings:packet});
 assert.equal(stale.stale,true);assert.deepEqual(h.read(),before);assert.deepEqual(h.disk(),before);assert.equal(h.attempts(),attempts);
 packet.undoChanges=JSON.parse(JSON.stringify((await h.run('get')).undoChanges));
 assert.equal((await h.w.AssistantWorkflowActions.execute('undo_workflow_settings',args,{},{expectedSettings:packet})).status,'completed');
 assert.equal(h.read().uiTheme,'light');assert.deepEqual(h.disk(),h.read());
});

test('P024 preferences: undo binds the exact changed-field destination and persists only that subset',async t=>{
 const h=fixture(t,'preferences');
 assert.equal(Object.hasOwn(await h.run('get'),'undoChanges'),false);
 await h.set({theme:'dark',language:'en'});
 const state=await h.run('get');
 assert.deepEqual(JSON.parse(JSON.stringify(state.undoChanges)),{theme:'system'},'unchanged requested fields are excluded');
 const packet={kind:'preferences',values:{theme:'dark'},canUndo:true,undoChanges:JSON.parse(JSON.stringify(state.undoChanges))};
 // Return to identical current values through a different change: the destination is now light.
 await h.set({theme:'light'});await h.set({theme:'dark'});
 const before=h.read(),attempts=h.attempts();let events=[];
 h.w.document.addEventListener('change',event=>events.push(event.target.id));
 const run=expectedSettings=>h.w.AssistantLibraryActions.execute('undo_app_preferences',{},{},{expectedSettings});
 assert.equal((await run(packet)).stale,true);
 assert.deepEqual(h.read(),before);assert.deepEqual(h.disk(),before);assert.equal(h.attempts(),attempts);assert.deepEqual(events,[]);
 packet.undoChanges=JSON.parse(JSON.stringify((await h.run('get')).undoChanges));
 for(const invalid of [{...packet,canUndo:false},{...packet,undoChanges:{}},{...packet,undoChanges:{theme:'light',language:'en'}},{...packet,undoChanges:{constructor:'light'}}]){
  assert.equal((await run(invalid)).stale,true);
 }
 assert.equal(h.attempts(),attempts);assert.deepEqual(events,[]);
 assert.equal((await run(packet)).status,'completed');
 assert.equal(h.read().uiTheme,'light');assert.equal(h.read().uiLocale,'en');assert.deepEqual(h.disk(),h.read());
 assert.deepEqual(events,['uiTheme'],'undo dispatches only controls changed by its assistant action');
 const after=await h.run('get');assert.equal(after.canUndo,false);assert.equal(Object.hasOwn(after,'undoChanges'),false);
});
