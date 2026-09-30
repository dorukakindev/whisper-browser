'use strict';
// R328-3 — kapsam haritası ratchet'i.
// Her taraf-1 modülün (src/*.js + backend/*.py, test_* hariç) en az bir
// test dosyasında ad-geçmesini zorunlu kılar; mevcut 4 bilinen istisna
// whitelist'tedir ve yalnız KÜÇÜLEBİLİR — yeni modül ekleyen biri test
// referansı da eklemek zorunda kalır.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../tools/coverage-map');

// Bilinen kapsamsız modüller (2026-09-30 envanteri). Bunlardan biri test
// kazanırsa listeden silinmeli; listeye yeni giren eklenemez.
const KNOWN_UNTESTED = new Set([
  'backend/browser_media_tools.py',
  'backend/catalog_scan.py',
  'backend/ndjson_utils.py',
  'backend/nmdb_catalog_import.py',
]);

describe('R328-3: modül-bazlı kapsam haritası', () => {
  const { rows, moduleCount, testCount } = scan();

  it('tarama en az modül/test taban çizgisini bulur', () => {
    assert.ok(moduleCount >= 150, `modül sayısı beklenmedik düşük: ${moduleCount}`);
    assert.ok(testCount >= 350, `test sayısı beklenmedik düşük: ${testCount}`);
  });

  it('hiç referanssız modül whitelist dışına çıkmaz', () => {
    const untested = rows.filter((r) => r.klass === 'none').map((r) => r.module);
    const unexpected = untested.filter((m) => !KNOWN_UNTESTED.has(m));
    assert.deepEqual(
      unexpected, [],
      `yeni kapsamsız modül(ler): ${unexpected.join(', ')} — test referansı ekle`,
    );
    // whitelist yalnız küçülür: test kazanmış girdiyi silmek gerekir
    const stale = [...KNOWN_UNTESTED].filter((m) => !untested.includes(m));
    assert.deepEqual(
      stale, [],
      `whitelist'te artık testli modül var — listeden sil: ${stale.join(', ')}`,
    );
  });

  it('require/import-edilen modül oranı gerilemez', () => {
    const direct = rows.filter((r) => r.klass === 'direct').length;
    assert.ok(direct >= 160, `direct kapsam geriledi: ${direct}/${moduleCount}`);
  });
});
