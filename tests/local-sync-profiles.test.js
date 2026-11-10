const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kuyruk-50/18: yerel oynatıcı parça-bazlı senkron profilleri. Eski tek
// player.offset dosya/parça değişince eski kaymayı yeni parçaya sızdırıyordu.
// Kilitler: kanal+ses+yol anahtarı, profil geri yükleme, parça değişiminde
// sıfırlama, legacy offset korunması, web modunda no-op, kalıcılık alanları.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'baslangic bulunamadi: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitis bulunamadi: ' + to);
  return renderer.slice(start, end);
}

const src = [
  slice('// Parça-bazlı senkron profilleri', 'async function loadSubtitle('),
  slice('function captureWatchPrefs()', 'function beginWatchSession'),
  slice('function subLangFromPath(', 'function languagePrefHint'),
].join('\n');

function mkCtx(overrides = {}) {
  const elements = {};
  const el = (id) => (elements[id] ||= { value: '', textContent: '', classList: { toggle() {}, add() {}, remove() {} } });
  const ctx = {
    console: { log() {} },
    window: {},
    watchItemByKey: () => null,
    $: (id) => el(id),
    player: {
      workspaceMode: 'player',
      subPath: '', sub2Path: '', subFormat: 'srt',
      offset: 0, offset2: 0, offsetProfiles: {},
      activeIdx: -1, activeIdx2: -1,
      browserRate: 1, browserVolume: 1, browserMuted: false,
      viewMode: 'default', autoPause: false, playbackPolicy: 'normal',
      autoFollow: true, mergeCont: false, subStyle: null, subBottom: 0, sub2Top: 0,
      subRole: 'source', sub2Role: 'translation', mediaKey: 'mk',
      ...overrides.player,
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src + `
    this.key = localSyncProfileKey;
    this.set = setLocalSyncProfileValue;
    this.apply = applyLocalSyncProfile;
    this.capture = captureWatchPrefs;
    this._el = (id) => ${'$'}(id);`, ctx);
  return ctx;
}

test('profil anahtarı kanal + ses izi + dosya yolunu içerir', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/media/a.en.srt';
  ctx.player.sub2Path = '/media/a.tr.srt';
  assert.equal(ctx.key(false), 'p||/media/a.en.srt');
  assert.equal(ctx.key(true), 's||/media/a.tr.srt');
  ctx._el('playerAudioLang').value = 'tr';
  assert.equal(ctx.key(false), 'p|tr|/media/a.en.srt');
  ctx.player.subPath = '';
  assert.equal(ctx.key(false), '');
});

test('web modunda profil no-op — kayıtlar subtitleSyncRecords tarafında yaşar', () => {
  const ctx = mkCtx();
  ctx.player.workspaceMode = 'browser';
  ctx.player.subPath = '/a.srt';
  assert.equal(ctx.key(false), '');
  ctx.apply(false, true);
  assert.equal(ctx.player.offset, 0);
});

test('kayıtlı profil geri uygulanır (birincil ve ikinci kanal)', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/a.srt'; ctx.player.sub2Path = '/b.srt';
  ctx.player.offsetProfiles['p||/a.srt'] = -1.5;
  ctx.player.offsetProfiles['s||/b.srt'] = 0.8;
  ctx.apply(false, false);
  assert.equal(ctx.player.offset, -1.5);
  assert.equal(ctx._el('subOffset').value, '-1.5');
  ctx.apply(true, false);
  assert.equal(ctx.player.offset2, 0.8);
  assert.equal(ctx._el('sub2Offset').value, '0.8');
});

test('parça değişimi: profilsiz yeni dosya 0 başlar — eski kayma sızmaz', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/b.srt';           // yeni dosya (kayıtsız)
  ctx.player.offset = -1.5;                // önceki dosyanın gecikmesi
  ctx.apply(false, /* isSwitch */ true);
  assert.equal(ctx.player.offset, 0);
  ctx.player.sub2Path = '/c.srt';
  ctx.player.offset2 = 2.0;                // önceki ikinci dosyanın gecikmesi
  ctx.apply(true, true);
  assert.equal(ctx.player.offset2, 0);
});

test('ilk yüklemede legacy prefs.offset korunur (geriye uyumluluk)', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/a.srt';
  ctx.player.offset = -2.3;                // prefs.offset'ten geri gelen
  ctx.apply(false, /* isSwitch */ false);  // ilk yükleme, geçiş değil
  assert.equal(ctx.player.offset, -2.3);
});

test('ayar yazımı sıfır-olmayanı saklar, sıfırı siler', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/a.srt'; ctx.player.sub2Path = '/b.srt';
  ctx.player.offset = -1.5; ctx.set(false);
  ctx.player.offset2 = 0.4; ctx.set(true);
  assert.equal(ctx.player.offsetProfiles['p||/a.srt'], -1.5);
  assert.equal(ctx.player.offsetProfiles['s||/b.srt'], 0.4);
  ctx.player.offset = 0; ctx.set(false);   // sıfıra çekince profil kalkar
  assert.equal(ctx.player.offsetProfiles['p||/a.srt'], undefined);
});

test('farklı ses parçası ayrı profil alır', () => {
  const ctx = mkCtx();
  ctx.player.subPath = '/a.srt';
  ctx._el('playerAudioLang').value = 'eng';
  ctx.player.offset = 1.0; ctx.set(false);
  ctx._el('playerAudioLang').value = 'tur';
  ctx.apply(false, false);                 // tur parçası için profil yok → ilk yükleme: mevcut
  assert.equal(ctx.player.offset, 1.0);
  ctx.player.offset = -0.5; ctx.set(false);
  assert.equal(ctx.player.offsetProfiles['p|eng|/a.srt'], 1.0);
  assert.equal(ctx.player.offsetProfiles['p|tur|/a.srt'], -0.5);
});

test('captureWatchPrefs offset2 ve offsetProfiles alanlarını taşır', () => {
  const ctx = mkCtx();
  ctx.player.offset = -1.5; ctx.player.offset2 = 0.4;
  ctx.player.offsetProfiles = { 'p||/a.srt': -1.5 };
  const prefs = ctx.capture();
  assert.equal(prefs.offset, -1.5);
  assert.equal(prefs.offset2, 0.4);
  assert.equal(JSON.stringify(prefs.offsetProfiles), JSON.stringify({ 'p||/a.srt': -1.5 }));
  prefs.offsetProfiles['p||/a.srt'] = 99;  // kopya olduğu doğrulanır
  assert.equal(ctx.player.offsetProfiles['p||/a.srt'], -1.5);
});

test('prefs/snapshot geri yükleme kod yolları kaynakta var', () => {
  assert.match(renderer, /prefs\.offsetProfiles/);
  assert.match(renderer, /saved\.offsetProfiles/);
  assert.match(renderer, /saved\.offset2/);
  assert.match(renderer, /player\.offsetProfiles = \{\};/); // yeni medyada sıfırlanır
});

test('R30 confirmed HLS audio applies both channels and separates same-language variants',()=>{
 const ctx=mkCtx({player:{subPath:'A.srt',sub2Path:'A.tr.srt',offset:2,offset2:4,offsetProfiles:{'p|tr|A.srt':-3,'s|tr|A.tr.srt':-4}}});let switched;const hls={audioTrack:0,audioTracks:[{id:0,lang:'en',name:'English'},{id:1,lang:'tr',name:'Turkish'},{id:2,lang:'tr',name:'Commentary'}],on:(_event,fn)=>switched=fn};ctx.player.hls=hls;Object.assign(ctx,{hls,Hls:{Events:{AUDIO_TRACK_SWITCHED:'switched'}},normalizeAudioLang:x=>x,updateAudioLockStatus(){}});const start=renderer.indexOf('  hls.on(Hls.Events.AUDIO_TRACK_SWITCHED,'),end=renderer.indexOf('  hls.on(Hls.Events.MEDIA_ATTACHED,',start);vm.runInContext(renderer.slice(start,end),ctx);switched();hls.audioTrack=1;switched();assert.equal(ctx.player.offset,0,'ambiguous legacy TR profile does not identify a variant');assert.equal(ctx.player.offset2,0);ctx.player.offset=-3;ctx.player.offset2=-4;ctx.set(false);ctx.set(true);const key=ctx.key(false);hls.audioTrack=2;switched();assert.notEqual(ctx.key(false),key);assert.equal(ctx.player.offset,0);assert.equal(ctx.player.offset2,0);hls.audioTrack=1;switched();assert.equal(ctx.player.offset,-3);assert.equal(ctx.player.offset2,-4);ctx.player.offsetProfiles={'p|tr|A.srt':-7,'s|tr|A.tr.srt':-8};hls.audioTracks=hls.audioTracks.slice(0,2);hls.audioTrack=0;switched();hls.audioTrack=1;switched();assert.equal(ctx.player.offset,-7,'unique-language legacy profile remains compatible');assert.equal(ctx.player.offset2,-8);ctx.player.hls={audioTrack:0};hls.audioTrack=0;switched();assert.equal(ctx.player.offset,-7,'event from retired HLS owner is ignored');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

{
 const m=require('../src/renderer/subtitle-work-status'),saved={'p|hls:main-en|primary.srt':1.2,'s|hls:main-en|translation.srt':1.4,'p|hls:commentary-en|primary.srt':3.5,'s|hls:commentary-en|translation.srt':4,'p|hls:main-en|other.srt':9},before=JSON.stringify(saved),rows=m.profiles(saved,'primary.srt','translation.srt','hls:main-en');assert.equal(rows.length,2);assert.equal(rows[0].current,true);assert.equal(rows[0].secondary,1.4);assert.equal(rows[1].current,false);assert.equal(rows[1].primary,3.5);assert.equal(JSON.stringify(saved),before);
}
