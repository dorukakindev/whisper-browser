'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseFeed,durationSeconds}=require('../src/feed-parser');
const {createFeedStore}=require('../src/feed-store');
const catalog=require('../src/player-source-catalog');
test('RSS, Atom and JSON publisher duration/language persist through a feed reload',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'publisher-metadata-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(durationSeconds('01:02:03'),3723);
 assert.equal(durationSeconds('1:99'),null);
 assert.equal(durationSeconds('unknown'),null);
 for(const [body,seconds,language] of [
  ['<rss><channel><language>en</language><item><guid>rss-1</guid><title>Episode</title><itunes:duration>12:34</itunes:duration><enclosure url="https://example.com/a.mp3" type="audio/mpeg"/></item></channel></rss>',754,'en'],
  ['<feed xml:lang="fr"><title>Feed</title><entry xml:lang="tr"><id>atom-1</id><title>Episode</title><link rel="enclosure" href="https://example.com/a.mp3" type="audio/mpeg"/><media:content duration="125"/></entry></feed>',125,'tr'],
  [JSON.stringify({version:'https://jsonfeed.org/version/1.1',language:'de',items:[{id:'json-1',title:'Episode',attachments:[{url:'https://example.com/a.mp3',mime_type:'audio/mpeg',duration_in_seconds:99}]}]}),99,'de'],
 ]){
  const parsed=parseFeed(body,'https://example.com/feed');
  assert.equal(parsed.entries[0].durationSeconds,seconds);
  assert.equal(parsed.entries[0].language,language);
  const file=path.join(root,'feeds-'+seconds+'.json'),store=createFeedStore(file);
  store.subscribe(parsed,parsed.entries,'all');
  const loaded=createFeedStore(file).entries().rows[0];
  assert.equal(loaded.durationSeconds,seconds);assert.equal(loaded.language,language);
 }
});
test('source filters use measured durations, canonical language tags and explicit unknowns',()=>{
 const items=[
  {itemId:'known',sourceId:'local',kind:'local',title:'Known',durationSeconds:26,language:'tur'},
  {itemId:'unknown',sourceId:'local',kind:'local',title:'Unknown',durationSeconds:null,language:null},
  {itemId:'multi',sourceId:'local',kind:'local',title:'Multi',durationSeconds:700,spokenLanguages:['eng','tur']},
 ];
 const query=q=>catalog.queryPlayerItems({batch:{items,revision:'one'},query:q}).items.map(i=>i.itemId);
 assert.deepEqual(query({speechLanguages:['tr']}),['known','multi']);
 assert.deepEqual(query({speechLanguages:['und']}),['unknown']);
 assert.deepEqual(query({speechLanguages:['en'],durations:['10to30']}),['multi']);
});

test('publisher untimed and conditional text never advertises confirmed subtitle languages',()=>{
 const build=descriptors=>({itemId:'episode',sourceId:'publisher',kind:'podcast',title:'Episode',subtitleLanguages:catalog.podcastSubtitleLanguages(descriptors)});
 const result=(item,query)=>catalog.queryPlayerItems({batch:{items:[item],revision:'one'},query}).items.length;
 for(const descriptors of [undefined,[],[{timed:'no',mime:'text/plain',language:'tr'}],[{timed:'no',mime:'text/html',language:'en'}],[{timed:'conditional',mime:'application/ttml+xml',language:'fr'}],[{timed:'yes',mime:'text/vtt',language:null}],[{timed:'yes',mime:'text/vtt',language:'und'}]]){
  const item=build(descriptors);
  assert.equal(item.subtitleLanguages,null);
  assert.equal(result(item,{subtitleAvailability:'present'}),0);
  assert.equal(result(item,{subtitleAvailability:'absent'}),0);
  assert.equal(result(item,{subtitleAvailability:'unknown'}),1);
 }
 const timed=build([{timed:'yes',mime:'text/vtt',language:'TR_tr'},{timed:'no',mime:'text/plain',language:'en'}]);
 assert.deepEqual(timed.subtitleLanguages,['tr-tr']);
 assert.equal(result(timed,{subtitleAvailability:'present',subtitleLanguages:['tr']}),1);
 assert.equal(result(timed,{subtitleLanguages:['en']}),0);
 assert.equal(result(timed,{subtitleAvailability:'absent'}),0);
});
