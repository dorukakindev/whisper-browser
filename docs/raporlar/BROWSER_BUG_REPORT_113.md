# BROWSER BUG REPORT 113 — R112 sonrası sınır kapatma (hardening)

**Dal:** `codex/r113-hardening-1790133270` · **Taban:** master `b5dfc35` (PR #35 merge sonrası)
**Kapsam:** R112'de doğrulanabilir olarak açık bırakılan dört madde: legacy smoke tamiratı, T2 hız/görünürlük senaryoları, T5 çapraz-sekme sızma kanıtı, uzatılmış birleşik soak.
**Yöntem:** Gerçek Electron + izole test profili (`WHISPER_RESOURCE_SOAK_USER_DATA`) + yerel fixture HTTP sunucusu. Ücretli sağlayıcı, gerçek hesap ve kullanıcı verisi kullanılmadı.

---

## Karar tablosu

| # | Madde | Karar | Kanıt |
|---|-------|-------|-------|
| 1 | `electron-subtitle-output-smoke` askıda kalma | **BUG DÜZELTİLDİ** (test altyapısı) | Süreç artık kendi başına çıkıyor; 4/4 kontrol `ok:true` |
| 2 | `electron-browser-tools-design` batch flake (`width:0`) | **BUG DÜZELTİLDİ** (test) | 3/3 tekrarlı koşu PASS |
| 3 | T2: 0.5×/2× hız + görünürlük senaryoları | **PASS** (+ tasarım bulgusu) | 69 örnek; hidden'da donma bilinçli tasarım, reshow'da anında toparlanma |
| 4 | T5: çapraz-sekme sızma | **PASS** (+ ölçülen tasarım sınırı) | 24/24 örnek, 0 sızma |
| 5 | Uzatılmış soak | **PASS** | 400+1300 döngü, listener/timer delta 0, yakalama %100 |

**Ürün kodu değişikliği:** yok (yalnız `tests/` + `docs/`). **Yeni ürün bug'ı:** bulunamadı — kanıtlanamayan iddia raporlanmadı.

---

## 1) Legacy smoke tamiratı

### BUG-R113-01 — `electron-subtitle-output-smoke` sonsuz askı (test altyapısı)

- **Belirti:** Smoke tüm assert'leri yeşil geçiyor, son log satırını basıyor, sonra süreç sonsuza kadar çıkmıyor (`~10 dk` gözlem).
- **Kök neden:** `stopElectron()` → `spawnSync('taskkill.exe', …)` **Windows-only**; Linux'ta ENOENT ile sessizce başarısız oluyor → canlı Electron child handle'ı Node event loop'unu açık tutuyor → `process.exit` asla tetiklenmiyor.
- **İkincil hata:** İlk düzeltme denemesi DevTools soketlerini zarif `app.quit()` çağrısından ÖNCE kapatıyordu → kapalı sokete `send()` sessizce düşürülüyor → CDP promise'i asla resolve olmuyor → zarif çıkış yolu da kilitleniyor.
- **Düzeltme (test dosyası):** `stopElectron(gracefulQuit)` — soketler açıkken 5 sn bütçeli zarif `app.quit()` → 10 sn bekle → `openSockets` kapat → POSIX'te `SIGKILL` / Windows'ta `taskkill.exe` → 3 sn exit beklemesi.
- **Ayrıca:** Dosya `electron-subtitle-output-smoke.js` → `electron-subtitle-output.smoke.js` olarak yeniden adlandırıldı; runner envanteri `electron-*.smoke.js` glob'una giriyor, yani artık `--all` içinde koşuyor.
- **Kanıt:** Assert çıktısı 4/4 `ok:true` (local, youtubePlayer, browserYoutube, pair) + süreç temiz çıkıyor.
- **Commit:** `4d710a0` (rename) + `6aedff2` (stopElectron gövdesi).
- **Kalan sınır:** Linux'ta doğrulandı; Windows `taskkill.exe` yolu kod düzeyinde korunuyor ama bu makinede koşturulamaz (Windows CI'da).

### BUG-R113-02 — `tools-design` batch flake `{width:0}` (test)

- **Belirti:** `--all` batch'inde `electron-browser-tools-design` ara sıra dar-panel ölçümünde `{width:0}` ile düşüyor.
- **Kök neden:** `setContentSize(900,700)` → asenkron X11 resize → `window 'resize'` → `syncResponsivePlayerLayout()`. Panel resize'dan ÖNCE açılırsa geç gelen sync `narrowPanelTakeover`'ı yeniden hesaplayıp paneli gizliyor (`display:none` → `width:0`). Testin `until(width>0)` beklemesi bile kurtaramıyor — ordering hatası, yavaşlık değil.
- **Düzeltme (test dosyası):** Paneli açmadan ÖNCE `player.narrowViewport === true` oturmasını bekle (≤15 sn) → sonra panel aç → ölç. Assert yük��ne teşhis alanları (`display`, `layer`, `sideTab`, `takeover`) eklendi — gelecek flake'lerde kök neden anında görülecek.
- **Kanıt:** 3/3 tekrarlı koşu PASS.
- **Commit:** `86be66c`.
- **Ürün etkisi:** yok — dar görünümün kendisi doğru çalışıyor; flake test yarışıydı.

---

## 2) T2 genişleme — hız + görünürlük (`electron-overlay-timing`)

Yeni senaryolar overlay metnini her 200 ms'de örneklenen video zamanına oraklıyor (`expectedAt(t)`), CPU sessizliği/rVFC'siz ortamda ±300 ms toleransla:

| Senaryo | Sonuç |
|---------|-------|
| `rate2` (2× @ t=6, 3 sn) | 15 örnek, 0 uyumsuz — medya 6→11.49 s ilerledi |
| `rate05` (0.5× @ t=4, 3 sn) | 15 örnek, 0 uyumsuz — medya 4→5.36 s |
| `paused` | metin iki okumada sabit ve doğru cue |
| `resume` | 10 örnek, 0 uyumsuz |
| `hidden` (`win.hide()`) | `visibilityState:'hidden'` doğrulandı; 13/13 örnek bayat (aşağıya bak) |
| `reshow` (`win.show()+focus`) | 8 örnek, 0 uyumsuz — ilk örnekte doğru cue'ya toparlanma |

**Tasarım bulgusu (bug DEĞİL):** `document.hidden` iken overlay bilinçli donuyor — `browser-overlay-controller.js` `queueFrame`/`boundaryTimer`/`render`/`mutationFrame` hepsi `document.hidden` korumalı (348/388/250/285) ve `visibilitychange → render` (617) reshow'da anında toparlıyor. Görünmez yüzeyde bayat metin kullanıcıya hiç görünmez → kaynak tasarrufu tasarımı. Bayat örnekler veri olarak raporlanıyor, hata olarak sayılmıyor.

**Commit:** `12b62df` (test genişlemesi, +82 satır).

---

## 3) T5 — çapraz-sekme sızma kanıtı (`electron-browser-tab-leak.smoke.js`, yeni)

Senaryo: iki sekme, iki ayrı video (`tab-a.mp4`/`tab-b.mp4`), sekme başına ayrı cue kümesi (`A-KAYNAK-*` + `A-CEVIRI-*` çeviri katmanı / `B-KAYNAK-*` yalnız kaynak), split görünümde iki yüzey **eşzamanlı görünür**.

| Ölçüm | Sonuç |
|-------|-------|
| S1 eşzamanlı örnekleme | 12+12 örnek, `vis A:12 B:12` — **0 sızma**: A'da hiç B metni, B'de hiç A metni/çevirisi yok; her sekme kendi `expectedAt(t)` cue'suyla oraklı |
| S2 sekme kapatma | A kapatıldı → main+renderer `{tabs:[B], active:B}` tutarlı; A URL'si kayıtlarda yok; `liveKeys` boş; split otomatik temizlendi; B overlay'i kesintisiz B metni göstermeye devam etti |
| S3 navigasyon (B→yeni sayfa) | `did-navigate → resetBrowserCaptureState` overlay cue'larını temizliyor — yeni medyada ne eski B ne A metni var; overlay'i yeniden kurunca doğru B kümesi dönüyor |
| S4 kaynak sayıları | `mediaListeners 7→7`, `mutationObservers 1→1` — şişme yok |

**Ölçülen tasarım sınırı (bug DEĞİL, dokümante edildi):** sekme mutasyonları `'tabs-changed'` event'i yerine **invoke yanıtıyla** senkronlanır — renderer helper'ları (`createBrowserTab`, `closeBrowserTab`, `syncBrowserTabs`) yanıtı uygular. `syncBrowserTabs` probe'u ile doğrulandı: kapatmada event gelmedi, yalnız yanıt uygulandı (stack: helper). Doğrudan `window.api.*` çağrısı renderer'ı bayat bırakır — ama ürünün tüm UI yolları helper kullandığı için sızma yüzeyi yok. `browserTabEventGate` koruma katmanı da bu modele bağlı.

**Kanıt:** `docs/raporlar/r113-evidence/tab-leak-*.png` (3 gerçek Electron ekran görüntüsü) + `tab-leak-report.json`.
**Commit:** `cb8cb8a` (yeni smoke, 344 satır).

---

## 4) Uzatılmış birleşik soak

`tests/run-resource-soak.js` — birleşik döngü (sayfa/video navigasyon + seek + kalite değişimi + offline/online + 403 + çeviri başlat/iptal + player↔browser geçiş + izleme-listesi yazımı + sekme hibernasyon unload/uyanma).

| Koşu | Süre | Sonuç |
|------|------|-------|
| 400 döngü + 50 hibernasyon | ~7 dk | **GEÇTİ** — 21/21 bütçe OK, `meaningful:true` |
| 1300 döngü + 60 hibernasyon | ~20 dk | **GEÇTİ** — tüm bütçeler OK, `meaningful:true` |

400'lük koşu ölçümleri (başlangıç/orta/son örnekleri raporda `samples[]`):
- yakalama **%100** (400/400), hibernasyon **%100** (50/50), unhandled rejection **0**
- `listener-delta: 0` — 8 döngülük smoke'daki +108'in ısınma olduğu doğrulandı (sızıntı değil)
- `main-rss-delta: -29.1 MB`, renderer/browser heap delta < 1 MB, timer delta 0
- `overlay-render-avg 0.10 ms`, max 0.10 ms — p95 bütçesi çok altında
- `browser-subtitle-file-count 64/64` — döngü boyunca biriken .vtt kalıntısı bütçe içinde

1300'lük koşu ölçümleri (örnekler: `start → stable-325 → postreload-650 → stable-650 → stable-975 → stable-1300 → final → cleanup`):
- yakalama **%100** (1300/1300), hibernasyon **%100** (60/60), unhandled rejection **0**
- `listener-delta: 0`, `main/renderer timer delta 0`, `gpu-process-delta 0`
- heap eğimi: renderer 404 B/döngü, browser 390 B/döngü (bütçe 49 KB/döngü) — doğrusal sızıntı yok
- `main-rss-delta: -9.6 MB` (650'deki `uygulama yenilendi` dahil), toplam çalışma kümesi delta -22 MB
- `overlay-render-avg 0.05 ms`, max 0.10 ms; `browser-subtitle-file-count 64/64` bütçe içinde

**Kanıt:** `docs/raporlar/r113-evidence/soak-400cycle.json` + `soak-1300cycle.json` (başlangıç/orta/bitiş örnekleri `samples[]` içinde).

---

## Doğrulanamayan / açık sınırlar

- **Windows `taskkill.exe` yolu:** kodda korunuyor, Windows CI'da koşar; bu makinede doğrulanamaz.
- **Sekme oluşturma/kapama ürün yolunda event'siz senkron:** ölçüldü ve bilinçli tasarım olarak dokümante edildi — değiştirilmedi (sızma yüzeyi üretmiyor).
## Test durumu

- `electron-subtitle-output.smoke` — PASS (önceden: sonsuz askı)
- `electron-browser-tools-design` — PASS 3/3 (önceden: batch flake)
- `electron-overlay-timing` — PASS (69+12 örnek, genişletilmiş)
- `electron-browser-tab-leak` — PASS (yeni)
- `run-resource-soak` 400 + 1300 — ikisi de GEÇTİ
- Tam `npm test` kasıtlı koşulmadı — ürün kodu değişmedi; hedefli smoke'lar yeterli.
