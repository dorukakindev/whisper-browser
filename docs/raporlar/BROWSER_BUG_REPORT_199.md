# BROWSER_BUG_REPORT_199 — R242: tur-4 paketinin açık bıraktığı 3 madde

**Tarih:** 2026-09-29 · **Dal:** `fix/r242-open-items` · **Temel:** `1c62214` (tur-4 merge)

Tur-4 paketinin BULGULAR.md dosyası üç maddeyi bilinçli açık bırakmıştı. Bu tur
üçünü de kapattı + tur-4 diff'inin tamamına bağımsız okuma yapıldı (bulgu yok).

## 1. Altyazı indirmesinde DNS rebinding — KAPANDI

`fetchBrowserBuffer` URL'yi `assertPublicBrowserSubtitleUrl` ile Node DNS'i
üzerinden doğruluyor, sonra `session.fetch` ile indiriyordu — Chromium'un kendi
resolver'ı ikinci bir çözümleme yapıyordu. Saldırgan DNS'i iki çözümleme arasında
değiştirirse indirme doğrulanmamış (özel ağ) bir adrese gidebilirdi.

**Düzeltme:** `assertPublicBrowserSubtitleUrl` artık doğrulanan
`{address, family}` döndürür; yeni `requestPinnedSubtitleBuffer` Node
`http(s).request` ile bağlantıyı `lookup` seçeneği üzerinden aynı IP'ye sabitler
(`requestPinnedMangaImage` kalıbı). SNI/Host asıl alan adında kalır → TLS
doğrulaması etkilenmez. Aynı-köken isteklerde oturum çerezleri elle taşınır;
User-Agent Chromium'un aynısıdır.

**Geri düşümler:** oturumun proxy'si `DIRECT` değilse (Node lookup proxy'yi
atlayamaz) veya oturum ilgili protokolü kendisi işliyorsa (fixture/test
interceptor'ü) eski `session.fetch` yolu kullanılır — o yolda DNS kontrolü
hâlâ uygulanır ama ikinci çözümleme penceresi kalır.

## 2. `normalize_timings` ~10 ms cue — KAPANDI

`backend/transcribe.py`: bitişik cue'lar arasına sıkışan bir blok, tavan
(`next_start - min_gap`) dar olduğunda son çare `e = s + 0.01` tabanına
düşüyordu → ~10 ms'lik okunamaz flaş cue yazılıyordu.

**Düzeltme:** normalize çıkışında <200 ms kalan cue metni sonraki cue'nun
başına katlanır (metin korunur, flaş yok); sonda kalırsa öncekine eklenir.

## 3. `whisper-assets://` parmak izi — KAPANDI

Protokol sabit `ass` host'unda 5 vendored dosyayı sunuyordu — kullanıcı dosyası
oracle'ı yok ama herhangi bir sayfa `whisper-assets://ass/jassub.js` yükleyerek
kullanıcının Whisper Browser çalıştırdığını tespit edebiliyordu.

**Düzeltme:** `registerAssAssets` oturum başına `ass-<16 hex>` nonce host'u
üretir; handler yalnız o host'a yanıt verir. URL yalnız enjekte edilen
`buildAssInstallScript` içine yazılır (`browserSession` parametresi eklendi);
tahmin edilebilir `whisper-assets://ass/...` artık 404 → parmak izi kapandı.

## Tur-4 diff'i bağımsız okuma (temiz)

`49ceb31..1c62214` (~900 satır) tam okundu: `rollback_open_output_transactions`
çift bekçili (closed + committed), `env` pop'u argv okumasını takip ediyor
(hf_token args akışı), favicon köken sınırı doğru (aynı köken yerel ağ sitesi
etkilenmez), dil kodu hem main'de hem backend'de doğrulanıyor, içe aktarılan
geçmişte kök listesi boşsa tüm dosyalar reddediliyor (güvenli varsayılan).
Yeni bulgu yok.

## Kanıtlar

- `tests/browser-subtitle-dns-pin.test.js` (YENİ, 5 senaryo): pin geçişi,
  çerez/UA taşınması, proxy geri düşümü, interceptor geri düşümü, yönlendirme
  zincirinde yeniden pin — 18/18 PASS.
- `backend/test_transcribe.py`: `test_normalize_timings_merges_unrenderable_flash_forward` dahil 204/204 PASS.
- `electron-browser-ass.smoke.js`: nonce host regex + sabit `ass` hostuna 404
  probu + uçtan uca JASSUB render — PASS.
- `electron-browser-subtitle-gauntlet` (CEA + çeviri tam akış) PASS —
  `isProtocolHandled('https')` geri düşümüyle fixture interception korundu.
- `electron-subtitle-output`, `electron-browser-cea-full-ui` PASS.
- Hedefli JS: dash-capture, overlay-controller, subtitles, manifest-recovery —
  hepsi PASS.

## Doğrulanmayanlar

- Proxy'li gerçek Windows ortamında Chromium geri düşüm yolu elle denenmedi.
- `normalize_timings` birleştirme kuralı gerçek Whisper çıktısında flaş cue
  üretmediği için yalnız sentetik korpusta kanıtlandı.
