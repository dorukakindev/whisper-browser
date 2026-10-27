(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./assistant-settings'):root.WhisperAssistantSettings,node?require('./provider-api-keys'):root.WhisperProviderApiKeys,node?require('./provider-model-profiles'):root.WhisperProviderModels);if(node)module.exports=api;else root.AssistantTranslationProfiles=api;})(typeof globalThis!=='undefined'?globalThis:this,(assistant,keys,models)=>{
 'use strict';
 const trusted={shuaiapi:'https://oai.sb/v1',openai:'https://api.openai.com/v1',codecraftapi:'https://codecraftapi.com/v1',apinex:'https://api.apinex.bond/v1'};
 function configs(settings={}){
  const t=settings.translate||{},endpoint=t.endpointPreset==='custom'?t.customBaseUrl:t.endpointPreset,profiles=keys.normalizeProviderKeyProfiles(t.apiKeyProfiles),saved=models.normalizeProviderModelProfiles(t.modelProfiles);
  const result=[];const add=(id,label,c)=>{try{const u=new URL(c.endpoint);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))||!c.model||!c.apiKey)return;result.push({id,label,model:c.model,provider:u.hostname,config:{endpoint:c.endpoint,model:c.model,apiKey:c.apiKey}});}catch{}};
  add('translation','Current subtitle provider',{endpoint,model:t.model,apiKey:t.apiKey});
  try{const a=assistant.resolve(settings,{endpoint,model:t.model,apiKey:t.apiKey});add('assistant','Assistant model, also available for subtitle translation',a);}catch{ /* A damaged assistant selection must not hide a usable subtitle profile. */ }
  for(const [provider,url] of Object.entries(trusted)){const scope='provider:'+provider,key=profiles[scope];if(!key)continue;for(const model of (saved[scope]||[]).slice(0,12))add('saved:'+provider+':'+encodeURIComponent(model),'Saved '+provider,{endpoint:url,model,apiKey:key});}
  return result;
 }
 const publicProfile=({id,label,model,provider})=>({id,label,model,provider,serviceTier:'standard',eligibleFor:['subtitle_translation','whisper_translation']});
 function describe(settings){const all=configs(settings),rows=all.slice(0,50).map(publicProfile);while(JSON.stringify(rows).length>10000)rows.pop();return {profiles:rows,limited:rows.length<all.length,total:all.length};}
 function list(settings){return describe(settings).profiles;}
 function resolve(settings,id){const row=configs(settings).find(r=>r.id===id);if(!row)throw Error('Configured translation profile unavailable / Kayıtlı çeviri profili kullanılamıyor.');return {...row.config,profile:publicProfile(row)};}
 function apply(opts,config){if(!config)return;opts.translateApiKey=config.apiKey;opts.translateBaseUrl=config.endpoint;opts.translateModel=config.model;opts.assistantTranslationProfile=config.profile;}
 return Object.freeze({list,describe,resolve,apply});
});
