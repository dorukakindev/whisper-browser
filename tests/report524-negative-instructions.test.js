const assert=require('node:assert/strict');
const {safeShortening:safe}=require('../src/dub-text-guard');
for(const natural of [false,true]) {
 for(const [source,wrong] of [
  ['Bu kırmızı anahtara dokunmayın.','Bu kırmızı anahtara dokunun.'],
  ['Bu şartlarda devam etmemelisiniz.','Bu şartlarda devam etmelisiniz.'],
  ['Bu aygıtı çalıştırmayınız.','Bu aygıtı çalıştırınız.'],
 ]) assert.equal(safe(source,wrong,{natural}),false,`${source} -> ${wrong}`);
}
assert.equal(safe('Bu kırmızı anahtara sakın dokunmayın.','Sakın bu kırmızı anahtara dokunmayın.',{natural:true}),true);
assert.equal(safe('Bu şartlarda kesinlikle devam etmemelisiniz.','Kesinlikle bu şartlarda devam etmemelisiniz.',{natural:true}),true);
assert.equal(safe('Bu durumda motoru çalıştırmayın.','Bu durumda motoru çalıştırmayın.',{natural:true}),true);
console.log('report524: negative instructions are retained without blocking word order changes');
