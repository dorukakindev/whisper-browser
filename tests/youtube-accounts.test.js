'use strict';

/**
 * R120 — YouTube çoklu-hesap deposu (src/youtube-accounts.js) birim testleri.
 *
 * Sözleşme:
 * - migrateSecrets: eski flat şema -> accounts map; bozuk JSON güvenli düşer.
 * - upsertAccount: email>name>fallback id; refresh_token'siz grant ephemeral.
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
  let r = yt.upsertAccount(acc, '', { refreshToken: 'rt', userName: 'Ahmet', userEmail: 'a@b.c' });
  assert.strictEqual(r.id, 'a@b.c');
  r = yt.upsertAccount(acc, '', { refreshToken: 'rt2', userName: 'Ahmet', userEmail: 'a@b.c' });
  assert.strictEqual(Object.keys(acc).length, 1, 'tekrar giriş yeni satır üretmez');
  assert.strictEqual(acc['a@b.c'].refreshToken, 'rt2');
  r = yt.upsertAccount(acc, '', { refreshToken: 'rt3', userName: 'İkinci' });
  assert.strictEqual(r.id, 'İkinci'.toLowerCase());
});

test('upsert: refresh_token yoksa ephemeral=true, oturum yine açılır', () => {
  const acc = {};
  const r = yt.upsertAccount(acc, '', {
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

for (const t of tests) {
  try { t.fn(); passed++; }
  catch (e) { console.error(`FAIL ${t.name}: ${e.message}`); }
}
console.log(`youtube-accounts: ${passed}/${tests.length} geçti`);
process.exit(passed === tests.length ? 0 : 1);
