# BROWSER_BUG_REPORT_266 — R317: Release-package bütünlüğü (kaynak listesi + erken uyarı)

Tarih: 2026-09-30 · Dal: `devin/1790754029-package-integrity` · Kod commit'i: `ce4481f`

## Kapsam ve yöntem

`tools/package-windows.js` (@electron/packager, asar:false) ile üretilen
Windows paketinin bütünlüğü: hangi dosyaların çalışma için gerekli olduğu,
paketleme ignore listesinin gerekli dosyayı yutup yutmadığı ve eksik dosyayla
açılan uygulamanın kullanıcıya ne gösterdiği.

## Doğrulanan bulgular

- **B1 — Gerekli-dosya doğrulaması yoktu:** packager'ın `ignore` kalıpları
  ad-hoc tutuluyordu; bir düzenleme çalışma-zamanı dosyasını (ör. yeni bir
  `src/*.js` modülü ya da `backend/x.py` betiği) sessizce paketten
  düşürebilirdi ve build yine başarılı görünürdü. Yalnız 6 saniyelik süreç
  canlılığı kontrol eden smoke bunu yakalayamaz (eksik `backend/transcribe.py`
  açılışı bozmaz, ilk transkripsiyonda patlar).
- **B2 — Eksik kaynakla açılan uygulama sessizce kırıktı:**
  `src/renderer/index.html` veya `preload.js` paketten düşerse pencere boş/
  yarım açılır, kullanıcı kurulumun bozuk olduğunu anlamazdı.
  `backend/transcribe.py` eksikse iş ancak spawn'da `ENOENT` ile düşerdi.
- **Denetim yan bulgusu:** `src/subtitle-sentence-layout.js` çalışma
  zamanında `require('../backend/subtitle-abbreviations.json')` ile veri
  dosyası okuyor — manifest kapanışı bu JSON'ı doğru yakalıyor (430 dosya);
  ayrıca `path.join` ile spawn edilen 5 ek backend betiği
  (`catalog_scan.py`, `workspace_video_package.py`, `browser_media_tools.py`,
  `browser_video_analysis.py`, `nmdb_catalog_import.py`) kapanışa dahil
  edildi.

## Düzeltmeler

- `tools/package-manifest.js` (yeni): `PACKAGER_IGNORE` tek kaynağa taşındı;
  `requiredPackageFiles()` kanonik listeyi hesaplar — kök `*.bat` + bat'ların
  çağırdığı tools, `src` require/`path.join` kapanışı (preload, loadFile,
  spawn dahil), renderer HTML script/link referansları, `vendor/` ağacı,
  backend girişleri + Python import kapanışı. `BOOT_CRITICAL` en küçük
  açılış kümesi; `missingInTarget()` paket çıktısı doğrulayıcısı.
- `tools/package-windows.js`: packager sonrası `missingInTarget` — eksik
  dosya varsa build listedeki adlarıyla derhal başarısız.
- `src/main.js`: `verifyAppResources()` ilk yerel `require` ÖNCESİNDE çağrılır —
  BOOT_CRITICAL + main.js require kapanışı eksikse iki dilli
  `dialog.showErrorBox` + `app.exit(1)` (eksik modülün require'da diyalogsuz
  çöküşü önlenir); kritik-olmayan eksikler konsol uyarısı. `transcribe:start`
  artık spawn'dan önce `transcribe.py` varlığını kontrol edip kurulum
  yönlendirmeli hata döner (ham `ENOENT` yerine).
- `tests/package-integrity.test.js` (yeni, 8 kontrol): liste↔depo↔ignore
  tutarlılığı, sahte paket ağacında eksik yakalama, `verifyAppResources`
  vm-dilim davranışı (diyalog+exit / yedek liste / sessiz geçiş),
  regex-kaçağı üç dosya (worklet/resolve/iki-adımlı join), erken-çağrı +
  require-kapanışı kapsama ratchet'i, transcribe.py erken-kontrol ratchet'i.

## Doğrulama

- 8/8 PASS; mevcut depoda liste tam (eksik/ignore-yutma yok — mevcut ignore
  dizisi güvenli).
- `node --check` src/main.js, tools/package-manifest.js,
  tools/package-windows.js temiz.

## Windows etkisi ve sınırlar

Doğrudan Windows paket akışı (`npm run package:win`). Gerçek paketleme
Windows'ta koşulmadı (başsız Linux kutusu; betik `process.platform` kapılı).
Doğrulama mantığı platformdan bağımsız dosya-varlık kontrolü.

## Kalan / izleme

- `npm run package:win` + `smoke:package:win` Windows'ta elle koşulmalı;
  yeni doğrulama adımı eksik-durumda build'i kıracak (bilinçli).
- `settings|window-state|premium-ui` JSON'ları paketten bilinçli dışlanmış —
  kullanıcıya ait/canlı dosyalar; manifest listesine girmez (doğru).
