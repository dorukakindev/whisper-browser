const assert = require('node:assert/strict');
const {safeShortening:safe} = require('../src/dub-text-guard');
for (const [negative,positive] of [['gelmezsen','gelirsen'],['gelmezsek','gelirsek'],['yapmazsan','yaparsan'],['bakmazsanız','bakarsanız'],['okuyamazsan','okuyabilirsen'],['veremezsem','verebilirsem'],['gelmezseler','gelirlerse'],['gelmezse','gelirse']]) {
  const source=`Yarın toplantıya ${negative} bu önemli dosyaları sana ayrıca e-posta üzerinden göndereceğim.`;
  const changed=source.replace(negative,positive);
  assert.equal(safe(source,changed,{natural:true}),false,source);
  assert.equal(safe(changed,source,{natural:true}),false,changed);
  assert.equal(safe(source,source,{natural:true}),true,source);
}
assert.equal(safe('Bu uzun bir cümledir.', 'Bu bir cümle.'),true);
assert.equal(safe('12 kişi, 12 saat bekledi.', '12 kişi bekledi.'),false);
assert.equal(safe('Ankara’da hiç kimse yok.', 'İzmir’de kimse yok.'),false);
assert.equal(safe('Bu doğru değil.', 'Bu doğru.'),false);
assert.equal(safe('12 kişi geldi.', '13 kişi geldi.'),false);
console.log('dub-text-guard: repeated numbers, names and explicit negation preserved');

assert.equal(safe('Bunun olması mümkün değil.', 'Bu mümkün değil.', {natural:true}),true);
assert.equal(safe('Bu mümkün değil, o da değil.', 'Bu mümkün değil.', {natural:true}),false);
assert.equal(safe('Bugün Ankara soğuk.', 'Bugün hava soğuk.', {natural:true}),false);
assert.equal(safe('12 kişi, 12 saat bekledi.', '12 kişi bekledi.', {natural:true}),false);

assert.equal(safe('Bu sonuç kesin doğrudur.', 'Bu sonuç doğru değil.', {natural:true}),false,'added negation reverses meaning');

assert.equal(safe('Dur! Bu mümkün değil.', 'Dur. Bu mümkün değil.', {natural:true}), false);
assert.equal(safe('Belki... henüz bilmiyoruz.', 'Belki, henüz bilmiyoruz.', {natural:true}), false);
assert.equal(safe('Belki... henüz bilmiyoruz.', 'Belki… henüz bilmiyoruz.', {natural:true}), true);
assert.equal(safe('Bu uzun bir cümledir.', 'Bu bir cümle!', {natural:true}), false);

for (const [a,b] of [['Ben gitmem.','Ben giderim.'],['Bunu yapamam.','Bunu yaparım.'],['Oraya gitme.','Oraya git.'],['Böyle olmasın.','Böyle olsun.'],['Bunu veremem.','Bunu veririm.'],['Ben gidemem.','Ben giderim.'],['Bunu okuyamam.','Bunu okurum.']]) {
  assert.equal(safe(a,b,{natural:true}),false,a);
  assert.equal(safe(b,a,{natural:true}),false,b);
}
for (const [a,b] of [['Elma çok lezzetli.','Elma lezzetli.'],['Bu çalışma çok güzel.','Bu çalışma güzel.'],['Bu dondurma çok güzel.','Bu dondurma güzel.'],['Ben gitmem.','Gitmem.']]) assert.equal(safe(a,b,{natural:true}),true,a);

for (const [a,b] of [['Gelmeden gitti.','Gelip gitti.'],['Okumadan konuştu.','Okuyup konuştu.'],['Gelmeksizin gitti.','Gelip gitti.'],['Gelmeyince gitti.','Gelince gitti.']]) {
  assert.equal(safe(a,b,{natural:true}),false,a);
  assert.equal(safe(b,a,{natural:true}),false,b);
  assert.equal(safe(a,a,{natural:true}),true,a);
}
