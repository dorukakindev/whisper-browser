# Browser Bug Raporu 40 — Great Courses `1-CC1` yakalanamama analizi

Tarih: 2026-09-16 · Yazıldığında HEAD: `073ac36` · Güncelleme: Sol'un `92f8f7f` düzeltmesi sonrası durum notları eklendi.

> **Not:** Bu rapor önce `BROWSER_BUG_REPORT_38.md` adıyla yazılmıştı; aynı numarayı Sol'un kapanış raporu kullanınca 40'a taşındı. Analizin tetiklediği düzeltmeler `92f8f7f` + `BROWSER_BUG_REPORT_39.md`'de.

## Belirti

`plus.thegreatcourses.com` ders sayfasında video `Subtitles: 1-CC1` ile oynuyor (altyazı ekranda görünüyor) ama uygulama "Bu sayfada altyazı izi bulunamadı" diyor; "Tüm altyazıyı getir" planı da oluşmuyor.

`1-CC1` kimlik biçimi Video.js/VHS'in bant-içi CEA izi konvansiyonudur (`{akış}-{INSTREAM-ID}`) — yani büyük olasılıkla HLS + gömülü CEA-608. Uygulamanın tam yakalama yolu bunun için tasarlandı; sorun, planın oluşabilmesi için gereken **manifest yakalamanın hiç gerçekleşmemiş** olması.

## Keşif hattı (doğrulanan mimari)

1. `browser-preload.js` — DOM'da `video`/`textTrack` gözler, içeriksiz sinyal yollar (`browser:discovery-signal`).
2. CDP debugger — `Network.responseReceived` + `loadingFinished` → gövde okunur → `detectHlsCea608` → `browserHlsCeaActive` → "Tüm altyazıyı getir" planı.
3. Fallback izleme taraması — `probeActiveBrowserTracks` izole dünyada `framesInSubtree` üzerinden **iframe'ler dahil** `video.textTracks` cue'larını okur.
4. Banner — `renderer.js` ~7383: 8 sn içinde iz/cue gelmezse "bulunamadı" mesajı.

## Aday kök nedenler ve durumları

| Aday | Mekanizma | Durum |
|---|---|---|
| A1 · `browserInstrumentationPending` takılması | Her sekme pending başlıyor; CF probe 'unknown' döngüsünde debugger/probe/kanca hiç çalışmaz → tam körlük. Ekran belirtisiyle örtüşen tek neden | **Açık** — `92f8f7f` fail-open reddetti (kanıtsız güvenlik gevşemesi). Gerçek kanıt hâlâ eksik: Ayrıntılar'da "Sayfa durumu: Ölçülmedi" + sıfır ağ izi beklenir |
| A2 · Manifest debugger'dan önce indi | Eski kod yalnız sonraki ağ yanıtlarını görüyordu | **Kapatıldı** — `92f8f7f`: `performance.getEntriesByType('resource')` taraması + aynı oturumla yeniden fetch + kuşak koruması + uzantısız manifest gövde imzası |
| A3 · Video OOPIF/iframe'de | `discovery-signal` `senderFrame!==mainFrame` sinyalleri atıyordu | **Kapatıldı** — `92f8f7f`: `framesInSubtree` doğrulamalı kabul |
| A4 · DASH + bant-içi CEA | `parseDashSubtitleMatchers` yalnız metin AdaptationSet; `cea-608` Accessibility hiç okunmuyor | **Açık** — kanıt bekleniyor; TGC'nin DASH kullandığı doğrulanmadı. Kanıtlanırsa video AdaptationSet'inden CEA planı + `decodeFragmentedMp4` yolu |
| A5 · Manifest CEA bildirmiyor ama segmentlerde var | `browserHlsCeaActive` yalnız bildirimli manifestten kuruluyor | **Açık** — `92f8f7f` "sessiz CEA keşfi"ni maliyet/false-positive nedeniyle eklemedi. Tanı bildirimsiz CEA gösterirse: varyant playlist'ten 1-2 segment indirip `CeaCaptionDecoder` varlık testi |
| A6 · Uzantısız/mime'siz manifest | Sınıflandırıcı kalıpları atlama | **Kısmen kapandı** — `92f8f7f` gövde imzasıyla tür belirliyor; geri kazanım aday listesi hâlâ dar (`master/manifest/playlist` ipucu) |

## Doğrulanan ek gözlem

- **Pending takılmasının görünür geri-beslemesi zayıf** — ~6 dk (240 kontrol × 1,5 sn) sonra uyarı; o ana kadar "yakalama neden kapalı" bilgisi yok. Fail-open reddedildi ama durum görünürlüğü hâlâ iyileştirilebilir.

## Kanıt toplama (kullanıcıdan beklenen — hâlâ geçerli)

1. O sekmede **Ayrıntılar** paneli → tanı metnini kopyala: `counts`, `manifest.kind/bytes/preview`, `acquisition.phase`, son olaylar.
2. **Yakalama açıkken sayfayı yeniden yükle** → 15 sn oynat → `1-CC1` izi geliyor mu? (A2 kapanışının gerçek-site kabulü)
3. Tanı "Sayfa durumu: Ölçülmedi" + sıfır ağ izi gösterirse → A1 kanıtlanır; DASH MPD görülürse → A4.

## Sonraki aday iş (kanıt geldiğinde)

- A1: pending için görünür durum + kullanıcı onaylı "yine de yakala" eylemi (fail-open değil, fail-visible)
- A4: MPD `cea-608` Accessibility → video SegmentTemplate üzerinden CEA planı
- A5: bildirimsiz CEA için sınırlı segment varlık testi
