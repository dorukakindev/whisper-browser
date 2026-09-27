# BROWSER_BUG_REPORT_159 — R179 DeArrow + Return YouTube Dislike mini istemcileri

Tarih: 2026-09-27 · Dal: `codex/r179-video-extras` · Kod commit: `3d446f6` (üzerinde master `fe051eb`)

## Kapsam

R126 raporundaki ertelenmiş öneri kataloğunun son Etap-1 "hızlı kazanım" maddesi:
açık YouTube videosu için iki topluluk verisi — DeArrow topluluk başlıkları ve
RYD beğenmeme sayıları. İkisi de yalnız opt-in ayarla çalışır; kart başına istek
yapılmaz (RYD kota saygısı).

## Uygulanan

### Backend (main process)

- `fetchDeArrowBranding(videoId)` — `sponsor.ajay.app/api/branding/<sha256öneki-4>`
  (SponsorBlock ile aynı karma-öneki gizlilik modeli; ham video kimliği sunucuya
  gitmez). 7 sn zaman aşımı, `redirect:'error'`, 256 KB boyut sınırı, LRU+TTL
  önbellek (96 kayıt), in-flight dedupe (`dearrow|<id>`).
- `fetchYouTubeDislikes(videoId)` — `returnyoutubedislikeapi.com/votes?videoId=`.
  Aynı ağ duruşu; `rydCache` 1 saat TTL / 10 dk negatif TTL.
- `browser:videoExtras:get` IPC handler — `authorizedBrowserSender` kapısı,
  video-id doğrulaması (url / `youtube:<id>` / ham 11 karakter), bayraklı
  `Promise.allSettled` toplama; iki kaynak bağımsız düşer.
- `browser-sponsorblock.js` saf yardımcılar: `extractDeArrowBranding`,
  `pickDeArrowTitle` (kilitli önce, sonra max oy, boş/orijinal atılır),
  `pickDeArrowThumbnail` (geçerli timestamp ≥0, orijinal değil),
  `sanitizeDeArrowTitle` (kontrol karakter ayıklama + 200 karakter sınırı),
  `normalizeRydVotes` (id eşleşmesi + negatif/NaN reddi + 1e12 kelepçe).

### Renderer

- Ayarlar → Tarayıcı → SponsorBlock bölümünde iki kalıcı anahtar:
  `browserDeArrowEnabled`, `browserRydDislikes` (settings-security şeması +
  browser-settings-registry kaydıyla).
- `player.videoExtras` durum alanı; `maybeFetchPlayerVideoExtras()` iki
  açma yolunda (`openMediaInPlayer` yerel akış ve `setPlayerHls` YouTube
  akışı) video-id çıkarıp istek yapar. Staleness çift kapısı: gelen yanıtın
  videoId'si hem gönderilenle hem hâlâ-açık medyayla eşleşmeli.
- Seçilen topluluk başlığı `playerTitle`'a uygulanır (orijinal `ytInfo`'da
  korunur); beğenmeme `updatePlayerMeta()` parçası olarak `👎 N` rozeti.
- `setMediaKey` medya değişiminde stale extras temizler.

### Bulgular (düzeltilen)

Kod incelemesinde düzeltilen tasarım/işlem kusurları:

1. **DeArrow videoID süzme** — `/api/branding/<prefix>` yanıtı aynı hash
   önekini paylaşan ~N kayıt döndürür; yanlış videonun başlığını uygulamayı
   engellemek için `videoID` alanıyla süzülür.
2. **Sanitizer bayt hatası** — `[\u0000-\u001f\u007f]` aralığı bayt-düzeyinde
   kaçış olarak yazıldığında sınıfın bozulması; düzeltildi ve testle mühürlendi.
3. **RYD `id` doğrulama** — yanıtta `id` video'dan farklıysa reddedilir
   (sahte yük); eski sürümlerde `id` eksikse sayılar yine kabul.
4. **Sıralama/kalıcılık şema uyumu** — `settings-security` kalıcılık listesi
   renderer `PERSIST_CHECKBOX_CONTROLS` ile bire bir eşleşir; iki yeni anahtar
   iki tarafta da kayıtlı.

## Doğrulama

- `tests/browser-video-extras.test.js` — 10 kontrol (parse/seçim/sanitizasyon/
  RYD doğrulama + vm-harness handler: bayrak gating, yetkisiz gönderici,
  desteklenmeyen adres reddi). Yeşil.
- `npm test` — tüm paket yeşil (tek düşüş: settings-security kalıcılık liste
  sırası, R179 içinde düzeltildi).
- `node --check` — değişen 8 dosya temiz.

## Windows etkisi

Yok — ağ/önbellek mantığı platformdan bağımsız; ayar UI'ı standart checkbox.
`start.bat` akışı etkilenmez.

## Doğrulanmamış sınırlar

- Gerçek DeArrow/RYD uçlarına canlı istek (testler stub'lı; API sözleşmesi
  dokümantasyon tabanlı).
- DeArrow küçük resim (`thumbnail.timestamp`) yalnız döndürülüyor, oynatıcı
  posterine uygulama yok (gelecek iş).

## Sonraki adımlar

- Windows'ta el kontrolü: gerçek YouTube videosunda ayarlar açıkken başlık
  değişimi ve `👎` rozeti görünür mü.
- Etap-1 kataloğu tamamen kapandı; Etap-2 (youtubei.js, subliminal vb.)
  ayrı turda.
