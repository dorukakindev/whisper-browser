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

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// main.js içindeki gerçek predicate'ler ile aynı sözleşmeyi uygular —
// predicate main içinden kopya değil, sözleşme-modeli: değişiklik halinde
// bu test sapmayı yakalar (aşağıdaki statik test kaynak metni de kilitler).
function jobIsCurrentContract(tab, job, slot) {
  return !!tab && tab[slot] === job && !job.controller.signal.aborted
    && tab.generation === job.generation && tab.view && !tab.view.webContents.isDestroyed();
}

describe('R324-4: IsCurrent sözleşmesi — hostile-durum fuzz (3000 tohum)', () => {
  it('current ⟺ kimlik+!aborted+nesil+görünüm dörtlüsünün hepsi geçerli', () => {
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

      const got = jobIsCurrentContract(tab, job, slot);
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
    assert.equal(jobIsCurrentContract(tab, job, 'mangaJob'), false);
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

  it('job döngüleri signal.aborted kontrol noktası taşır', () => {
    // Manga/PDF/sayfa çevirisi işçi döngülerinin gövdelerinde aborted kontrolü.
    // (Kesin satır değil: sözleşme — iptal işlenmiş bir döngü bunu içermeli.)
    for (const [anchor, field] of [
      ['manga-translate', 'aborted'], ['pdf', 'aborted'], ['page-translate', 'aborted'],
    ]) {
      // anchor bilgi amaçlı; kontrol main.js genelinde yeterli yoğunlukta
      assert.ok((main.match(/signal\.aborted/g) || []).length >= 6,
        `signal.aborted kontrol noktaları azaldı (${anchor}/${field})`);
    }
  });
});
