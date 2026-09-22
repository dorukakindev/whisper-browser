# BROWSER BUG REPORT 44 — Tam altyazının yeniden yakalanması ve görünmeyen çeviri başlangıç hatası

Tarih: 2026-09-16

Durum: **DOĞRULANDI ve DÜZELTİLDİ**

Önem: P1 — çeviri ana akışı sessizce başlamıyor · P2 — tamamlanmış CEA yakalaması gereksiz yere yeniden çalışıyor

## Kullanıcı belirtisi

The Great Courses sayfasındaki gömülü `1-CC1` CEA altyazısı `593 altyazı satırı eksiksiz yakalandı ve GİRDİ klasörüne kaydedildi` mesajıyla tamamlandı. **Çevir ve göster** eylemine basılmasına rağmen çeviri başlamadı veya videoda görünmedi. Yaklaşık beş dakika sonra aynı 593 satır ikinci kez yakalanıp kaydedildi; çevirinin neden başlamadığı kalıcı biçimde açıklanmadı.

## Kaynak altyazı doğrulaması

Kullanıcının verdiği `Classical Mythology The Great Courses Plus.9fe540d5.en.CC1.srt` dosyası salt okunur incelendi:

- dosya boyutu: 51.818 bayt,
- zaman satırı/blok sayısı: 593 / 593,
- ilk cue başlangıcı: `00:00:08,775`,
- son cue: 593, bitiş `00:31:01,793`, metin `goddesses.`

Sonuç: sorun eksik veya bozuk SRT değildir; kaynak yakalama çıktısı tutarlıdır.

## Doğrulanan kök nedenler

### BUG-44-01 — Tamlık metadata terfisi cue parmak izi tekilleştirmesine takılıyordu

`storeBrowserTrack()` / `publishBrowserTrackNow()` aynı cue parmak izini daha önce gördüğünde yayını tamamen eliyordu. Tam yakalama sürerken 593 cue `captureComplete: false` metadata ile yayımlanmışsa, yakalama bitimindeki aynı 593 cue bu kez `captureComplete: true` ve nihai `inputPath` ile gelse bile metin parmak izi değişmediği için son yayın düşüyordu.

CEA yakalama işi tamamlanmış görünürken renderer'daki iz metadata'sı hâlâ “tamamlanmamış” kalıyor; kullanıcı çeviri eylemine bastığında mevcut tam izi kullanmak yerine tam yakalama yeniden başlıyordu. Günlükteki iki aynı 593-satır mesajı bu erişilebilir olay yoluyla açıklanır.

### BUG-44-02 — Sağlayıcı yapılandırma hatası geç ve geçici yüzeye çıkıyordu

`startBrowserTranslation()` çeviri zamanlayıcısını oluştururken endpoint/API anahtarı yapılandırmasını önceden doğrulamıyordu. Eksik sağlayıcı anahtarı ancak ilk cümle isteği sırasında asenkron olarak bulunabiliyor; başlangıç isteği ise başarılı kabul edilebiliyordu. Renderer başlangıç reddini kalıcı sağlık durumuna veya hata günlüğüne taşımıyordu.

Bu yüzden anahtar/endpoint problemi varsa kullanıcı eyleminin neden sonuç vermediği görünür ve kalıcı biçimde açıklanmıyordu. Kullanıcının etkin anahtar değerleri okunmadı; mevcut sağlayıcıda gerçekten anahtar bulunup bulunmadığı bu raporda iddia edilmez. Düzeltme sonrası uygulama gerçek nedeni doğrudan gösterecektir.

## Düzeltme

1. Aynı cue parmak izinde `captureComplete: false → true` veya nihai `inputPath` terfisi artık yeni metadata yayını sayılıyor.
2. Bekleyen büyüyen-yayın ile final yayın aynı parmak izindeyse bekleyen zamanlayıcı iptal edilip final yayın hemen uygulanıyor.
3. Yayın kaydı `captureComplete`, `captureTotal` ve `inputPath` alanlarını saklıyor; tamamlanmış tam iz yeniden yakalama yerine doğrudan çeviri yoluna giriyor.
4. Canlı web çevirisi başlamadan önce endpoint güvenliği ve seçili sağlayıcının API anahtarı doğrulanıyor. Hata varsa zamanlayıcı kurulmadan `BROWSER_TRANSLATION_CONFIG` ile reddediliyor.
5. Renderer başlangıç reddini:
   - hata günlüğüne,
   - 15 saniyelik yüksek öncelikli bildirime,
   - kaybolmayan `translation-error` sağlık durumuna yazıyor.
6. Anahtar/endpoint hatasında eylem **Çeviri ayarlarını aç**; diğer sağlayıcı/ağ hatalarında **Yeniden dene** oluyor.
7. Kullanıcı çeviri sağlayıcısını, anahtarını veya özel endpoint'i kaydedince eski yapılandırma hatası temizleniyor ve çeviri eylemi yeniden sunuluyor.

## Ret ve kapsam gerekçesi

- Gerçek API anahtarı, token veya kullanıcı ayar dosyası okunmadı ve rapora yazılmadı.
- Ücretli/canlı sağlayıcı çağrısı yapılmadı. Bu nedenle belirli bir sağlayıcı hesabının yetkili ve kotasının açık olduğu iddia edilmiyor.
- Kaynak SRT yeniden yazılmadı; düzeltme yalnız tamlık metadata yaşam döngüsü ile çeviri başlangıç/hata görünürlüğündedir.
- Yerel OpenAI-uyumlu endpoint'lerin anahtarsız kullanımı korunurken uzak endpoint'lerde HTTPS ve API anahtarı şartı korunmuştur.

## Doğrulama dökümü

- `node tests/browser-cea-full-capture.test.js` — **GEÇTİ**
  - aynı cue parmak izinde eksik→tam metadata terfisi,
  - tamamlanmış aynı yayının üçüncü kez yayımlanmaması doğrulandı.
- `node tests/browser-translation-preflight.test.js` — **GEÇTİ**
  - uzak endpoint + boş anahtar anında reddediliyor,
  - anahtarlı uzak endpoint ve anahtarsız localhost kabul ediliyor,
  - güvensiz uzak HTTP reddediliyor,
  - hata tanı durumuna yazılıyor.
- `node tests/browser-subtitle-actions.test.js` — **GEÇTİ**
  - başlangıç reddi player/sekme durumunda saklanıyor,
  - hata günlüğü, 15 saniyelik bildirim ve sağlık kartı yenilemesi doğrulandı.
- `node tests/browser-subtitle-health.test.js` — **GEÇTİ**
  - API/endpoint hatası ayarlar eylemine,
  - ağ/sağlayıcı hatası yeniden deneme eylemine bağlandı,
  - ayar kaydı sonrası yalnız yapılandırma hatasının temizlenmesi doğrulandı.
- `electron tests/electron-browser-cea-full-ui.smoke.js --disable-gpu` — **GEÇTİ**
  - gerçek renderer'da `translation-ready / Çevir ve göster`,
  - hata halinde `translation-error / Çeviri ayarlarını aç`,
  - tam hata metninin görünürlüğü doğrulandı.
- `npm test` — **GEÇTİ**; tüm Node ve Python testleri (180/180 ana backend testi dahil) yeşil.
- `npm run test:electron-bridge` — **GEÇTİ**.
- `node --check src/main.js`, `src/renderer/renderer.js`, `tests/electron-browser-cea-full-ui.smoke.js` — **GEÇTİ**.

## Gerçek site kabul sınırı

Uygulama tamamen kapatılıp yeni kodla açıldıktan sonra aynı ders için tamamlanmış iz üzerinde **Çevir ve göster** seçilmelidir. Beklenen sonuç:

- tam yakalama ikinci kez başlamaz,
- yapılandırma geçerliyse çeviri kuyruğu başlar ve çeviri videoda görünür,
- yapılandırma geçersizse kesin neden üst sağlık kartında ve günlükte görünür; API anahtarı/endpoint probleminde **Çeviri ayarlarını aç** düğmesi çıkar.

Bu son gerçek-sağlayıcı kabulü kullanıcı ortamında yapılmalıdır.
