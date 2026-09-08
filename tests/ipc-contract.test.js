'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  IPC_CONTRACTS,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_SETTINGS_JSON_CHARS,
  TRANSCRIBE_KEYS,
  createValidatedIpcHandler,
  installIpcHandlerValidation,
  isAllowedOpenFilePath,
  publicErrorMessage,
  validateIpcArgs,
} = require('../src/ipc-contract');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

let passed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passed++;
        console.log(`  PASS  ${name}`);
      });
    }
    passed++;
    console.log(`  PASS  ${name}`);
    return Promise.resolve();
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(error.stack || error);
    process.exitCode = 1;
    return Promise.resolve();
  }
}

function matches(source, regex) {
  return [...source.matchAll(regex)].map((match) => match[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertSame(actual, expected, message) {
  assert.deepStrictEqual(sortedUnique(actual), sortedUnique(expected), message);
}

function rendererApiCallArities(source) {
  const calls = [];
  const pattern = /window\.api\.([A-Za-z_$][\w$]*)(?:\?\.)?\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    const open = pattern.lastIndex - 1;
    let depth = 1;
    let braces = 0;
    let brackets = 0;
    let commas = 0;
    let hasToken = false;
    let quote = '';
    let escaped = false;
    for (let index = open + 1; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        hasToken = true;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = '';
        continue;
      }
      if (char === '\'' || char === '"' || char === '`') {
        quote = char;
        hasToken = true;
      } else if (char === '(') {
        depth++;
        hasToken = true;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          calls.push({ name: match[1], arity: hasToken ? commas + 1 : 0, index: match.index });
          pattern.lastIndex = index + 1;
          break;
        }
      } else if (char === '{') {
        braces++;
        hasToken = true;
      } else if (char === '}') {
        braces--;
      } else if (char === '[') {
        brackets++;
        hasToken = true;
      } else if (char === ']') {
        brackets--;
      } else if (char === ',' && depth === 1 && braces === 0 && brackets === 0) {
        commas++;
      } else if (!/\s/.test(char)) {
        hasToken = true;
      }
    }
  }
  return calls;
}

function ok(channel, ...args) {
  assert.strictEqual(validateIpcArgs(channel, args), '', `${channel} geçerli payloadı reddetti`);
}

function rejected(channel, ...args) {
  assert.notStrictEqual(validateIpcArgs(channel, args), '', `${channel} geçersiz payloadı kabul etti`);
}

(async () => {
  await test('main ve preload invoke/send kanalları bire bir eşleşir', () => {
    const mainChannels = matches(mainSource, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
    const preloadChannels = matches(preloadSource, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g);
    const mainSendChannels = matches(mainSource, /ipcMain\.on\(\s*['"]([^'"]+)['"]/g);
    const preloadSendChannels = matches(preloadSource, /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g);
    assert(mainChannels.length > 50, 'IPC envanteri beklenmedik ölçüde küçük');
    assertSame(mainChannels, preloadChannels, 'orphan invoke/handler kanalı var');
    assertSame(mainSendChannels, preloadSendChannels, 'orphan send/on kanalı var');
    assert.strictEqual(mainChannels.length, new Set(mainChannels).size, 'main içinde yinelenen handler kanalı var');
    assert.strictEqual(mainSendChannels.length, new Set(mainSendChannels).size, 'main içinde yinelenen on kanalı var');
  });

  await test('her invoke handlerının makine tarafından okunabilen payload sözleşmesi vardır', () => {
    const mainChannels = matches(mainSource, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
    assertSame(Object.keys(IPC_CONTRACTS), mainChannels, 'sözleşmesiz veya handlersız kanal var');
  });

  await test('merkezi kaynak/payload doğrulaması ilk handler kaydından önce kurulur', () => {
    const installAt = mainSource.indexOf('installIpcHandlerValidation(');
    const firstHandlerAt = mainSource.indexOf('ipcMain.handle(');
    assert(installAt >= 0 && installAt < firstHandlerAt, 'IPC doğrulama katmanı handlerlardan önce kurulmalı');
    assert.match(mainSource, /contextIsolation:\s*true/);
    assert.match(mainSource, /nodeIntegration:\s*false/);
    assert.doesNotMatch(preloadSource, /^\s{2}(?:exec|spawn|shell|readFile|writeFile|removeFile)\s*:/m,
      'preload genel amaçlı shell/filesystem yetkisi açmamalı');
  });

  await test('main olay kanalları ve preload dinleyicileri bire bir eşleşir', () => {
    const mainEvents = matches(mainSource, /\.send\(\s*['"]([^'"]+)['"]/g);
    const preloadEvents = matches(preloadSource, /ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g);
    assertSame(mainEvents, preloadEvents, 'orphan main→renderer olay kanalı var');
  });

  await test('renderer yalnız preload tarafından açılan dar API yöntemlerini çağırır', () => {
    const exposed = matches(preloadSource, /^\s{2}([A-Za-z_$][\w$]*):/gm);
    const used = matches(rendererSource, /window\.api\.([A-Za-z_$][\w$]*)/g);
    const missing = sortedUnique(used).filter((name) => !exposed.includes(name));
    assert.deepStrictEqual(missing, [], `preload köprüsünde eksik renderer çağrıları: ${missing.join(', ')}`);
    assert(!/^\s{2}ipcRenderer\s*:/m.test(preloadSource), 'ipcRenderer nesnesi doğrudan renderer dünyasına açılmamalı');
  });

  await test('renderer çağrıları preload bridge imzalarından eksik argüman göndermez', () => {
    const signatures = new Map();
    const optionalTail = new Map([['browserCommand', 1]]);
    for (const match of preloadSource.matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s*\(([^)]*)\)\s*=>/gm)) {
      const count = match[2].trim() ? match[2].split(',').length : 0;
      signatures.set(match[1], optionalTail.get(match[1]) ?? count);
    }
    const short = rendererApiCallArities(rendererSource).filter((call) => (
      signatures.has(call.name) && call.arity < signatures.get(call.name)
    ));
    assert.deepStrictEqual(short.map((call) => `${call.name}:${call.arity}/${signatures.get(call.name)}`), [],
      'renderer→preload payload imzası eksik çağrılar içeriyor');
  });

  await test('dosya okuma/yazma yalnız yerel altyazı uzantılarına açıktır', () => {
    const subtitle = 'C:\\Medya\\film.tr.srt';
    ok('media:readSubtitle', subtitle);
    ok('media:writeSubtitle', { path: subtitle, text: '1\n00:00:00,000 --> 00:00:01,000\nMerhaba' });
    rejected('media:readSubtitle', 'C:\\Users\\K\\.codex\\auth.json');
    rejected('media:writeSubtitle', { path: 'C:\\Users\\K\\Desktop\\startup.js', text: 'kod' });
    rejected('media:writeSubtitle', { path: 'film.srt', text: 'göreli yol' });
  });

  await test('diskten altyazı ve ayar okuma dosya boyutunu okumadan önce sınar', () => {
    const readStart = mainSource.indexOf("ipcMain.handle('media:readSubtitle'");
    const readEnd = mainSource.indexOf("ipcMain.handle('watch:start'", readStart);
    const readHandler = mainSource.slice(readStart, readEnd);
    assert(readHandler.indexOf('fs.statSync(filePath)') < readHandler.indexOf('fs.readFileSync(filePath)'),
      'altyazı dosyası okumadan önce stat boyutu sınanmalı');
    const importStart = mainSource.indexOf("ipcMain.handle('settings:import'");
    const importEnd = mainSource.indexOf("ipcMain.handle('media:probeTracks'", importStart);
    const importHandler = mainSource.slice(importStart, importEnd);
    assert(importHandler.indexOf('fs.statSync(importPath)') < importHandler.indexOf('fs.readFileSync(importPath'),
      'ayar yedeği okumadan önce stat boyutu sınanmalı');
  });

  await test('metin, ayar ve tarama payloadlarının boyut/adet sınırları vardır', () => {
    rejected('settings:save', { glossary: 'x'.repeat(MAX_SETTINGS_JSON_CHARS + 1) });
    rejected('clipboard:write', 'x'.repeat(8 * 1024 * 1024 + 1));
    rejected('paths:scanMedia', Array.from({ length: 513 }, (_, index) => `C:\\Medya\\${index}`));
    ok('paths:scanMedia', ['C:\\Medya', 'D:\\Dizi']);
    ok('watch:start', 'D:\\Gelen', { formats: 'srt,vtt', langSuffix: true, outputDir: 'D:\\Çıktı', translateTo: 'tr' });
    rejected('watch:start', 'D:\\Gelen', { formats: 'srt,exe' });
    rejected('watch:start', 'D:\\Gelen', { formats: 'srt', shellCommand: 'whoami' });
  });

  await test('PNG data URL ve altyazı cue dizisi kaynak tüketimini sınırlıdır', () => {
    ok('media:saveImage', { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', suggestedName: 'kare.png' });
    rejected('media:saveImage', { dataUrl: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_CHARS)}` });
    rejected('media:saveImage', { dataUrl: 'data:text/plain;base64,QQ==', suggestedName: 'not.png' });
    const cue = { start: 0, end: 1, text: 'satır' };
    rejected('browser:subtitle:export', { cues: Array.from({ length: 20001 }, () => cue), format: 'srt' });
    rejected('browser:setOverlay', { source: [cue], internalScript: 'alert(1)' });
  });

  await test('enum ve sayı sınırları yanlış renderer payloadlarını erken reddeder', () => {
    ok('browser:command', 'speed', 1.25);
    rejected('browser:command', 'speed', 40);
    rejected('browser:command', 'shell', 'whoami');
    ok('browser:capture:setEnabled', false);
    rejected('browser:capture:setEnabled', 'false');
    ok('dialog:openFile', 'subtitle');
    rejected('dialog:openFile', 'executable');
    ok('subs:shift', 'C:\\Medya\\film.vtt', -2.5);
    rejected('subs:shift', 'C:\\Medya\\film.txt', 0);
  });

  await test('harici protokoller ve bozuk URLler shell/medya kanallarına geçmez', () => {
    ok('shell:openExternal', 'https://example.com/watch?v=1');
    rejected('shell:openExternal', 'file:///C:/Windows/win.ini');
    rejected('shell:openExternal', 'javascript:alert(1)');
    ok('shell:openPath', 'D:\\Medya\\film.srt');
    ok('shell:openPath', 'D:\\Medya');
    rejected('shell:openPath', 'C:\\Temp\\calistir.exe');
    rejected('shell:openPath', 'C:\\Temp\\calistir.ps1');
    assert.strictEqual(isAllowedOpenFilePath('D:\\Medya\\film.srt'), true);
    assert.strictEqual(isAllowedOpenFilePath('D:\\Medya\\film.mkv'), true);
    assert.strictEqual(isAllowedOpenFilePath('C:\\Temp\\calistir.exe'), false);
    const openStart = mainSource.indexOf("ipcMain.handle('shell:openPath'");
    const openEnd = mainSource.indexOf("ipcMain.handle('shell:openExternal'", openStart);
    assert.match(mainSource.slice(openStart, openEnd), /fs\.statSync\(p\)[\s\S]*isAllowedOpenFilePath\(p\)/,
      'gerçek dosya türü shell.openPath öncesinde sınanmalı');
    ok('media:probe', { url: 'https://youtu.be/abc', cookieBrowser: 'firefox' });
    rejected('media:probe', { url: 'https://youtu.be/abc', cookieBrowser: 'powershell' });
    rejected('media:probe', { url: 'https://youtu.be/abc', arbitraryField: true });
  });

  await test('transkripsiyon şeması bilinmeyen alanı, bozuk enumu ve çift girdiyi reddeder', () => {
    const base = {
      input: 'D:\\Medya\\film.mkv', engine: 'faster', device: 'cuda', computeType: 'float16',
      task: 'transcribe', splitMode: 'sentence', wrapMode: 'none', formats: 'srt,vtt',
    };
    ok('transcribe:start', base);
    rejected('transcribe:start', { ...base, shellCommand: 'Remove-Item C:\\' });
    rejected('transcribe:start', { ...base, engine: 'arbitrary-engine' });
    rejected('transcribe:start', { ...base, youtube: 'https://youtu.be/abc' });
    rejected('transcribe:start', { ...base, input: 'D:\\Medya\\notlar.exe' });
    rejected('transcribe:start', { ...base, glossary: 'x'.repeat(24001) });
    const start = mainSource.indexOf("ipcMain.handle('transcribe:start'");
    const end = mainSource.indexOf("ipcMain.handle('maintenance:updateYtdlp'", start);
    const consumed = matches(mainSource.slice(start, end), /options\.([A-Za-z_$][\w$]*)/g);
    const missing = sortedUnique(consumed).filter((key) => !TRANSCRIBE_KEYS.has(key));
    assert.deepStrictEqual(missing, [], `transcribe handlerında sözleşmesiz alanlar: ${missing.join(', ')}`);
  });

  await test('izleme kütüphanesi kaydı sınırlı bir şema dışında alan taşımaz', () => {
    ok('library:upsert', {
      key: 'local:d:/medya/film.mkv', type: 'local', title: 'Film', localPath: 'D:\\Medya\\film.mkv',
      duration: 7200, position: 120, completed: false, subtitlePaths: ['D:\\Medya\\film.srt'],
      prefs: { speed: 1 }, session: { id: 'session-1', watchSeconds: 120 },
    });
    rejected('library:upsert', { key: 'x', arbitraryBlob: 'x' });
    rejected('library:search', 'x'.repeat(501));
  });

  await test('handler sarmalayıcısı yalnız ana pencerenin ana frame çağrısını kabul eder', async () => {
    const mainFrame = {};
    const trusted = { mainFrame, isDestroyed: () => false };
    const handler = createValidatedIpcHandler(
      'history:list',
      async () => ['ok'],
      () => trusted,
      { error() { throw new Error('log çağrılmamalı'); } },
    );
    assert.deepStrictEqual(await handler({ sender: trusted, senderFrame: mainFrame }), ['ok']);
    assert.deepStrictEqual(await handler({ sender: {}, senderFrame: mainFrame }), { ok: false, error: 'Yetkisiz IPC isteği.' });
    assert.deepStrictEqual(await handler({ sender: trusted, senderFrame: {} }), { ok: false, error: 'Yetkisiz IPC isteği.' });
    assert.deepStrictEqual(await handler({ sender: trusted }), { ok: false, error: 'Yetkisiz IPC isteği.' });
    assert.match((await handler({ sender: trusted, senderFrame: mainFrame }, 'fazla')).error, /parametre kabul etmiyor/);
  });

  await test('merkezi kurulum sonradan kaydedilen her handlerı da sözleşmeyle sarar', async () => {
    let registered;
    const ipcMain = { handle(channel, handler) { registered = { channel, handler }; } };
    const mainFrame = {};
    const trusted = { mainFrame, isDestroyed: () => false };
    installIpcHandlerValidation(ipcMain, () => trusted, { error() {} });
    ipcMain.handle('clipboard:write', async (_event, text) => text.length);
    assert.strictEqual(registered.channel, 'clipboard:write');
    assert.strictEqual(await registered.handler({ sender: trusted, senderFrame: mainFrame }, 'abc'), 3);
    assert.match((await registered.handler({ sender: {}, senderFrame: mainFrame }, 'abc')).error, /Yetkisiz/);
    assert.throws(() => ipcMain.handle('orphan:channel', async () => true), /sözleşmesi eksik/);
  });

  await test('beklenmeyen hata stack sızdırmadan serileştirilir ve hassas sorgu değeri gizlenir', async () => {
    const logs = [];
    const trusted = { mainFrame: {}, isDestroyed: () => false };
    const handler = createValidatedIpcHandler(
      'settings:load',
      async () => { throw new Error('C:\\secret\\settings.json stack ayrıntısı'); },
      () => trusted,
      { error(...args) { logs.push(args); } },
    );
    const result = await handler({ sender: trusted, senderFrame: trusted.mainFrame });
    assert.deepStrictEqual(result, { ok: false, error: 'İşlem sırasında beklenmeyen bir hata oluştu.' });
    assert.strictEqual(logs.length, 1, 'temizlenmiş ayrıntı yalnız ana süreç loguna gitmeli');
    assert.strictEqual(logs[0].length, 1);
    assert(!String(logs[0][0]).includes('\n'), 'log satırı stack taşımamalı');
    assert.strictEqual(publicErrorMessage('https://x.test/?token=secret&v=1\nstack'), 'https://x.test/?token=[gizlendi]&v=1 stack');
    assert.strictEqual(publicErrorMessage('Bearer abc.def sk-secretsecret hf_secretsecret'),
      'Bearer [gizlendi] [gizlendi] [gizlendi]');
    assert.strictEqual(publicErrorMessage('C:\\Users\\K\\secret\\settings.json açılamadı'),
      '[yerel yol gizlendi] açılamadı');

    const returnedError = createValidatedIpcHandler(
      'settings:load',
      async () => ({ ok: false, error: 'C:\\Users\\K\\secret\\settings.json açılamadı' }),
      () => trusted,
      { error() {} },
    );
    assert.deepStrictEqual(await returnedError({ sender: trusted, senderFrame: trusted.mainFrame }),
      { ok: false, error: '[yerel yol gizlendi] açılamadı' });
  });

  if (!process.exitCode) {
    const invokeCount = matches(mainSource, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g).length;
    const sendCount = matches(mainSource, /ipcMain\.on\(\s*['"]([^'"]+)['"]/g).length;
    const eventCount = sortedUnique(matches(mainSource, /\.send\(\s*['"]([^'"]+)['"]/g)).length;
    console.log(`\n${passed} IPC sözleşme testi geçti · ${invokeCount} invoke · ${sendCount} send · ${eventCount} olay kanalı.`);
  }
})();
