'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),settings=require('../src/assistant-settings'),{sanitizeSettings}=require('../src/settings-security'),{splitSettingsSecrets,mergeSettingsSecrets}=require('../src/secret-store');
test('DeepInfra assistant selection never borrows a translation credential; legacy sharing stays explicit',()=>{
 const shared={endpoint:'https://translation.fixture/v1',model:'translation',apiKey:'fixture-translation'};
 assert.deepEqual(settings.resolve({},shared),shared);
 const config=settings.resolve({assistant:{endpointPreset:settings.ENDPOINT,apiKey:'fixture-assistant'}},shared);
 assert.equal(settings.resolve({assistant:{apiKey:'fixture-assistant'}},shared).endpoint,settings.ENDPOINT);
 assert.equal(settings.resolve({assistant:{endpointPreset:'inherit',apiKey:'fixture-assistant'}},shared).endpoint,shared.endpoint);
 assert.equal(config.model,settings.MODEL);assert.equal(config.apiKey,'fixture-assistant');assert.equal(shared.apiKey,'fixture-translation');
 assert.equal(settings.resolve({assistant:{endpointPreset:settings.ENDPOINT}},shared).apiKey,'');
 assert.equal(settings.timeout(config),720000);assert.equal(settings.timeout(shared),120000);
 for(const endpoint of ['https://api.deepinfra.com.evil/v1/openai','http://api.deepinfra.com/v1/openai','https://api.deepinfra.com/v1/openai?x=1','https://key@api.deepinfra.com/v1/openai','https://api.deepinfra.com/anthropic','https://api.deepinfra.com:443/v1/openai/other'])assert.deepEqual(settings.requestOptions(endpoint),{});
 assert.deepEqual(settings.requestOptions(settings.ENDPOINT+'/chat/completions'),{service_tier:'flex'});
});
test('Assistant key enters the existing vault and cannot ride an imported endpoint change',()=>{
 const raw={assistant:{endpointPreset:settings.ENDPOINT,model:settings.MODEL,apiKey:'fixture-assistant'},translate:{endpointPreset:'https://api.openai.com/v1',model:'translation',apiKey:'fixture-translation'}};
 const clean=sanitizeSettings(raw,{allowSecrets:true}),split=splitSettingsSecrets(clean);
 assert.equal(split.secrets['assistant.apiKey'],'fixture-assistant');assert(!JSON.stringify(split.publicSettings).includes('fixture-assistant'));
 assert.equal(mergeSettingsSecrets(split.publicSettings,split.secrets).assistant.apiKey,'fixture-assistant');
 const imported=sanitizeSettings({assistant:{endpointPreset:'inherit',apiKey:'hostile'}},{allowSecrets:false,existingSettings:clean});
 assert(!imported.assistant.apiKey);assert(imported.clearedSecretFields.includes('assistant.apiKey'));
 assert.equal(sanitizeSettings({ui:{}},{allowSecrets:true,existingSettings:clean}).assistant.apiKey,'fixture-assistant');
});

test('Flex choice survives settings sanitization and applies only to the assistant provider',()=>{
 const raw={assistant:{endpointPreset:settings.ENDPOINT,model:settings.MODEL,flex:false}};
 const saved=sanitizeSettings(raw,{allowSecrets:true});assert.equal(saved.assistant.flex,false);
 const c=settings.resolve(saved);assert.equal(c.serviceTier,'standard');assert.deepEqual(settings.requestOptions(c.endpoint,c),{});
 assert.deepEqual(settings.requestOptions(c.endpoint,{serviceTier:'flex'}),{service_tier:'flex'});
 assert.equal(sanitizeSettings({assistant:{endpointPreset:settings.ENDPOINT}},{existingSettings:saved,allowSecrets:true}).assistant.flex,false);
 assert.throws(()=>sanitizeSettings({assistant:{endpointPreset:settings.ENDPOINT,flex:'false'}},{allowSecrets:true}),/boolean/);
});


test('Legacy assistant tier is job-scoped and never leaks into unrelated subprocesses',()=>{
 const {buildSecretEnv}=require('../src/settings-security');
 assert.equal(buildSecretEnv({WHISPER_ASSISTANT_SERVICE_TIER:'flex'},{chat:{serviceTier:'standard'}}).WHISPER_ASSISTANT_SERVICE_TIER,'standard');
 assert.equal(buildSecretEnv({WHISPER_ASSISTANT_SERVICE_TIER:'standard'},{}).WHISPER_ASSISTANT_SERVICE_TIER,undefined);
});

test('New text workflows default to DeepSeek without moving legacy keys',()=>{
 const fresh=settings.fillTextDefaults({});assert.equal(fresh.translate.endpointPreset,settings.ENDPOINT);assert.equal(fresh.translate.model,settings.MODEL);assert.equal(fresh.llm.model,settings.MODEL);
 const legacy=settings.fillTextDefaults({translate:{apiKey:'synthetic-old'},llm:{apiKey:'synthetic-cleanup'}});assert.equal(legacy.translate.endpointPreset,'https://api.shuaiapi.com/v1');assert.equal(legacy.llm.endpointPreset,'https://api.deepseek.com');
 const custom={translate:{endpointPreset:'custom',customBaseUrl:'https://example.invalid/v1',model:'custom'},llm:{endpointPreset:'custom',model:'other'}};assert.deepEqual(settings.fillTextDefaults(custom),custom);
});
