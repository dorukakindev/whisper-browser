# BROWSER_BUG_REPORT_161 — R181: araç/test altyapısı derin denetimi

Tarih: 2026-09-28 · Dal: `codex/r181-tools-audit-1790537361` · Temel: master `220ff35`

Kapsam: `tools/` (14 dosya), `benchmarks/` (2), kök `.bat` kurulum betikleri,
test altyapısı (`tests/run-all.js`, fixture sunucuları, electron smoke'lar).
Etap-1 kataloğu kapandıktan sonra (R179) ilk kez *araç yüzeyi* derin okundu —
ürün kodu değil, ürünü paketleyen/doğrulayan katman.

## Doğrulanmış bulgular

### B1 — Windows paketi iç geliştirme yüzeylerini taşıyordu [Orta — düzeltildi]
`tools/package-windows.js` ignore listesi şunları **pakete dahil ediyordu**:
`docs/raporlar/` (~22 MB, 174 dosya), `benchmarks/`, `quality/`,
`design-system/`, `.agents/` (skill notları), `premium-ui.json`, kök iç
belgeler (AGENTS.md, CLAUDE.md, DEVIR-NOTU.md, YENI-BILGISAYAR.md, DESIGN.md,
UI-DESIGN-SYSTEM.md, UX-CONTRACT.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md,
DRM-KURULUM.md). Kullanıcıya 22MB+ ölü ağırlık + iç belgelerin sızması.
Düzeltme: ignore regexleri genişletildi; `tools/` kasıtlı pakette kalıyor
(`install.bat` paket içinden `tools\install-orchestrator.js`'i çağırır) ve bu
kurala yorum yazıldı. Kullanıcı belgeleri (README, KURULUM, PRIVACY, SUPPORT,
THIRD_PARTY_NOTICES, CHANGELOG, SECURITY) ve `docs/`'un kalanı (PRIVACY,
INSTALLATION, KURULUM_TEDARIK_ZINCIRI…) pakette kalır.
Kanıt: `du -sh docs/raporlar` = 22M; pakete referans süpürmesi
`git grep "docs/raporlar\|benchmarks/"` → çalışma zamanında sıfır referans.
Regresyon: `tests/windows-package-ignore.test.js` (yeni) — 23 yolun
atıldığı, 19 yolun pakette kaldığı doğrulanır; `tools/` koruması da testte.

### B2 — smoke-windows-package ölü-çocuk yarışı [Orta — düzeltildi]
`smoke-windows-package.js`: sonuç `ok===false` iken de `child.kill()` +
`child.once('exit')` koşulsuzdu. Senaryo: pencere açıldı ama süreç smoke
penceresinden önce kendi kendine çıktı (ya da `runPackaged` içinde zaten
wait-and-kill edilmişti) → `exit` olayı artık hiç gelmeyecek, bekleme sonsuz
asılırdı. Düzeltme: `exitCode===null && signalCode===null` kapısı + 5 sn
`unref` edilmiş üst sınır.

### B3 — ertelemeli fixture yanıtı yıkılmış sokete yazıyordu [Düşük — düzeltildi]
`tests/browser-stream-fixture-server.js` `delayed()` 80ms sonra koşulsuz
`send(response,…)`; test sunucu kapanırken soket yıkıldıysa `ERR_STREAM_
DESTROYED` fırlatabilir → flaky test kaynağı. Kapı:
`!response.destroyed && !response.writableEnded`.

### B4 — boş altın küme audit'i boş geçiyordu [Düşük — düzeltildi]
`tools/audit-subtitle-golden.js`: `pass: blockingCount===0` — bozuk/boş
`subtitle-quality-golden.json` "0 ihlal" diye tam puan verirdi. Artık
`rows.length > 0 && blockingCount === 0`. Gerçek altın dosya hâlâ geçiyor
(15 knownGood + 16 expectedRepairs, 0 false-rejection).

### B5 — npmInvocation belirsiz hata mesajı [Kozmetik — düzeltildi]
`tools/install-orchestrator.js` `npmInvocation`: tüm adaylar yoksa
`cli=undefined` olup `fs.existsSync(undefined)` Node 22'de `false` döner
(TypeError DEĞİL — box'ta doğrulandı), mesajda `npm CLI bulunamadi: undefined`
basılırdı. Şimdi `!cli` kapısı + adayların boş olduğunu söyleyen net mesaj.
Sözleşme (`install-supply-chain.test.js`, `command===process.execPath` +
`prefix[0]` npm-cli.js ile biter) değişmedi — 50 senaryo yeşil.

## Derin okunan temiz yüzeyler

- `install-orchestrator.js` tamamı: lock `openSync 'wx'` + dead-pid
  kurtarma, `assertSafeTemporary` sınır regex'i (`^\.(venv|node_modules)-
  (installing|backup)-\d+$` — traversal reddedilir), venv stage→swap→repair
  →rollback, `expectedPins`/`verifyVenv`, `npm ci --ignore-scripts`,
  ELECTRON_COMMIT allowlist, lisans/bütünlük politikası.
- `audit-public-history.js`: git-log secret taraması, synthetic/example
  filtreleri.
- `build-browser-ass.js`, `python-runtime.js` (Windows Store alias + isAbsolute
  kapısı), `audit-production-licenses.js`, `audit-browser-ai.js`
  (`90:34` başvuru reddi `\b` ile doğru), `compare-subtitle-translations.js`,
  `audit-subtitle-corpus.js` (boş korpus fail-closed),
  `audit-subtitle-external-sdh.js` (≥10 çift kapısı), `audit-subtitle-pair.js`.
- `.bat` betikleri: setlocal + pause'lu hata yolları (R155 düzeltmeleri yerinde).
- `benchmarks/*`, `tests/manual/*`, 40 electron smoke'un spawn/kill/finally
  süpürmesi — `electron-youtube-oauth.smoke.js`'in loopback sunucusu
  `app.exit` ile süreç sonunda yıkılır, doğru sınır.
- `tests/run-all.js`: per-dosya 10dk timeout + hang sınıflandırması.

## Testler

- `tests/windows-package-ignore.test.js` (yeni): 23+19 yol ✓
- `tests/install-supply-chain.test.js`: 50 senaryo ✓
- `tests/browser-stream-fixtures.test.js`: tamamı ✓
- `node --check` 5 düzenlenen dosya + yeni test: temiz
- `tools/audit-subtitle-golden.js` gerçek veriyle: pass=true (davranış korundu)

## Windows etkisi

Pozitif: paket boyutu ~22MB+ küçülür, iç belgeler sızıntısı kapanır, installer
hata mesajı netleşir. Risk: yok — yeni ignore listesi çalışma zamanı
dosyası atmaz (ratchet testi `tools/`, `install.bat`, `README` vb. koruduğunu
kanıtlar). Doğrulanmamış sınır: gerçek Windows paketleme koşusu
(`npm run package:windows`) bu kutuda koşamaz; Windows'ta bir paketleme
denemesi önerilir.
