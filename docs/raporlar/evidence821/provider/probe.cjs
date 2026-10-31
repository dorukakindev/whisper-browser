'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
const models=require(path.join(root,'src/provider-model-profiles'));
const keys=require(path.join(root,'src/provider-api-keys'));
const security=require(path.join(root,'src/settings-security'));
const {JSDOM}=require(path.join(root,'node_modules/jsdom'));
const source=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8').replace(/\r\n/g,'\n');
function block(start,end){let a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
async function run(initialCount){
 const dom=new JSDOM('<input id="translateModel" value="new-model"><select id="translateSavedModel"></select><button id="translateRemoveModel"></button><button id="translateAddModel"></button><output id="translateProbeStatus"></output>');
 const scope=keys.providerCredentialScope('custom','https://new-provider.example/v1');
 const initial=Object.fromEntries(Array.from({length:initialCount},(_,i)=>[keys.providerCredentialScope('custom',`https://provider-${i}.example/v1`),['saved-model']]));
 let callback,persisted;
 const button=dom.window.document.getElementById('translateAddModel');
 button.addEventListener=(_type,fn)=>{callback=fn;};
 const context=vm.createContext({window:{WhisperProviderModels:models},document:dom.window.document,$:id=>dom.window.document.getElementById(id),providerSettingText:x=>x,providerCredentialScopeFor:()=>scope,providerModelProfiles:initial,saveAppSettings:async()=>{persisted=models.serializeProviderModelProfiles(context.providerModelProfiles);return true;}});
 vm.runInContext(block('function renderProviderModelChoices(', '\n\n\nfunction translationProbeMessage'),context);
 vm.runInContext(block("$('translateAddModel')?.addEventListener('click'", "$('translateRemoveModel')?.addEventListener('click'"),context);
 await callback();
 const sanitized=security.sanitizeSettings({translate:{endpointPreset:'custom',customBaseUrl:'https://new-provider.example/v1',model:'new-model',modelProfiles:persisted}},{allowSecrets:true});
 return {initialCount,afterAddCount:Object.keys(context.providerModelProfiles).length,rawNewScopePresent:!!context.providerModelProfiles[scope],renderedChoices:[...dom.window.document.getElementById('translateSavedModel').options].map(x=>x.value),serializedCount:Object.keys(JSON.parse(persisted)).length,newScopePersisted:!!JSON.parse(sanitized.translate.modelProfiles)[scope],status:dom.window.document.getElementById('translateProbeStatus').textContent};
}
(async()=>{
const over=await run(32),within=await run(31);
assert.equal(over.afterAddCount,33);assert.equal(over.rawNewScopePresent,true);assert.equal(over.newScopePersisted,false);assert.deepEqual(over.renderedChoices,['']);assert.equal(over.status,'');
assert.equal(within.newScopePersisted,true);assert.deepEqual(within.renderedChoices,['','new-model']);
assert.throws(()=>models.addProviderModel({scope:Array.from({length:64},(_,i)=>'m'+i)},'scope','new-model'));
const map=Object.fromEntries(Array.from({length:32},(_,i)=>['endpoint:https://key-'+i+'.example/v1','SYNTHETIC_'+i]));
const updated=keys.updateProviderKeyProfile(map,'endpoint:https://new-key.example/v1','SYNTHETIC_NEW',true);
const keyVariant={afterUpdateCount:Object.keys(updated).length,newScopePersisted:!!JSON.parse(keys.serializeProviderKeyProfiles(updated))['endpoint:https://new-key.example/v1']};
assert.equal(keyVariant.afterUpdateCount,33);assert.equal(keyVariant.newScopePersisted,false);
const out={head:process.env.AUDIT821_HEAD || 'not-supplied',over,within,perProvider64ModelReject:true,keyVariant,scope:'unchanged renderer add callback/render choices + actual modules and settings sanitizer; DOM/save transport controlled; no personal key/network/native UI'};
fs.mkdirSync(process.env.AUDIT821_OUT || path.join(root,'.uiprev/audit821-provider'),{recursive:true});fs.writeFileSync(path.join(process.env.AUDIT821_OUT || path.join(root,'.uiprev/audit821-provider'),'results.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
})();
