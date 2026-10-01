# BROWSER_BUG_REPORT_306 — tools/ derin okuma (R394–R395)

Tarih: 2026-10-01 · Dal: `devin/<ts>-r394-r396` · Başlangıç: `bfcd763`

## Kapsam

tools/ altındaki tüm denetim/paketleme betikleri satır satır okundu:

| Dosya | Satır | Sonuç |
|---|---|---|
| install-orchestrator.js | 618 | R392'de okundu — B-392-01 düzeltildi (PR #336) |
| package-manifest.js | 222 | Temiz |
| package-windows.js | 78 | Temiz |
| smoke-windows-package.js | 61 | Temiz |
| coverage-map.js | 122 | Temiz |
| ui-fuzz-coverage.js | 154 | Temiz |
| audit-subtitle-corpus.js | 50 | Temiz |
| audit-subtitle-golden.js | 33 | Temiz |
| audit-subtitle-external-sdh.js | 35 | Temiz |
| audit-subtitle-pair.js | 46 | Temiz |
| compare-subtitle-translations.js | 49 | Temiz |
| build-browser-ass.js | 51 | Temiz |
| audit-browser-ai.js | 29 | Temiz |
| audit-production-licenses.js | 71 | Temiz |
| test-timing.mjs | 109 | Temiz |
| ui-smoke.mjs | 316 | Temiz |
| **audit-ui.mjs** | 220 | **B-395-01 düzeltildi** |
| **audit-public-history.js** | 147 | **B-395-02 + B-395-03 düzeltildi** |

## B-395-01 — audit-ui.mjs profil dizini sızıntısı (ReferenceError yutuluyor)

- **Bulgu:** `finally` bloğundaki `fs.rmSync(profile, …)` çağrısı `profile`'ı ana kapsamda referanslıyordu; değişken yalnız `launchBrowser()` içinde lokal `const` idi. ReferenceError, aynı satırdaki boş `catch (_)` tarafından sessizce yutuluyordu → her koşuda `/tmp/whisper-ui-audit-profile-*` dizini geride kalıyor ve "Windows kilidi" yorumu gerçek hatayı maskeliyordu.
- **Kanıt:** Statik kanıt yeterli — `profile` hiçbir kapsamda `main()` içinde tanımlı değildi; ui-smoke.mjs aynı kalıbı doğru uyguluyor (`profile` retry döngüsünde ana scope'ta izleniyor).
- **Düzeltme:** `launchBrowser()` artık `profile`'ı da döndürüyor; `profiles` dizisi tüm denemeleri izliyor, `finally` hepsini siliyor.

## B-395-02 — audit-public-history.js 13 sahte-pozitif url-userinfo bulgusu

- **Bulgu:** SSRF/url test fixture'larındaki sahte kimlikli URL'ler (`https://user:pass@video.site/x`, `https://u:p@h.com`, `http://u:p@h/p`, `https://user:pw@www.youtube.com/tv`) `url-userinfo` kuralına takılıp `error` sayılıyordu → temiz repoda araç `exit 1` dönüyordu. `isTestFixture` muafiyeti yalnız `example.*` domain'li URL'leri kapsıyordu.
- **Kanıt:** `node tools/audit-public-history.js` tam geçmiş taramasında 13 bulgu — hepsi `tests/` altında fixture-kimlikli satırlar.
- **Düzeltme:** `isTestFixture` içine `fixtureUserinfo` kalıbı eklendi — `tests/` dosyalarında `://<kısa-ad>:<p|pw|pass|sifre|test|x|secret|user|name>@` biçimindeki userinfo muaf. Gerçek kimlik sızıntıları (uzun/özgün parola) hâlâ yakalanır. Sonuç: 13 → 0 bulgu, `exit 0`.

## B-395-03 — audit-public-history.js `hf_` (HuggingFace) token kalıbı eksik

- **Bulgu:** Reponun kendi sır türü (`WHISPER_HF_TOKEN` — pyannote/diarization akışı) geçmiş taramasında aranmıyordu; yanlışlıkla commit'lenen bir `hf_…` anahtarı geçerdi.
- **Düzeltme:** `['huggingface-token', /\bhf_[A-Za-z0-9]{30,}\b/g]` kuralı eklendi. Tam geçmiş taraması yeni kurala rağmen 0 bulgu — yani geçmişte hf_ token sızıntısı da yok.

## R394 — ek kanıt: Electron 43 console-message çift imzası

`/tmp/console-probe.js` xvfb altında çalıştırıldı: Electron 43, `console-message` olayını **5 argümanla** yayar — yeni details-nesnesi **ve** eski positional argümanlar (`level` number: 3=error, 2=warning). `level >= 3` kullanan ratchet'ler (electron-console-ratchet, ui-fuzz-coverage) çalışır durumda; "ölü dinleyici" hipotezi runtime kanıtıyla çürütüldü. Deprecation yalnızca ileri-sürüm riski olarak notlandı.

## Windows'ta doğrulanmayan

- İki düzeltme de saf Node — platformdan bağımsız. audit-ui.mjs profil temizliği Windows'ta da aynı ReferenceError'la hiç çalışmıyordu; düzeltme `fs.rmSync`'in Windows kilit hatasını tolere eden `try/catch`'i koruyor.
- `package-windows.js` / `smoke-windows-package.js` win32-guarded — Linux'ta koşulamaz; kod okuması temiz.

## Komutlar

- `node tools/audit-public-history.js` → 0 bulgu, exit 0 (önce: 13 bulgu, exit 1)
- `node --check tools/audit-ui.mjs tools/audit-public-history.js` → temiz
