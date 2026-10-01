'use strict';
// R324-4 — iptal/abort yayılım tutarlılığı: pageTranslationJobIsCurrent /
// mangaJobIsCurrent sözleşmesi hostile-durum fuzz'ı + abort yayılımının
// statik bütünlük ratchet'i (her IsCurrent yüzeyinin abort çağrısı önce
// gelir, sonuç düşürme hep predicate üzerinden gider).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const vm = require('vm');

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// main.js içindeki GERÇEK predicate gövdesini çıkarır — kopya-model yerine
// üretim kodu fuzz'lanır, böylece hem oracle'ın hem predicate'in aynı
// yanlışta buluşması imkânsızlaşır (statik kilitler ayrıca var).
function extractFn(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\)\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  // imzalı varsayılan parametrelerdeki `{}` yanlış kapanış üretmesin diye
  // derinlik sayımı parametre listesinin `)` sonrasındaki `{` ile başlar.
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(m.index, i + 1);
  }
  return null;
}

const realm = vm.createContext({});
const REAL_PREDICATES = {};
for (const [slot, name] of [['pageTranslateJob', 'pageTranslationJobIsCurrent'], ['mangaJob', 'mangaJobIsCurrent']]) {
  const src = extractFn(main, name);
  assert.ok(src, `${name} main.js içinde bulunamadı`);
  vm.runInContext(src, realm);
  REAL_PREDICATES[slot] = realm[name];
}

describe('R324-4: IsCurrent sözleşmesi — hostile-durum fuzz (3000 tohum)', () => {
  it('current ⟺ kimlik+!aborted+nesil+görünüm dörtlüsünün hepsi geçerli (gerçek predicate)', () => {
    const slots = ['pageTranslateJob', 'mangaJob'];
    for (let seed = 0; seed < 3000; seed++) {
      const rand = rng(seed);
      const slot = pick(rand, slots);
      const gen = pick(rand, [0, 1, 7, -1, NaN, 2 ** 31]);
      const destroyed = rand() < 0.4;
      const job = {
        generation: rand() < 0.6 ? gen : pick(rand, [0, 1, 7, -1, NaN, 9]),
        controller: { signal: { aborted: rand() < 0.5 } },
      };
      const tab = rand() < 0.1 ? null : {
        generation: gen,
        view: rand() < 0.85 ? { webContents: { isDestroyed: () => destroyed } } : null,
      };
      if (tab) {
        // %20 ihtimalle slot başka bir job nesnesine bakar
        tab[slot] = rand() < 0.8 ? job : { generation: gen, controller: { signal: { aborted: false } } };
      }

      const got = REAL_PREDICATES[slot](tab, job);
      const expected = !!tab
        && tab[slot] === job
        && !job.controller.signal.aborted
        && tab.generation === job.generation
        && !!(tab.view && !tab.view.webContents.isDestroyed());
      // Predicate strict boolean değil falsy/truthy döndürür (son operand
      // null olabilir) — çağrıcılar boolean bağlamda kullanır.
      assert.equal(!!got, expected, `seed ${seed}`);
      // current ise hiçbir bozulma alanı yok
      if (got) {
        assert.ok(!job.controller.signal.aborted, 'aborted job current olamaz');
        assert.ok(tab.view && !tab.view.webContents.isDestroyed());
      }
    }
  });

  it('NaN nesil her iki tarafta da eşleşmez (güvenli tarafa düşer)', () => {
    const job = { generation: NaN, controller: { signal: { aborted: false } } };
    const tab = { generation: NaN, mangaJob: job, view: { webContents: { isDestroyed: () => false } } };
    assert.equal(REAL_PREDICATES.mangaJob(tab, job), false);
  });
});

describe('R324-4: statik yayılım bütünlüğü', () => {
  it('her IsCurrent predicate dört koşulu da içerir', () => {
    for (const name of ['pageTranslationJobIsCurrent', 'mangaJobIsCurrent']) {
      const idx = main.indexOf(`function ${name}`);
      assert.ok(idx > 0, `${name} bulunamadı`);
      const body = main.slice(idx, idx + 400);
      for (const clause of ['signal.aborted', 'generation', 'isDestroyed', `tab.${name === 'pageTranslationJobIsCurrent' ? 'pageTranslateJob' : 'mangaJob'}`]) {
        assert.ok(body.includes(clause), `${name} içinde '${clause}' eksik`);
      }
    }
  });

  it('abort çağrısı slot temizlenmeden önce gelir (stop fonksiyonları)', () => {
    // stopBrowserPageTranslation / stopBrowserManga gövdelerinde
    // controller.abort, job=null atamasından önce görünmeli.
    for (const [name, slot] of [['stopBrowserPageTranslation', 'pageTranslateJob'],
      ['stopBrowserManga', 'mangaJob']]) {
      const idx = main.indexOf(`function ${name}`);
      assert.ok(idx > 0, `${name} bulunamadı`);
      const body = main.slice(idx, idx + 1400);
      const abortIdx = body.indexOf('.abort(');
      const slotNullIdx = body.indexOf(`${slot} = null`);
      assert.ok(abortIdx > -1, `${name} içinde abort çağrısı yok`);
      assert.ok(slotNullIdx === -1 || abortIdx < slotNullIdx,
        `${name}: abort, ${slot} temizliğinden sonra`);
    }
  });

  it('job döngüleri bölgesinde aborted kontrol noktası taşır', () => {
    // Her işçi döngüsünün KENDİ gövdesinde iptal kontrolü olmalı — global
    // sayım bir döngüde kontrol kaybolunca fark edemezdi. Anchor hem serbest
    // fonksiyonları hem ipcMain.handle gövdelerini bulur.
    const extractHandler = (channel) => {
      const re = new RegExp(`ipcMain\\.handle\\('${channel}'[\\s\\S]*?=>\\s*\\{`);
      const m = re.exec(main);
      if (!m) return null;
      const start = m.index + m[0].length - 1;
      let depth = 0;
      for (let i = start; i < main.length; i++) {
        if (main[i] === '{') depth++;
        else if (main[i] === '}' && --depth === 0) return main.slice(m.index, i + 1);
      }
      return null;
    };
    for (const [label, body] of [
      ['manga işçi döngüsü', extractFn(main, 'translateMangaCandidate')],
      ['pdf çeviri döngüsü', extractHandler('pdf:translatePages')],
      ['sayfa çevirisi blok döngüsü', extractFn(main, 'runBrowserPageTranslationBlocks')],
    ]) {
      assert.ok(body, `${label}: anchor bulunamadı — refaktörde bu test güncellenmeli`);
      assert.ok(/\.aborted|mangaJobIsCurrent|pageTranslationJobIsCurrent|cancelAll/.test(body),
        `${label}: gövdede abort/IsCurrent kontrolü yok`);
    }
  });
});
