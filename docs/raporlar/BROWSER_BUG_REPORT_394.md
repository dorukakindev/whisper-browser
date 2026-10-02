# BROWSER_BUG_REPORT_394 — Senkron sonrası master test envanteri: 29 dosya kırmızı (çoğu merge drift'i)

Tarih: 2026-10-02. Repo: `dorukakindev/whisper-browser`. Taban: yerel `master` `2e12ead1` → `origin/master` `4726db3e` fast-forward (131 commit). `package.json`/`package-lock.json` değiştiği için `npm install` koşuldu (Electron `v43.2.0+wvcus`→`v43.5.0+wvcus`, `darkreader` 4.9.130→4.9.133, `hls.js` ^1.7.1→^1.7.3, yeni `resedit` ^3.1.0).

## Ölçüm

- `npm test` (`tests/run-all.js`, dosya başına çıktı kodu): **481/510 dosya geçti, 29 dosya başarısız.** Tekrar koşulan dosya-bazlı envanter aynı 29 listeyi verdi.
- Sözdizimi kapısı temiz: `node --check` main/preload/renderer + senkronda değişen tüm `src/`/`tools/` JS dosyaları; `py_compile` değişen tüm backend modülleri.
- Koşulmayanlar: Electron smoke paketi (`tests/run-electron-smokes.js`), `start.bat` üzerinden gerçek arayüz, GPU/DRM, gerçek sağlayıcı.

## Kök neden hipotezi

Hızlı art arda merge edilen PR'lar (R331–R392, kuyruk-50, batch serileri) tek dalda yeşildi fakat birleşik `master`da sözleşme drift'i oluştu: A PR'ı bir renderer fonksiyonunu kaynak-slice testle kilitlerken B PR'ı aynı fonksiyonun içine yeni yardımcı çağrısı ekledi; VM sandbox'ında stub yok → `ReferenceError`. Benzer şekilde ratchet eşikleri (sabit renk sayısı, i18n kapsamı) birleşik durumda aşıldı. CI workflow'daki `cancel-in-progress: true` + hızlı master push'ları birleşik durumun tam doğrulanmasını atlamış olabilir (kesin kanıt: uzak CI geçmişi bu makineden okunamadı).

## Başarısız dosyalar — sınıflandırma

### A) Kaynak-slice / VM stub drift'i (platformdan bağımsız, gerçek)

| Dosya | Kanıt |
|---|---|
| `local-sync-profiles.test.js` | `captureWatchPrefs` slice'ı `subLangFromPath` çağırıyor (PR #368 testi, PR #425 çağrıyı ekledi) |
| `subtitle-output-contract.test.js` | aynı `subLangFromPath` kalıbı |
| `adversarial-ipc.test.js` | `networkOnline is not defined` |
| `browser-profile-jobs.test.js` | `openAppDialog is not defined` |
| `browser-subtitle-selection.test.js` | `browserTrackSourceLanguage is not defined` |
| `browser-ui-regressions-r3.test.js` | `interfaceChoice is not defined` + PDF durum-satırı senaryosu |
| `browser-reading-design.test.js` | `chip.classList.add is not a function` (stub eksik) |
| `validation.test.js` | `markOwnSubtitleWrite is not defined` |

### B) Ratchet / kaynak-sözleşme ihlalleri (gerçek drift)

| Dosya | Kanıt |
|---|---|
| `css-hardcoded-colors.test.js` | styles.css sabit renk 439 > sınır 430 |
| `design-system.test.js` | `:focus-visible{outline:none}` yasağına takılan yeni kural |
| `i18n-coverage.test.js` | index.html'de EN karşılığı olmayan 5 metin (ör. "Sayfa aralığı, yalnız başarısızlar…") |
| `ui-locale.test.js` | aynı statik metin kümesi, çeviri sözleşmesi |
| `dialog-locale.test.js` | dt()/dl() dışı native dialog dizgisi |
| `dom-innerhtml-ratchet.test.js` | kaçışsız enterpolasyon + bayat izin-listesi girdileri |
| `dpi-multimonitor-ratchet.test.js` | "fullscreen bounds ekrana bağlı olamaz" |
| `resource-leak-inventory.test.js` | kaynakta `fs.watch`/`fs.watchFile` belirdi |
| `pdf-job-scheduler.test.js` | `translateVisiblePdfPagesNow` kaynağı bulunamadı (isim drift'i) |
| `pdf-manga-36-40.test.js` | `mangaRegionsStateScript` gövdesi bulunamadı |
| `pdf-ocr-capability.test.js` | `ocr_status` gövdesi bulunamadı |
| `player-ui.test.js` | dinamik sekme-kapama eylemi SVG yerine Unicode "×" kullanıyor |
| `browser-adapter-contract.test.js` | "JSON dizini yoksa hata döner" sözleşmesi (308/309 PASS) |
| `settings-roundtrip.test.js` | yeni `translatePriceIn` [0,10000] doğrulaması fixture'ı reddediyor |
| `persist-paths-deadzone.test.js` | `t_pdf_save`: kalıcı yol beklentisi `false` döndü |
| `library-maintenance-21-25.test.js` | parça kaydı deep-equal uyuşmazlığı (null-prototype nesne) |

### C) Ortam / yerel koşul (ürün regresyonu değil)

| Dosya | Kanıt |
|---|---|
| `unicode-paths.test.js` | `execFileSync('python3', …)` — bu makinede `python3` takma adı yok; CI'da setup-python sağlıyor |
| `auth-io-deadzone.test.js` | `python`/`python3` çözüm sırası + POSIX `/app/...` yol beklentisi Windows'da `\app\...` üretiyor (test Windows-güvenli değil) |
| `report127-regressions.test.js` | 6 test geçti; teardown `fs.rmSync` temp dizinde EPERM (Windows kilit/AV zamanlaması) |
| `docs-index-integrity.test.js` | indekslenmemiş **yerel untracked** devir notları (2026-09-19/20 ×9) — senkronun suçu değil |
| `backend/test_scene_context.py` | `open('backend/transcribe.py')` encoding'siz — cp1254'te (Türkçe Windows) `UnicodeDecodeError`/`UnicodeEncodeError`; windows-latest CI'da cp1252'de 0x9E=ž decode edildiği için geçer. `PYTHONUTF8=1` ile tüm kontroller yeşil |

## Sonuç ve sınırlar

- Senkronun kendisi temiz (ff-only, untracked dosyalar korundu — rapor-300 çakışması 393'e taşındı).
- ~24 dosyada gerçek birleşik-master drift'i var; çoğu tek satırlık stub/eşik/isim düzeltmesi. Düzeltme ayrı `codex/` dalı + PR ile yapılmalı; bu rapor bulgu kaydıdır, kod değişmedi.
- `test_scene_context.py` encoding ve `unicode-paths`/`auth-io-deadzone` `python3` varsayımı Windows birincil-ortam kuralı gereği küçük taşınabilirlik düzeltmesi adayı.
- Kanıtlanmadı: uzak CI'nın master HEAD'de yeşil/kırmızı olduğu (MCP/bağlantı erişimi yoktu); Electron smoke ve gerçek arayüz.
