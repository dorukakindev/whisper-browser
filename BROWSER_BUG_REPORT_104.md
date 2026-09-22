# BROWSER_BUG_REPORT_104 — Gece Denetimi ve Düzeltme Turu (2026-09-22)

- **Repo:** `dorukakindev/whisper-browser`
- **Dal:** `devin/night-audit` (taban `93f27d3` = origin/master, PR #23 birleşimi)
- **Kod commit'i:** `7fdaa2d`
- **Yöntem:** gerçek Electron (Ubuntu, `DISPLAY=:0`) + deterministic fixture/mock + Node regresyon testleri. Kullanıcı verisi, gerçek profil, API anahtarı, çerez kullanılmadı; sentetik profil ve sahte sağlayıcılar.

## Ek/iddia kaynağı durumu

2026-09-21 tarihli DOCX/Markdown denetim dosyaları bu oturuma **ulaşmadı** (eklerde görünmüyor). İddia kaynağı olarak yalnız repo içi raporlar (R94–R103) ve güncel kaynak kullanıldı; ek içerikleri görmeden "doğrulandı/yanlış-pozitif" hükmü verilmedi.

## Yasaklı alanlar (başka çalışma ağacında devam eden)

YouTube logout/revocation + browse kuyruğu, izin-isteği gerçek frame kökeni, ASS export ölçeği, çeviride sayı/saat koruması — bu alanlarda kod değiştirilmedi. Orada görülen sorunlar yalnız kanıt olarak aşağıda.

## Bulgular

### F-104-1 (FAIL-FIXED) — SmartTube arama hatası "Sonuç yok" diye görünüyordu

- **Konum:** `src/renderer/renderer.js:23224` (`searchInvidious`).
- **Ulaşılabilir yol:** SmartTube → arama → `invidious:search` 500/ağ hatası döner → `!res.ok` yolu `return []` yapıyordu.
- **Etki:** Ağ/sunucu hatası kullanıcıya "bu sorgu için sonuç yok" gibi görünüyordu; yanlış teşhis, yeniden deneme eksikliği.
- **Kök neden:** Fonksiyon hata durumunu boş liste olarak sessizce bastırıyordu; render tarafı hata ile boş sonucu ayıramıyordu.
- **Kırmızı test:** `tests/smarttube-search-error.test.js` — 500/timeout hatası render'da `showError` + "Tekrar dene" bekliyor, öncesi `[]` dönüp boş state basıyordu.
- **Düzeltme:** `!res.ok || !res.data` artık `throw new Error(reason)`; render catch'i hata mesajı + retry gösteriyor. Boş sorgu IPC'siz `[]` sözleşmesi korunur.
- **Yeşil kanıt:** 5 test PASS; mevcut `smarttube-*` suitleri etkilenmedi.

### F-104-2 (FAIL-FIXED) — Abonelik/kanal sekmesinde ağ hatası giriş-tavsiye boş ekranına çöküyordu

- **Konum:** `src/renderer/renderer.js` `renderSmartTubeSection` `'channels'` dalı (~23502) — `.catch(() => null)` kaldırıldı.
- **Ulaşılabilir yol:** SmartTube → "channels" sekmesi → Invidious 500/timeout → catch hatayı yutup `videos=[]` → "giriş yapın" tarzı boş/yanlılama mesajı.
- **Etki:** Geçici hata kullanıcıya "giriş yapmalısın" sinyali veriyordu; gerçek hata + retry gizleniyordu.
- **Kök neden:** Geniş `.catch(() => null)` tüm hata sınıflarını boş sonuca indirgeme; login-sınıfı hatalar zaten `fetchInvidiousSubscriptions` içinde `null`'a indirgeniyor (o yol korundu).
- **Kırmızı test:** `tests/smarttube-channels-error.test.js` — 500/timeout → `showError` + retry beklentisi; gerçek boş liste → boş mesaj; login-401 → `null` davranışı korunur.
- **Yeşil kanıt:** 9 test PASS (channels 500/timeout/boş/login-null, live hata/boş, load-more üç durum).

### F-104-3 (FAIL-FIXED) — Canlı sekme aynı sınıf + "Daha fazla yükle" geçici hatanın ardından ölüyordu

- **Konum:** `'live'` dalı (~23556, `.catch(() => [])` kaldırıldı) ve `stSearchLoadMore` (`renderer.js:25372-25399`).
- **Ulaşılabilir yol:** live sekmesi ağ hatası → sahte "canlı yayın yok"; arama sayfalamasında 5xx → `hasMore` kapalı, buton sonsuza ölü.
- **Etki:** Tek bir geçici hata aramada sayfalamayı kalıcı kilitliyordu; canlı sekme hata/boş ayrımı yapamıyordu.
- **Düzeltme:** `loadError` yakalanıp `stSearchHasMore` korunuyor; `.st-more-btn` "Tekrar dene: <hata>" gösteriyor; `seq`/`stSearchActive`/query guard'ları eski sayfayı karıştırmıyor.
- **Yeşil kanıt:** channels-error test dosyasındaki 9 testin load-more üçlüsü (hata→buton canlı+metin, boş→hasMore kapanır, başarı→ekleme) PASS.

### F-104-4 (FAIL-FIXED) — Player katmanından açılan `<dialog>` Escape ile kapanmıyordu

- **Konum:** `src/renderer/renderer.js:21757-21761` global keydown Escape kolu; dialog `src/renderer/media-catalog.js:436` `showModal()`.
- **Ulaşılabilir yol:** Player açık → medya kataloğu dialog'u → Escape bas → global handler önce `preventDefault()` → `<dialog>` native cancel ölür → dialog açık kalır. Ana görünümden açılan dialog doğru kapanıyordu (katman hidden'da handler return ediyor).
- **Etki:** Klavye kullanıcısı player katmanındaki modalı Esc ile kapatamaz; odak tuzağına yakın erişilebilirlik kusuru.
- **Kök neden:** Escape kolunda koşulsuz `preventDefault()` — `<dialog>`'ün platform iptal davranışını baskılıyor.
- **Kırmızı test:** `tests/player-escape-dialog.test.js` — açık dialog varken `preventDefault` çağrılmamalı; öncesi çağrılıyordu (AssertionError).
- **Düzeltme (iki katman):** (a) `if (document.querySelector('dialog[open]')) return;` `preventDefault` öncesi — açık modal varken Escape native cancel'e bırakılır, hedef nerede olursa olsun. İlk denemede `e.target.closest('dialog[open]')` bekçisi eksikti: `media-catalog.js` `render()`'ın koşulsuz `replaceChildren`'ı odaklı `.mc-close` düğmesini öldürüp `activeElement`'i BODY'ye düşürüyordu → hedef bekçisi eşleşmiyordu (re-verify'de trusted Escape yine `open:true` bıraktı). (b) Kök neden onarımı: `render()` artık odak sırasını korur (FOCUSABLES indeksi) ve modal açıkken odak dialog dışına kaçmışsa `.mc-close`'a geri alır.
- **Yeşil kanıt:** Node test PASS + gerçek Electron'da gerçek açılış yolu (buton → showModal → reload busy-render): `ae=BUTTON/mc-close` (odak korunuyor), trusted `sendInputEvent(Escape)` → `open:false`. Programatik kenar durumu da doğrulandı (odak BODY'deyken Escape → `open:false`). `player-ui` 145 test sıfır regresyon.

### G-104-1 (FAIL-OPEN, kozmetik) — `settings-open` sınıfı katman gizliyken stale kalabiliyor

Re-verify koşusunda bir kez gözlendi: ayar çekmecesi kapandıktan sonra `settings-open` class'ı `playerLayer` hidden iken DOM'da kalabiliyor; bir sonraki Escape'in drawer'a düştüğü görüldü. Görünür etki yok (hidden katman) — kozmetik/edge; düzeltme bu turda yapılmadı, kanıt kayıtlı (`/tmp/e-matrix` koşusu).

## Kuyruk bazında sonuçlar

### A — Browser/Player kullanım matrisi — FAIL-FIXED

- Yeni smoke `tests/electron-smarttube-usage-matrix.smoke.js` (gerçek Electron, mock IPC): Enter/Space çapraz-tetik yok (kanal kartı → kanal IPC×2, probe 0; video kartı → probe×1, overlay kapanıp probe hatasında yeniden açılıyor), ArrowRight odak kaydırıyor, 401/403/429/ENOTFOUND → doğru görünür durum + retry, home feed hatası → fallback + kurtarma, restart sonrası kuyruk kalıcı (write/verify faz).
- Bu matris F-104-1/2/3'ü yüzeye çıkardı (yukarı). Mock OAuth başarısı ≠ gerçek YouTube hesap doğrulaması — raporda yalnız IPC sözleşmesi doğrulanmış sayıldı.

### B — Yakalama + zaman doğruluğu — zaten kapalı (kanıt yeniden koşuldu)

R98/T1 ve R99/T2'nin eklediği regresyon smokes'ları bu dalda tekrar koşuldu: `electron-overlay-timing`, `electron-capture-completeness`, `subtitle-gauntlet` hepsi yeşil; seq-ankerli CEA defteri ve `complete`-bayrak sözleşmesi geçerli. **Yeni bulgu yok.** CEA-708/DRM açık sınır.

### C — Çeviri maliyet/iş yaşam döngüsü — zaten kapalı

R100 (altın korpus + sağlayıcı sayaçları) ve `browser-translation-reliability.test.js` (seek önceliği, geç cevap iptali, offline, retry, devre kesici, Retry-After-429) kapsamında; perf koşusu `providerCalls=13` (10k cue toplu işleniyor — cue başına çağrı yok) ve `liveResults=0` gösterdi; yeni maliyet bug'ı yok. Sağlayıcı hata/timeout/bozuk-JSON için terminal hata+durdur/dene R96-R100 hattıyla doğrulanmış.

### D — Crash/veri bütünlüğü — zaten kapalı

`crash-integrity.test.js` (fs enjeksiyon, `.bak` kurtarma, `.tmp` süpürme, EIO dürüst fail, destroyed-webContents guard, job dedupe) dalda tekrar yeşil; idempotence kanıtı R102'de alınmış. Yeni bug yok.

### E — UI/a11y — FAIL-FIXED (F-104-4)

Ajan matrisinde 72 ekran görüntüsü (`/tmp/e-matrix/`): EN+TR, 1280×720/1920×1080, 125-150% ölçek, Player/Browser/SmartTube/jobs/panel/settings/dialog/hata durumları. Odak görünürlüğü ve uzun-TR metin bütçesinde kritik kusur yok; tek doğrulanmış işlev sorunu F-104-4 düzeltildi. Grafit/amber tema korunur, kozmetik yenileme yapılmadı.

### F — Performans/dayanıklılık — PASS (ölçüm, yeni bug yok)

`electron-perf-gauntlet`: 10.000 cue render=15ms, 500 node cap; p95/p99 longtask=0ms; rafP95/P99=17ms; multi-tab=3; ΔRAM=+125MB, Δdisk=+49KB — bütçeler içinde, sızıntı eğilimi yok. Yeni perf bug'ı yok.

### G — Temiz kurulum/CI — PASS

Sıfır klon (`/home/ubuntu/night-clean`): install→`npm test` tam yeşil ("Tüm testler geçti"); Electron bridge smoke PASS; master CI (`93f27d3`) windows+ubuntu yeşil. Ortam notu: `npm test` `requirements-ci.txt` bağımlılıklarını ister (R103'te belgeli, ürün bug'ı değil). Windows doğrulaması CI'a emanet — Ubuntu başarısı gerçek-Windows kanıtı diye sunulmuyor.

## Kabul matrisi

| Kuyruk | Durum |
|---|---|
| A kullanım matrisi | FAIL-FIXED (F-104-1/2/3) |
| B yakalama/zaman | PASS (zaten kapalı; CEA-708/DRM açık sınır) |
| C çeviri maliyet | PASS (zaten kapalı; gerçek sağlayıcı = erişim sınırı) |
| D crash/bütünlük | PASS (zaten kapalı) |
| E UI/a11y | FAIL-FIXED (F-104-4) |
| F performans | PASS |
| G temiz kurulum/CI | PASS (Windows = CI) |

## Nicel özet

- 4 gerçek bug → 4 düzeltme, hepsi önce-kırmızı → sonra-yeşil.
- Yeni testler: search-error 5, channels-error 9, escape-dialog 3 hücre, usage-matrix Electron smoke (12+ doğrulama noktası, 2 fazlı restart).
- Gerçek-Electron kanıtı: usage-matrix smoke + `sendInputEvent` Escape doğrulaması + ajan 72 ekranlık matris.
- Deterministik fixture kanıtı: yakalama/zaman/crash suitleri tekrar yeşil; perf sayıları yukarıda.
- **Doğrulanamayan (erişim):** gerçek YouTube hesap akışı, gerçek ücretli sağlayıcı kalitesi, CEA-708 fixture'ı, gerçek Windows makine, DOCX/Markdown ek içerikleri.
