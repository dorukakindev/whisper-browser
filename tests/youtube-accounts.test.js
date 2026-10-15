'use strict';

/**
 * R120 — YouTube çoklu-hesap deposu (src/youtube-accounts.js) birim testleri.
 *
 * Sözleşme:
 * - migrateSecrets: eski flat şema -> accounts map; bozuk JSON güvenli düşer.
 * - upsertAccount: email>name>userId>'unknown' id; refresh_token'siz grant
 *   ephemeral; expiresIn 0/NaN/negatifte 3600 varsayılır (N4).
 * - removeAccount: aktif silinince sıradaki hesap aktifleşir.
 * - activeAccount: refresh_token veya geçerli ephemeral access_token şart.
 * - accountList: renderer'a token/secret sızdırmaz.
 */

const assert = require('assert');
const yt = require('../src/youtube-accounts');

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('migrate: flat refresh_token tek hesaba taşınır', () => {
  const m = yt.migrateSecrets({
    client_id: 'cid', client_secret: 'cs',
    refresh_token: 'rt-1', user_name: 'Ahmet', user_email: 'a@b.c', auth_mode: 'tv',
  });
  assert.strictEqual(m.activeId, 'a@b.c');
  const a = m.accounts['a@b.c'];
  assert.ok(a, 'hesap var');
  assert.strictEqual(a.refreshToken, 'rt-1');
  assert.strictEqual(a.userName, 'Ahmet');
  assert.strictEqual(a.authMode, 'tv');
});

test('migrate: accounts JSON + active_id okunur; boşluk güvenli', () => {
  const accounts = {
    'a@x.c': { refreshToken: 'r1', userName: 'A', authMode: 'tv' },
    'b@x.c': { refreshToken: 'r2', userName: 'B', authMode: 'tv' },
  };
  const m = yt.migrateSecrets({ accounts: JSON.stringify(accounts), active_id: 'b@x.c' });
  assert.strictEqual(Object.keys(m.accounts).length, 2);
  assert.strictEqual(m.activeId, 'b@x.c');
  // Bozuk blob + geçersiz active -> ilk hesap
  const m2 = yt.migrateSecrets({ accounts: '{bozuk', active_id: 'yok' });
  assert.deepStrictEqual(m2.accounts, {});
  const m3 = yt.migrateSecrets({ accounts: JSON.stringify(accounts), active_id: 'yok' });
  assert.strictEqual(m3.activeId, 'a@x.c');
});

test('upsert: id email önce, yoksa name; aynı hesap tekrar girişte birleşir', () => {
  const acc = {};
  let r = yt.upsertAccount(acc, { refreshToken: 'rt', userName: 'Ahmet', userEmail: 'a@b.c' });
  assert.strictEqual(r.id, 'a@b.c');
  r = yt.upsertAccount(acc, { refreshToken: 'rt2', userName: 'Ahmet', userEmail: 'a@b.c' });
  assert.strictEqual(Object.keys(acc).length, 1, 'tekrar giriş yeni satır üretmez');
  assert.strictEqual(acc['a@b.c'].refreshToken, 'rt2');
  r = yt.upsertAccount(acc, { refreshToken: 'rt3', userName: 'İkinci' });
  assert.strictEqual(r.id, 'İkinci'.toLowerCase());
});

test('upsert: kimliksiz giriş kararlı acct-unknown id altında birleşir — yetim satır yok (N2)', () => {
  const acc = {};
  // _fetch_me başarısız → name/email/id yok; iki giriş aynı satıra yazmalı.
  let r = yt.upsertAccount(acc, { refreshToken: 'rt1', userName: '', userEmail: '', userId: '' });
  assert.strictEqual(r.id, 'acct-unknown');
  r = yt.upsertAccount(acc, { refreshToken: 'rt2', userName: '', userEmail: '', userId: '' });
  assert.strictEqual(Object.keys(acc).length, 1, 'ikinci kimliksiz giriş ayrı satır üretmemeli');
  assert.strictEqual(acc['acct-unknown'].refreshToken, 'rt2');
  // Kanal id'si varsa kalıcı kimlik o olur (isim değişse bile aynı satır).
  r = yt.upsertAccount(acc, { refreshToken: 'rt3', userName: '', userEmail: '', userId: 'UC-abc' });
  assert.strictEqual(r.id, 'acct-UC-abc');
  r = yt.upsertAccount(acc, { refreshToken: 'rt4', userName: '', userEmail: '', userId: 'UC-abc' });
  assert.strictEqual(r.id, 'acct-UC-abc');
});

test('upsert: expiresIn=0 şimdi doluyor; NaN/negatif güvenli yedeğe düşer (N4)', () => {
  const acc = {};
  // Zaman sınırları çağrı öncesi VE sonrası anlara göre ölçülür — upsert'in kendi
  // Date.now()'u ikisi arasındadır; tek 'before' referansı 1ms'lik gecikmede
  // üst sınırı aşıp (3600001ms) flaky kırılırdı (CI windows'ta gözlendi).
  const b0 = Date.now();
  const r0 = yt.upsertAccount(acc, { accessToken: 'at', expiresIn: 0, userId: 'u0' });
  const a0 = Date.now();
  assert.ok(acc[r0.id].expiresAt >= b0 && acc[r0.id].expiresAt <= a0,
    'expiresIn=0 "şimdi doluyor" demek — çağrı anında dolmalı, 3600 varsayımına sessizce düşmemeli');
  assert.strictEqual(yt.activeAccount(acc, r0.id), null, 'süresi dolmuş ephemeral aktif sayılmaz');
  const b1 = Date.now();
  const r1 = yt.upsertAccount(acc, { accessToken: 'at', expiresIn: 'NaN-degil', userId: 'u1' });
  const a1 = Date.now();
  // expiresAt = upsertAnı + 3600000; upsertAnı b1..a1 arasında →
  // alt sınır b1'e (gecikme yönünde genişler), üst sınır a1'e göre.
  assert.ok(acc[r1.id].expiresAt - b1 > 3000 * 1000 && acc[r1.id].expiresAt - a1 <= 3600 * 1000,
    `geçersiz expiresIn -> ~3600s yedek, ${acc[r1.id].expiresAt - b1}ms`);
  const b2 = Date.now();
  const r2 = yt.upsertAccount(acc, { accessToken: 'at', expiresIn: -50, userId: 'u2' });
  const a2 = Date.now();
  assert.ok(acc[r2.id].expiresAt - b2 > 3000 * 1000 && acc[r2.id].expiresAt - a2 <= 3600 * 1000,
    `negatif expiresIn -> ~3600s yedek, ${acc[r2.id].expiresAt - b2}ms`);
  const b3 = Date.now();
  const r3 = yt.upsertAccount(acc, { accessToken: 'at', expiresIn: 120, userId: 'u3' });
  const a3 = Date.now();
  assert.ok(acc[r3.id].expiresAt - b3 >= 120 * 1000 && acc[r3.id].expiresAt - a3 <= 120 * 1000,
    `expiresIn=120 saygı görmeli, ${acc[r3.id].expiresAt - b3}ms`);
});

test('upsert: refresh_token yoksa ephemeral=true, oturum yine açılır', () => {
  const acc = {};
  const r = yt.upsertAccount(acc, {
    refreshToken: '', accessToken: 'at-x', expiresIn: 3600,
    userName: 'Geçici', userEmail: 'g@h.i', authMode: 'tv',
  });
  assert.strictEqual(acc['g@h.i'].ephemeral, true);
  assert.ok(yt.activeAccount(acc, 'g@h.i'), 'ephemeral oturum aktif sayılır');
});

test('activeAccount: süresi dolmuş ephemeral null döner', () => {
  const acc = {
    e: { refreshToken: '', accessToken: 'at', expiresAt: Date.now() - 1000,
         userName: '', userEmail: '', authMode: 'tv', ephemeral: true },
  };
  assert.strictEqual(yt.activeAccount(acc, 'e'), null);
});

test('removeAccount: aktif silinince sıradaki aktifleşir; son hesap boşaltır', () => {
  const acc = {
    a: { refreshToken: 'r1' }, b: { refreshToken: 'r2' },
  };
  let active = yt.removeAccount(acc, 'a', 'a');
  assert.strictEqual(active, 'b');
  assert.deepStrictEqual(Object.keys(acc), ['b']);
  active = yt.removeAccount(acc, 'b', 'b');
  assert.strictEqual(active, '');
  // Olmayan hesap silme — activeId değişmez
  const acc2 = { a: { refreshToken: 'r' } };
  assert.strictEqual(yt.removeAccount(acc2, 'a', 'yok'), 'a');
});

test('accountList: token/secret sızdırmaz, sıra/aktif doğru', () => {
  const acc = {
    'a@x.c': { refreshToken: 'rt-SECRET', accessToken: 'at-SECRET',
               userName: 'A', userEmail: 'a@x.c', authMode: 'tv', ephemeral: false },
  };
  const list = yt.accountList(acc, 'a@x.c');
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].active, true);
  const json = JSON.stringify(list);
  assert.ok(!json.includes('rt-SECRET') && !json.includes('at-SECRET'),
    'token renderer listesinde sızdı');
  for (const k of Object.keys(list[0])) {
    assert.ok(['id', 'userName', 'userEmail', 'active', 'ephemeral', 'stale'].includes(k),
      `beklenmeyen alan: ${k}`);
  }
});

test('persist: refresh grants survive restart without access tokens or ephemeral accounts', () => {
  const accounts = {
    saved: {refreshToken:'fixture-refresh',accessToken:'fixture-access',expiresAt:999,userName:'Fixture',authMode:'tv'},
    temporary: {accessToken:'temporary-access',ephemeral:true,expiresAt:Date.now()+100000},
  };
  const persistent = yt.persistableAccounts(accounts);
  assert.deepStrictEqual(Object.keys(persistent), ['saved']);
  assert(!JSON.stringify(persistent).includes('fixture-access'));
  assert(!JSON.stringify(persistent).includes('expiresAt'));
  const restored = yt.migrateSecrets({accounts:JSON.stringify(persistent),active_id:'saved'});
  assert.strictEqual(yt.activeAccount(restored.accounts, restored.activeId).refreshToken,'fixture-refresh');
});

test('main persist saves the exported account projection instead of silently failing', () => {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const start=source.indexOf('function persistYoutubeSession()'),end=source.indexOf('function restoreYoutubeSession()',start);
  let saved;
  vm.runInNewContext(source.slice(start,end)+';persistYoutubeSession()',{
    ytAccounts:yt,youtubeSession:{accounts:{a:{refreshToken:'fixture',accessToken:'must-not-persist'}},activeId:'a'},
    getYoutubeSessionStore:()=>({save:data=>{saved=data;}}),
  });
  assert(saved,'main persistence must reach the store');
  assert.strictEqual(JSON.parse(saved.accounts).a.refreshToken,'fixture');
  assert(!saved.accounts.includes('must-not-persist'));
});

for (const t of tests) {
  try { t.fn(); passed++; }
  catch (e) { console.error(`FAIL ${t.name}: ${e.message}`); }
}
console.log(`youtube-accounts: ${passed}/${tests.length} geçti`);
process.exit(passed === tests.length ? 0 : 1);
