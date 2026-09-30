# BROWSER BUG REPORT 291 — R328-3: modül-bazlı kapsam haritası

- Tarih: 2026-09-30
- Kapsam: taraf-1 modül envanteri (`src/*.js` + `backend/*.py`, `test_*` hariç) × test korpusu (`tests/*.test.js` + `backend/test_*.py`)
- Sonuç: **bug yok** — envanter + üreteç + ratchet eklendi.

## Envanter (2026-09-30)

181 modül × 397 test dosyası: **170 direct** (require/import), **7 named**
(ad-geçme — preload'lar ve süreç-içi sürülen script'ler), **4 none**:

| Modül | Durum |
| --- | --- |
| `backend/browser_media_tools.py` | süreç-içi script — `src/browser-media-tools.js` (testli) üzerinden spawn |
| `backend/catalog_scan.py` | süreç-içi script — `src/catalog-discovery.js` üzerinden spawn |
| `backend/nmdb_catalog_import.py` | süreç-içi script — `src/nmdb-catalog-import.js` üzerinden spawn |
| `backend/ndjson_utils.py` | testli modüllerin (`invidious`, `live_asr`, `media`, `model_benchmark`) ortak import'u — dolaylı kapsam gerçek |

## Eklenenler

- `tools/coverage-map.js` — üreteç (`scan()` API + markdown çıktısı);
  `docs/kapsam-haritasi.md` bu komutla yeniden üretilir.
- `docs/kapsam-haritasi.md` — anlık harita (sınıf tablosu + listeler).
- `tests/coverage-map.test.js` (3/3) — ratchet: `none` kümesi whitelist
  (`KNOWN_UNTESTED`) dışına çıkamaz; whitelist yalnız küçülür; direct
  oranı ≥160 modül sabitlenir. Yeni modül ekleyen test referansı da ekler.

## Sınırlar

- `named` sınıfı zayıf kanıt (ad-geçme ≠ davranış kapsamı); preload'ların
  asıl kapsamı IPC-parity + electron smoke'ları.
- Python `direct` tespiti `import/from/importlib/sys.modules` kalıbına
  dayanır; subprocess spawn satırları bilinçli `named`'de kalır.
- Öz-referans: `coverage-map.test.js` whitelist satırlarıyla modül adları
  taşıdığı için taramadan dışlanır (üreteçte sabit).
