'use strict';
// R334: auth/recovery/dosya-yetki fonksiyonları için deadzone kilitleri.
// local-file-access.js ve burnin-output.js saf Node modülleri — doğrudan
// require edilir; main.js fonksiyonları vm section'larıyla değerlendirilir.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const { SubtitleFileAccess, MediaFileAccess, canonicalLocalPath } = require('../src/local-file-access');
const burnin = require('../src/burnin-output');

function section(start, end) {
  const from = MAIN.indexOf(start);
  const to = end ? MAIN.indexOf(end, from + start.length) : MAIN.length;
  assert(from >= 0 && to > from, `section bulunamadı: ${start}`);
  return MAIN.slice(from, to);
}

function makeCtx(extra = {}) {
  const ctx = {
    fs, path, os, console, process, Buffer, URL, JSON, Math, Date, Number, Array, Object, Set, Map, Promise, RegExp, Error, TypeError, String, Boolean, Intl,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    require: Object.assign((m) => require(m), { resolve: (m) => require.resolve(m) }),
    app: { getPath: () => TEST_ROOT },
    __dirname: path.join(__dirname, '..', 'src'),
    ...extra,
  };
  return vm.createContext(ctx);
}

function evalAll(ctx, sections) {
  const src = sections.join('\n');
  vm.runInContext(`(function(){'use strict';\n${src}\n; return {` +
    collectExports(src).map((n) => `${n.replace(/[.\[\]]/g, '_')}: ${n}`).join(',') + '}; })()', ctx);
  return ctx;
}
// evalAll yerine doğrudan ctx üzerinden çağır — fonksiyonlar contextify edilir.
function defineIn(ctx, sections) {
  vm.runInContext(sections.join('\n'), ctx);
  return ctx;
}

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-authio-'));
const results = [];

function t(name, fn) {
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(() => { results.push(name); }).catch((e) => { console.error(`FAIL ${name}:`, e); process.exitCode = 1; }); results.push(name); }
  catch (e) { console.error(`FAIL ${name}:`, e); process.exitCode = 1; }
}
async function at(name, fn) {
  try { await fn(); results.push(name); }
  catch (e) { console.error(`FAIL ${name}:`, e); process.exitCode = 1; }
}

// ---------- 1. küçük yardımcılar ----------
function t_tiny_helpers() {
  const calls = [];
  const ctx = defineIn(makeCtx({
    powerSaveBlocker: { stop: (id) => calls.push(['stop', id]) },
    mainWindow: null,
    powerBlockerId: 7,
    jobLog: null,
  }), [
    section('function stopPowerBlocker()', '// Görev çubuğu'),
    section('function setTaskbarProgress(', 'function sendEvent('),
    section('function endJobLog()', '// ===== Oynatıcı'),
    section('function pidAlive(', 'function sweepOrphanOutputTransactions'),
    section('function backupOnce(', 'function writeSubtitleAtomic'),
  ]);
  vm.runInContext('stopPowerBlocker()', ctx);
  assert.strictEqual(JSON.stringify(calls), JSON.stringify([['stop', 7]]));
  assert.strictEqual(ctx.powerBlockerId, null);
  // powerBlockerId null → no-op
  vm.runInContext('stopPowerBlocker()', ctx);
  assert.strictEqual(calls.length, 1);
  // setTaskbarProgress: pencere yok → no-op; var → setProgressBar
  assert.doesNotThrow(() => vm.runInContext('setTaskbarProgress(0.5)', ctx));
  const prog = [];
  ctx.mainWindow = { isDestroyed: () => false, setProgressBar: (v) => prog.push(v) };
  vm.runInContext('setTaskbarProgress(0.42)', ctx);
  assert.strictEqual(JSON.stringify(prog), JSON.stringify([0.42]));
  ctx.mainWindow = { isDestroyed: () => true, setProgressBar: (v) => prog.push(v) };
  vm.runInContext('setTaskbarProgress(0.9)', ctx);
  assert.strictEqual(prog.length, 1, 'yok edilmiş pencereye ilerleme gönderilmez');
  // endJobLog
  ctx.jobLog = { stream: { end: () => calls.push(['endLog']) } };
  vm.runInContext('endJobLog()', ctx);
  assert.strictEqual(JSON.stringify(calls[1]), JSON.stringify(['endLog']));
  assert.strictEqual(ctx.jobLog, null);
  // pidAlive: geçersiz/kendi pid → true
  assert.strictEqual(vm.runInContext('pidAlive(0)', ctx), true);
  assert.strictEqual(vm.runInContext('pidAlive(-4)', ctx), true);
  assert.strictEqual(vm.runInContext('pidAlive("abc")', ctx), true);
  assert.strictEqual(vm.runInContext('pidAlive(process.pid)', ctx), true);
  assert.strictEqual(vm.runInContext('pidAlive(99999999)', ctx), false);
  // backupOnce: birincil yok → bak adı sadece döner; var → kopya; bak zaten var → ezmez
  const dir = path.join(TEST_ROOT, 'bak'); fs.mkdirSync(dir, { recursive: true });
  ctx.__missing = path.join(dir, 'yok.json');
  assert.strictEqual(vm.runInContext('backupOnce(__missing)', ctx), ctx.__missing + '.bak');
  const f = path.join(dir, 'var.json'); fs.writeFileSync(f, 'v1');
  ctx.__f = f;
  assert.strictEqual(vm.runInContext('backupOnce(__f)', ctx), f + '.bak');
  assert.strictEqual(fs.readFileSync(f + '.bak', 'utf8'), 'v1');
  fs.writeFileSync(f, 'v2');
  vm.runInContext('backupOnce(__f)', ctx);
  assert.strictEqual(fs.readFileSync(f + '.bak', 'utf8'), 'v1', 'mevcut .bak ezilmez');
}

// ---------- 2. kuyruk kalıcılığı ----------
function t_queue_persist() {
  const written = [];
  const ctx = defineIn(makeCtx({
    queueTerminalGuards: new Set(),
    readQueueStateRaw: () => ({ items: [] }),
    updateQueueSnapshotTerminal: (raw, id, ev) => ({ term: id, ev }),
    updateQueueSnapshotRunning: (raw, id, patch) => ({ run: id, ...patch }),
    writeQueueState: (snap) => written.push(snap),
    activeTranscriptionJobId: 'j',
    activeQueueItemId: 9,
  }), [
    section('function persistQueueTerminal(', 'function persistQueueRunning('),
    section('function persistQueueRunning(', 'function appendSubtitleEditLog('),
  ]);
  vm.runInContext('persistQueueTerminal(null, {})', ctx);
  assert.strictEqual(written.length, 0, 'boş id no-op');
  vm.runInContext('persistQueueTerminal(12, {status:"done"})', ctx);
  assert.strictEqual(ctx.queueTerminalGuards.has(12), true);
  assert.strictEqual(JSON.stringify(written[0]), JSON.stringify({ term: 12, ev: { status: 'done' } }));
  vm.runInContext('persistQueueRunning(12, {input:"/a/v.mp4"})', ctx);
  assert.strictEqual(ctx.queueTerminalGuards.has(12), false, 'running yeniden-denemeyi serbest bırakır');
  assert.strictEqual(JSON.stringify(written[1]), JSON.stringify({ run: 12, type: 'file', input: '/a/v.mp4', label: 'v.mp4', opts: { input: '/a/v.mp4' } }));
  vm.runInContext('persistQueueRunning(5, {youtube:"https://www.youtube.com/watch?v=abcdef0123456789"})', ctx);
  assert.strictEqual(written[2].type, 'youtube');
  assert.strictEqual(written[2].label.startsWith('youtube.com/watch'), true);
  assert.strictEqual(written[2].label.length <= 60, true);
}

// ---------- 3. altyazı düzenleme günlüğü sınırları ----------
function t_edit_log() {
  const dir = path.join(TEST_ROOT, 'edits');
  const ctx = defineIn(makeCtx({}), [
    section('function appendSubtitleEditLog(', "ipcMain.handle('media:writeSubtitle'"),
  ]);
  ctx.__dir = dir;
  // yeni dosya → append başarılı, ''
  assert.strictEqual(vm.runInContext(`appendSubtitleEditLog(__dir, 'aaaaaaaaaaaaaaaaaaaaaaaa', {a:1})`, ctx), '');
  const target = path.join(dir, 'aaaaaaaaaaaaaaaaaaaaaaaa.jsonl');
  assert.strictEqual(fs.existsSync(target), true);
  // var olan dosya + küçük ekleme → ''
  assert.strictEqual(vm.runInContext(`appendSubtitleEditLog(__dir, 'aaaaaaaaaaaaaaaaaaaaaaaa', {b:2})`, ctx), '');
  // >4MB dosyaya ekleme → uyarı dizisi
  fs.writeFileSync(target, 'x'.repeat(4 * 1024 * 1024 + 1));
  const warn = vm.runInContext(`appendSubtitleEditLog(__dir, 'aaaaaaaaaaaaaaaaaaaaaaaa', {c:3})`, ctx);
  assert.strictEqual(typeof warn === 'string' && warn.includes('sınırına ulaşıldı'), true);
}

// ---------- 4. harici açma politikası + webContent kısıtı ----------
async function t_external_open() {
  const opened = [];
  const ctx = defineIn(makeCtx({
    decideUrlPolicy: (url) => url === 'deny:x' ? { action: 'deny' }
      : url === 'ok:x' ? { action: 'external', url: 'ok:x' } : { action: 'allow', url },
    shell: { openExternal: async (u) => opened.push(u) },
    browserExternalOpenAt: new WeakMap(),
    Date,
  }), [
    section('function openExternalByPolicy(', 'const browserExternalOpenAt'),
    section('const browserExternalOpenAt', 'async function readJsonResponseLimited'),
  ]);
  assert.strictEqual(await vm.runInContext('openExternalByPolicy("deny:x")', ctx), false);
  assert.strictEqual(await vm.runInContext('openExternalByPolicy("ok:x")', ctx), true);
  assert.strictEqual(JSON.stringify(opened), JSON.stringify(['ok:x']));
  const wc = {};
  ctx.__wc = wc;
  assert.strictEqual(await vm.runInContext('openExternalFromWebContent(__wc, "ok:x")', ctx), true);
  assert.strictEqual(await vm.runInContext('openExternalFromWebContent(__wc, "ok:x")', ctx), false, '3 sn içinde ikinci açılış kısıtlanır');
  // nesne olmayan contents → kısıt yok ama politika yine işler
  assert.strictEqual(await vm.runInContext('openExternalFromWebContent(null, "ok:x")', ctx), true);
}

// ---------- 5. sınırlı JSON okuma ----------
async function t_json_limited() {
  const ctx = defineIn(makeCtx({
    readResponseBufferLimited: async (res, max, label) => Buffer.from(res),
  }), [section('async function readJsonResponseLimited(', 'let browserGlossaryTruncationNotified')]);
  assert.strictEqual(await vm.runInContext('readJsonResponseLimited("\\uFEFF{\\"a\\":1}", 1e3, "X").then(r=>r.a)', ctx), 1);
  await assert.rejects(
    vm.runInContext('readJsonResponseLimited("bozuk", 1e3, "Servis")', ctx),
    /geçerli JSON değil/);
}

// ---------- 6. medya/altyazı yetki hattı ----------
async function t_media_auth() {
  const media = new MediaFileAccess(new Set(['mp4', 'mkv']));
  const subs = new SubtitleFileAccess();
  const vid = path.join(TEST_ROOT, 'v.mp4'); fs.writeFileSync(vid, 'x');
  const srt = path.join(TEST_ROOT, 's.srt'); fs.writeFileSync(srt, 'x');
  const dialogs = [];
  const ctx = defineIn(makeCtx({
    mediaFileAccess: media, subtitleFileAccess: subs,
    dialog: { showMessageBox: async (_w, o) => { dialogs.push(o); return { response: 1 }; } },
    mainWindow: {},
    dt: (a) => a,
  }), [
    section('function validateLocalMediaPath(', 'async function scanMediaFromPaths'),
    section('async function authorizeSubtitleFile(', "ipcMain.on('browser:trusted-bridge'"),
  ]);
  ctx.__v = vid; ctx.__s = srt;
  // validate/authorize: grant'siz → authorize throw
  assert.strictEqual(vm.runInContext('validateLocalMediaPath(__v)', ctx), vid);
  assert.throws(() => vm.runInContext('authorizeLocalMediaPath(__v)', ctx), /seçilmedi/);
  // authorizeMediaFile: diyalog allow → grant + target döner
  assert.strictEqual(await vm.runInContext('authorizeMediaFile(__v)', ctx), vid);
  assert.strictEqual(media.has(vid), true);
  assert.strictEqual(dialogs.length, 1);
  // bir kez grant'liyse diyalog sormaz
  assert.strictEqual(await vm.runInContext('authorizeMediaFile(__v)', ctx), vid);
  assert.strictEqual(dialogs.length, 1);
  // subtitle: iptal → throw
  ctx.dialog = { showMessageBox: async () => ({ response: 0 }) };
  await assert.rejects(vm.runInContext('authorizeSubtitleFile(__s)', ctx), /onaylanmadı/);
  // allow → grant
  ctx.dialog = { showMessageBox: async () => ({ response: 1 }) };
  assert.strictEqual(await vm.runInContext('authorizeSubtitleFile(__s)', ctx), srt);
}

// ---------- 7. medya tarama ----------
async function t_scan() {
  const media = new MediaFileAccess(new Set(['mp4', 'mkv', 'srt']));
  const root = path.join(TEST_ROOT, 'scan');
  fs.mkdirSync(path.join(root, 'alt', 'ic'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gizli'), { recursive: true });
  fs.writeFileSync(path.join(root, 'b.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'a.mkv'), 'x');
  fs.writeFileSync(path.join(root, 'not.txt'), 'x');
  fs.writeFileSync(path.join(root, '.gizli', 'g.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'alt', 'ic', 'd.mp4'), 'x');
  const ctx = defineIn(makeCtx({
    mediaFileAccess: media, canonicalLocalPath, MEDIA_EXTS: new Set(['mp4', 'mkv', 'srt']),
  }), [section('async function scanMediaFromPaths(', 'function inspectMediaScanRoots(')]);
  ctx.__paths = [root];
  const out = await vm.runInContext('scanMediaFromPaths(__paths)', ctx);
  assert.strictEqual(JSON.stringify(out.map((p) => path.basename(p)).sort()), JSON.stringify(['a.mkv', 'b.mp4', 'd.mp4']), 'gizli klasör + medya-olmayan atlanır');
  assert.strictEqual(media.has(path.join(root, 'a.mkv')), true, 'bulunan dosyalar grant alır');
  // maxDepth=1 → yalnız kökün doğrudan dosyaları (derinlik dosya derinliği sayar)
  const shallow = await vm.runInContext('scanMediaFromPaths(__paths, {maxDepth:1})', ctx);
  assert.strictEqual(JSON.stringify(shallow.map((p) => path.basename(p)).sort()), JSON.stringify(['a.mkv', 'b.mp4']));
  // olmayan yol → hatayı yutar, []
  ctx.__paths = [path.join(TEST_ROOT, 'yok')];
  assert.strictEqual((await vm.runInContext('scanMediaFromPaths(__paths)', ctx)).length, 0);
}

// ---------- 8. burnin sahneleme ----------
function t_burnin_stage() {
  const dir = path.join(TEST_ROOT, 'burnin-temp');
  fs.mkdirSync(dir, { recursive: true });
  // 49 saatlik eski sahne dosyası + yeni + desensiz dosya
  const oldF = path.join(dir, 'subtitle-12345678-1234-1234-1234-123456789012.srt');
  fs.writeFileSync(oldF, 'old');
  const old = Date.now() - 49 * 3600e3;
  fs.utimesSync(oldF, old / 1000, old / 1000);
  fs.writeFileSync(path.join(dir, 'subtitle-abcdefab-cdef-abcd-efab-cdefabcdefab.ass'), 'new');
  fs.writeFileSync(path.join(dir, 'random.txt'), 'keep');
  const src = path.join(TEST_ROOT, 'in.ass'); fs.writeFileSync(src, 'data');
  const ctx = defineIn(makeCtx({ randomUUID: () => 'deadbeef-cafe-0000-0000-000000000000', removeFileQuietly: burnin.removeFileQuietly }), [
    section('function stageBurninSubtitle(', 'function burninRecoveryStatePath('),
  ]);
  ctx.__src = src;
  const staged = vm.runInContext('stageBurninSubtitle(__src)', ctx);
  assert.strictEqual(path.basename(staged), 'subtitle-deadbeef-cafe-0000-0000-000000000000.ass');
  assert.strictEqual(fs.readFileSync(staged, 'utf8'), 'data');
  assert.strictEqual(fs.existsSync(oldF), false, '48 saati aşan sahne dosyası süpürülür');
  assert.strictEqual(fs.existsSync(path.join(dir, 'random.txt')), true, 'desen-dışı dosya korunur');
}

// ---------- 9. burnin kurtarma durumu ----------
async function t_burnin_state() {
  const vid = path.join(TEST_ROOT, 'm.mp4'); fs.writeFileSync(vid, 'x');
  const sub = path.join(TEST_ROOT, 'm.srt'); fs.writeFileSync(sub, 'x');
  const valid = {
    version: 1, id: 'rid', videoPath: vid, subPath: sub,
    tempPath: path.join(TEST_ROOT, 'm.altyazili.tok.tmp.mp4'),
    outPath: path.join(TEST_ROOT, 'm.altyazili.mp4'),
    pid: process.pid, totalSec: 60, startedAt: Date.now() - 1000,
  };
  const ctx = defineIn(makeCtx({
    burninJob: null,
    writeJsonAtomic: (t2, v) => fs.writeFileSync(t2, JSON.stringify(v)),
    readBurninRecoveryFile: burnin.readBurninRecoveryFile,
    normalizeBurninRecovery: burnin.normalizeBurninRecovery,
    burninRecoveryPathsMatch: burnin.burninRecoveryPathsMatch,
    burninRecoveryProcessMatches: burnin.burninRecoveryProcessMatches,
    burninFinalOutputLooksComplete: burnin.burninFinalOutputLooksComplete,
    burninTempLooksComplete: burnin.burninTempLooksComplete,
    burninReplacementBackupPaths: burnin.burninReplacementBackupPaths,
    probeCommand: async () => '60',
    processIsAlive: () => true,
    processNameForPid: () => 'ffmpeg',
    removeFileQuietly: burnin.removeFileQuietly,
    resolveFfTool: () => 'ffprobe',
  }), [
    section('function burninRecoveryStatePath(', 'function readBurninRecoveryState('),
    section('function readBurninRecoveryState(', 'function writeBurninRecoveryState('),
    section('function writeBurninRecoveryState(', 'function clearBurninRecoveryState('),
    section('function clearBurninRecoveryState(', 'function processIsAlive('),
    section('function processIsAlive(', 'function processNameForPid('),
    section('function processNameForPid(', 'function burninRecoveryProcessIsRunning('),
    section('function burninRecoveryProcessIsRunning(', 'async function inspectBurninRecovery('),
    section('async function inspectBurninRecovery(', 'let burninJob'),
  ]);
  ctx.__r = valid; ctx.__bad = { version: 2, id: 'x' }; ctx.__void = null;
  // normalize sürüm reddi
  assert.strictEqual(vm.runInContext('normalizeBurninRecovery(__bad)', ctx), null, 'version>1 reddedilir');
  // write: geçerli → dosya yazılır + normalize döner
  const normalized = vm.runInContext('writeBurninRecoveryState(__r)', ctx);
  assert.strictEqual(normalized.id, 'rid');
  const statePath = path.join(TEST_ROOT, 'burnin-recovery.json');
  assert.strictEqual(fs.existsSync(statePath), true);
  // ikinci yazı → .bak
  vm.runInContext('writeBurninRecoveryState(__r)', ctx);
  assert.strictEqual(fs.existsSync(statePath + '.bak'), true);
  // pathsMatch bozuksa throw
  ctx.__mismatch = { ...valid, outPath: '/baska/yol.mp4' };
  assert.throws(() => vm.runInContext('writeBurninRecoveryState(__mismatch)', ctx), /güvenli değil/);
  // read: normalize+pathsMatch döner
  const got = vm.runInContext('readBurninRecoveryState()', ctx);
  assert.strictEqual(got.id, 'rid');
  // processIsAlive: geçersiz → false; canlı pid → true
  assert.strictEqual(vm.runInContext('processIsAlive(-1)', ctx), false);
  assert.strictEqual(vm.runInContext('processIsAlive(process.pid)', ctx), true);
  // burninRecoveryProcessIsRunning: ffmpeg adı + canlı → true
  assert.strictEqual(vm.runInContext('burninRecoveryProcessIsRunning(__r)', ctx), true);
  ctx.burninJob = { pid: 42 };
  assert.strictEqual(vm.runInContext('burninRecoveryProcessIsRunning({pid:42})', ctx), true, 'aktif burninJob pid eşleşmesi');
  ctx.burninJob = null;
  // inspectBurninRecovery: dosya var → available
  const ins = await vm.runInContext('inspectBurninRecovery()', ctx);
  assert.strictEqual(ins.available, true);
  assert.strictEqual(ins.inputReady, true);
  assert.strictEqual(ins.externalRunning, true);
  // clear: id eşleşmezse false
  assert.strictEqual(vm.runInContext('clearBurninRecoveryState("baska")', ctx), false);
  assert.strictEqual(fs.existsSync(statePath), true);
  // id eşleşir → dosyalar silinir
  assert.strictEqual(vm.runInContext('clearBurninRecoveryState("rid")', ctx), true);
  assert.strictEqual(fs.existsSync(statePath), false);
  assert.strictEqual(fs.existsSync(statePath + '.bak'), false);
}

// ---------- 10. araç çözümleri ----------
function t_resolve() {
  const spawnCalls = [];
  const ctx = defineIn(makeCtx({
    appResourceRoot: () => '/app',
    spawnSync: (cmd, args) => { spawnCalls.push([cmd, args]); return { status: 0, stdout: '', error: null }; },
    EXTERNAL_PLAYER_SPECS: { mpv: { env: 'WHISPER_MPV_PATH', candidates: ['/no/mpv'] } },
  }), [
    section('function resolveFfTool(', "ipcMain.handle('media:probeTracks'"),
    section('function resolvePython(', '// Bir isin sonucunu'),
    section('function resolveExternalPlayerPath(', "ipcMain.handle('player:external'"),
  ]);
  // resolveFfTool: backend/bin'de yok → bare ad
  assert.strictEqual(vm.runInContext('resolveFfTool("ffprobe")', ctx), 'ffprobe');
  // resolvePython: venv yok → spawnSync probe, status 0 → commands[0]
  // (linux 'python3', win32 'python' — resolvePython'daki platform sırası)
  const py = vm.runInContext('resolvePython()', ctx);
  assert.strictEqual(py, process.platform === 'win32' ? 'python' : 'python3');
  assert.strictEqual(JSON.stringify(spawnCalls[0][1]), JSON.stringify(['--version']));
  // resolveExternalPlayerPath: env yok, aday yok → probe 'which' → stdout satırı kabul
  spawnCalls.length = 0;
  ctx.spawnSync = (cmd, args) => ({ status: 0, stdout: '/usr/bin/mpv\n', error: null });
  // dosya /usr/bin/mpv gerçekte var mı? makinede yoksa accept '' döner — bu yüzden existsSync stub'ı gerekir: fs gerçek, /usr/bin/mpv olmayabilir. Fallback: dosya adı kontrolü — sonuç ya '' ya '/usr/bin/mpv'
  const mpv = vm.runInContext('resolveExternalPlayerPath("mpv")', ctx);
  assert.strictEqual(['', '/usr/bin/mpv'].includes(mpv), true);
  // bilinmeyen ad → ''
  assert.strictEqual(vm.runInContext('resolveExternalPlayerPath("yok")', ctx), '');
  // env override: dosya adı stem ile başlamalı
  const fake = path.join(TEST_ROOT, 'mpv-custom'); fs.writeFileSync(fake, 'x');
  ctx.spawnSync = () => ({ status: 0, stdout: '', error: null });
  process.env.WHISPER_MPV_PATH = fake;
  assert.strictEqual(vm.runInContext('resolveExternalPlayerPath("mpv")', ctx), fake);
  const other = path.join(TEST_ROOT, 'vlc.exe'); fs.writeFileSync(other, 'x');
  process.env.WHISPER_MPV_PATH = other;
  assert.strictEqual(vm.runInContext('resolveExternalPlayerPath("mpv")', ctx), '', 'dosya adı stem eşleşmezse env reddedilir');
  delete process.env.WHISPER_MPV_PATH;
}

// ---------- 11. youtube/invidious ortamı ----------
function t_youtube_env() {
  const ytAccounts = {
    activeAccount: (accts, id) => (id && accts[id]) || null,
    removeAccount: (accts, activeId, id) => { delete accts[id]; return activeId === id ? Object.keys(accts)[0] || '' : activeId; },
    persistableAccounts: (a) => a,
  };
  const ctx = defineIn(makeCtx({
    ytAccounts,
    youtubeSession: {
      accounts: { a1: { refreshToken: 'rt1', accessToken: 'at1' } }, activeId: 'a1',
      clientId: 'cid', clientSecret: 'csec',
    },
    _ytDevice: null,
    _ytAuthFlow: null,
    invidiousSessions: new Map([['s1', { sid: 'SID', instance: 'http://127.0.0.1:3000' }]]),
    isLocalInvidiousInstance: (v) => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(v),
    invidiousLastInstance: null,
  }), [
    section('function ytActiveAccount(', 'let _ytDevice'),
    section('function youtubeAuthEnv(', 'function runYoutubeCommand('),
    section('function validateInvidiousInstance(', 'function invidiousSessionInstance('),
    section('function invidiousSessionInstance(', 'function invidiousAuthEnv('),
    section('function invidiousAuthEnv(', 'function runInvidiousCommand('),
    section('function _ytAbortAuthFlow(', "ipcMain.handle('youtube:authCode'"),
  ]);
  assert.strictEqual(vm.runInContext('ytActiveAccount()', ctx).accessToken, 'at1');
  // youtubeAuthEnv: client secret + aktif hesap rt/at
  const env = vm.runInContext('youtubeAuthEnv()', ctx);
  assert.strictEqual(JSON.stringify(env), JSON.stringify({ WHISPER_YT_CLIENT_SECRET: 'csec', WHISPER_YT_REFRESH_TOKEN: 'rt1', WHISPER_YT_ACCESS_TOKEN: 'at1' }));
  // overrides kazanır; alan boşsa yazılmaz
  const env2 = vm.runInContext('youtubeAuthEnv({refreshToken:"X"})', ctx);
  assert.strictEqual(env2.WHISPER_YT_REFRESH_TOKEN, 'X');
  ctx.youtubeSession.accounts = {}; ctx.youtubeSession.activeId = '';
  const env3 = vm.runInContext('youtubeAuthEnv()', ctx);
  assert.strictEqual('WHISPER_YT_REFRESH_TOKEN' in env3, false);
  ctx._ytDevice = { deviceCode: 'DC' };
  assert.strictEqual(vm.runInContext('youtubeAuthEnv()', ctx).WHISPER_YT_DEVICE_CODE, 'DC');
  ctx._ytDevice = null;
  // validateInvidiousInstance
  assert.strictEqual(vm.runInContext('validateInvidiousInstance("http://x:3000/path?q=1")', ctx), 'http://x:3000');
  assert.strictEqual(vm.runInContext('validateInvidiousInstance("ftp://x")', ctx), '');
  assert.strictEqual(vm.runInContext('validateInvidiousInstance(42)', ctx), '');
  // invidiousSessionInstance: ilk oturum instance'ı
  assert.strictEqual(vm.runInContext('invidiousSessionInstance()', ctx), 'http://127.0.0.1:3000');
  // invidiousAuthEnv: yerel instance'a SID gider
  assert.strictEqual(JSON.stringify(vm.runInContext('invidiousAuthEnv("http://127.0.0.1:3000")', ctx)), JSON.stringify({ WHISPER_INVIDIOUS_SID: 'SID' }));
  assert.strictEqual(Object.keys(vm.runInContext('invidiousAuthEnv("https://remote.example")', ctx)).length, 0, 'uzak instance SID almaz');
  assert.strictEqual(Object.keys(vm.runInContext('invidiousAuthEnv("")', ctx)).length, 0);
  // _ytAbortAuthFlow: yoksa false, varsa reject+close+true
  assert.strictEqual(vm.runInContext('_ytAbortAuthFlow("m")', ctx), false);
  const rejected = [];
  ctx._ytAuthFlow = { timer: setTimeout(() => {}, 1e5), server: { close() {} }, reject: (e) => rejected.push(e.message) };
  assert.strictEqual(vm.runInContext('_ytAbortAuthFlow("iptal")', ctx), true);
  assert.strictEqual(JSON.stringify(rejected), JSON.stringify(['iptal']));
  assert.strictEqual(ctx._ytAuthFlow, null);
}

// ---------- 12. ensureYoutubeAccessToken ----------
async function t_youtube_token() {
  const runCalls = [];
  let accounts = { a1: { refreshToken: 'rt1', accessToken: '', expiresAt: 0, authMode: 'custom' } };
  const ctx = defineIn(makeCtx({
    ytAccounts: {
      activeAccount: (a, id) => (id && a[id]) || null,
      removeAccount: (a, activeId, id) => { delete a[id]; return activeId === id ? Object.keys(a)[0] || '' : activeId; },
      persistableAccounts: (x) => x,
    },
    youtubeSession: { accounts, activeId: 'a1', clientId: 'cid', clientSecret: 'csec' },
    _ytRefreshInFlight: null,
    runYoutubeCommand: async (args, _e, _t, env) => { runCalls.push({ args, env }); return { ok: true, data: { access_token: 'NEW', expires_in: 3600 } }; },
    youtubeAuthEnv: () => ({ E: '1' }),
    persistYoutubeSession: () => {},
  }), [
    section('function ytActiveAccount(', 'let _ytDevice'),
    section('async function ensureYoutubeAccessToken(', 'function validateInvidiousInstance('),
  ]);
  // async fonksiyon ctx'te tanımlı
  // hesap yok → null
  const saved = ctx.youtubeSession;
  ctx.youtubeSession = { accounts: {}, activeId: '', clientId: 'c', clientSecret: 's' };
  assert.strictEqual(await vm.runInContext('ensureYoutubeAccessToken()', ctx), null);
  ctx.youtubeSession = saved;
  // token taze değil → refresh çağrısı, client-id cid
  const tok = await vm.runInContext('ensureYoutubeAccessToken()', ctx);
  assert.strictEqual(tok, 'NEW');
  assert.strictEqual(JSON.stringify(runCalls[0].args), JSON.stringify(['refresh', '--client-id', 'cid']));
  // hesap güncellendi
  assert.strictEqual(accounts.a1.accessToken, 'NEW');
  assert.strictEqual(accounts.a1.expiresAt > Date.now(), true);
  // taze token → refresh'siz döner
  runCalls.length = 0;
  assert.strictEqual(await vm.runInContext('ensureYoutubeAccessToken()', ctx), 'NEW');
  assert.strictEqual(runCalls.length, 0, 'taze token refresh tetiklemez');
  // refresh_token yok + süresi dolmuş → null
  accounts.a2 = { refreshToken: '', accessToken: 'x', expiresAt: 1, authMode: 'custom' };
  ctx.youtubeSession.activeId = 'a2';
  assert.strictEqual(await vm.runInContext('ensureYoutubeAccessToken()', ctx), null);
  // invalid_grant → hesap düşer
  accounts.a1.accessToken = ''; accounts.a1.expiresAt = 0;
  ctx.youtubeSession.activeId = 'a1';
  ctx.runYoutubeCommand = async () => ({ ok: false, error: 'invalid_grant: expired' });
  assert.strictEqual(await vm.runInContext('ensureYoutubeAccessToken()', ctx), null);
  assert.strictEqual('a1' in accounts, false, 'invalid_grant hesabı kaldırır');
}

// ---------- 13. runYoutubeCommand / runInvidiousCommand ----------
async function t_run_commands() {
  const spawned = [];
  const jobs = { youtube: null, invidious: null };
  function fakeProc() {
    const p = new EventEmitter();
    p.stdout = new EventEmitter(); p.stdout.setEncoding = () => {};
    p.stderr = new EventEmitter(); p.stderr.setEncoding = () => {};
    return p;
  }
  const ctx = defineIn(makeCtx({
    mediaJobs: jobs,
    appResourceRoot: () => '/app',
    resolvePython: () => 'python3',
    pythonRuntimeEnv: (x) => x,
    spawn: (exe, args, opts) => { const p = fakeProc(); spawned.push({ exe, args, opts, p }); return p; },
    parseNdjsonLine: (l) => { try { return JSON.parse(l); } catch { return null; } },
    createNdjsonLineBuffer: ({ onOverflow }) => {
      let buf = '';
      return {
        push: (chunk) => { buf += chunk; const lines = buf.split('\n'); buf = lines.pop(); return lines; },
        flush: () => { const rest = buf; buf = ''; return rest ? [rest] : []; },
      };
    },
    sanitizeProcessDetail: (s) => s,
    writeJobLog: () => {},
    terminateProcessTree: () => {},
    YOUTUBE_RESULT_TYPES: new Set(['token', 'feed']),
    INVIDIOUS_RESULT_TYPES: new Set(['probe', 'subs']),
    subtitleFileAccess: { grant: () => {} },
    validateInvidiousInstance: (v) => v,
    invidiousLastInstance: null,
    windowsHide: undefined,
  }), [
    section('function runYoutubeCommand(', '// access_token taze'),
    section('function runInvidiousCommand(', "ipcMain.handle('media:probe'"),
  ]);
  // meşgul slot
  jobs.youtube = {};
  assert.strictEqual(await vm.runInContext('runYoutubeCommand(["x"])', ctx).then((r) => r.ok), false);
  jobs.youtube = null;
  // spawn throw → ok:false
  const realSpawn = ctx.spawn;
  ctx.spawn = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
  const r1 = await vm.runInContext('runYoutubeCommand(["x"])', ctx);
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error, 'Python bulunamadı.');
  ctx.spawn = realSpawn;
  // başarılı: sonuç satırı + close
  const p1 = vm.runInContext('runYoutubeCommand(["browse","--browse-id","FEsubscriptions"])', ctx);
  const s1 = spawned[spawned.length - 1];
  assert.strictEqual(s1.args[0], path.join('/app', 'backend', 'youtube.py'));
  s1.p.stdout.emit('data', JSON.stringify({ type: 'token', ok: 1 }) + '\n');
  s1.p.emit('close', 0);
  const r2 = await p1;
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.data.type, 'token');
  assert.strictEqual(jobs.youtube, null, 'close sonrası slot boşalır');
  // hata satırı + close → ok:false
  const p2 = vm.runInContext('runYoutubeCommand(["x"])', ctx);
  const s2 = spawned[spawned.length - 1];
  s2.p.stdout.emit('data', JSON.stringify({ type: 'error', message: 'boom' }) + '\n');
  s2.p.emit('close', 1);
  const r3 = await p2;
  assert.strictEqual(r3.ok, false);
  assert.strictEqual(r3.error, 'boom');
  // invidious: subs satırı grant alır
  const grants = [];
  ctx.subtitleFileAccess = { grant: (p) => grants.push(p) };
  const p3 = vm.runInContext('runInvidiousCommand(["subs"], "invidious")', ctx);
  const s3 = spawned[spawned.length - 1];
  assert.strictEqual(s3.args[0], path.join('/app', 'backend', 'invidious.py'));
  s3.p.stdout.emit('data', JSON.stringify({ type: 'subs', path: '/t/x.srt' }) + '\n');
  s3.p.emit('close', 0);
  const r4 = await p3;
  assert.strictEqual(r4.ok, true);
  assert.strictEqual(JSON.stringify(grants), JSON.stringify(['/t/x.srt']));
}

// ---------- 14. YouTube TV durumu ----------
function t_tv_session() {
  const sent = [];
  const ctx = defineIn(makeCtx({
    youtubeTvState: { open: false, videoId: '', title: '', refused: false, userAgent: 'cobalt', error: '', handoff: 0 },
    mainWindow: { isDestroyed: () => false, webContents: { send: (ch, payload) => sent.push([ch, payload]) } },
    youtubeTvWindow: null,
  }), [
    section('function sendYoutubeTvState(', 'function configureYoutubeTvSession('),
    section('function configureYoutubeTvSession(', 'function openYoutubeTvWindow('),
    section('function closeYoutubeTvWindow(', "ipcMain.handle('youtube-tv:open'"),
  ]);
  const st = vm.runInContext('sendYoutubeTvState({videoId:"v1"})', ctx);
  assert.strictEqual(st.videoId, 'v1');
  assert.strictEqual(st.userAgent, 'cobalt');
  assert.strictEqual(sent[0][0], 'youtube-tv:event');
  // configureYoutubeTvSession: izinler yalnız fullscreen; will-download reddedilir
  const perms = [];
  const tvSes = new EventEmitter();
  tvSes.setUserAgent = () => {};
  tvSes.setPermissionRequestHandler = (fn) => { tvSes._req = fn; };
  tvSes.setPermissionCheckHandler = (fn) => { tvSes._chk = fn; };
  ctx.__s = tvSes;
  vm.runInContext('configureYoutubeTvSession(__s, "UA")', ctx);
  const req = [];
  tvSes._req(null, 'fullscreen', (v) => req.push(v));
  tvSes._req(null, 'camera', (v) => req.push(v));
  assert.strictEqual(JSON.stringify(req), JSON.stringify([true, false]));
  assert.strictEqual(tvSes._chk(null, 'fullscreen'), true);
  assert.strictEqual(tvSes._chk(null, 'media'), false);
  const dl = [];
  tvSes.emit('will-download', { preventDefault: () => dl.push(1) });
  assert.strictEqual(dl.length, 1);
  // ikinci yapılandırma guard'ı tekrarlamaz
  vm.runInContext('configureYoutubeTvSession(__s, "UA")', ctx);
  tvSes.emit('will-download', { preventDefault: () => dl.push(1) });
  assert.strictEqual(dl.length, 2, 'will-download tek dinleyici');
  // closeYoutubeTvWindow
  let destroyed = false;
  ctx.youtubeTvWindow = { isDestroyed: () => false, destroy: () => { destroyed = true; } };
  vm.runInContext('closeYoutubeTvWindow()', ctx);
  assert.strictEqual(destroyed, true);
  assert.strictEqual(ctx.youtubeTvWindow, null);
}

// ---------- 15. YouTube stream başlıkları ----------
function t_stream_headers() {
  const hooks = {};
  const ses = {
    webRequest: {
      onBeforeSendHeaders: (filter, fn) => { hooks.send = { filter, fn }; },
      onHeadersReceived: (filter, fn) => { hooks.recv = { filter, fn }; },
    },
  };
  const ctx = defineIn(makeCtx({
    session: { defaultSession: ses },
    YT_MEDIA_FILTER: { urls: ['https://*.googlevideo.com/*'] },
  }), [section('function installYoutubeStreamHeaders(', '// ===== İzleme ekranı')]);
  vm.runInContext('installYoutubeStreamHeaders()', ctx);
  assert.strictEqual(JSON.stringify(hooks.send.filter.urls), JSON.stringify(['https://*.googlevideo.com/*']));
  const req = {};
  hooks.send.fn({ requestHeaders: { A: 'b' } }, (r) => Object.assign(req, r));
  assert.strictEqual(req.requestHeaders.Origin, 'https://www.youtube.com');
  assert.strictEqual(req.requestHeaders.Referer, 'https://www.youtube.com/');
  const res = {};
  hooks.recv.fn({ responseHeaders: { 'Cross-Origin-Resource-Policy': ['x'], Other: ['y'] } }, (r) => Object.assign(res, r));
  assert.strictEqual(res.responseHeaders['Access-Control-Allow-Origin'][0], '*');
  assert.strictEqual('Cross-Origin-Resource-Policy' in res.responseHeaders, false);
  assert.strictEqual(res.responseHeaders.Other[0], 'y');
}

// ---------- 16. widevine ----------
async function t_widevine() {
  const ctx = defineIn(makeCtx({
    components: null,
    widevineComponentStatus: { available: false },
    widevineReadinessPromise: null,
    browserView: null,
    reportBrowserDrmSupport: () => {},
  }), [section('async function prepareWidevineComponents(', 'async function waitForProtectedPlayback(')]);
  // components yok → mevcut durum döner
  const r0 = await vm.runInContext('prepareWidevineComponents()', ctx);
  assert.strictEqual(JSON.stringify(r0), JSON.stringify({ available: false }));
  // hazır bileşen → ready:true + promise saklanır
  ctx.components = { whenReady: async () => {}, status: () => ({ s: 1 }) };
  const r1 = await vm.runInContext('prepareWidevineComponents()', ctx);
  assert.strictEqual(r1.ready, true);
  assert.deepStrictEqual(r1.status, { s: 1 });
  assert.ok(ctx.widevineReadinessPromise, 'readiness promise saklanır');
  // hata → failed + detail kırpılır
  ctx.widevineComponentStatus = { available: false };
  ctx.widevineReadinessPromise = null;
  ctx.components = { whenReady: async () => { throw new Error('x'.repeat(300)); } };
  const r2 = await vm.runInContext('prepareWidevineComponents()', ctx);
  assert.strictEqual(r2.failed, true);
  assert.strictEqual(r2.detail.length, 240);
}

// ---------- 17. popup politikası ----------
function t_popup() {
  const notices = [];
  const ctx = defineIn(makeCtx({
    decideUrlPolicy: (url, _s, _src) => url === 'ext:x' ? { action: 'external', url }
      : url === 'deny:x' ? { action: 'deny' } : { action: 'allow', url, hostname: 'h.t' },
    openExternalFromWebContent: async () => {},
    safeWebContentsUrl: () => 'https://src',
    sendBrowserEvent: (tab, ev) => notices.push(ev),
    browserPopupWindows: { canAdd: () => ctx.__canAdd, add: (w) => ctx.__addOk && (ctx.__added = w, true) },
    MAX_BROWSER_POPUPS: 3,
    securePopupWebPreferences: (p) => ({ partition: p, sandbox: true }),
    attachNavigationGuard: () => () => {},
    sanitizeBrowserUserAgent: (u) => u + '+s',
    BROWSER_PARTITION: 'persist:whisper-browser',
  }), [
    section('function browserWindowOpenHandler(', 'function browserPopupWindowOptions('),
    section('function browserPopupWindowOptions(', 'function configureBrowserPopup('),
    section('function configureBrowserPopup(', 'function safeBrowserBounds('),
  ]);
  const wc = {};
  ctx.__wc = wc; ctx.__tab = { id: 't' };
  ctx.__canAdd = true;
  // external → deny
  assert.strictEqual(vm.runInContext('browserWindowOpenHandler(__wc, __tab)({url:"ext:x"}).action', ctx), 'deny');
  // politika deny → deny
  assert.strictEqual(vm.runInContext('browserWindowOpenHandler(__wc, __tab)({url:"deny:x"}).action', ctx), 'deny');
  // allow + kapasite → allow + popup-opened olayı + override seçenekler
  const h = vm.runInContext('browserWindowOpenHandler(__wc, __tab)', ctx);
  const out = h({ url: 'ok:x' });
  assert.strictEqual(out.action, 'allow');
  assert.strictEqual(out.outlivesOpener, false);
  assert.strictEqual(out.overrideBrowserWindowOptions.webPreferences.partition, 'persist:whisper-browser');
  assert.strictEqual(notices[0].type, 'popup-opened');
  // kapasite dolu → deny + notice
  ctx.__canAdd = false;
  assert.strictEqual(h({ url: 'ok:x' }).action, 'deny');
  assert.strictEqual(notices[1].type, 'notice');
  // browserPopupWindowOptions
  const opts = vm.runInContext('browserPopupWindowOptions()', ctx);
  assert.strictEqual(opts.autoHideMenuBar, true);
  // configureBrowserPopup: add reddederse destroy
  ctx.__destroyed = 0;
  ctx.__pop = { isDestroyed: () => false, destroy: () => { ctx.__destroyed += 1; } };
  ctx.__addOk = false;
  vm.runInContext('configureBrowserPopup(__pop, __tab)', ctx);
  assert.strictEqual(ctx.__destroyed, 1);
  // add kabul + wc yok → erken dönüş
  ctx.__addOk = true; ctx.__added = null;
  vm.runInContext('configureBrowserPopup({webContents:null}, __tab)', ctx);
  assert.strictEqual(ctx.__added !== null, true);
}

// ---------- 18. ytBrowseSerialized ----------
async function t_browse_serial() {
  const ctx = defineIn(makeCtx({}), [
    'let _ytBrowseTail = Promise.resolve(); const _ytBrowseGenerations = new Map();',
    section('function ytBrowseSerialized(', "ipcMain.handle('youtube:browse'"),
  ]);
  ctx.__log = [];
  // seri çalışır: ikinci fn birincinin bitmesini bekler
  const a = vm.runInContext('ytBrowseSerialized("b1", async()=>{__log.push("a1");return "A"})', ctx);
  const b = vm.runInContext('ytBrowseSerialized("b1", async()=>{__log.push("a2");return "B"})', ctx);
  const [ra, rb] = await Promise.all([a, b]);
  assert.strictEqual(ra, 'A');
  assert.strictEqual(rb, 'B');
  assert.strictEqual(JSON.stringify(ctx.__log), JSON.stringify(['a1', 'a2']));
  // supersedable: aynı id'nin yenisi eskiyi ezer
  const c1 = vm.runInContext('ytBrowseSerialized("b2", async()=>"C1", true)', ctx);
  const c2 = vm.runInContext('ytBrowseSerialized("b2", async()=>"C2", true)', ctx);
  const [r1, r2] = await Promise.all([c1, c2]);
  assert.strictEqual(JSON.stringify(r1), JSON.stringify({ ok: false, superseded: true }));
  assert.strictEqual(r2, 'C2');
  // farklı browseId birbirini ezmez
  const d1 = vm.runInContext('ytBrowseSerialized("x", async()=>"D1", true)', ctx);
  const d2 = vm.runInContext('ytBrowseSerialized("y", async()=>"D2", true)', ctx);
  assert.strictEqual(await d1, 'D1');
  assert.strictEqual(await d2, 'D2');
}

// ---------- main ----------
async function main() {
  t('t_tiny_helpers', t_tiny_helpers);
  t('t_queue_persist', t_queue_persist);
  t('t_edit_log', t_edit_log);
  await at('t_external_open', t_external_open);
  await at('t_json_limited', t_json_limited);
  await at('t_media_auth', t_media_auth);
  await at('t_scan', t_scan);
  t('t_burnin_stage', t_burnin_stage);
  await at('t_burnin_state', t_burnin_state);
  t('t_resolve', t_resolve);
  t('t_youtube_env', t_youtube_env);
  await at('t_youtube_token', t_youtube_token);
  await at('t_run_commands', t_run_commands);
  t('t_tv_session', t_tv_session);
  t('t_stream_headers', t_stream_headers);
  await at('t_widevine', t_widevine);
  t('t_popup', t_popup);
  await at('t_browse_serial', t_browse_serial);
  console.log(`auth-io-deadzone: ${results.length} senaryo geçti`);
  process.exit(process.exitCode || 0);
}
main();
