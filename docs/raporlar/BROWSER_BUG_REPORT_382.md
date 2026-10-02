# BROWSER BUG REPORT 382 — Yeni-100 batch 9: doküman/araç/infra derinleştirme

Tarih: 2026-10-02 · Dal: devin/1790909555-docs-infra-b9 · Başlangıç: `0325c76` · Bitiş kod: `90b5133`

## Özet

Doküman, araç ve altyapı yüzeylerinin 10 maddelik derinleştirme turu (IPC kataloğu, güvenlik modeli, mimari referansları, CONTRIBUTING/KURULUM komut doğruluğu, package.json betik hedefleri, tools/ çalışabilirliği, CI/blueprint tutarlılığı, devir/rapor indeks bütünlüğü). Sonuç: **2 doğrulanmış indeks kayması onarıldı + sınıf kalıcı ratchet'le kilitlendi**; kalan 8 yüzey mevcut hâliyle doğrulandı.

## Düzeltilen kusurlar

### B382-01 — `docs/devir/2026-10-02-0255.md` indeksizdi

PR #415'in (batch 4, yaşam döngüsü) devir notu dosyası repoda mevcut ama DEVIR-NOTU.md kök indeksinde bağlantısı yoktu. Rapor sırasına göre (batch 5 ile batch 3 arası) eklendi.

### B382-02 — `BROWSER_BUG_REPORT_373.md` INDEX satırsızdı

100-kuyruk batch 10 raporu dosyada vardı fakat `docs/raporlar/INDEX.md`'de satırı eksikti (372'nin üstüne, azalan sırayla eklendi).

### B382-03 — Yeni ratchet: `tests/docs-index-integrity.test.js`

İki boşluk da elle yakalandı; sınıfı kalıcı kilitleyen iki yönlü ratchet yazıldı: her `docs/devir/*.md` DEVIR-NOTU.md'de ve her `BROWSER_BUG_REPORT_*.md` INDEX.md'de bağlantılı olmalı + indekslerdeki bağlantılar var olmayan dosyaya işaret edemez. İlk koşu: **573 devir notu + 341 rapor satırı doğrulandı**.

## Doğrulanmış-temiz yüzeyler

- **IPC-KATALOG.md**: 223 `ipcMain.handle` + 12 `ipcMain.on` kanalı — tüm `src/*.js` (main.js + browser-feature-services + browser-mini-player + media-catalog-service) ile birebir; misclassified kanal yok.
- **GUVENLIK-MODELI.md**: "241 export, 7 dormant, 0 çıplak" iddiası `preload-usage-ratchet.test.js` çıktısıyla birebir.
- **ARCHITECTURE.md**: referans verilen tüm `src/` `backend/` dosyaları mevcut (ölü yol yok).
- **CONTRIBUTING.md**: `npm test`, `node --check` üçlüsü, smoke/soak komutları çalışır durumda.
- **INSTALLATION/KURULUM**: Node 22.13+ ⇄ `engines >=22.13.0` ⇄ CI `node-version: 22.13.0` ⇄ blueprint `node-version: "22.14"` tutarlı.
- **package.json betikleri**: 17 betiğin tüm dosya hedefleri mevcut.
- **tools/ui-fuzz-coverage.js**: Electron altında (belgelenen çağrı) **400/400** işlem, **0 console hatası** (renderer.js: 926 fonksiyon bloğu, 353 hiç çalışmadı — mevcut kapsam durumu, kusur değil). `tools/package-manifest.js` kitaplık modülü — sessiz çıkış doğru davranış.
- **ci.yml**: `ubuntu-latest`/`windows-latest` + node 22.13 + py 3.11 — Actions devre dışı ama dosya tutarlı.
- **Blueprint**: node 22.14 + xvfb + CJK/emoji fontları + backend venv — güncel.

## Test kanıtı

- `tests/docs-index-integrity.test.js`: **PASS** (573 + 341 satır, iki yön)
- `tests/windows-package-ignore.test.js`: PASS (23 iç + 19 dış yol)
- `tests/preload-usage-ratchet.test.js`: PASS (241/7/0 — GUVENLIK iddiasıyla birebir)
- `tools/ui-fuzz-coverage.js` (Electron): 400/400, console hatası yok

## Windows etkisi

Doküman/test değişikliği; ürün kodu yok. `node --check` gerektiren dosya değişmedi. Windows doğrulama gerektiren yüzey yok.
