# BROWSER_BUG_REPORT_96 — Browser Subtitle Reliability Gauntlet

Tarih: 2026-09-21 · Dal: `devin/subtitle-reliability-gauntlet` · Taban: `master @ b203a2d` (r95 turu dahil)

## Kapsam

Yedi bölümlük matris: (1) protokol fixture laboratuvarı, (2) zaman çizelgesi değişmezleri, (3) tam yakalama/eksiksizlik, (4) büyüyen altyazı + çeviri maliyeti, (5) kaynak–çeviri eşleşmesi, (6) gerçek Electron UI kabulü, (7) ≥30 dk deterministik soak. İzole profil + sentetik fixture; gerçek kullanıcı verisi yok, DRM/CDM aşılmadı.

## Ürün bulguları (gerçek hatalar)

### F-96-1 — hls.js `data:` `<track>` öğeleri aynı streamKey'e çöküyor: subtitles+captions tek buffer'da birleşiyor — FAIL-FIXED

- **Dosya:satır:** `src/main.js` ~10298 (`browserTrackProbeScriptWithMode` içindeki `element.src` → `sourceUrl` ataması); `browserTrackStreamKey` ~5031.
- **Ulaşılabilir olay yolu:** hls.js `subtitleDisplay` açık herhangi bir HLS sayfası — hls.js altyazı izlerini `src="data:,WEBVTT"` (gövdesiz data URL) taşıyan sentetik `<track>` öğeleriyle oluşturur; aynı sayfada CEA/embedded iz de aynı src'li `<track>` ile çıkar. Probe `element.src`'i `sourceUrl` olarak kullanınca `browserTrackStreamKey('data:,WEBVTT','en')` → `'null,WEBVTT|en'` iki iz için de aynı anahtar üretir → `browserTrackBuffers` tek buffer'da birleşir.
- **Reprodüser:** `tests/browser-subtitle-gauntlet.test.js` sonundaki regresyon testi — üretim `browserTrackProbeScriptWithMode`'u sahte DOM'da çalıştırıp iki textTrack (subtitles 'English' [F,S,T] + captions 'Embedded' ['00:00:00']) için streamKey'leri karşılaştırır. Önce kırmızıydı: iki anahtar da `'null,WEBVTT|en'`.
- **Kullanıcı etkisi:** Gerçek HLS sayfasında subtitle ve embedded-CC izleri TEK yayınlanan altyazıya karışıyor: published SRT `[First, Second, '00:00:00'@0–119]` içeriyordu ve 'Third fixture cue' düşüyordu — çapraz kontaminasyon + sessiz cue kaybı.
- **Kök neden:** `data:` URL'i ağ kimliği değildir; probe onu kaynak kimliği olarak kullanıyordu.
- **Düzeltme:** `sourceUrl` artık `/^data:/i` src'ler için boş bırakılıyor → `dom:lang:label:kind:trackId` yedeği devreye giriyor → iz başına ayrı anahtar (`nullen:English:subtitles:|en` vs `nullen:Embedded:captions:|en`).
- **Son doğrulama:** Regresyon testi yeşil; `tests/electron-browser-subtitle-gauntlet.smoke.js` gerçek Electron'da 7 ayrı iz gösteriyor (3 vtt + hls-vtt + cea-608 + 2 html5-track), coverage'da iki ayrı DOM-key girişi.

### Test harnesi bulguları (ürün hatası değil — ayrı raporlanır)

- **T-96-1:** `tests/run-resource-soak.js` yalnız Windows'tan spawn ediyordu (`cmd.exe /d /s /c start.bat`) → Linux'ta soak tamamen BLOCKED'tu. Platforma göre `require('electron')` ikilisiyle `electron . --disable-gpu` başlatılıyor.
- **T-96-2:** Watchdog sabit 10 dk idi → `cycles*8sn + 15dk`'a ölçeklendi.
- **T-96-3:** Soak fixture'ına gerçek oynatma sayfası eklendi: hls.js + mux.js'in gerçek CEA-608 fMP4 segmentleri (`dash-608-captions-init.mp4`/`dash-608-captions-seg.m4s`). URI'ler döngü başına benzersiz (`?c=N`) — sabit URI'ler üretim dedup'ına haklı olarak takılıp döngüyü "yakalanamadı" yapıyordu (fixture hatasıydı, ürün davranışı doğruydu).
- **T-96-4:** Soak op'ları: video döngülerinde seek (`v.currentTime`) + kalite değişimi (`hls.currentLevel`), metin döngülerinde offline/online (`session.enableNetworkEmulation`) ve 403 fetch, 25. döngülerde `useBrowserTrack(true)` + `window.api.stopBrowserTranslation` ile gerçek çeviri başlat/iptal (sahte sağlayıcı), ortada `mainWindow` yenilemesi (`WHISPER_RESOURCE_SOAK_RELOAD_AT`), 60 tab hibernasyonu. Not: offline op'unu video sayfasında çalıştırmak sonraki video döngülerinin ağını bozuyordu — op'lar metin döngülerine sabitlendi.
- **Gözlem (ürün):** Video oynatan veya işlenmemiş altyazı yanıtı olan sekmeyi `unloadBrowserTab` reddediyor (`'Sekmede ses veya video oynuyor.'`, `'1 altyazı yanıtı henüz işlenmedi'`) — koruma bilinçli; hibernasyon hedefi metin sayfasına taşınarak ölçülüyor.

## Kabul matrisi

| Bölüm | Durum | Kanıt |
|---|---|---|
| 1. Protokol fixture lab | PASS | `tests/browser-subtitle-gauntlet.test.js` — EXT-X-MAP/BYTERANGE/SKIP/GAP, değişen MEDIA-SEQUENCE, aynı-URL-değişen-içerik, 200/304, sıfır-olmayan PTS (X-TIMESTAMP-MAP 90s), metin düzeltmesi, reklam/discontinuity, CEA-608 algı+varyant eşleşme. Canlı/büyüyen playlist ve 403/imzalı-URL-yenileme kolları gerçek-Electron smoke'unda. CEA-708: desteklenmiyor → açık "unsupported" tanısı. |
| 2. Zaman değişmezleri | PASS | Monoton sıra, negatif süre yok, discontinuity çift uygulanmıyor, varyantlardan tekilleştirme, seek sonrası eski-epoch cue yok — deterministic suite + smoke'ta seek→overlay doğrulaması. |
| 3. Eksiksiz yakalama | PASS | `EXTINF:8` (video 125s) → `state:'partial'`, `planComplete:false`, `planReason:'duration-gap'`, mesaj "Segment planı video süresinin yalnız %6 bölümünü kapsıyor; yakalanan 1 satır korundu" — kısmi sonuç dürüstçe bildiriliyor. `EXTINF:125` → `state:'complete'`, `durationPercent:100`, "1 altyazı satırı eksiksiz yakalandı ve GİRDİ klasörüne kaydedildi." — tam mesajı yalnız kanıtla. |
| 4. Büyüyen altyazı + çeviri maliyeti | PASS | Deterministik scheduler testi: 100 cue → 100 çağrı; +20 → reconcile yalnız yenileri; 5 metin düzeltmesi → yalnız değişen "added"; zaman-değişimi tek başına yeniden çeviri tetiklemez; iptal/retry sayaçları. Gerçek UI: sahte sağlayıcıda `providerRequests:1` ile 3-cue gruplu cümle → `liveTranslations:3` (`TR:…·p0/p1/p2`). |
| 5. Kaynak–çeviri eşleşmesi | PASS | sentenceIdFor zaman+id tabanlı (aynı metin farklı zaman → ayrı id); araya eklenen cue sonraki kimlikleri kaydırmaz; `distributeTranslation` parça zamanlarını kaynağa sadık tutar; düzeltilen kaynak eski çeviriyi düşürür; sayı/olumsuzluk gate'i sağlayıcı kaymasını reddeder. |
| 6. Gerçek Electron UI kabulü | PASS | `electron-browser-subtitle-gauntlet.smoke.js` — gerçek Electron + `host-resolver-rules` + yerel HTTPS fixture + self-signed cert (`setCertificateVerifyProc` yalnız gauntlet.test'e izin) + sahte OpenAI-uyumlu sağlayıcı. Player/Browser modu, HLS/VTT + gömülü CEA yakalama, "Tüm altyazıyı getir" (CEA plan→complete), "İzi seç ve çevir", kaynak/ikisi görünümleri, seek, sekme yenileme, EN/TR, %100/125/150 ölçek — screenshotlar `.uiprev/subtitle-gauntlet/`. |
| 7. ≥30 dk soak | PASS | `tests/run-resource-soak.js --cycles=4000 --warmup=20 --hibernation-cycles=100` → 4000/4000 yakalama, 100/100 hibernasyon, 0 unhandled rejection, tüm bütçeler GEÇTİ — süre **34.0 dk** (16:34→17:08 UTC). Önceki 3200 döngülük koşu da yeşildi ama 26.9 dk ile 30 dk altında kaldı; metrikler aşağıda. |

## Bölüm 7 — soak sonuçları

**3200-döngü koşusu** (`soak-3200-report.json`, süre 26.9 dk ölçülen): 3200/3200 yakalama (%100), 80/80 hibernasyon, 0 unhandled rejection; verdict **GEÇTİ** (23/23 bütçe).

| Örnek | main RSS | main heap | renderer heap | toplam WS | listener | timer (main) | trackBuf | pend.Resp | srt dosya |
|---|---|---|---|---|---|---|---|---|---|
| start | 317.9 MB | 90.9 MB | 4.5 MB | 714.1 MB | 1615 | 19 | 1 | 0 | 0 |
| stable-800 | 287.9 | 32.9 | 4.4 | 729.6 | 1495 | 17 | 2 | 0 | — |
| postreload-1600 | 297.2 | 39.1 | 4.1 | 752.8 | 1371 | 10 | 2 | 0 | — |
| stable-2400 | 296.9 | 32.6 | 4.8 | 741.4 | 1479 | 17 | 2 | 0 | — |
| stable-3200 | 298.6 | 50.4 | 4.8 | 742.9 | 1479 | 14 | 1 | 0 | — |
| final | 286.4 | 37.5 | 5.7 | 687.8 | 1615 | 3 | 0 | 0 | — |
| cleanup | 288.8 | 41.3 | 5.7 | 591.6 | 1453 | 1 | 0 | 0 | 64 |

- **Sızıntı yok:** main RSS −33 MB (azaldı), renderer heap +1.25 MB (eğim 301 B/döngü — yatay), listener delta 0, timer delta ≤0, GPU süreç delta 0, trackBuffers/pendingResponses sınırlı.
- **`postreload-1600`:** uygulama yenilemesi renderer listener'larını 1495→1371'e düşürdü (eski context'in dinleyicileri salındı — birikim yok), sonrasında normal seviyeye döndü.
- **Ops kapsamı:** her çift döngü hls.js video sayfası (gerçek oynatma + seek + `hls.currentLevel` kalite değişimi); 9,29,49… döngülerinde offline/online; 11,23,35…'te 403 fetch; 25,50,75…'te gerçek `useBrowserTrack` + `stopBrowserTranslation` (sahte sağlayıcı); 1600'de uygulama yenilemesi; 80 tab unload/wake hibernasyonu.
- **Ops gözlemi:** `browser-subtitle-file-count` tam 64 (bütçe sınırında) — store kendi üst sınırında dönüyor; büyüme kontrollü.

**4000-döngü koşusu** (`soak-long-report.json`, süre 34.0 dk = 16:34:16→17:08:16 UTC): 4000/4000 yakalama (%100), 100/100 hibernasyon, 0 unhandled rejection; verdict **GEÇTİ** (23/23 bütçe). Uygulama yenilemesi döngü 2000'de yapıldı.

| Örnek | main RSS | main heap | renderer heap | listener | main timer | srt dosya |
|---|---|---|---|---|---|---|
| start | 310.3 MB | 35.8 MB | 4.49 MB | 1615 | — | — |
| stable-1000 | 291.7 | — | 4.43 | 1495 | — | — |
| postreload-2000 | 296.3 | — | 4.14 | 1371 | — | — |
| stable-2000 | 292.4 | — | 4.14 | 1371 | — | — |
| stable-3000 | 299.7 | — | 4.78 | 1479 | — | — |
| stable-4000 | 304.6 | — | 4.60 | 1479 | — | — |
| final | 291.3 | — | 5.29 | 1615 | 0 delta | — |
| cleanup | 294.3 | — | 5.29 | 1453 | — | 64 |

- **Sızıntı yok (ikinci bağımsız koşu):** main RSS delta **−19.9 MB** (azaldı), renderer heap delta +0.80 MB (eğim **160 B/döngü**, bütçe 48 KiB — yatay), browser heap −0.03 MB, toplam WS −15.2 MB, listener delta 0, main timer delta 0, GPU süreç delta 0. İki koşu da aynı profil: düzenli ve tekrarlanabilir artış GÖRÜLMEDİ.
- **İki koşu karşılaştırması:** 3200 ve 4000 döngü aynı davranış eğrisini verdi (RSS hafif düşüş + düz eğim) — tek koşuya özgü artefakt değil.
- **Reload etkisi tekrarlandı:** `postreload-2000`'de renderer listener'ları 1495→1371 (eski context salındı), sonrasında 1479'a geri döndü; final'de 1615 — start ile birebir aynı.
- **subtitle dosya sayısı:** yine tam 64 (store üst sınırı) — kontrollü büyüme ikinci koşuda da sabit.

## Doğrulanamayanlar

- **Gerçek sağlayıcı kalitesi:** sahte OpenAI-uyumlu sunucu kullanıldı; gerçek LLM çıktısı ölçülmedi.
- **Gerçek HLS/DASH servisleri:** tüm fixture'lar yerel; dış servis istekleri yok (erişim engeli değil, tasarım).
- **CEA-708:** fixture üretimi yok — "unsupported" tanı kolu doğrulandı.

## Komutlar / exit kodları

- `node --test tests/browser-subtitle-gauntlet.test.js` → 0
- `node tests/electron-browser-subtitle-gauntlet.smoke.js` → 0 (report.json + 10 screenshot)
- `npm test` → 0 (tüm node+python paketi)
- `npm run test:electron-bridge` → 0
- `node tests/run-resource-soak.js --cycles=3200 --warmup=20 --hibernation-cycles=80` → 0 (GEÇTİ, 26.9 dk)
- `node tests/run-resource-soak.js --cycles=4000 --warmup=20 --hibernation-cycles=100` → 0 (GEÇTİ, 34.0 dk)
