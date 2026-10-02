// Kuyruk-g20 — Windows paket açılışı: Türkçe+boşluklu yolda medya dosya URL'si
// ve .bat yollarının değişmezleri. pathToFileUrl davranış kilidi (vm-slice).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8').replace(/\r\n/g, '\n');
const installBat = fs.readFileSync(path.join(root, 'install.bat'), 'utf8');
const startBat = fs.readFileSync(path.join(root, 'start.bat'), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

const startIdx = renderer.indexOf('function pathToFileUrl');
const slice = renderer.slice(startIdx, renderer.indexOf('\n}', startIdx) + 2);
const ctx = vm.createContext({ String, encodeURI });
vm.runInContext(`${slice}; this.__f = pathToFileUrl;`, ctx);
const f = ctx.__f;

test('Türkçe karakterli Windows yolu doğru yüzde-kodlanır', () => {
  const url = f('D:\\Videolar\\İnek Çiftliği\\film.srt');
  assert.strictEqual(url, 'file:///D:/Videolar/%C4%B0nek%20%C3%87iftli%C4%9Fi/film.srt');
});

test('yüzde işareti dosya adında çift kodlanır (yanlış dosyaya çözülmez)', () => {
  const url = f('C:\\Users\\x\\%20yeniden.srt');
  assert.ok(url.includes('%2520'), url);
  assert.ok(!/(?<!%25)%20/.test(url), 'tek-kodlanmış %20 kalmasın');
});

test('boşluklu klasör yolu %20 ile kodlanır', () => {
  assert.strictEqual(f('D:\\Whisper Local\\altyazı\\çıktı.srt'),
    'file:///D:/Whisper%20Local/altyaz%C4%B1/%C3%A7%C4%B1kt%C4%B1.srt');
});

test('hash karakteri sorgu/parça sınırı oluşturmaz', () => {
  assert.ok(f('C:\\x\\film#1.mp4').includes('%231'), 'hash %23 olmalı');
});

test('sürücü harfi korunur, POSIX yolu üç slash ile kalır', () => {
  assert.ok(f('C:\\a\\b.srt').startsWith('file:///C:/'));
  assert.ok(f('/home/kullanıcı/dosya.srt').startsWith('file:///home/'));
});

test('UNC ağ yolu sunucuyu host olarak korur (yerel dizine çözülmez)', () => {
  // \\sunucu\paylas\x → file://sunucu/paylas/x; eski sürüm sunucu adını yola
  // katlıyor ve URL yerel 'C:\sunucu\paylas\x'e düşüyordu — ağ paylaşımındaki
  // medya oynatıcıda açılmıyordu.
  const url = f('\\\\nas-kutu\\filmler\\gece.mp4');
  assert.strictEqual(url, 'file://nas-kutu/filmler/gece.mp4');
  const parsed = new URL(url);
  assert.strictEqual(parsed.hostname, 'nas-kutu');
  assert.strictEqual(parsed.pathname, '/filmler/gece.mp4');
});

test('UNC yolunda Türkçe ve boşluk da host bölümüne dokunmadan kodlanır', () => {
  const url = f('\\\\server\\paylaşım\\Kış Güneşi.mkv');
  assert.strictEqual(url, 'file://server/payla%C5%9F%C4%B1m/K%C4%B1%C5%9F%20G%C3%BCne%C5%9Fi.mkv');
});

test('soru işareti dosya adı sorgu sınırı oluşturmaz', () => {
  // POSIX'te '?' geçerli dosya adı karakteridir; kodlanmadan kalırsa URL
  // parçalayıcı kalanını sorgu dizisi sanıp dosyayı keser.
  const url = f('/home/x/neyin peşinde?.mp4');
  assert.strictEqual(url, 'file:///home/x/neyin%20pe%C5%9Finde%3F.mp4');
});

test('install.bat anahtar yolları tırnaklı ve dizini %~dp0 üzerinden kurar', () => {
  assert.match(installBat, /cd \/d "%~dp0"/);
  assert.match(installBat, /node "%~dp0tools\\install-orchestrator\.js"/);
});

test('start.bat PATH katmanları tırnaklı değişken atamalarıyla kurulur', () => {
  assert.match(startBat, /set "VENV_LIB=%~dp0backend\\venv\\Lib\\site-packages"/);
  assert.match(startBat, /set "PATH=%VENV_LIB%\\torch\\lib;%PATH%"/);
  assert.match(startBat, /set "PATH=%~dp0backend\\bin;%PATH%"/);
});

test('ffmpeg subtitles= argümanı tek tırnak + sürücü iki nokta kaçışlı (boşluk güvenli)', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const fnIdx = main.indexOf('function ffSubtitlesArg');
  const body = main.slice(fnIdx, main.indexOf('\n}', fnIdx));
  assert.ok(body.includes(`p.replace(/\\\\/g, '/')`), 'backslash→slash');
  assert.ok(body.includes(`replace(/^([A-Za-z]):/,`), 'sürücü iki nokta kaçışı');
  assert.ok(body.includes("subtitles='${fwd}'"), 'tek tırnaklı sarma');
});

console.log(`PASS ${passed}/${passed}`);
