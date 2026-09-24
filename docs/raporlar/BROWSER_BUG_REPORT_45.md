# BROWSER BUG REPORT 45 — Sayfa değişiminde kalan çeviri hata bildirimi

Tarih: 2026-09-16

Durum: **DOĞRULANDI ve DÜZELTİLDİ**

Önem: P2 — eski sayfanın çeviri hatası yeni sayfanın altyazı durumunu yanlış gösteriyor

## Kullanıcı belirtisi

Tarayıcı altyazı şeridindeki `Çeviri başlatılamadı: ... HTTP 503 ...` bildirimi sayfa veya video değiştikten sonra da görünmeye devam ediyordu. Bildirimi elle kapatacak bir eylem de yoktu.

## Doğrulanan kök neden

Çeviri başlangıç/sağlayıcı hatası `player.browserTranslationLastError` alanında saklanıyordu. Ancak iki yaşam döngüsü eksikti:

1. Gerçek sayfa/video değişiminde çalışan `clearBrowserTracks()` altyazı izlerini ve başarısız blok sayısını temizliyor, `browserTranslationLastError` değerini temizlemiyordu.
2. Sekme değişiminde `restoreActiveBrowserTabWorkspace()` sekmeye ait son çeviri hatasını geri yüklemiyor veya boşaltmıyordu. Global player durumu önceki etkin sekmenin hata metnini taşıyabiliyordu.

Bu nedenle hata artık geçerli olmadığı halde yeni sayfanın sağlık kartında kalıyordu. Hata kartının yalnız ayarlar/yeniden dene eylemi vardı; kullanıcı bildirimi kapatamıyordu.

## Düzeltme

1. Çeviri hata metni artık her tarayıcı sekmesinin kendi çalışma alanında saklanıyor ve sekme değişiminde o sekmeden geri yükleniyor.
2. Gerçek medya/sayfa değişimindeki `clearBrowserTracks()` hem global hem sekmeye ait eski çeviri hata metnini temizliyor.
3. Yeni bir canlı web çevirisi başlatılırken önceki hata hem global hem sekme düzeyinde temizleniyor.
4. Asenkron çeviri sonucu hata döndürürse metin etkin sekmeye yazılıyor ve sağlık kartı hemen yeniden çiziliyor.
5. Çeviri hata kartına **Temizle** düğmesi eklendi. Düğme yalnız tekil hata metnini kaldırır ve `Çeviri hata bildirimi temizlendi.` geri bildirimini gösterir.
6. Dar ekranlarda birincil eylem ile **Temizle** düğmesi taşmadan sarılır.

## Ret ve kapsam gerekçesi

- **Temizle**, sağlayıcının HTTP 503/kota/yapılandırma sorununu çözmez; yalnız eski bildirimi kapatır. Aynı hata yeniden oluşursa gerçek hata tekrar gösterilir.
- Başarısız çeviri bloklarının sayacı kullanıcı tarafından gizlenebilir yapılmadı. Bu durum yeniden denenecek gerçek iş verisini temsil eder ve **Hataları yeniden dene** eylemi görünür kalmalıdır.
- Aynı videodaki yalnız sorgu/hash değişikliklerinde altyazı çalışma alanı mevcut tasarım gereği korunur. Otomatik temizlik gerçek medya/sayfa değişimi yoluna bağlandı; böylece aynı ders içindeki geçerli altyazı ve çeviri gereksiz yere silinmez.
- Kullanıcı ayarları, API anahtarları ve canlı sağlayıcı hesabı okunmadı; ücretli API çağrısı yapılmadı.

## Doğrulama dökümü

- `node tests/browser-subtitle-health.test.js` — **GEÇTİ**
  - çeviri hata durumunun kapatılabilir olduğu,
  - başarısız blok sayacının kapatılamadığı,
  - global ve sekme hata durumunun birlikte temizlendiği,
  - sayfa/video temizliğinin eski hatayı kaldırdığı,
  - sekme geri yüklemesinin sekmeye ait hata değerini kullandığı doğrulandı.
- Hedefli renderer regresyonları — **GEÇTİ**
  - `browser-subtitle-actions`, `browser-background-navigation`, `player-ui` (143/143) ve `browser-subtitle-session`.
- `electron tests/electron-browser-cea-full-ui.smoke.js --disable-gpu` — **GEÇTİ**
  - gerçek renderer'da hata halinde **Temizle** görünür,
  - tıklama sonrası hata alanı boşalır,
  - kart `translation-error` durumundan çıkar ve tekrar `Çevir ve göster` durumuna döner,
  - dar görünümde yatay taşma oluşmaz.
- `npm test` — **GEÇTİ**; son satır `Tüm testler geçti`, Python backend ana paketi 180/180.
- `npm run test:electron-bridge` — **GEÇTİ**.
- `node --check src/main.js`, `src/preload.js`, `src/renderer/renderer.js` — **GEÇTİ**.
- `backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py` — **GEÇTİ**.

## Kabul sonucu

Eski bir çeviri hatası artık yeni sayfa/video durumuna taşınmaz. Kullanıcı aynı sayfada kalmak isterse hata kartındaki **Temizle** düğmesiyle bildirimi kapatabilir; gerçek sorun sürüyorsa sonraki çeviri denemesi yeni hata metnini yeniden görünür kılar.
