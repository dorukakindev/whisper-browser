# BROWSER_BUG_REPORT_174 — R193: tools/ + CI denetimi (temiz) + 2 eski PR kurtarıldı

**Tarih:** 2026-09-28 · **Dal:** `codex/r193-tools-audit` · **Temel:** master `b542e2d` (PR #64+#65 merge sonrası)

## Kapsam

Bu turda son hiç-denetlenmemiş yüzeyler kapatıldı ve açıkta kalan iki eski PR kurtarıldı:

### 1. `tools/install-orchestrator.js` (609 satır, tam okuma)

Windows kurulumunun çekirdek motoru. Denetlenen disiplinlerin hepsi yerinde:

- **Atomik takas:** venv sahne dizinine (`backend/.venv-installing-<pid>`) kurulur, doğrulanır (`verifyVenv`: pin eşleşmesi + `pip check` + `import ctranslate2, faster_whisper` smoke), sonra `renameSync` ile devreye alınır; hata yolunda `rollbackVenv`/`rollbackNode` eski dizini geri koyar.
- **Kilit:** `.whisper-install.lock` `wx` (exclusive create) + ölü-pid kurtarma (`processAlive` + `ESRCH` ayrımı) + `finally` ile her koşulda serbest bırakma.
- **Tedarik zinciri:** `package-lock.json` lockfileVersion=3 + kök bağımlılık `package.json` eşitliği (NPM_LOCK_DRIFT) + registry integrity zorunluluğu + Electron yalnız izin verilen commit'te (ELECTRON_COMMIT) + tüm pip kilitleri tam-sürüm regex'iyle doğrulanır (LOCK_NOT_EXACT).
- **Geçici yol güvenliği:** `assertSafeTemporary` — `path.relative` kök dışını ve `\.(venv|node_modules)-(installing|backup)-\d+` kalıbı dışı adları reddeder; `rmSync` yalnız bu kapının ardından çağrılır.
- **npm çözümü (Windows):** `npm_execpath` → `node_modules/npm/bin/npm-cli.js` aday zinciri; hiçbiri yoksa anlaşılır `NPM_MISSING`.
- **Sonuç:** doğrulanmış kusur yok.

### 2. Diğer tools betikleri

- `tools/package-windows.js` — Windows-only kapı, Castlabs Electron zip'i yalnız önbellekten (`findElectronZip`), kapsamlı `ignore` kuralları (R181'in 22MB sızıntı düzeltmesi yerinde), BUILD-MANIFEST.
- `tools/build-browser-ass.js` — JASSUB bundle + üçüncü-taraf lisans bildirimi zorunluluğu (eksik dosyada throw).
- `tools/compare-subtitle-translations.js` — A/B kalite raporu, sha256 kanıtı, yapısal regresyonda çıkış kodu 2.
- `tools/audit-ui.mjs` — stub `window.api` Proxy'si (then/onX ayrımı doğru), aşamalı renderer kopyası kaynak ağaca dokunmuyor.
- **Sonuç:** hepsi temiz.

### 3. `.github/workflows/ci.yml` denetimi

Minimal `permissions: contents: read` + pin'li action'lar (`checkout@v4`, `setup-node@v4`, `setup-python@v5`, `upload-artifact@v4`) + Node 22.13.0 pin + `npm ci --ignore-scripts` + Electron ikilisi ayrıca `install.js --no` ile (orchestrator'la aynı açık adım — script'in checksum doğrulaması çalışır) + `requirements-ci.txt` + son adımda `node --check` × `py_compile`. Secret yok, aşırı izin yok, dal kısıtlı push (main/master) + PR. **Temiz.**

### 4. Eski açık PR kurtarma (PR #64 + PR #65)

İki `codex/` dalı 27 Eylül'den beri açık ve merge edilmemişti; içerikleri hâlâ geçerli gerçek düzeltmelerdi:

- **PR #64** (`codex/review-devin-20260927`): `transcribe.py` `preview_refresh` — seçenek kapısı yerine gerçek `entries != preview_entries` karşılaştırması. Zorunlu temizlik (dedupe, yaygın-hata, snap-to-speech) seçenekler kapalıyken de cue değiştirebildiğinden diske yazılan nihai liste ile önizleme ayrışıyordu; sahte-motor regresyon testi eşlik ediyor. Kurtarma: master merge edildi, rapor dosya-çakışması `BROWSER_BUG_REPORT_133.md` → **172** olarak taşındı, DEVIR-NOTU indeksine eksik iki girdi (`2026-09-27-0438` + R132'nin hiç indekslenmemiş `2026-09-26-2338` girdisi) eklendi. Ubuntu+Windows CI yeşil → squash-merge `65cabc0`.
- **PR #65** (`codex/browser-icons-20260927`): player/tarayıcı ikon düğmelerinde SVG ortalama (`<summary>`'nin `list-item` varsayılanı dahil) + 34px vuruş hedefi + daha okunaklı daralt/altyazı-dosyası glifleri + yeni `electron-browser-icon-alignment.smoke.js`. Kurtarma: `BROWSER_BUG_REPORT_134.md` → **173** olarak taşındı; PR64 merge'inin yarattığı INDEX/DEVIR çakışması ikinci master-merge'de birleştirilip sıralandı. Bu kutuda Electron kurulup yeni smoke koşuldu: **tüm geometri assertion'ları yeşil** (34px kutu, |dx|,|dy| < 0.6). Ubuntu+Windows CI yeşil → squash-merge `b542e2d`.
- **Not:** `.player-layer .btn-icon { padding:0; display:inline-grid; place-items:center }` kuralının geri dönük güvenliği doğrulandı — daldan bu yana `index.html`/`renderer.js`'e yeni `.btn-icon` kullanımı eklenmemiş ve tüm metin-glifi düğmeler sabit 28/34px kutulu olduğundan `padding:0` küçültme yaratmıyor.

### 5. Kalan renderer orta-boy fonksiyonları — nokta denetimi

- `playerJobEvent`/`finish` (3739-3963): mediaKey staleness kapısı, `doneHandled` idempotens, kısmi-çeviri muhasebesi, `attachCompletedJobSubtitles` hatasında `rememberPendingPlayerLoad` kurtarıcısı, `finally` ile `job.loading` temizliği. **Temiz.**
- `navigateBrowserFromAddress` (10956-10992): `navigateSeq`+`tabId` staleness çifti, `result.aborted` ayrımı, hata yolunda loading-state temizliği. Sekme şeridi dinleyicileri (11097-11103): grup toggle, mute, kapatma, sürükle-bırak reorder (`indexOf` <0 kontrolleri), auxclick orta-tık kapatma, ok tuşu navigasyonu (Home/End). **Temiz.**
- `clearBrowserCookieScope` (11362-11398): onay diyaloğu, `partial` yanıtında sayım+başarısız ayrımı, `removed` NaN kapısı. **Temiz.**
- `renderSmartTubeSection`/`showError` (24126-24335): uzak hata metni yalnız `textContent`'e (innerHTML yok — CSP notu yerinde), her `await` sonrası `stale()`, bölüm-bazlı hata/fallback ayrımı (home asla boş kalmıyor), retry düğmesi. **Temiz.**

### 6. Odaklı runtime doğrulama

`wb-r190`'a `npm ci --ignore-scripts` + kilitli Electron kuruldu ve merged master üzerinde odaklı smoke seti koştu: `icon-alignment` (yeni — 34px/merkezleme), `smarttube-boot`, `subtitle-output` (yerel+YouTube+tarayıcı üç yolu), `crash-integrity` — **4/4 GEÇTİ**.

## Sonuç

Doğrulanmış yeni ürün bug'ı yok — ürün kodu değişmedi. `tools/` + CI + kalan riskli fonksiyonlar temiz. İki unutulmuş PR kurtarılıp merge edildi (master `b542e2d`). Kalan tek açık uç: PR119 head review'ının "1 potential issue" bulgusu API'de 404 (yalnız web sayfasında görünür) — `2e2a057` ve `9f6ac81` commit'lerinde `get_findings` 404 dönüyor.
