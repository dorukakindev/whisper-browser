// player-loop-policy — öncelik, N=3 → iki geri seek, A–B 0.25, tampon/bekleyen seek, hover sahipliği.
const assert = require('node:assert');
const L = require('../src/player-loop-policy.js');

const cue = { id: 'c1', start: 10, end: 13 };
// 1) Toplam dinleme N=3: iki geri seek, sonra durur; sayaç yalnız teyitli seek ile ilerler
{
  let repeat = L.startRepeat('c1', 3); const seeks = [];
  for (let round = 0; round < 6; round++) {
    const a = L.nextLoopAction({ time: 13, cue, repeat });
    if (a.type !== 'seek') break;
    seeks.push(a.to); assert.strictEqual(a.countOnConfirm, true);
    repeat = L.confirmRepeatSeek({ repeat, cue, time: a.to + 0.1 });
  }
  assert.deepStrictEqual(seeks, [10, 10], 'iki geri seek');
  assert.strictEqual(repeat.heard, 3);
  assert.strictEqual(L.nextLoopAction({ time: 13, cue, repeat, autoPause: true }).type, 'pause', 'tekrar bitti → cue sonu durma');
  // Başarısız seek sayılmaz
  const r0 = L.startRepeat('c1', 3);
  assert.strictEqual(L.confirmRepeatSeek({ repeat: r0, cue, time: 13.0 }).heard, 1, 'hedefe geçmediyse ilerlemez');
  assert.strictEqual(L.startRepeat('c1', 7).total, 3, 'geçersiz N → 3');
}
// 2) A–B aktifken cue sayacı ilerlemez; B'de A'ya sarar; dışarı seek döngüyü kapatır
{
  const ab = { a: 10, b: 12 }; const repeat = L.startRepeat('c1', 3);
  assert.deepStrictEqual(L.nextLoopAction({ time: 12, ab, cue, repeat }), { type: 'seek', to: 10, reason: 'ab-loop', countOnConfirm: false });
  assert.strictEqual(L.nextLoopAction({ time: 11, ab, cue, repeat }).type, 'none');
  assert.strictEqual(L.nextLoopAction({ time: 40, ab, cue, repeat }).type, 'clear-ab');
  assert.strictEqual(L.nextLoopAction({ time: 1, ab, cue, repeat }).type, 'clear-ab');
}
// 3) Öncelik: kullanıcı komutu her şeyin önünde; tampon cue sonu sayılmaz; bekleyen seek varken eylem yok
{
  const ab = { a: 10, b: 12 };
  assert.strictEqual(L.nextLoopAction({ time: 12, ab, userCommand: true }).reason, 'user-command');
  assert.strictEqual(L.nextLoopAction({ time: 13, cue, repeat: L.startRepeat('c1', 3), buffering: true }).reason, 'buffering');
  assert.strictEqual(L.nextLoopAction({ time: 13, cue, autoPause: true, pendingSeek: true }).reason, 'seek-pending');
  assert.deepStrictEqual(L.PRIORITY, ['user-command', 'ab-loop', 'repeat', 'cue-end-pause', 'gap-policy']);
  assert.strictEqual(L.nextLoopAction({ time: 11, cue, autoPause: true }).type, 'none', 'cue ortasında durmaz');
}
// 4) A–B aralığı 0.25 dahil
{
  assert.ok(L.validateAbRange(1, 1.25)); assert.ok(!L.validateAbRange(1, 1.24)); assert.ok(!L.validateAbRange(NaN, 2)); assert.ok(!L.validateAbRange(0, 700, 600));
  assert.ok(L.validateAbRange(0, 600, 600));
}
// 5) Hover/odak duraklatma sahipliği
{
  let playing = true; let blocked = false; const log = [];
  const owner = L.createHoverPauseOwner({ enabled: () => true, isPlaying: () => playing, pause: () => { playing = false; log.push('pause'); }, play: () => { playing = true; log.push('play'); }, canResume: () => !blocked });
  owner.enter('word'); owner.enter('panel'); assert.deepStrictEqual(log, ['pause'], 'ikinci katman ikinci pause üretmez');
  owner.leave('word'); assert.deepStrictEqual(log, ['pause'], 'katman sayacı sıfırlanmadan resume yok');
  owner.leave('panel'); assert.deepStrictEqual(log, ['pause', 'play']);
  // Kullanıcı kendisi duraklatmışsa jeton alınmaz → çıkışta resume yok
  playing = false; log.length = 0; owner.enter('word'); owner.leave('word'); assert.deepStrictEqual(log, []);
  // Kullanıcı hover sırasında müdahale ederse resume yok
  playing = true; owner.enter('word'); owner.userIntervened(); owner.leave('word'); assert.deepStrictEqual(log, ['pause']);
  // Engel (hata/panel) varken resume yok; kaynak değişince sıfırlanır
  playing = true; log.length = 0; blocked = true; owner.enter('a'); owner.leave('a'); assert.deepStrictEqual(log, ['pause']);
  blocked = false; playing = true; owner.enter('a'); owner.sourceChanged(); assert.strictEqual(owner.layerCount, 0); assert.strictEqual(owner.owns, false);
  // Kapalı seçenek: hiçbir şey yapmaz
  const off = L.createHoverPauseOwner({ enabled: () => false, isPlaying: () => true, pause: () => log.push('X'), play: () => log.push('Y') });
  log.length = 0; off.enter('a'); off.leave('a'); assert.deepStrictEqual(log, []);
}
console.log('player-loop-policy.test.js: OK');
