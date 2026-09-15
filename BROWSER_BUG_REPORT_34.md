# BROWSER BUG REPORT 34 — YouTube varsayılan görünüm ve Shorts filtresi

Tarih: 15 Eylül 2026
Başlangıç ürün kodu: `d1dfcf7496ce193b7b350bc5a12d74d71acccdd8`
Bitiş ürün kodu: `4bb6c9fba54f5a8a2d913a7f887379107d7114b5`
Kapsam: Kullanıcının verdiği Mirage CSS/userscript örneklerini tarayıcıdaki YouTube sayfalarına varsayılan uygulama.

## Sonuç

İstenen iki davranış tamamlandı:

1. YouTube sayfaları varsayılan olarak koyu, geniş, yuvarlatılmış kartlı özel görünümle açılır.
2. Shorts rafları, kartları ve gezinme bağlantıları varsayılan olarak gizlenir.

İki davranış tarayıcı ayarlarında ayrı anahtardır ve ikisi de varsayılan açıktır. Kullanıcının verdiği metindeki userscript metadata'sı ve çalıştırma talimatları uygulanmadı; yalnız CSS davranışı özellik girdisi olarak uyarlandı.

## Ayrıntılı bulgu ve düzeltme dökümü

### BULGU-01 — Yeni kalıcı anahtarlar güvenli ayar şemasında eksikti

- Kanıt: İlk tam `npm test` koşusunda `tests/settings-security.test.js`, renderer kalıcılık listesi ile `src/settings-security.js` izin listesinin farklı olduğunu deterministik olarak bildirdi.
- Etki: Bu hâliyle anahtarlar arayüzde çalışsa da güvenli ayar dışa/içe aktarma ve şema eşitliği bozulacaktı.
- Düzeltme: `browserYoutubeAppearance` ve `browserYoutubeHideShorts`, hem renderer kalıcılık listesine hem güvenli ayar şemasına eklendi.
- Doğrulama: Hedefli settings testi 18/18, sonraki tam paket 178/178 geçti.
- Durum: DÜZELTİLDİ.

### ÖZELLİK-01 — Güvenli CSS enjeksiyonu ve yaşam döngüsü

- `src/browser-youtube-style.js`, yalnız `youtube.com` ve gerçek alt alanlarını kabul eder; `youtube.com.evil.example` reddedilir.
- CSS `webContents.insertCSS(..., { cssOrigin: 'user' })` ile uygulanır. Sayfanın ana dünyasına userscript/global temizleme nesnesi bırakılmaz.
- Sekme nesli, istek sırası ve güncel URL yeniden denetlenir. Geç kalan sonuç sayfa değiştiyse kaldırılır.
- Aynı nesil ve aynı ayarda yinelenen çağrı tekrar CSS eklemez.
- YouTube dışına çıkıldığında önceki CSS anahtarı kaldırılır.

### ÖZELLİK-02 — Görünüm

- Koyu YouTube yüzeyi, yarı saydam masthead, grafit menüler, yuvarlatılmış küçük resimler/kartlar, hover geri bildirimi, koyu arama/filtre kontrolleri ve uyarlanabilir 2/3/4/5 sütun ızgarası eklendi.
- YouTube oynatıcısının ilerleme vurgusu beyazlaştırıldı; uygulamanın kendi renderer CSS'i değiştirilmedi.

### ÖZELLİK-03 — Shorts gizleme

- Shorts shelf, reel shelf, grid shelf, zengin kart, arama kartı, kompakt öneri, guide/mini-guide ve mobil pivot seçicileri kapsandı.
- Reklam veya promoted öğeleri hedefleyen seçici eklenmedi.
- Gerçek YouTube arama smoke ölçümü: 90 Shorts bağlantısı bulundu, görünür Shorts sayısı 0.

## Ret gerekçeleri

- Verilen userscript doğrudan çalıştırılmadı: sayfa ana dünyasında global durum bırakması ve iki kez yapıştırılmış Shorts betiğinin yinelenen enjeksiyon üretmesi önlendi.
- Stil ile Shorts filtresi iki ayrı `<style>`/userscript olarak eklenmedi: tek CSS anahtarı yaşam döngüsü ve kapatma işlemini atomik tutuyor.
- Reklam veya sponsor öğeleri Shorts filtresine katılmadı: mevcut Ghostery/SponsorBlock yollarıyla sorumluluk çakışması önlendi.
- `youtube-nocookie.com` kapsama alınmadı: kullanıcının verdiği eşleşme kapsamı `youtube.com` idi; gömülü oynatıcı görünümünü gereksiz yere değiştirmemek için dar alan adı sınırı korundu.

## Doğrulama dökümü

- `node tests/browser-youtube-style.test.js` → 25 test geçti.
- `node tests/browser-settings-tab.test.js` → geçti.
- `node tests/browser-settings-registry.test.js` → geçti.
- `node tests/browser-site-profiles.test.js` → 14 test geçti.
- `node tests/settings-security.test.js` → 18 test geçti.
- `node --check src/main.js` → geçti.
- `node --check src/renderer/renderer.js` → geçti.
- `npm test` → exit 0, `Tüm testler geçti`; backend ana paketi 178/178.
- `npm run test:electron-bridge` → exit 0.
- Gerçek YouTube, ayrı geçici Electron profili:
  - Ana sayfa: başlık `YouTube`, masthead `rgba(15, 15, 15, 0.96)`, zemin `rgb(15, 15, 15)`.
  - `results?search_query=shorts`: 90 Shorts bağlantısı, 0 görünür.
- `git diff --check` → temiz.

## Sınırlar

- Gerçek YouTube testi oturumsuz ve ayrı test profiliyle yapıldı; kullanıcının açık sekmeleri/çerezleri değiştirilmedi.
- YouTube DOM adları zamanla değişebilir. Regresyon testi seçici ve yaşam döngüsü sözleşmesini korur; gerçek site değişikliği olursa yeni DOM örneğiyle seçiciler güncellenmelidir.
- Smoke ekran görüntüsü `scratch/` altında yerel kanıttır ve Git'e eklenmemiştir.