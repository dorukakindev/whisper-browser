# BROWSER BUG REPORT 285 — R325 kalıcılık matrisleri

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r325-userdata-matrix` · **Tür:** simülasyon matrisleri + 1 düşük-şiddet düzeltme

## Kapsam

- R325-1: 19 userData dosyasının tek-çatı bozulma simülasyonu.
- R325-2: atomik-yazma envanteri genişletme.
- R325-3: ENOSPC/disk-kota simülasyonu.
- R325-4: session restore kombinasyon matrisi.

## Bulgular

### B-325-01 — Soak tanısı bozuk kütüphanede patlıyor (düşük)
`collectResourceSoakSnapshot` içinde `loadWatchLibrary().length` korumasızdı;
watch-library.json + .bak birlikte bozuksa store veri-koruma hatası fırlatır
ve kaynak-soak anlık görüntüsü üretilemezdi. **Düzeltme:** `safeWatchLibraryEntryCount()`
(−1 işareti) — snapshot tanı amaçlı olduğundan hata koduyla raporlar.

### Doğrulanan sözleşmeler (bug yok)
- watch-library `load()`: bozuk primary+backup'ta fırlatır (sessiz silme
  yok); `.bak` tek başına sağlamsa kurtarır. Renderer `library:list`
  çağrıları `.catch` ile boş kütüphane gösterir — kabul edilmiş davranış.
- Atomik-yazma: tüm kalıcı store'lar tmp+rename veya işlem günlüğü; userData
  yoluna doğrudan `writeFileSync` yok (statik ratchet eklendi).
- ENOSPC: watch-library `replaceItems` ve note-store `flush` hata fırlatır,
  birincil dosya dokunulmaz kalır (tmp-yazım önce patlar, rename hiç koşmaz).
- Oturum: normalizeBrowserSession 1000 tohumlu hostile oturumda tüm
  invariant'ları korur (tekil kimlik mint'leme, sınır-dışı aktif kurtarma,
  split ∈ tabs ve ≠ active, ratio kelepçesi).

## Eklenen kilitler

- `tests/userdata-corruption-matrix.test.js` — 11 test: 7 store × 6 hostile
  payload + watch-library sözleşme/.bak + atomik-yazma statik envanteri.
- `tests/session-restore-matrix.test.js` — 3 test: 1000 tohumlu hostile
  oturum fuzz'ı + aktif-kurtarma + split kapısı.

## Doğrulama

- `node tests/userdata-corruption-matrix.test.js` → 11/11 PASS.
- `node tests/session-restore-matrix.test.js` → 3/3 PASS.
- `node --check src/main.js` → OK.

## Windows etkisi

Yok — tanı yolu ve test-only.
