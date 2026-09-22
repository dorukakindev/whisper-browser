# BROWSER_BUG_REPORT_103 — T6: Temiz Makinede Yeniden Üretilebilir Kurulum

- **Tarih:** 2026-09-22 (Europe/Istanbul)
- **Dal:** `devin/t6-clean-install`
- **Başlangıç SHA:** `4453ae0` (origin/master)
- **Bitiş kod SHA:** `b438a7e`
- **Kapsam:** Altı görevden altıncısı — sıfır checkout'ta bağımlılık kurulumu, `npm test`, Electron bridge, hedefli UI smoke, Python testleri; ortam/ürün ayrımı; CI'da açık araç kurulumu ve kritik test koşusu; dürüst platform belgelendirmesi.

## Temiz-checkout kanıtı (Ubuntu 22.04, `~/clean-checkout`, `git clone` → sıfır)

| Adım | Sonuç |
|---|---|
| `npm ci` (postinstall ile) | 156 paket, Castlabs Electron v43.2.0+wvcus ikilisi indi |
| `npm ci --ignore-scripts` | ikili İNMEZ — `install.js` gerekir (belgelendi, CI'a açık adım eklendi) |
| `./install.sh` (yeni, orkestratör `core`) | PASS — kilit doğrulama, staged venv (py3.10), torch cu121, atomik takas, manifest `0ce6f2fa…` |
| `./start.sh` | PASS — "Whisper Browser" penceresi gerçek `:0`'da açıldı |
| `npm test` (venv + requirements-ci) | PASS — tüm dosyalar (`Tüm testler geçti`) |
| `npm run test:electron-bridge` (`DISPLAY=:0` ve `xvfb-run -a`) | PASS — her iki yolda da |
| `electron-browser-video-e2e` + `electron-ui-scale-matrix` smoke | PASS |

## Gerçek bulgular

### F-103-1 — Kurulan venv'in console script'leri kalıcı bozuk (FAIL-FIXED)

- **Konum:** `tools/install-orchestrator.js` — `createVenv(stagePath)` → `installIntoVenv` → `swapVenvIn()` (venv `.venv-installing-<pid>` → `backend/venv`).
- **Ulaşılabilir yol:** her temiz kurulum. Venv taşınamaz; `bin/pip`, `bin/yt-dlp`, `bin/evs-vmp`, ct2-* dönüştürücüler gibi tüm console script'leri yorumlayıcı yolunu shebang (posix) / gömülü launcher (Windows `.exe`) içine *sahne* dizini adıyla yazar → kurulum sonrası hepsi `bad interpreter`/`not recognized` verir, kalıcıdır. Ürün akışları `python`/`python -m` kullandığı için uygulama çalışırdı, ancak kullanıcının `venv/bin/pip install` gibi bakımı ve tüm script yolları ölüydü.
- **Önce kırmızı kanıt:** gerçek kurulum sonrası `backend/venv/bin/pip` → `bad interpreter: .venv-installing-80479/bin/python` (Ubuntu clean checkout'ta reproduce edildi; mekanizma Windows'ta da aynı — distlib `.exe` launcher içine aynı sahne yolu gömülür).
- **Düzeltme:** takas sonrası `repairVenvScripts()` — `pip._vendor.distlib.scripts.ScriptMaker` ile kurulu dağıtımların tüm `console_scripts`/`gui_scripts` girdi noktaları geçerli yorumlayıcı yoluna göre yeniden üretilir; hata `SCRIPT_REPAIR` koduyla atomik rollback'e bağlı.
- **Sonra kanıt:** yamalı orchestrator ile sıfırdan `./install.sh` → `pip --version` ✓, `yt-dlp --version` ✓, `evs-vmp --help` ✓. Birim testi: `install-supply-chain` +2 senaryo (onarım çağrısı + hatada eski venv'in geri gelmesi), 50 senaryo PASS.

### Ortam/ürün ayrımı — hata sayılmayanlar

- `browser-alignment`/`browser-video-analysis`/catalog testlerinin `srt`/`PIL`/`guessit` eksikliği **ürün hatası değil** — test bağımlılıkları (`requirements-ci.txt`) gerektirir; üretim `requirements-core.lock`'u bunları içermez. Açıklığı kapatan asıl sorun: **`requirements-ci.txt` pinleri `numpy==2.4.6`/`scipy==1.17.1` py3.10'da çözülemezdi** — README "3.10 veya 3.11" derken temiz Ubuntu 22.04 (stok py3.10) üzerinde `npm test` tam koşulamıyordu. Düzeltme: `python_version` marker'ları ile py3.10'da numpy 2.2.6/scipy 1.15.3, py3.11+'da mevcut pinler — CI ortamı birebir aynı kalır, 3.10'da tam suite koşulabilir hale geldi (kanıt: clean checkout'ta `npm test` yeşil).
- `subtitle-parser-fuzz` tek koşuda `makeWebVtt:timeout` (2230 ms) sapması verdi; tek başına tekrarda en yavaş vaka 2.5 ms — pip indirme yükü sırasında jitter, ürün değil. İddia kurulmadı.
- Linux dbus `Failed to connect to the bus` / GPU `CreateCommandBuffer` stderr gürültüsü ortama ait; smoke'lar geçiyor.

## CI değişiklikleri (`.github/workflows/ci.yml`)

- `npm ci --ignore-scripts` sonrası **açık** `node node_modules/electron/install.js --no` (orkestratörün kendi adımıyla aynı) — ikili artık CI'da da var.
- Ubuntu'da `xvfb + libnss3/libgtk-3-0t64/libasound2t64/libgbm1/libxss1` kurulumu + `xvfb-run -a` ile **gerçek Electron bridge smoke**; Windows'ta `npm run test:electron-bridge`. Önceden CI hiçbir Electron smoke koşmuyordu ve ikili indirilmediği için koşamazdı.
- Mevcut adımlar (ffmpeg kurulumu, requirements-ci, `npm test`, sözdizimi) aynen korunur; test atlama yok.

## Yeni dosyalar

- `install.sh` — `install.bat` karşılığı; aynı kilit-doğrulamalı orkestratörü çağırır, isteğe bağlı profil argümanı geçirir.
- `start.sh` — `start.bat` karşılığı; HF env değişkenleri + pip ile kurulan `nvidia/cudnn`/`cublas`/`torch` lib dizinleri için `LD_LIBRARY_PATH` + `backend/bin` PATH'i, `npm start`.

## Doküman güncellemeleri

- `docs/INSTALLATION.md`: Windows/ Ubuntu ayrımı, `./install.sh`/`./start.sh`, test için Electron ikilisi adımı, Python 3.11 test-gereksinimi, dürüst sınırlar (VMP/DRM imza onarımı Windows-only, WhisperX/diarize betikleri Windows-only, CUDA ayarı Windows'ta doğrulanmış, safeStorage Secret Service gerektirir, macOS hedef değil).
- `README.md`: aynı platform notları + Development bölümüne eksik venv/electron adımları.
- `tests/browser-subtitles.test.js`: `install.sh` → orkestratör sözleşme assertion'ı (install.bat ile aynı kalıp).

## Çalıştırılanlar / çalıştırılamayanlar

- Koşuldu: temiz Ubuntu checkout'ta `install.sh` uçtan uca ×2 (yamalı öncesi/sonrası), `npm test` tam suite (venv+ci deps ile yeşil), `test:electron-bridge` (`:0` + `xvfb-run`), 2 hedefli UI smoke, `install-supply-chain` + `browser-subtitles` hedefli.
- Koşulamadı: gerçek Windows makine — `install.bat`/`start.bat`/`drm-kur.bat` Windows mantığı değiştirilmedi; Windows kapsamı CI `windows-latest` işine ve bu oturumun önceki raporlarındaki (BROWSER_BUG_REPORT_97) gerçek-Windows koşularına dayanıyor. `install.sh` içindeki `python` shebang onarımı Windows `.exe` launcher'ları da distlib üzerinden yeniden üretir; Windows yolu CI runner'ında doğrulanamaz durumda — açık sınır olarak not edilir.
- Yeni bağımlılık: yok (distlib, pinlenmiş pip 25.1.1'in vendored bileşeni).

## Açık sınırlar

- `install.sh` `whisperx`/`diarize` profillerini kabul eder ama o profiller Linux'ta doğrulanmadı (Windows-only olarak belgelendi).
- `start.sh` VMP imza kontrolü yapmaz — DRM'li servisler Linux'ta desteklenmiyor (belgelendi).
- `existingHealthy` eski (yamalı öncesi) kurulmuş venv'lerin bozuk script'lerini onarmaz; parmak izi değişimi sonraki koşuda zaten tam kurulumu tetikler.
