# BROWSER BUG REPORT 43 — Tam yakalama sonrası çeviri eylemi çalışmıyor

Tarih: 2026-09-16

Durum: **DOĞRULANDI ve DÜZELTİLDİ**

Önem: P1 — ana kullanıcı akışı tamamlanamıyor

## Kullanıcı belirtisi

The Great Courses sayfasındaki gömülü `1-CC1` CEA altyazısı eksiksiz yakalanıp 560 satır olarak `GİRDİ` klasörüne kaydedildi. Buna rağmen üst şeritteki **İzi seç ve çevir** düğmesine basıldığında görünür bir işlem başlamadı; çeviri videoda gösterilmedi.

## Doğrulanan kök neden

`src/renderer/renderer.js` içindeki sağlık düğmesi `select` eyleminde yalnızca `browserTrackActions` alanının `hidden` sınıfını kaldırıyor ve `browserTrackSelect` öğesine odaklanıyordu. Bu yol:

- tamamlanmış CEA kaydını seçmiyor,
- `useBrowserTrack(true, trackId)` çağrısını yapmıyor,
- çeviri kuyruğunu başlatmıyor,
- dar/yerel video yüzeyi düzeninde görünmeyen seçim alanına odaklandığı için kullanıcıya hiçbir geri bildirim vermiyordu.

Dolayısıyla sorun sağlayıcı, API anahtarı veya yakalama verisi değil; düğmenin çeviri komutuna bağlı olmamasıydı.

## Düzeltme

1. Tamamlanmış CEA kaydı varsa onu önizleme/yarım izlerden önce seçen `preferredBrowserSourceTrack()` eklendi.
2. Sağlık kartına `translation-ready` durumu ve görünür **Çevir ve göster** eylemi eklendi.
3. Düğme `translateBrowserSubtitleFromHealth()` üzerinden doğrudan `useBrowserTrack(true, track.id)` hattına bağlandı.
4. Bu hat mevcut davranışı koruyarak:
   - kaynak SRT'yi yükler,
   - bağlamlı tam-iz çevirisini kuyruğa alır,
   - hazır blokları ikinci altyazı kanalına işler,
   - profil tercihi yoksa `both` görünümünü açarak çeviriyi videoda gösterir.
5. Kaynak iz bulunamazsa sessizce başarısız olmak yerine seçim alanı açılır ve Türkçe hata bildirimi gösterilir.

## Ret ve kapsam gerekçesi

- Yeni bir çeviri motoru veya ikinci bir kuyruk yazılmadı; mevcut `startBrowserLiveTranslation` hattı yeniden kullanıldı. Böylece bağlam, sağlayıcı ayarı, tekrar deneme, kaydetme ve video üstü gösterim sözleşmeleri ayrışmadı.
- Tamamlanmamış CEA kaydında doğrudan çeviri açılmadı; önce tam yakalama yapan mevcut güvenli akış korunuyor.
- Hedef dilde hazır bir site izi varsa gereksiz yeniden çeviri önerilmiyor.
- Gerçek ücretli sağlayıcı çağrısı yapılmadı; kontrollü test yalnız komut bağlama, iz seçimi ve Electron görünürlüğünü doğruladı.

## Doğrulama dökümü

- `node tests/browser-subtitle-health-translate.test.js` — **GEÇTİ**
  - tamamlanmış CEA kaydının önizleme izinden önce seçildiği,
  - `useBrowserTrack(true, 'complete')` çağrısı,
  - iz yoksa görünür geri dönüş yolu doğrulandı.
- `node tests/browser-subtitle-health.test.js` — **GEÇTİ**
  - 560 satırlık tamamlanmış kayıtta `translation-ready / translate`,
  - düğme etiketi `Çevir ve göster`,
  - mevcut sağlık durumlarının regresyonsuz kalması doğrulandı.
- `electron tests/electron-browser-cea-full-ui.smoke.js --disable-gpu` — **GEÇTİ**
  - gerçek renderer içinde düğme görünür,
  - durum `translation-ready`, eylem `translate`,
  - tercih edilen iz `cea-complete`,
  - metin `560 satırlık kaynak altyazı hazır...` olarak doğrulandı.
- Görsel kanıt: `.uiprev/browser-cea-full-ui-smoke/cea-translation-ready.png` (yerel test çıktısı; Git'e alınmaz).

- `npm test` — **GEÇTİ**; tüm Node testleri ve Python backend testleri (180/180 ana backend testi dahil) yeşil.
- `npm run test:electron-bridge` — **GEÇTİ**; güvenilir köprü, TextTrack/EME ve gerçek medya yaşam döngüsü doğrulandı.
- `node --check src/main.js`, `src/preload.js`, `src/renderer/renderer.js` — **GEÇTİ**.
