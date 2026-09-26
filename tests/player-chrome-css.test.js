'use strict';

// Oynatıcı/ray CSS regresyonları. Hepsi ölçülmüş hatalardan geliyor:
// - .st-upnext-count bloğu .player-osd kuralının ORTASINA yapıştırılmış, kapanış
//   parantezi kaybolmuştu: OSD'nin opacity/color/pointer-events/transition
//   bildirimleri seçici konumuna düştü, .player-osd.show kuralı da geçersiz
//   seçiciye yutuldu. Sonuç: videonun üstünde hep boş siyah hap, açık temada
//   koyu-üstü-koyu metin.
// - <summary> varsayılan display:list-item; "…" simgesi dairenin sol üstündeydi.
// - Tarayıcı rayında padding-inline:14px 48 px'lik rayı 20 px içeriğe düşürüyordu.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssDir = path.join(__dirname, '../src/renderer');
const files = fs.readdirSync(cssDir).filter((name) => name.endsWith('.css'));

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

// En içteki {…} bloklarını (seçici, gövde) çiftleri olarak döndürür.
function rules(source) {
  const out = [];
  for (const m of stripComments(source).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

function declarations(body) {
  const map = new Map();
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    map.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return map;
}

function findRule(source, selector) {
  return rules(source).filter((r) => r.selector.split('\n').pop().trim() === selector);
}

// 1) Hiçbir dosyada seçici konumunda "prop: değer;" kalıntısı olmamalı.
for (const name of files) {
  const src = fs.readFileSync(path.join(cssDir, name), 'utf8');
  for (const { selector } of rules(src)) {
    const lastSelector = selector.split('}').pop();
    assert.ok(!/^\s*[a-z-]+\s*:\s*[^;{}]+;/m.test(lastSelector),
      `${name}: seçici konumunda sahipsiz bildirim var (kural bloğu bölünmüş olabilir):\n${lastSelector.slice(0, 200)}`);
  }
}

// 1b) Özel özellik kendine başvuramaz: `--x: var(--x)` döngüseldir, değer boş
//     kalır ve onu kullanan her bildirim geçersiz olur (browser-chrome.css'te
//     --motion-fast/--motion-base böyleydi; geçişler hiç çalışmıyordu).
for (const name of files) {
  const src = stripComments(fs.readFileSync(path.join(cssDir, name), 'utf8'));
  for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;{}]*)/g)) {
    assert.ok(!new RegExp(`var\\(\\s*${m[1]}\\s*[,)]`).test(m[2]),
      `${name}: ${m[1]} kendine başvuruyor (döngüsel özel özellik)`);
  }
}

const styles = fs.readFileSync(path.join(cssDir, 'styles.css'), 'utf8');
const chrome = fs.readFileSync(path.join(cssDir, 'browser-chrome.css'), 'utf8');

// 2) OSD varsayılan gizli, tıklamayı geçirir, temadan bağımsız açık metin.
const osd = findRule(styles, '.player-osd');
assert.equal(osd.length, 1, '.player-osd temel kuralı tek olmalı');
const osdDecl = declarations(osd[0].body);
assert.equal(osdDecl.get('opacity'), '0');
assert.equal(osdDecl.get('pointer-events'), 'none');
assert.match(osdDecl.get('color') || '', /var\(--ink-bright\)|#fff/);
assert.match(osdDecl.get('transition') || '', /opacity/);
const osdShow = findRule(styles, '.player-osd.show');
assert.equal(osdShow.length, 1, '.player-osd.show geçerli bir kural olarak ayrışmalı');
assert.equal(declarations(osdShow[0].body).get('opacity'), '1');

// 3) "…" düğmesi ortalanır.
const more = findRule(styles, '.player-more > summary');
assert.equal(more.length, 1);
assert.equal(declarations(more[0].body).get('display'), 'grid');
assert.equal(declarations(more[0].body).get('place-items'), 'center');

// 4) Tarayıcı rayı kendi dar dolgusunu korur.
const rail = findRule(chrome, '.workspace-browser .player-side.side-rail');
assert.equal(rail.length, 1, 'tarayıcı rayı dolgu kuralı eksik');
assert.equal(declarations(rail[0].body).get('padding-inline'), '4px');

console.log('player-chrome-css: ok');
