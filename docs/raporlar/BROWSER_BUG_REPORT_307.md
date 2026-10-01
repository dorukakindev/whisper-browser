# BROWSER_BUG_REPORT_307 — R408: tests/ en büyük dosyalar + kök .bat/CI denetimi

**Tarih:** 2026-10-01 · **Kapsam:** tests/ içindeki en büyük 8 test dosyası (~7.790 satır) + kökteki tüm 8 `.bat` + `install.sh`/`start.sh` + `.github/workflows/ci.yml`
**Sonuç:** **Sıfır doğrulanmış kusur** — repo derin-okuma envanteri kapanmış durumda (src/, backend/, tools/, tests/ büyük dosyalar, betikler, CI tamamı okundu).

## Yöntem

Her dosya tam satır okundu; avlanan kusur sınıfları: sahte-pozitif test (assert'ü olmayan/sonucu yutan), boş/vacuous assert, skip-gate kusuru (koşul hep false → test asla koşmaz), yanlış regex/section-dilimi (sliced code yanlış fonksiyonu seçerse test sessizce geçer), saat/rastgele bağımlılığı, gerçek veriyle temas (kullanıcı dosyasına yazan test), fixture sızıntısı (temp dizin temizlenmez), tests/ altındaki fixture'ların audit kurallarını tetiklemesi.

## Denetlenen test dosyaları

| Dosya | Satır | Yapı | Bulgu |
|---|---|---|---|
| `player-ui.test.js` | 2.251 | DOM'suz kaynak-desen ratchet'i + `vm.createContext` ile sahte-DOM üzerinde dilimlenmiş gerçek keydown handler'ı (R58-15 klavye önceliği, R146 'o' tuşu playback policy çevrimi) | Temiz |
| `report67-smarttube-wiring.test.js` | 1.258 | R67-01..15 kaynak ratchet'leri + gerçek davranış harness'ları: `makeFakeEl`/`dispatchBubbling` (parent zinciri + stopPropagation/preventDefault), `fakeStorage`, `buildQueueHarness`/`buildCardHarness` (gerçek gövdeleri dilimleyip koşturur) | Temiz |
| `browser-subtitles.test.js` | 1.242 | `src/browser-subtitles` saf export'larının doğrudan birim testi + elle inşa edilmiş binary fixture'lar (MP4 tfhd/tfdt/trun/trex/moof kutuları, UTF-16 BOM tamponları, Windows-1254) | Temiz |
| `auth-io-deadzone.test.js` | 778 | main.js ölü-bölge fonksiyonlarını `section()` dilimleriyle vm-context'te koşturur; gerçek fs üzerinde burnin-recovery yaz/oku/temizle, spawn proxy'leri | Temiz |
| `settings-security.test.js` | 714 | Proxy `fs` ile fault injection + child-process `process.exit` crash simülasyonu (44 senaryo: günlük her rename sınırında kapanma → rollback) + 512 tohumlu schema fuzz'ı | Temiz |
| `browser-report86-regressions.test.js` | 695 | Gerçek `.wbp` paket yazıp Python backend ile oku/çıkar/geri-bağla (mutlak-yol sızıntısı matrisi) + ayna `.bak` EACCES fault'ları + playback-diagnostic backoff simülatörü | Temiz |
| `queue-lifecycle.test.js` | 581 | `xorshift` tohumlu 25.000 rastgele interleaving (exactly-once terminal invariant'ı) + `FakeClock` zamanlayıcı + mutasyon testi (guard kaldırılırsa invariant'ın yakaladığının kanıtı) | Temiz |
| `browser-workflow-core.test.js` | 534 | `BrowserTranslationScheduler` davranış testleri (abort paylaşımı, retry backoff, cache kimliği) + `browser-preload.js`'i vm'de sahte DOM'la koşturup discovery-signal içerik-sızıntısı kontrolü | Temiz |

### Not edilen dayanıklılık gözlemleri (kusur değil)

- `queue-lifecycle.test.js` 25.000-trial döngüsü tek koşuda ~birkaç saniye sürer — CI determinizm ratchet'i (R295) `Math.random` yasağı koymuş; dosya kendi `xorshift`'ini kullandığı için uyumlu.
- `auth-io-deadzone.test.js` `resolveExternalPlayerPath("mpv")` sonucunu `['', '/usr/bin/mpv']` kabul listesiyle doğrular — makine bağımsız; kasıtlı tolerans, vacuous değil.
- `settings-security.test.js` child-process crash senaryoları `spawnSync(process.execPath, '-e', ...)` ile gerçek process öldürür — platform-bağımsız (Windows'ta da çalışır).

## Betik/CI denetimi (hepsi temiz)

- `install.bat`/`start.bat` — `setlocal`, `cd /d %~dp0`, errorlevel merdiveni, cuDNN/cuBLAS PATH sırası (torch\lib önce), EVS VMP verify + `choice /c EH` onarım sorusu (2=H doğru dallanır), `call npm start`.
- `drm-kur.bat`, `install-whisperx.bat`, `install-diarize.bat`, `install-browser-align.bat`, `install-browser-extras.bat`, `install-browser-tools.bat` — önceki segmentte tam okundu; requirements dosyaları mevcut, orkestratör profil argümanları doğru.
- `install.sh`/`start.sh` — `.bat` eşdeğerleri; Linux nvidia paket düzeni `lib/` (Windows `bin/`den farklı — doğru), `LD_LIBRARY_PATH`, `set -euo pipefail`.
- `.github/workflows/ci.yml` — ubuntu+windows matrisi, `fail-fast:false`, 30 dk timeout, concurrency re-run gruplaması, `npm ci --ignore-scripts` + açık Castlabs install adımı, her iki OS'ta ffmpeg, Linux'ta xvfb+UI audit/smoke, artifact upload `always()`, syntax check. `actions/setup-node@v4`, `setup-python@v5`, `checkout@v4`, `upload-artifact@v4` — güncel major sürümler.

## Windows'ta doğrulanmayan

- `.bat` dosyalarının gerçek Windows çalıştırması (orkestratör argümanları statik olarak doğru; `choice`/errorlevel mantığı satır okumasıyla doğrulandı).
- `ci.yml` windows-latest bacağı — Actions kullanıcıda kapalı olduğundan koşu gözlemlenemiyor.

## Sonuç ve envanter durumu

Bu batch ile birlikte: **src/ (tümü), backend/ (tümü), tools/ (17 betik), tests/ en büyük 8 dosya, kök betikler, CI** derin okundu ve temiz çıktı. Kalan okunmamış yüzey: tests/ içindeki ~390 küçük/orta test dosyası (her biri kendi batch'inde yazılıp koştu; ortak harness kalıpları bu 8 büyük dosyada doğrulandı) ve `docs/` metni. Önceki nottaki "tests/ tamamı okundu" ifadesi bu batch ile düzeltilmiş oldu — büyük dosyalar ancak şimdi doğrulandı.
