'use strict';
// R154 — Electron güvenlik sertleştirme ratchet'i.
// Her BrowserWindow/WebContentsView kurulum noktasının kilitli
// webPreferences taşıdığını ve uygulama genelinde webview reddinin
// kurulu olduğunu statik olarak doğrular. Yeni bir pencere ekleyen kod
// bu testten geçmek zorundadır — kilit unutulursa CI düşer.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(SRC, f), 'utf8') }));

let n = 0;
const ok = (c, m) => { n += 1; assert(c, m); };

// Bir kurulum noktasından sonra gelen ~60 satır webPreferences'ı içerir.
const siteText = (file, index) => file.text.slice(index, index + 4000);

const REQUIRED = [/contextIsolation:\s*true/, /nodeIntegration:\s*false/, /sandbox:\s*true/];
const FORBIDDEN = [/nodeIntegration:\s*true/, /contextIsolation:\s*false/, /sandbox:\s*false/,
  /webSecurity:\s*false/, /allowRunningInsecureContent:\s*true/, /webviewTag:\s*true/,
  /experimentalFeatures:\s*true/, /navigateOnDragDrop:\s*true/];

// Popuplarda tercihler securePopupWebPreferences() üzerinden gelir — o
// fonksiyonun gövdesi de aynı gereksinimlere tabi.
const helperBodies = [];
for (const file of files) {
  const re = /function\s+(securePopupWebPreferences|browserPopupWindowOptions)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(file.text))) {
    helperBodies.push({ name: m[1], text: file.text.slice(m.index, m.index + 4000) });
  }
}
ok(helperBodies.some((h) => h.name === 'securePopupWebPreferences'), 'securePopupWebPreferences bulunamadı');
for (const helper of helperBodies) {
  if (helper.name === 'securePopupWebPreferences') {
    for (const rule of REQUIRED) {
      ok(rule.test(helper.text), `${helper.name} eksik kilit: ${rule}`);
    }
  } else {
    // browserPopupWindowOptions gibi sarıcılar kilitli yardımcıya değmeli.
    ok(/securePopupWebPreferences/.test(helper.text),
      `${helper.name} securePopupWebPreferences kullanmıyor`);
  }
  for (const rule of FORBIDDEN) {
    ok(!rule.test(helper.text), `${helper.name} yasaklı ayar: ${rule}`);
  }
}

let siteCount = 0;
for (const file of files) {
  const re = /new\s+(BrowserWindow|WebContentsView|BrowserView)\s*\(/g;
  let m;
  while ((m = re.exec(file.text))) {
    siteCount += 1;
    const slice = siteText(file, m.index);
    // popup'lar overrideBrowserWindowOptions üzerinden yardımcıya gider —
    // dilimde webPreferences görünmeyebilir, yardımcı referansı yeterlidir.
    if (/securePopupWebPreferences|browserPopupWindowOptions/.test(slice)) continue;
    ok(/webPreferences/.test(slice), `${file.name}:${m.index} webPreferences yok`);
    for (const rule of REQUIRED) {
      ok(rule.test(slice), `${file.name}:${m.index} eksik kilit: ${rule}`);
    }
  }
  for (const rule of FORBIDDEN) {
    ok(!rule.test(file.text), `${file.name} yasaklı ayar: ${rule}`);
  }
}
ok(siteCount >= 5, `beklenen kurulum noktaları bulunamadı (${siteCount})`);

// Uygulama genelinde webview reddi kurulu olmalı (web-contents-created +
// will-attach-webview preventDefault) — ayrı pencere kilitlerinden bağımsız
// savunma derinliği katmanı.
const main = files.find((f) => f.name === 'main.js').text;
ok(/web-contents-created/.test(main), 'main.js web-contents-created kancası yok');
ok(/will-attach-webview/.test(main), 'main.js will-attach-webview reddi yok');

// Sertifika hatalarında asla sessiz geçiş olmamalı.
ok(/certificate-error[\s\S]{0,2000}callback\(false\)/.test(main), 'certificate-error handler callback(false) çağırmıyor');

// Harici açılışlar tek politika kapısından geçmeli — doğrudan shell.openExternal
// çağrısı yalnız openExternalByPolicy içinde bulunabilir.
const shellCalls = [...main.matchAll(/shell\.openExternal\s*\(/g)];
ok(shellCalls.length === 1, `shell.openExternal ${shellCalls.length} yerde (yalnız openExternalByPolicy beklenir)`);

// R244: V8 kod önbelleği politikası yalnız ana pencerede ve yalnız güvenli
// değerde — 'bypassHeatCheckAndEagerCompile' GC/bellek baskısı riski taşır.
const v8Uses = [...main.matchAll(/v8CacheOptions:\s*'([^']+)'/g)].map((m) => m[1]);
ok(v8Uses.length === 1, `v8CacheOptions ${v8Uses.length} yerde (yalnız ana pencere beklenir)`);
ok(v8Uses[0] === 'bypassHeatCheck', `v8CacheOptions=${v8Uses[0]} (yalnız bypassHeatCheck)`);
ok(!/bypassHeatCheckAndEagerCompile/.test(main), 'eager compile yasak — GC/bellek baskısı');

// R279: getDisplayMedia yalnız ana pencerenin ÜST dokümanına açık —
// requestFrame.top===mainFrame kabulü ana penceredeki herhangi bir iframe'e
// jestle ekran+loopback ses verirdi; üst-doküman eşitliği şart.
const dm = main.match(/setDisplayMediaRequestHandler\(async \(request, callback\)[\s\S]{0,1400}?getSources/);
ok(!!dm, 'setDisplayMediaRequestHandler bloğu bulunamadı');
if (dm) {
  ok(!/requestFrame\.top\s*===\s*mainFrame/.test(dm[0]),
    'displayMedia alt kareye de açık (requestFrame.top kabulü)');
  ok(/requestFrame === mainFrame/.test(dm[0]),
    'displayMedia üst-doküman eşitliği (requestFrame===mainFrame) eksik');
  ok(/request\.userGesture/.test(dm[0]), 'displayMedia jest koşulu eksik');
  ok(/request\.audioRequested/.test(dm[0]), 'displayMedia ses-istemi koşulu eksik');
}

console.log(`electron-security: ${n} kontrol geçti (${siteCount} kurulum noktası)`);
