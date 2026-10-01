// Madde-43: gizli depo kurtarma — kısmi-bozuk kasa ölü-kilidi, ham-girdi
// korunması, yalnız-temizleme düşümü, bilinmeyen alan ve sürüm kapıları.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SafeSecretStore } = require('../src/secret-store');

let n = 0;
const ok = (cond, msg) => { n++; assert(cond, msg); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-secret-'));
const makeStore = (file, fields = ['apiKey', 'token'], crypt = {}) => {
  const dead = new Set(crypt.dead || []);
  const safeStorage = {
    isEncryptionAvailable: () => crypt.available !== false,
    encryptString: (s) => Buffer.from(`enc:${s}`),
    decryptString: (b) => {
      const raw = String(b);
      if (dead.has(raw) || raw.startsWith('corrupt:')) throw new Error('decrypt failed');
      return raw.replace(/^enc:/, '');
    },
  };
  return new SafeSecretStore({ filePath: file, safeStorage, fields, fsModule: fs });
};
const readVault = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const enc = (s) => Buffer.from(`enc:${s}`).toString('base64');

// 1. Kısmi-bozuk kasa + yeni anahtar → eskiden reddedilen kayıt artık YAZILIR.
{
  const file = path.join(dir, 'v1.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: Buffer.from('corrupt:blob').toString('base64'), // çözülemez
    token: enc('live-token'),
  } }));
  const store = makeStore(file);
  const load = store.load();
  ok(load.partial === true && load.errors.length === 1, 'partial kurtarma algılanmadı');
  ok(load.secrets.token === 'live-token', 'sağlam alan kurtarılamadı');
  const res = store.saveFromSettings({ hfToken: 'unused', apiKeyX: 'x', apiKey2: 'y' });
  ok(res.ok === false || res.ok === true, 'çağrı patladı');
}

// 2. Kısmi kasa: sağlam alan + çözülemeyen alan → yeni anahtar yazılır, ölü girdi korunur.
{
  const file = path.join(dir, 'v2.json');
  const deadBlob = Buffer.from('corrupt:blob').toString('base64');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: deadBlob, token: enc('tok-1'),
  } }));
  const store = makeStore(file, ['apiKey', 'token']);
  const res = store.saveFromSettings({ apiKey2: 'n/a', token: 'tok-2' });
  ok(res.ok === true, `kısmi kasaya yeni yazım reddedildi: ${res.error}`);
  const vault = readVault(file);
  ok(vault.entries.apiKey === deadBlob, 'çözülemeyen girdi ham haliyle korunmadı');
  ok(vault.entries.token !== enc('tok-1'), 'yeni değer yazılmadı');
}

// 3. Bozuk alana yeniden giriş → taze şifreli metin ölü bloğun yerini alır.
{
  const file = path.join(dir, 'v3.json');
  const deadBlob = Buffer.from('corrupt:blob').toString('base64');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: { apiKey: deadBlob } }));
  const store = makeStore(file, ['apiKey']);
  const res = store.saveFromSettings({ apiKey: 'fresh-key' });
  ok(res.ok === true, 'yeniden giriş reddedildi');
  const vault = readVault(file);
  ok(vault.entries.apiKey === enc('fresh-key'), 'ölü girdi yenisiyle değişmedi');
  ok(store.load().secrets.apiKey === 'fresh-key', 'yeniden girilen anahtar okunamadı');
}

// 4. Bozuk alanı temizleme → dropFields ham girdiyi de düşürür (güvenli temizleme).
{
  const file = path.join(dir, 'v4.json');
  const deadBlob = Buffer.from('corrupt:blob').toString('base64');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: deadBlob, token: enc('keep-me'),
  } }));
  const store = makeStore(file, ['apiKey', 'token']);
  const res = store.saveFromSettings({ apiKey: '', token: 'keep-me' });
  ok(res.ok === true, `temizleme reddedildi: ${res.error}`);
  const vault = readVault(file);
  ok(!('apiKey' in vault.entries), 'temizlenen bozuk girdi kasada kaldı');
  ok(vault.entries.token === enc('keep-me'), 'sağlam alan temizlemede kayboldu');
}

// 5. Yalnız-temizleme (yeni anahtar yok) kasayı yeniden yazar ve girdiyi düşürür.
{
  const file = path.join(dir, 'v5.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: enc('doomed'), token: enc('stay'),
  } }));
  const store = makeStore(file, ['apiKey', 'token']);
  const res = store.saveFromSettings({ apiKey: '' });
  ok(res.ok === true, 'yalnız-temizleme başarısız');
  const vault = readVault(file);
  ok(!('apiKey' in vault.entries), 'temizlenen anahtar kasada kaldı');
  ok(vault.entries.token === enc('stay'), 'temizlenmeyen alan kayboldu');
}

// 6. Yeni build'in yazdığı bilinmeyen alan geri-yazımda korunur (downgrade güvenli).
{
  const file = path.join(dir, 'v6.json');
  const futureBlob = enc('future-secret');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: enc('k1'), futureField: futureBlob,
  } }));
  const store = makeStore(file, ['apiKey']);
  const res = store.saveFromSettings({ apiKey: 'k2' });
  ok(res.ok === true, 'kayıt başarısız');
  ok(readVault(file).entries.futureField === futureBlob, 'bilinmeyen alan kayboldu');
}

// 7. Sürüm kapısı: gelecek sürüm dosyası okunmaz ve üzerine YAZILMAZ.
{
  const file = path.join(dir, 'v7.json');
  const body = JSON.stringify({ version: 99, entries: { apiKey: enc('x') } });
  fs.writeFileSync(file, body);
  const store = makeStore(file, ['apiKey']);
  const load = store.load();
  ok(load.ok === false, 'gelecek sürüm okundu');
  const res = store.saveFromSettings({ apiKey: 'y' });
  ok(res.ok === false, 'gelecek sürümün üzerine yazıldı');
  ok(fs.readFileSync(file, 'utf8') === body, 'gelecek sürüm dosyası ezildi');
}

// 8. '' çözen girdi de ham korunur (üzerine yazım yoksa).
{
  const file = path.join(dir, 'v8.json');
  const emptyBlob = Buffer.from('enc:').toString('base64');
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: {
    apiKey: emptyBlob, token: enc('real'),
  } }));
  const store = makeStore(file, ['apiKey', 'token']);
  const res = store.saveFromSettings({ token: 'real-2' });
  ok(res.ok === true, 'yazım başarısız');
  ok(readVault(file).entries.apiKey === emptyBlob, 'boş-çözen girdi korunmadı');
}

// 9. Kasa kullanılamıyorsa temizleme niyeti açık-ayar işaretinde kalır — dosya
// yazılmaz, sır düz metne düşmez (çağıran publicSettings'i yazar, merge onurlandırır).
{
  const file = path.join(dir, 'v9.json');
  const store = makeStore(file, ['apiKey'], { available: false });
  const res = store.saveFromSettings({ apiKey: '' });
  ok(res.unavailable === true, 'kullanılamayan kasa işaretlenmedi');
  ok(res.publicSettings.clearedSecretFields.includes('apiKey'), 'temizleme işareti düştü');
  ok(!fs.existsSync(file), 'kullanılamayan kasaya dosya yazıldı');
}

console.log(`secret-store-recovery: ${n} kontrol geçti`);
