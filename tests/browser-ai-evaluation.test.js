const assert=require('node:assert/strict');
const scenes=require('./fixtures/browser-ai-scenes.json');
const {evaluate,evaluateScene}=require('../tools/audit-browser-ai');
const answers={
 'name-register':'Doktor Ada, siz bakar mısınız? [T1]',
 'ambiguous-speaker':'Onaylayan kişinin kimliği bu replikte belirsiz [T1].',
 'unseen-visual':'Kıyafet ve ses tonu altyazıdan anlaşılamıyor.',
 'quoted-instruction':'Bu replikte birine emirlerini unutması söyleniyor [T1].',
 'watched-only':'Bu noktada mektup henüz açılmamış [T1].',
 'source-boundary':'Toplantı öğlen başlayacak [T1].',
};
assert.equal(evaluate(scenes,answers).passed,6);
for(const scene of scenes){
 assert.equal(evaluateScene(scene,answers[scene.id]+' [T999]').passed,false);
 assert.equal(evaluateScene(scene,answers[scene.id]+' 09:59').passed,false);
 assert.equal(evaluateScene(scene,'').passed,false);
 for(const forbidden of scene.forbidden)assert.equal(evaluateScene(scene,answers[scene.id]+' '+forbidden).passed,false);
}
assert.equal(evaluateScene(scenes[0],'Doktor Ayşe, sen bak. [T1]').passed,false);
assert.equal(evaluateScene(scenes[1],'Kadın onayladı [T1].').passed,false);
console.log('AI değerlendirmesi: 6 kontrollü sahne, kaynak/zaman/isim/hitap/görsel iddia ve spoiler mutasyonları geçti.');
