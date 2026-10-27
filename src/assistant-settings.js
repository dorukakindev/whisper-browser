(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WhisperAssistantSettings=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ENDPOINT='https://api.deepinfra.com/v1/openai',MODEL='deepseek-ai/DeepSeek-V4.1-Flash-1017';
 function isDeepInfra(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.hostname==='api.deepinfra.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/v1\/openai(?:\/chat\/completions)?\/?$/.test(u.pathname);}catch{return false;}}
 function requestOptions(endpoint,config={}){return isDeepInfra(endpoint)&&config.serviceTier!=='standard'?{service_tier:'flex'}:{};}
 function resolve(settings={},shared={}){const a=settings.assistant;const preset=a?.endpointPreset||(a?.apiKey?ENDPOINT:'inherit');if(preset==='inherit')return {...shared};if(preset!==ENDPOINT)throw Error('Unsupported assistant provider / Desteklenmeyen asistan sağlayıcısı.');return {endpoint:ENDPOINT,model:a.model||MODEL,apiKey:a.apiKey||'',targetLanguage:shared.targetLanguage||'tr',serviceTier:a.flex===false?'standard':'flex'};}
 function timeout(config){return isDeepInfra(config?.endpoint)?12*60*1000:120000;}
 return Object.freeze({ENDPOINT,MODEL,isDeepInfra,requestOptions,resolve,timeout});
});
