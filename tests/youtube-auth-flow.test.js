'use strict';

/**
 * R126 — YouTube auth akış yarışları (N1, N3, N6).
 *
 * src/main.js içindeki IPC handler gövdeleri vm sandbox'ında koşulur —
 * Electron süreci gerekmez; ipcMain/mediaJobs/runYoutubeCommand/youtubeSession
 * hepsi sahte. Doğrulananlar:
 * - N1: poll uçuştayken iptal (_ytDevice=null) — geç resolve olan başarı
 *   sonucu hayalet hesap + persist üretmemeli, TypeError vermemeli.
 * - N3: accountRemove dolu auth slotunu öldürüp revoke'a yer açmalı —
 *   slot doluyken revoke "zaten çalışıyor" reddiyle sessizce atlanıyordu.
 * - N6: youtube:browse slot beklemesi süreç 'close' olayıyla çıkmalı
 *   (150ms uyku-poll yerine olay odaklı).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const accounts = require('../src/youtube-accounts');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

function slice(fromMarker, toMarker) {
  const start = source.indexOf(fromMarker);
  assert.ok(start >= 0, `marker yok: ${fromMarker}`);
  const end = source.indexOf(toMarker, start);
  assert.ok(end > start, `son marker yok: ${toMarker}`);
  return source.slice(start, end);
}

// ipcMain.handle yakalayıcı: kayıtlı handler'ları isimle döndürür.
function ipcHarness(code) {
  const handlers = {};
  const context = {
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    authorizedBrowserSender: () => true,
    mediaJobs: { youtube: null, youtubeAuth: null },
    youtubeSession: { accounts: {}, activeId: '', clientId: 'cid', clientSecret: 'cs' },
    ytAccounts: accounts,
    ytActiveAccount: () => accounts.activeAccount(
      context.youtubeSession.accounts, context.youtubeSession.activeId),
    youtubeAuthEnv: () => ({}),
    youtubeSessionPayload: () => ({ ok: true }),
    persistYoutubeSession: () => { context.persisted.push(1); },
    persisted: [],
    _ytDevice: null,
    _ytAbortAuthFlow: () => true,
    _ytBrowseGenerations: new Map(),
    _ytBrowseTail: Promise.resolve(),
    terminateProcessTree: () => {},
    spawn: () => {},
    mainWindow: null,
    runYoutubeCommand: null, // test kurar
    console, setTimeout, clearTimeout, Promise, Date, String, Number,
    Math, JSON, Object, Array, Map,
  };
  vm.runInNewContext(code, context);
  return { context, handlers };
}

async function testN1() {
  // youtube:poll kesiti — 'youtube:logout' handler'ına kadar.
  const code = slice("ipcMain.handle('youtube:poll'", "ipcMain.handle('youtube:logout'");
  const h = ipcHarness(code);
  let resolvePoll;
  const pollPromise = new Promise((r) => { resolvePoll = r; });
  h.context.runYoutubeCommand = () => pollPromise;
  h.context._ytDevice = { deviceCode: 'dc', expiresAt: Date.now() + 600_000, interval: 3, tv: true };

  const out = h.handlers['youtube:poll']({});
  // Kullanıcı iptal eder / çıkış yapar → _ytDevice null olur.
  h.context._ytDevice = null;
  // Sonra geç resolve olan başarı: token döner ama oturum silinmişti.
  resolvePoll({ ok: true, data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } });
  const result = await out;
  assert.equal(result.ok, false, 'iptal sonrası başarı geç resolve ok:false dönmeli');
  assert.equal(h.context.persisted.length, 0, 'hayalet hesap persist edilmemeli');
  assert.deepEqual(h.context.youtubeSession.accounts, {}, 'hayalet hesap satırı olmamalı');
}

async function testN3() {
  // youtube:accountRemove kesiti — 'youtube:poll' handler'ına kadar.
  const code = slice("ipcMain.handle('youtube:accountRemove'", "ipcMain.handle('youtube:poll'");
  const h = ipcHarness(code);
  const calls = [];
  const killed = [];
  const fakeProc = new EventEmitter();
  h.context.mediaJobs.youtubeAuth = fakeProc; // dolu auth slotu (poll uçuşta)
  h.context.youtubeSession.accounts = {
    'a@b.c': { refreshToken: 'rt-victim', accessToken: 'at-victim', userName: 'A' },
  };
  h.context.youtubeSession.activeId = 'a@b.c';
  h.context._ytDevice = { deviceCode: 'x', tv: true };
  h.context.terminateProcessTree = (p) => {
    killed.push(p);
    if (h.context.mediaJobs.youtubeAuth === p) h.context.mediaJobs.youtubeAuth = null;
  };
  h.context.runYoutubeCommand = (args) => {
    calls.push(args.slice());
    return Promise.resolve({ ok: true, data: { remote_ok: true } });
  };
  const result = await h.handlers['youtube:accountRemove']({}, 'a@b.c');
  assert.equal(killed.length, 1, 'dolu auth slotu öldürülmedi — revoke reddedilirdi');
  assert.equal(calls.length, 1, 'revoke hiç koşmadı');
  assert.equal(calls[0][0], 'revoke', 'revoke komutu bekleniyor');
  assert.equal(result.remoteOk, true, 'remoteOk kaybedilmemeli');
  assert.equal(h.context._ytDevice, null, 'uçuşan cihaz akışı temizlenmeli');
  assert.equal(h.context.youtubeSession.activeId, '', 'hesap çıkarıldı — aktiflik sıfırlanmalı');
}

async function testN3_noSlot() {
  // Slot boşken de revoke normal koşmalı (regresyon: gereksiz kill yok).
  const code = slice("ipcMain.handle('youtube:accountRemove'", "ipcMain.handle('youtube:poll'");
  const h = ipcHarness(code);
  const calls = [];
  const killed = [];
  h.context.youtubeSession.accounts = { a: { refreshToken: 'r', userName: 'A' } };
  h.context.terminateProcessTree = (p) => killed.push(p);
  h.context.runYoutubeCommand = (args) => {
    calls.push(args[0]);
    return Promise.resolve({ ok: true, data: { remote_ok: true } });
  };
  const result = await h.handlers['youtube:accountRemove']({}, 'a');
  assert.equal(killed.length, 0, 'boş slotta kill olmamalı');
  assert.deepEqual(calls, ['revoke']);
  assert.equal(result.remoteOk, true);
}

async function testN6() {
  // youtube:browse kesiti — 'youtube:accountRemove' öncesindeki serialize yardımcısı
  // + handler gövdesi. mediaJobs.youtube dolu iken 'close' beklemeli.
  const start = source.indexOf('function ytBrowseSerialized');
  assert.ok(start >= 0);
  const end = source.indexOf("ipcMain.handle('youtube:logout'", start);
  const code = source.slice(start, end);
  const h = ipcHarness(code);
  const pending = new EventEmitter();
  h.context.mediaJobs.youtube = pending;
  const calls = [];
  h.context.runYoutubeCommand = (args) => { calls.push(args[0]); return Promise.resolve({ ok: true, data: {} }); };
  h.context.ensureYoutubeAccessToken = () => Promise.resolve('tok');
  const out = h.handlers['youtube:browse']({}, 'FEwhat_to_watch');
  // Emisyon olmadan 200ms bekleme — iş başlamamalı (slot dolu).
  const early = await Promise.race([
    out.then(() => 'resolved'),
    new Promise((r) => setTimeout(() => r('still-waiting'), 150)),
  ]);
  assert.equal(early, 'still-waiting', 'slot doluyken browse beklemede kalmalı');
  assert.equal(calls.length, 0, 'slot boşalmadan komut başlatılmamalı');
  // Süreç kapanır → bekleme çıkıp komut koşmalı.
  h.context.mediaJobs.youtube = null;
  pending.emit('close');
  const result = await out;
  assert.equal(result.ok, true);
  assert.equal(calls[0], 'browse');
}

(async () => {
  const tests = [testN1, testN3, testN3_noSlot, testN6];
  let passed = 0;
  for (const t of tests) {
    try { await t(); passed++; console.log(`PASS ${t.name}`); }
    catch (e) { console.error(`FAIL ${t.name}: ${e.stack || e.message}`); }
  }
  console.log(`youtube-auth-flow: ${passed}/${tests.length} geçti`);
  process.exit(passed === tests.length ? 0 : 1);
})();
