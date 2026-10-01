# BROWSER_BUG_REPORT_313 — Doğrulama kuyruğu tur-2 (madde 8–20)

**Tarih:** 2026-10-01 · **Dal:** `devin/<ts>-dogrulama-turu-2` (master `bfd1509` üzerine)
**Çalışma kuralı:** her maddede önce sorun doğrulandı; doğrulanmış kusur düzeltildi + ilgili testler koşuldu; temiz çıkan kanıtıyla kapatıldı.

## Karar tablosu

| # | Madde | Karar | Kanıt |
|---|-------|-------|-------|
| 8 | ui-locale EN/TR parity + kodsuz anahtarlar | **Temiz** | 2627 çift tarandı; `toTurkish` geri haritası tam; tek şüpheli anahtar escape-artefaktı çıktı (main.js:5524). Attr-sink taraması (title/aria/placeholder) 0 ihlal. |
| 9 | css-colors ratchet doğrula + düşür | **DÜZELTİLDİ** | 433→430: `styles.css`'e `--shadow-deep` token'ı eklendi (2 sabit `rgba(0,0,0,.6)` körleme); `browser-mini.css` tek-başına stylesheet olduğu için kendi `:root{--accent}`'ini aldı, `button:focus-visible` token'a çevrildi. `tests/css-hardcoded-colors.test.js` PASS. |
| 10 | npm audit + outdated triage | **DÜZELTİLDİ** | Electron `v43.2.0+wvcus` GHSA aralığında (<43.4.1) → `v43.5.0+wvcus` (castlabs fork tag'i doğrulanarak yükseltildi); darkreader 4.9.130→4.9.133; hls.js ^1.7.1→^1.7.3. `npm audit` = 0 vuln. |
| 11 | Referanssız dosyalar (orphan) | **Temiz** | Reachability-grafik taraması (extensionless require dahil): src/, tools/, tests/ içinde kökten erişilemeyen ürün dosyası yok. |
| 12 | index.html aria/focus statik denetim | **DÜZELTİLDİ** | `for=` eksikliği: `Zaman kaydır (sn, SRT/VTT)` etiketi `shiftSeconds` input'una bağlanmadığı için ekran okuyucu ilişkisizdi → `for="shiftSeconds"` eklendi. Kalan kontroller sarmalama-label örüntüsüyle zaten ilişkili. |
| 13 | tooltip/aria'da locale dışı dizgiler | **Temiz** | HTML attr değerlerinin tamamı ya sözlük anahtarı ya sözlük değeri (EN literal'ler reverse-map ile TR'ye çevriliyor). 0 ihlal. |
| 14 | package.json script bütünlüğü | **Temiz** | Tüm script referansları diskte var; `test:electron-*` köprüleri çalışır. |
| 15 | KURULUM↔install.bat drift | **DÜZELTİLDİ** | INSTALLATION.md yalnız 2/5 installer'ı belgeliyordu → 5 `.bat` da yazıldı + Linux'a `.sh` karşılığı olmayan extras için `venv/bin/pip install -r requirements-*.txt` bölümü eklendi. |
| 16 | README↔özellik drift | **Temiz** | README'de iddia edilen her yüzey kodda doğrulandı. |
| 17 | burn-in/ffmpeg argv güvenliği | **Temiz** | `ffSubtitlesArg` kaçış zinciri (backslash→slash, `'`, `C:` kök kaçışı) doğru; staging `userData/burnin-temp/` + sender gate + yetkilendirme + `.srt/.ass` uzantı kapısı yerinde. |
| 18 | Kuyruk persistence round-trip | **Temiz** | `queue-opts-roundtrip` 61.388 kontrol (10.305 öğe, 0 geçersiz), `queue-state-corruption` PASS, `queue-ordering-invariants` FIFO/id-özgünlük/kapı PASS. |
| 19 | DEVIR-NOTU indeks bütünlüğü | **DÜZELTİLDİ** | 17 not indekste eksikti (09-18→09-30 tarih aralığı), 3 bağlantı hiç var olmayan dosyalara gidiyordu (makine-geçişi kaybı) → eksikler kronolojik eklendi, ölü bağlantılar "not dosyası repoda mevcut değil" işaretiyle açıklama metnine çevrildi. Sonuç: 505 md = 505 bağlantı, 0 ölü. |
| 20 | Altın-yol Electron açılışı + ekran görüntüsü | **Temiz** | Gerçek preload + bare-window IPC stub'ı ile 1400×900 pencere açıldı; renderer 0 console hatası, tüm paneller (Choose a source / Signal chain / Live preview / Job summary / Log) render. Stub'ın kapsamadığı `models:status`/`queue:save`/`invidious:feed` stderr izleri harness artefaktıdır, ürün kusuru değil. |

## Doğrulanmayan yüzey (Windows)

CSS token ve aria düzeltmeleri platformdan bağımsız; Windows'ta el-kontrolü gerektiren tek öğe yeni başlatma ekran görüntüsü değil (Linux xvfb görseli temsili). `install.bat`/`start.bat` gerçek-Windows koşusu hâlâ el-kontrol listesinde.

## Değişen dosyalar

- `src/renderer/styles.css` — `--shadow-deep` token'ı + 2 sabit rgba körleme
- `src/renderer/browser-mini.css` — standalone `:root{--accent}` + focus-visible token'a
- `tests/fixtures/css-hardcoded-color-baseline.txt` — 433→430
- `src/renderer/index.html` — `for="shiftSeconds"`
- `docs/INSTALLATION.md` — 5 installer + Linux extras bölümü
- `package.json` + `package-lock.json` — electron 43.5.0+wvcus, darkreader 4.9.133, hls.js ^1.7.3
- `DEVIR-NOTU.md` — 15 eksik indeks satırı + 3 ölü bağlantı işareti

## Test

- `node tests/css-hardcoded-colors.test.js` PASS (baseline 430)
- `node tests/queue-opts-roundtrip.test.js` 61.388 kontrol
- `node tests/queue-state-corruption.test.js` PASS
- `node tests/queue-ordering-invariants.test.js` PASS
- `xvfb-run -a node tests/run-electron-smokes.js --all` → **56 smoke, EXIT=0** (Electron 43.5.0+wvcus üzerinde)
- `npm audit` → 0 vulnerabilities
- Altın-yol açılış: `/tmp/golden-launch.png` (0 console error)
