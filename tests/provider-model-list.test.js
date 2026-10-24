'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {listTranslationProviderModels}=require('../src/translation-provider-probe');
test('Model listing uses one bounded GET on the selected endpoint, deduplicates and never returns credentials',async()=>{
 let request;
 const result=await listTranslationProviderModels({endpoint:'https://provider.example/custom/v1/chat/completions',apiKey:'fixture-secret',fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify({data:[{id:'model-b'},{id:'model-a'},{id:'model-a'},{id:'fixture-secret'},{id:'sk-hidden'},{id:'bad\nmodel'}]}));}});
 assert.equal(request.url,'https://provider.example/custom/v1/models');assert.equal(request.options.method,'GET');assert.equal(request.options.redirect,'error');assert.equal(request.options.body,undefined);assert.deepEqual(result.models,['model-a','model-b']);assert(!JSON.stringify(result).includes('secret'));
});
test('Model listing rejects unsafe URLs and bounds responses without exposing provider errors',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('must not request');};
 for(const endpoint of ['http://provider.example/v1','https://name:password@provider.example/v1','https://provider.example/v1?api_key=x'])assert.equal((await listTranslationProviderModels({endpoint,apiKey:'fixture',fetchImpl:never})).code,'invalid_config');
 assert.equal(calls,0);
 const large=await listTranslationProviderModels({endpoint:'https://provider.example/v1',apiKey:'fixture',fetchImpl:async()=>new Response('{}',{headers:{'content-length':'600000'}})});assert.equal(large.code,'invalid_response');
 const rejected=await listTranslationProviderModels({endpoint:'https://provider.example/v1',apiKey:'fixture',fetchImpl:async()=>new Response('fixture-private-body',{status:401})});assert.equal(rejected.code,'authentication');assert(!JSON.stringify(rejected).includes('private'));
});
test('A provider without models endpoint leaves manual selection available; list is capped',async()=>{
 const no=await listTranslationProviderModels({endpoint:'https://provider.example/v1',apiKey:'fixture',fetchImpl:async()=>new Response('{}',{status:404})});assert.equal(no.code,'endpoint_not_found');
 const many=await listTranslationProviderModels({endpoint:'http://127.0.0.1:1234/v1',fetchImpl:async(_url,options)=>{assert(!options.headers.Authorization);return new Response(JSON.stringify({data:Array.from({length:1100},(_,i)=>({id:'model-'+i}))}));}});assert.equal(many.models.length,1000);assert(many.limited);
});
