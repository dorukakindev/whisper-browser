// Kuyruk-50 madde 24 — canlı ASR ses parçası/dil değişimi takipçisi kilitleri.
const assert = require('assert');
const { createLiveAsrAudioSwitch } = require('../src/live-asr-audio-switch');

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// İlk dil gözlenene kadar kararsız
{
  const s = createLiveAsrAudioSwitch();
  const r = s.observe('');
  check('boş dil → stable, dil boş', r.action === 'stable' && r.language === '');
  const r2 = s.observe('en');
  check('ilk dil gözlenir → stable en', r2.action === 'stable' && r2.language === 'en' && r2.streamSeq === 1);
}

// Aynı dil sürekli → stable
{
  const s = createLiveAsrAudioSwitch();
  s.observe('tr'); s.observe('tr');
  const r = s.observe('tr');
  check('sürekli aynı dil → stable', r.action === 'stable' && r.streamSeq === 1);
}

// Tek seferlik sapma iz bölmez (pending), geri dönüşte sıfırlanır
{
  const s = createLiveAsrAudioSwitch();
  s.observe('en'); s.observe('en');
  const p = s.observe('de');
  check('tek sapma → pending, seq sabit', p.action === 'pending' && p.streamSeq === 1);
  const back = s.observe('en');
  check('eski dile dönüş → pending sıfırlanır', back.action === 'stable' && s.snapshot().pendingCount === 0);
  const p2 = s.observe('de');
  check('yeni tek sapma yeniden sayar', p2.action === 'pending' && s.snapshot().pendingCount === 1);
}

// Ardışık 2 farklı dil → switch + seq artışı; sonrası yeni dilde stable
{
  const s = createLiveAsrAudioSwitch();
  s.observe('en'); s.observe('en');
  s.observe('de'); // pending 1
  const sw = s.observe('de'); // pending 2 → switch
  check('2 ardışık farklı dil → switch', sw.action === 'switch' && sw.language === 'de' && sw.streamSeq === 2);
  const r = s.observe('de');
  check('değişim sonrası yeni dil stable', r.action === 'stable' && r.language === 'de');
}

// İkinci değişim seq'i tekrar artırır
{
  const s = createLiveAsrAudioSwitch();
  s.observe('en'); s.observe('tr'); s.observe('tr'); // → switch seq2
  s.observe('en'); s.observe('en');
  check('geri değişim → seq 3', s.snapshot().streamSeq === 3 && s.snapshot().observedLanguage === 'en');
}

// Farklı yeni diller ardışık sayılmaz (de→fr→de sayacı sıfırlar)
{
  const s = createLiveAsrAudioSwitch();
  s.observe('en');
  s.observe('de'); // pending de:1
  s.observe('fr'); // pending fr:1 (de sayacı sıfırlandı)
  const r = s.observe('de'); // pending de:1 tekrar
  check('dönüşümlü sapmalar switch yapmaz', r.action === 'pending' && s.snapshot().streamSeq === 1);
}

// Büyük/küçük harf ve boşluk normalize edilir
{
  const s = createLiveAsrAudioSwitch();
  s.observe(' EN ');
  const p = s.observe('en');
  check('normalize dil eşleşmesi', p.action === 'stable' && p.language === 'en');
}

// Geçersiz karakterler süzülür; boş gözlem durumu değiştirmez
{
  const s = createLiveAsrAudioSwitch();
  s.observe('tr');
  const r = s.observe('123!@#');
  check('geçersiz dil gözlemi yok sayılır', r.action === 'stable' && s.snapshot().observedLanguage === 'tr');
}

// minConsecutive yapılandırılabilir
{
  const s = createLiveAsrAudioSwitch(3);
  s.observe('en');
  s.observe('de'); s.observe('de');
  check('eşik 3 iken 2 sapma pending kalır', s.snapshot().streamSeq === 1);
  const sw = s.observe('de');
  check('3. ardışık → switch', sw.action === 'switch' && sw.streamSeq === 2);
}

// pending parça eski streamSeq'te kalır (kontaminasyon yönü: yeni dil eski izde tek cue — eski dil yeni izde asla)
{
  const s = createLiveAsrAudioSwitch();
  s.observe('en'); s.observe('en');
  const p = s.observe('de');
  check('pending cue eski seq\'te', p.streamSeq === 1);
}

console.log(`live-asr-audio-switch: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
