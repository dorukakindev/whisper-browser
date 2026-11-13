'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceVersion}=require('../src/podcast-session');
const {createPodcastTextTranslation}=require('../src/podcast-text-translation');

test('untimed translation rechecks spoiler permission after provider work and before saving or continuing',async()=>{
 for(const revokeAt of [1,2]){
 const text='A synthetic publisher sentence. '.repeat(220);
 const entry={id:'episode',feedId:'feed',kind:'podcast',externalId:'one',spoiler:'marked',spoilerAllowed:true,enclosures:[{url:'https://audio.example/one.mp3',type:'audio/mpeg'}]};
 const version=sourceVersion(entry);
 entry.podcastWorkspace={sourceVersion:version,transcript:{state:'untimed',format:'plain',text,status:'complete',provenance:'publisher'},translation:{state:'untimed',format:'plain',text:'Previous completed translation',provenance:'user'}};
 const writes=[];
 const store={entry:()=>structuredClone(entry),podcastWorkspace:(_id,v,patch)=>{assert.equal(v,version);writes.push(structuredClone(patch));Object.assign(entry.podcastWorkspace,structuredClone(patch));}};
 let calls=0,revoke=true;
 const start=createPodcastTextTranslation({store,translate:async()=>{calls++;if(revoke&&calls===revokeAt)entry.spoilerAllowed=false;return 'Synthetic translation '+calls;}});
 const input={entryId:entry.id,sourceVersion:version,expectedTranscriptText:text,targetLanguage:'tr'};
 await assert.rejects(start(input,new AbortController().signal),/spoiler/i);
 assert.equal(calls,revokeAt,'revoked source must not send another chunk');
 assert.equal(writes.length,revokeAt-1,'late output and checkpoint must not be saved after revocation');
 if(revokeAt===2)assert.deepEqual(entry.podcastWorkspace.textTranslationRecovery.parts,['Synthetic translation 1'],'completed checkpoint survives revocation');
 assert.equal(entry.podcastWorkspace.translation.text,'Previous completed translation');
 revoke=false;entry.spoilerAllowed=true;
 const result=await start(input,new AbortController().signal);
 assert(calls>revokeAt+1,'synthetic source uses multiple chunks and failed job releases its owner');
 assert.equal(result.translation.status,'complete');
 }
});
