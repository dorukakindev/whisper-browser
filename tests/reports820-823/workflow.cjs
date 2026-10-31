// Behavioral regression derived from the corresponding report reproducer.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),settings=require(path.join(root,'src/settings-security')),workflows=require(path.join(root,'src/browser-workflow-recorder'));
const out=path.resolve(process.env.AUDIT820_OUT||path.join(root,'.uiprev','audit820-workflows-'+Date.now()));fs.mkdirSync(out,{recursive:true});
const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const start=renderer.indexOf('  try {\n    const s = await window.api.loadSettings();');
// Repository text may use CRLF. Preserve the actual production statements.
const normalized=renderer.replace(/\r\n/g,'\n');
const from=normalized.indexOf('  try {\n    const s = await window.api.loadSettings();');
const to=normalized.indexOf('  void refreshBrowserAdblockState();',from);
assert(from>=0&&to>from);
const startup=normalized.slice(from,to);
const valid={id:'synthetic-recording',title:'Synthetic',createdAt:1,mediaIdentity:'synthetic-media',steps:[{command:'setSubtitleMode',args:{mode:'source'}}]};
async function run(label,library){
 const payload={browserWorkflows:library,ui:{model:'tiny',beamSize:'3'},translate:{model:'synthetic-model'}};
 const imported=settings.parseImportText(JSON.stringify(payload));
 let applyCalls=0,providerCalls=0;
 const controls=new Map();
 const sandbox={window:{api:{loadSettings:async()=>imported.settings},BrowserWorkflowRecorder:workflows},glossary:[],projectGlossaries:{},state:{},player:{},browserSponsorExemptions:[],browserWorkflowLibrary:[],updateFolderPathDisplay:()=>{},normalizeBrowserSponsorExemptions:x=>x||[],updateTranslateEndpointUI:()=>{},updateMangaEndpointUI:()=>{},initializeProviderApiKeyState:()=>providerCalls++,initializeProviderModelProfiles:()=>{},applyUiSettings:ui=>{applyCalls++;sandbox.appliedUi=ui;},PRESETS:{},$:id=>{if(!controls.has(id))controls.set(id,{value:'default',checked:false});return controls.get(id);}};
 await vm.runInNewContext('(async()=>{'+startup+'})()',sandbox);
 let normalizationError=null;try{workflows.normalizeWorkflowLibrary(imported.settings.browserWorkflows);}catch(e){normalizationError={name:e.name,message:e.message};}
 return {label,parserAccepted:true,importedLibrary:imported.settings.browserWorkflows,normalizationError,startupApplyUiCalls:applyCalls,startupProviderInitializationCalls:providerCalls,loadedWorkflowIds:sandbox.browserWorkflowLibrary.map(x=>x.id),appliedUi:sandbox.appliedUi||null};
}
(async()=>{
 assert.equal(workflows.normalizeWorkflowLibrary([valid,null])[0].id,valid.id);assert.equal(workflows.normalizeWorkflowLibrary([{...valid,steps:[null,...valid.steps]}])[0].steps.length,1);
 const cases=[];cases.push(await run('valid-control',[valid]));cases.push(await run('null-workflow',[valid,null]));cases.push(await run('null-step',[{...valid,steps:[valid.steps[0],null]}]));cases.push(await run('unsupported-command-control',[valid,{id:'unsupported',steps:[{command:'unrecognized',args:{}}]}]));
 assert.equal(cases[0].startupApplyUiCalls,1);assert.equal(cases[0].startupProviderInitializationCalls,2);assert.deepEqual(cases[0].loadedWorkflowIds,[valid.id]);
 for(const row of cases.slice(1,3)){assert.equal(row.parserAccepted,true);assert.equal(row.normalizationError,null);assert.equal(row.startupApplyUiCalls,1);assert.equal(row.startupProviderInitializationCalls,2);assert.deepEqual(row.loadedWorkflowIds,[valid.id]);}
 assert.equal(cases[3].normalizationError,null);assert.equal(cases[3].startupApplyUiCalls,1);
 const sources={};for(const f of ['src/browser-workflow-recorder.js','src/settings-security.js','src/renderer/renderer.js'])sources[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
 const result={ok:true,sources,cases,scope:'Real parseImportText/sanitizeSettings and workflow normalizers; unchanged complete initial-settings try/catch extracted from renderer. Controlled loadSettings/DOM/side-effect adapters; no real user settings, disk write, network, Electron or physical GPU.'};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log('regression passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
