'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sanitizeSettings,publicSettings}=require('../src/settings-security');
const {splitSettingsSecrets,DEFAULT_SECRET_FIELDS}=require('../src/secret-store');
const {createMetadataClient}=require('../src/catalog-discovery');
test('TMDB credentials use the existing secret store and are excluded from public export/import',()=>{
 const apiKey='fixture-tmdb-token-not-a-real-credential';
 const clean=sanitizeSettings({tmdb:{apiKey,language:'en-US'}},{allowSecrets:true});assert.equal(clean.tmdb.apiKey,apiKey);assert(DEFAULT_SECRET_FIELDS.includes('tmdb.apiKey'));
 assert(!JSON.stringify(publicSettings(clean)).includes(apiKey));const split=splitSettingsSecrets(clean);assert(!JSON.stringify(split.publicSettings).includes(apiKey));assert.equal(split.secrets['tmdb.apiKey'],apiKey);
 const imported=sanitizeSettings({tmdb:{apiKey:'injected-credential',language:'tr-TR'}},{allowSecrets:false,existingSettings:clean});assert.notEqual(imported.tmdb.apiKey,'injected-credential');
});
test('TMDB metadata uses the selected language and supports bearer or v3 API keys',async()=>{
 const requests=[];const client=createMetadataClient(async(url,options)=>{requests.push({url:new URL(url),options});return new Response(JSON.stringify({results:[]}));},{language:()=> 'en-US'});
 await client.search({kind:'movie',title:'Synthetic'},'x'.repeat(40));assert.equal(requests[0].url.searchParams.get('language'),'en-US');assert.equal(requests[0].options.headers.Authorization,'Bearer '+'x'.repeat(40));
 const key='a'.repeat(32);await client.search({kind:'movie',title:'Synthetic'},key);assert.equal(requests[1].url.searchParams.get('api_key'),key);assert.equal(requests[1].options.headers.Authorization,undefined);assert.equal(requests[1].url.hostname,'api.themoviedb.org');
});
test('Metadata completion resolves only a known TMDB or unique IMDb identity, never a guessed title',async()=>{
 let count=0;const client=createMetadataClient(async()=>{count++;return new Response(JSON.stringify({movie_results:[{id:55}]}));});
 assert.equal(await client.resolve({kind:'film',tmdbId:'movie:42'},'x'.repeat(40)),42);assert.equal(count,0);
 assert.equal(await client.resolve({kind:'film',imdbId:'tt1234567'},'x'.repeat(40)),55);
 await assert.rejects(client.resolve({kind:'film',title:'No identity'},'x'.repeat(40)));
});
