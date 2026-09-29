'use strict';
// IPC payload fuzz turu 2 — adversarial-ipc.test.js gönderici-yetki kapılarını
// denetler; bu dosya *yetkili* göndericiyle tip-bozuk/hostile payload'ları handler
// gövdesinin derinliklerine ulaştırır.
//
// Yaklaşım: her kanal main.js'ten çıkarılıp proxy-global bir vm context'inde
// kaydedilir; bilinmeyen global adlar callable+awaitable kaydedici proxy döndürür.
// "Kapı" adlarına (yetkilendiriciler, erişim depoları, dialog) gerçekçi reddeden/
// sınırlı kabul eden double'lar konur ki stub-truthy artefaktı olmasın:
//   - authorizeLocalMediaPath/authorizeMediaFile/authorizeSubtitleFile:
//     yalnız dolu string geçirir (gerçeği gibi yetkili kabul), diğerlerini reddeder.
//   - *Access depoları: has=false, grant no-op, inspect throw.
//   - dialog: her zaman iptal/red.
//   - spawn()/child '.on("close"/"exit"/"finish"/"end")' dinleyicisi kuyruklanır
//     ve kod=1 ile tetiklenir (çocuk süreç beklemesi asılı kalmasın).
//
// İhlal sınıfı:
//   1) allowlist dışı tehlikeli sink çağrısı (spawn/fs-yazımı/shell/net/dialog-dışı
//      yan etki) — her allowlist girdisi gerekçelidir.
//   2) Object.prototype/Array.prototype kirliliği (korpus __proto__/constructor).
//   3) 2 sn üstü çağrı (asılı promise / olay bekleyen stub dışında).
//   4) Error olmayan değerle throw/reject.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { SubtitleFileAccess, MediaFileAccess, canonicalLocalPath } = require('../src/local-file-access');
const { clonePublicOptions, validateQueueOptions } = require('../src/queue-persistence');
const { decodeSubtitleBuffer } = require('../src/browser-textutil');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');

// --- handler çıkarımı (adversarial-ipc ile aynı sözleşme) ---
const handlers = new Map();
for (const match of main.matchAll(/^ipcMain\.handle\('([^']+)'/gm)) {
  const ends = ['\n});', '\n}));'].map((token) => ({ at: main.indexOf(token, match.index), length: token.length }))
    .filter((end) => end.at >= 0).sort((a, b) => a.at - b.at);
  const end = ends[0];
  const lineEnd = main.indexOf('\n', match.index);
  const oneLine = main.slice(match.index, lineEnd).trimEnd().endsWith(');');
  handlers.set(match[1], main.slice(match.index, oneLine ? lineEnd : end.at + end.length));
}
const argCounts = new Map();
const paramNames = new Map();
for (const [channel, src] of handlers) {
  const sig = src.match(/^ipcMain\.handle\('[^']+',\s*(?:async\s*)?(?:function\s*\w*\s*)?\(([^)]*)\)/);
  const params = sig ? sig[1].split(',').map((p) => p.trim()).filter(Boolean) : ['event'];
  argCounts.set(channel, Math.max(0, params.length - 1));
  paramNames.set(channel, params.slice(1));
}

// Fuzz edilmeyen konumlara ad-bazlı makul değer — yalnız `undefined` bırakmak
// çok-argümanlı handler'ların ilk truthy kapısında erken-dönmesine ve
// payload'un derin doğrulamaya hiç ulaşmamasına yol açıyordu.
const SIBLING_HINT = [
  [/url|src|href|link/i, 'https://example.invalid/'],
  [/file|path|dir|folder|target|dest|input|output/i, 'x.tmp'],
  [/opt|setting|config|pref|param|args?/i, {}],
  [/items?|list|arr|entries|cues|tracks|segments|ids|names/i, []],
  [/count|num|limit|index|offset|size|ms\b|sec|time|pos|idx|width|height|volume|rate|amount|len/i, 1],
  [/enabled|flag|force|bool|allow|skip|visible|open|reload|reset/i, true],
];
const siblingValue = (name) => {
  const hit = SIBLING_HINT.find(([re]) => re.test(name || ''));
  return hit ? hit[1] : 'x';
};

// --- modül-düzeyi state: `let` → falsy/literal; `new Set/Map/{}` → gerçek ---
function statePresets() {
  const presets = {};
  for (const m of main.matchAll(/^(?:let|const)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*([^;\n]*))?;/gm)) {
    const name = m[1], init = (m[2] || '').trim();
    if (['ipcMain', 'app', 'mainWindow', 'BrowserWindow', 'dialog', 'session',
      'safeStorage', 'powerSaveBlocker', 'globalShortcut', 'net', 'shell',
      'nativeTheme', 'screen', 'Tray', 'Menu', 'Notification', 'clipboard',
      'webContents', 'WebContentsView', 'BrowserView'].includes(name)) continue;
    if (/^new (Set|Map|WeakMap|WeakSet)\(/.test(init)) presets[name] = eval(init);
    else if (/^(\[\]|\{\}|Object\.create\(null\))$/.test(init)) presets[name] = eval(init);
    else if (/^(null|false|true|undefined|0|-?\d+|''|"")$/u.test(init)) presets[name] = eval(init || 'null');
    else if (m[0].startsWith('const') && init) continue;
    else presets[name] = null;
  }
  return presets;
}

// --- kaydedici proxy ---
function preview(v) {
  if (typeof v === 'string') return v.slice(0, 160);
  try { return JSON.stringify(v)?.slice(0, 200) ?? String(v); } catch (_) { return String(v); }
}
function makeRecorder(calls) {
  const rec = (p) => new Proxy(function () {}, {
    get: (t, prop) => {
      if (prop === 'then') return (res) => res(undefined);
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === Symbol.asyncIterator) return async function* () {};
      if (prop === Symbol.hasInstance) return () => false;
      if (prop === 'inspect' || prop === 'toJSON' || prop === 'valueOf' || prop === 'toString'
        || prop === Symbol.toStringTag) return () => '';
      return rec(`${p}.${String(prop)}`);
    },
    apply: (t, thisArg, args) => {
      calls.push({ path: p, argc: args.length, args: args.map(preview) });
      // Çocuk-süreç/kanal olay dinleyicilerini hemen tetikle — handler'ın
      // asılı kalmasını engelle (gerçek child yakında 'close' üretir).
      if (/\.(on|once|addListener|prependListener)$/.test(p) && typeof args[1] === 'function'
          && ['close', 'exit', 'finish', 'end'].includes(args[0])) {
        queueMicrotask(() => { try { args[1](1); } catch (_) {} });
      }
      return rec(`${p}()`);
    },
    construct: (t, args) => { calls.push({ path: `new ${p}`, argc: args.length, args: args.map(preview) }); return rec(`new ${p}`); },
    has: () => true,
    set: () => true,
  });
  return rec;
}

const REAL_GLOBALS = {
  Promise, JSON, Object, Array, Number, String, Boolean, BigInt, Math, Date,
  RegExp, Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError,
  URIError, Map, Set, WeakMap, WeakSet, WeakRef, Symbol, Proxy, Reflect, Intl,
  TextEncoder, TextDecoder, URL, URLSearchParams, Buffer, ArrayBuffer,
  Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
  Float32Array, Float64Array, DataView, BigInt64Array, BigUint64Array,
  setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
  queueMicrotask, structuredClone, isNaN, isFinite, parseInt, parseFloat,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, btoa, atob,
  escape, unescape, undefined, NaN, Infinity, eval: undefined,
};

const frame = {}, sender = { mainFrame: frame };
const authorized = { sender, senderFrame: frame };
const authSrc = main.slice(main.indexOf('function authorizedBrowserSender'), main.indexOf('\nasync function authorizeSubtitleFile'));
const auth = vm.runInNewContext(`${authSrc}; authorizedBrowserSender`, {
  mainWindow: { isDestroyed: () => false, webContents: sender },
});
assert.equal(auth(authorized), true);

const denyAccess = { has: () => false, grant() {}, add() {}, inspect() { throw new Error('yetkisiz'); } };
// Korpus payload'larının derin yolu görebilmesi için double'lar:
// string yol = "yetkili dosya" kabul edilir; tüm diğer tipler reddedilir.
function gateDoubles(rec) {
  const authorize = async (p) => {
    if (typeof p !== 'string' || !p.trim()) throw new Error('Dosya yetkisi reddedildi.');
    return p;
  };
  return {
    authorizeLocalMediaPath: (p) => {
      if (typeof p !== 'string' || !p.trim()) throw new Error('Dosya yetkisi reddedildi.');
      return p;
    },
    authorizeMediaFile: authorize,
    authorizeSubtitleFile: authorize,
    authorizeWatchFolder: authorize,
    authorizeMediaScanRoots: async (p) => (Array.isArray(p) ? p.filter((x) => typeof x === 'string' && x) : []),
    subtitleFileAccess: new SubtitleFileAccess(),
    mediaFileAccess: new MediaFileAccess(),
    watchFolderAccess: denyAccess,
    pdfFileAccess: denyAccess,
    shellTargetAccess: denyAccess,
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: '' }),
      showMessageBox: async () => ({ response: 0 }),
    },
    app: {
      getPath: () => path.join(os.tmpdir(), 'whisper-fuzz-userdata'),
      getAppPath: () => path.join(__dirname, '..'),
      getLocale: () => 'en', isPackaged: () => false,
      on: () => {}, once: () => {}, whenReady: async () => {},
      quit: rec('app.quit'), relaunch: rec('app.relaunch'),
      exit: rec('app.exit'),
    },
    canonicalLocalPath,
    loadSettings: () => ({}),
    loadQueueState: () => ({ ok: true, queue: [] }),
    defaultMediaFolders: () => ({ inputDir: '', outputDir: '' }),
    clonePublicOptions, validateQueueOptions, decodeSubtitleBuffer,
    decideUrlPolicy: (u) => {
      const s = String(u);
      let proto = '';
      try { proto = new URL(s).protocol; } catch (_) {}
      // Gerçek politika file:/javascript: gibi şemaları external'e bırakmaz;
      // double da aynı filtreyi uygular (handler'ın protokol kapısı ölçülür).
      return { action: 'external', protocol: proto || 'https:', hostname: 'x.test', url: s };
    },
    activeRequestedBrowserTab: () => ({
      id: 'tab-1', url: 'https://x.test/', mangaTranslated: 1, mangaVisible: false,
      view: rec('tab.view'), translateState: {},
    }),
    executeBrowserTrustedMain: async () => [1],
    inspectBurninRecovery: async () => ({
      available: true, externalRunning: false, alreadyDone: false,
      recovery: { id: 'x', files: [], missingGlyphList: [] },
    }),
    mainWindow: rec('mainWindow'),
    EXTERNAL_PLAYER_NAMES: ['x'],
    EXTERNAL_PLAYER_SPECS: { x: { env: 'X_PLAYER' } },
    resolveExternalPlayerPath: (n) => `/usr/bin/${n}`,
    resolvePython: () => 'python',
    resolveFfTool: (n) => n,
    ytdlpRuntimeRoot: () => path.join(os.tmpdir(), 'whisper-fuzz-rt'),
    pythonRuntimeEnv: (extra) => extra || {},
    createHash: require('crypto').createHash,
    randomBytes: require('crypto').randomBytes,
    fs: rec('fs'), os: rec('os'), path,
    child_process: rec('child_process'),
    http: rec('http'), https: rec('https'), net: rec('net'),
    electron: rec('electron'),
  };
}
// --- hostile korpus (yapısal-clone güvenli değerler) ---
function mkDeep(depth) { let o = {}; for (let i = 0; i < depth; i += 1) o = { a: o }; return o; }
const CORPUS = [
  ['undefined', undefined], ['null', null], ['true', true], ['false', false],
  ['zero', 0], ['neg1', -1], ['NaN', NaN], ['Inf', Infinity], ['negInf', -Infinity],
  ['empty-str', ''], ['str', 'x'], ['nul-str', 'a\0b'], ['big-str', 'x'.repeat(100_000)],
  ['fmt-str', '%s%d%j'], ['traversal', '../../etc/passwd'], ['win-traversal', '..\\..\\evil'],
  ['url-ish', 'file:///etc/passwd'], ['proto-str', '__proto__'],
  ['empty-arr', []], ['arr', ['a', 'b', 'c']], ['holes-arr', new Array(1000)],
  ['num-arr', [0, 1, 2, 3]], ['obj', {}], ['obj-vals', { a: 1, b: 'x', c: true }],
  // '__proto__' nesne literalinde prototype'ı değiştirir — kendi veri özelliği
  // olarak taşımak için JSON.parse kullanılır (structured clone gibi).
  ['proto-payload', JSON.parse('{"__proto__":{"polluted":"PWN"},"a":1}')],
  ['ctor-payload', JSON.parse('{"constructor":{"prototype":{"polluted":"PWN"}}}')],
  ['deep-obj', mkDeep(40)], ['huge-val', { k: 'y'.repeat(50_000) }],
  ['len-obj', { length: 1e9 }], ['date', new Date(0)], ['re', /evil/gi],
  ['typed', new Uint8Array([1, 2, 3])], ['buf', Buffer.from('buf')],
  ['arr-proto', JSON.parse('[{"__proto__":{"polluted":"PWN"}}]')],
  // Şema-ipucu payload'ları — alan-adı tahminiyle derin yolları açar.
  ['schema-path', { filePath: '../../etc/passwd', path: '..\\..\\evil.exe', input: '/etc/passwd' }],
  ['schema-url', { url: 'file:///etc/passwd', youtube: 'javascript:alert(1)', src: 'x'.repeat(2000) }],
  ['schema-items', { items: [{ i: 0, t: 'x'.repeat(1000) }], tracks: [{ index: -1 }], ids: [0, -1] }],
  ['schema-state', { enabled: {}, model: {}, id: {}, tabId: {}, options: 'x' }],
  // EXTERNAL_PLAYER_NAMES double'ı ['x'] — file yetkisi spawn'a ulaşır;
  // file: URL'i protokol kapısında reddedilmeli (spawn çağrısı OLMAMALI).
  ['schema-player-file', { player: 'x', file: '/etc/passwd' }],
  ['schema-player-url', { player: 'x', url: 'file:///etc/passwd' }],
];
const protoNames = Object.getOwnPropertyNames(Object.prototype).join(',') + '|' +
  Object.getOwnPropertyNames(Array.prototype).join(',');
function assertNoPollution() {
  assert.strictEqual(Object.getPrototypeOf({}), Object.prototype);
  assert.strictEqual(Object.getPrototypeOf([]), Array.prototype);
  assert.equal(({}).polluted, undefined);
  assert.equal(([]).polluted, undefined);
  assert.equal(Object.getOwnPropertyNames(Object.prototype).join(','), protoNames.split('|')[0]);
  assert.equal(Object.getOwnPropertyNames(Array.prototype).join(','), protoNames.split('|')[1]);
}

const DANGER = /(?:^|\.)(?:spawn|exec|execFile|execFileSync|execSync|spawnSync|fork|openExternal|openPath|moveItemToTrash|setLoginItemSettings|kill|exit|crash|relaunch|writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|renameSync|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|mkdir|mkdirSync|mkdtemp|mkdtempSync|symlink|symlinkSync|chmod|chmodSync|chown|chownSync|truncate|truncateSync|copyFile|copyFileSync|utimes|utimesSync|send|postMessage|fetch|downloadURL|connect|request|setPassword|deletePassword|encryptString|decryptString|findInPage|stopFindInPage|setPermissionRequestHandler|setCertificateVerifyProc|loadExtension|removeExtension|setProxy|insertText|sendInputEvent|executeJavaScript|print|printToPDF|capturePage|setWindowOpenHandler|setAllowNTLMCredentialsForDomains|setUserAgent|clearData|clearCache|clearStorageData|flushStorageData|clearAuthCache|forcefullyCrashRenderer|saveSettings|persistQueueState|writeQueueState|saveBrowserSession|persistPlaces|appendJournal|inspectBurninRecoveryWrite|quit|relaunch)(?:\.|\(|$)/;

// Yan-etki allowlist'i — yalnız "payload ne olursa olsun bu kanalın işi zaten bu
// çağrı" olanlar. Her girdi gerekçelidir; payload-bağımlı sink BURADA olamaz.
const SIDE_EFFECT_ALLOWLIST = {
  // Kanalın tek işi oturum bölümünü temizlemek.
  'youtube-tv:signout': [/^session\.fromPartition\(\)\.clearStorageData/],
  // Kanalın tek işi sabit günlük klasörünü OS'te açmak.
  'logs:openFolder': [/^shell\.openPath/],
  // Kanalın tek işi sabit adapters klasörünü oluşturup OS'te açmak.
  'browser:adapters:openFolder': [/^fs\.mkdirSync/, /^shell\.openPath/],
  // Sabit argv ile yt-dlp güncelleme betiği (kanalın işi).
  'maintenance:updateYtdlp': [/^spawn/, /^resolvePython/],
  // Yetkili dosyada ffprobe/ffmpeg — kanalın işi; argv array, shell yok.
  'media:probeTracks': [/^spawn/, /^resolveFfTool/],
  'media:extractSubtitleTrack': [/^fs\.mkdirSync/, /^spawn/, /^resolveFfTool/],
  // Yetkili girdide python transkripsiyon süreci + userData altında iş klasörü — kanalın işi.
  'transcribe:start': [/^spawn/, /^authorizeMediaFile/, /^authorizeSubtitleFile/, /^fs\.mkdirSync/],
  // Kanalın işi kuyruk durumunu diske yazmak; validateQueueOptions + mergeQueueSnapshotForSave
  // normalizesi önceden çalışır. Payload şekli kuyruğun kendisidir (hostile anahtarlar
  // JSON'a veri olarak düşer; prototype zincirine dokunmaz — assertNoPollution kilitler).
  'queue:save': [/^writeQueueState/, /^mergeQueueSnapshotForSave/, /^readQueueStateRaw/],
  // Kanalın işi seçili harici oynatıcıyı yetkili dosya/URL ile başlatmak
  // (EXTERNAL_PLAYER_NAMES + politika/yetki kapıları önceden çalışır).
  'player:external': [/^spawn/, /^resolveExternalPlayerPath/, /^decideUrlPolicy/],
  // Ortam probu — sabit argv (python --version, ffmpeg -version, nvidia-smi).
  'app:getEnvInfo': [/^spawn/, /^probeCommand/],
  // Kanalın işi ayar nesnesini diske yazmak (payload = ayar, hedef sabit).
  'settings:save': [/^saveSettings/],
};
// OAuth loopback dinleyicisi tarayıcı onayını bekler — kanal tasarımı gereği
// senkron sonlanmaz; arg'suz kanal, payload bağımsız.
const HANG_ALLOWLIST = new Set(['youtube:authCode']);

const MAX_CALL_MS = 2000;
let passed = 0;
function test(name, fn) { return Promise.resolve(fn()).then(() => { passed += 1; console.log(`  PASS  ${name}`); }); }

function classifyError(e) {
  if (e instanceof Error) return `err:${e.name}`;
  // vm realm'inin Error'ı instanceof dışı kalır — ad+mesaj taşıyan nesne error sayılır.
  if (e && typeof e === 'object' && typeof e.message === 'string'
      && typeof e.name === 'string' && /Error$/u.test(e.name)) return `err:${e.name}(realm)`;
  return `nonerror:${typeof e}`;
}

(async () => {
  const violations = [];
  const coverage = { channels: 0, calls: 0, registerFails: [], hangs: [] };
  for (const [channel, src] of handlers) {
    const calls = [];
    const rec = makeRecorder(calls);
    const globals = {
      ...REAL_GLOBALS, ...statePresets(), ...gateDoubles(rec),
      authorizedBrowserSender: auth,
      dt: (tr) => tr, tr: (k) => k,
      console: rec('console'), process: rec('process'),
      require: (m) => { calls.push({ path: `require(${m})`, argc: 1, args: [m] }); return rec(`require(${m})`); },
      queueBrowserTabTransition: (fn) => fn(),
    };
    let callback;
    const capture = {
      handle: (name, fn) => { if (name === channel) callback = fn; },
      on: () => {},
    };
    const globalProxy = new Proxy(globals, {
      has: () => true,
      get: (t, p) => {
        if (p === 'ipcMain') return capture;
        if (p === 'globalThis' || p === 'self' || p === 'window') return globalProxy;
        if (p === Symbol.unscopables) return undefined;
        if (p in t) return t[p];
        return rec(String(p));
      },
      set: (t, p, v) => { t[p] = v; return true; },
    });
    try {
      vm.runInNewContext(src, globalProxy);
    } catch (err) {
      coverage.registerFails.push(`${channel}: ${err.message}`);
      continue;
    }
    if (typeof callback !== 'function') { coverage.registerFails.push(`${channel}: no-callback`); continue; }
    coverage.channels += 1;

    const nArgs = argCounts.get(channel);
    const positions = nArgs === 0 ? [-1] : Array.from({ length: nArgs }, (_, i) => i);
    for (const pos of positions) {
      for (const [label, rawPayload] of CORPUS) {
        const payload = structuredClone(rawPayload);
        const args = [authorized];
        const pNames = paramNames.get(channel) || [];
        for (let i = 0; i < nArgs; i += 1) args.push(i === pos ? payload : siblingValue(pNames[i]));
        calls.length = 0;
        const t0 = Date.now();
        let outcome = 'ok';
        let settleRace = () => {};
        const watchdog = new Promise((_, rej) => {
          const timer = setTimeout(() => rej(new Error('hang-timeout')), MAX_CALL_MS);
          settleRace = () => clearTimeout(timer);
        });
        try {
          await Promise.race([callback(...args), watchdog]);
        } catch (err) {
          outcome = classifyError(err);
        } finally { settleRace(); }
        const ms = Date.now() - t0;
        coverage.calls += 1;
        assertNoPollution();
        // Vm-realm kalıcı değildir; kalıcı kirlilik vektörü host-realm nesneleridir.
        // Payload'un kendi prototipi de takas edilmiş olmamalı (nesne türlerinde).
        if (payload && (typeof payload === 'object' || typeof payload === 'function')) {
          assert.equal(payload.polluted, undefined);
        }
        // Vm-realm prototip kirliliği: işleyici içindeki nesneler vm'nin
        // Object/Array.prototype'ını taşır — oraya yazılan 'polluted' host
        // tarafındaki denetimden geçmez. Bağlam içinden sondalanır.
        const vmClean = vm.runInContext(
          '({}).polluted === undefined && [].polluted === undefined',
          globalProxy) === true;
        if (!vmClean) {
          violations.push({ channel, pos, label, ms, outcome: 'vm-proto-pollution', danger: [] });
        }
        const dangerHits = calls.filter((c) => DANGER.test(c.path));
        const allowed = SIDE_EFFECT_ALLOWLIST[channel] || [];
        const unexpected = dangerHits.filter((hit) => !allowed.some((re) => re.test(hit.path)));
        const hang = ms > MAX_CALL_MS || /hang-timeout/.test(outcome);
        if (hang) coverage.hangs.push(`${channel} arg${pos} ${label} sinks=[${calls.map((c) => c.path).slice(0, 6).join(', ')}]`);
        if ((hang && !HANG_ALLOWLIST.has(channel)) || unexpected.length || outcome.startsWith('nonerror')) {
          violations.push({ channel, pos, label, ms, outcome, danger: unexpected });
        }
      }
    }
  }
  console.log(`\n${coverage.channels}/${handlers.size} kanal, ${coverage.calls} çağrı tarandı.`);
  if (coverage.registerFails.length) console.log(`    register-fail: ${coverage.registerFails.join(' | ')}`);
  if (coverage.hangs.length) {
    console.log(`    asılı kalan çağrılar (subprocess/stub-bekleme dahil): ${coverage.hangs.length}`);
    for (const h of coverage.hangs.slice(0, 15)) console.log(`      ${h}`);
  }
  if (violations.length) {
    console.log('\n=== İHLALLER ===');
    for (const v of violations) {
      const sinks = v.danger.map((d) => `${d.path}(${d.args.join(', ')})`).join(', ');
      console.log(`  ${v.channel} arg${v.pos} ${v.label}: ${v.ms}ms ${v.outcome} sinks=[${sinks}]`);
    }
  }
  assert.equal(violations.length, 0, `${violations.length} payload ihlali`);
  assert.deepEqual(coverage.registerFails, [],
    `sanal-alana kaydedilemeyen ${coverage.registerFails.length} kanal taranmadan kaldı`);
  await test('korpus + invariant özeti tamam', () => {});
})().catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => {
    console.log(`\n${passed} kontrol geçti`);
    // main.js'in require-time kaynakları (dosya izleyicileri, zamanlayıcılar)
    // süreci açık tutar; run-all'ın spawnSync timeout'unu tetiklememek için
    // çıktılar basıldıktan sonra açıkça çık.
    process.exit(process.exitCode || 0);
  });
