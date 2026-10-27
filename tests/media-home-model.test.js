'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/renderer/media-home-model');

test('Windows source aliases keep the most recent progress and catalog artwork at library scale',()=>{
 const catalog=Array.from({length:5000},(_,i)=>({id:'film'+i,hasPoster:true,source:{type:'local',value:'C:\\Films\\Video'+i+'.mp4'}}));
 const history=catalog.flatMap((_,i)=>[{key:'file:C:\\Films\\Video'+i+'.mp4',position:1,duration:100,lastWatched:1},{key:'file:c:/films/video'+i+'.mp4',position:20,duration:100,lastWatched:2}]);
 const result=model.snapshot(catalog,history);assert.equal(result.watch.length,5000);assert(result.watch.every(row=>row.position===20&&row.id&&row.hasPoster));assert.equal(history.length,10000);
});
test('resume excludes completed/end credits and rejects invalid timing without mutating history', () => {
  const history = [
    { key: 'file:a', position: 20, duration: 100, lastWatched: 1 },
    { key: 'file:b', position: 96, duration: 100, lastWatched: 3 },
    { key: 'file:c', position: 50, duration: 100, completed: true, lastWatched: 2 },
    { key: 'file:d', position: Infinity, duration: NaN },
    { key: 'file:e', position: 40, duration: 0, lastWatched: 4 },
  ];
  const before = structuredClone(history);
  assert.deepEqual(model.snapshot([], history).continuing.map(row => row.key), ['file:e', 'file:a']);
  assert.deepEqual(history, before);
  assert.equal(model.progress({ duration: 100, position: 500 }).percent, 100);
});
test('audio files, video files and browser pages retain their own category', () => {
  assert.equal(model.medium({ type: 'local', localPath: 'C:\\Sesler\\Türkçe.FLAC' }), 'music');
  assert.equal(model.medium({ type: 'browser', sourceRef: 'https://example.com/album.mp3' }), 'web');
  assert.equal(model.medium({ type: 'youtube' }), 'web');
  assert.equal(model.medium({ type: 'local', localPath: 'C:\\Film.mkv' }), 'video');
  assert.equal(model.medium({ type: 'local', sourceRef: 'C:/Sesler/şarkı.opus' }), 'music');
});
test('search supports Turkish accents, preserves user text and tolerates malformed lists', () => {
  const item = { title: 'İSTANBUL Çığlığı', synopsis: 'Özgür bir öykü', year: 2026 };
  assert(model.matches(item, 'istanbul cigligi'));
  assert(model.matches(item, 'ozgur'));
  assert(model.matches(item, '2026'));
  assert.equal(item.title, 'İSTANBUL Çığlığı');
  assert.deepEqual(model.snapshot(null, [null, {}, { key: 'a' }, { key: 'a' }]).watch, [{ key: 'a' }]);
  assert.deepEqual(model.snapshot({}, null).items, []);
});
test('resume rows borrow existing catalog artwork without changing saved paths or titles', () => {
  const history = [{ key: 'file:c:/filmler/öykü.mp4', title: 'My title', position: 10, duration: 100 }];
  const result = model.snapshot([{ id: 'film', hasPoster: true, source: { type: 'local', value: 'C:\\Filmler\\Öykü.mp4' } }], history);
  assert.equal(result.watch[0].id, 'film');
  assert.equal(result.watch[0].hasPoster, true);
  assert.equal(result.watch[0].title, 'My title');
  assert.equal(history[0].id, undefined);
});

test('exported M4B audiobooks stay in the audio category',()=>{assert.equal(model.medium({type:'local',sourceRef:'C:/Books/Kitap.m4b'}),'music');});
test('YouTube resume artwork derives only from a validated video identity',()=>{
  for(const item of [{key:'youtube:abcdefghijk'},{key:'browser:https://www.youtube.com/watch?v=abcdefghijk&t=2'},{sourceRef:'https://youtu.be/abcdefghijk'},{url:'https://m.youtube.com/shorts/abcdefghijk'}])
    assert.equal(model.thumbnail(item),'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  for(const url of ['https://youtube.com.evil.example/watch?v=abcdefghijk','https://user:password@youtube.com/watch?v=abcdefghijk','file:///abcdefghijk','abcdefghijk','https://youtube.com/watch?v=../../secret'])
    assert.equal(model.thumbnail({sourceRef:url}),'');
});

test('home artwork eligibility excludes non-video pages without deleting history',()=>{
 const history=[{key:'browser:https://www.youtube.com/results?search_query=test',position:4,duration:50},{key:'browser:https://www.tiktok.com/@private',position:4,duration:50},{key:'youtube:abcdefghijk',position:4,duration:50}];
 const data=model.snapshot([],history);assert.equal(data.continuing.length,3);assert.equal(data.continuing.filter(model.hasArtwork).length,1);assert(model.hasArtwork({id:'film',hasPoster:true}));assert.equal(model.hasArtwork({hasPoster:true}),false);assert.equal(history.length,3);
});
