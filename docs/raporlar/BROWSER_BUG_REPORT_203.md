# BROWSER BUG REPORT 203 — R246: Windows doğrulama bulguları (NTP imleç-ölümü + PDF 403)

Tarih: 2026-09-29 · Dal: `fix/r246-ntp-pdf` · Taban: master `f341577`
Kapsam: R236 Windows doğrulama oturumunun (devin-3c20a46559b44bca9180f0e9eb3699c8) elle doğruladığı iki hata.

## Bulgu 1 — Yeni-sekme sayfasında imleç ölü (tıklama/hover yok, klavye var)

**Belirti (Windows, doğrulanmış):** Boş sekmeye dönünce `#browserEmpty` NTP yüzeyi
görünür fakat hiçbir öğesi tıklanamaz ve hover almaz; klavye kısayolları ve
adres çubuğu çalışır.

**Kök neden:** `view.setVisible(false)` çağrılan bir WebContentsView, sınırını
(`setBounds`) slot üzerinde tutmaya devam ediyordu. Windows'ta gizli native
yüzeyin HWND'i sınır bölgesindeki işaretçi olaylarını yutabiliyor; NTP DOM'unu
örtüyor ama boyamıyor — görünür yüzey tıklanamaz hale geliyor. Klavye
renderer webContents'te kaldığı için etkilenmiyor. `applyBrowserViewsLayout`
ve dokuz ayrı nokta `setVisible(false)` diyordu ama sınırları hiç değiştirmiyordu.

**Düzeltme (src/main.js):**
- `hideBrowserViewOffscreen(view)`: `setVisible(false)` + sınırı
  `{x:-10000, y:-10000, w, h}` ekran dışına taşır (boyut korunur — sayfa
  reflow yapmaz).
- `setBrowserViewShown(tab, view, shown)`: gösterirken `applyBrowserViewBounds`
  ile sınırı yeniden uygular, sonra `setVisible(true)`; gizlerken
  `hideBrowserViewOffscreen`.
- Tüm gizleme noktaları güncellendi: `applyBrowserViewsLayout` (aktif/ikincil/
  arka plan/tam-ekran), HTTP boş-yanıt (`did-fail-load` ağırlık ölçümü),
  `openBrowserLinkInNewTab` görünürlük noktası, sekme değişimi
  (`previous.view`), `hideBrowserView` (tüm sekmeler), sertifika hatası,
  `browser:navigate` ve `browser:readlist` açılış yolları.
- `ensureBrowserView`'deki `setVisible(false)` ve kaldırma-öncesi gizleme
  bilinçli bırakıldı (henüz eklenmemiş/kaldırılacak görünüm, sıfır sınır).

## Bulgu 2 — PDF okuyucu açılmıyor: `whisper-pdf:` 403

**Belirti (Windows, doğrulanmış):** `pdf:open` sonrası okuyucu
"PDF okunamadı: PDF verisi alınamadı (HTTP 403)" toast'u veriyor, belge yüklenmiyor.

**Kök neden:** `installPdfDocumentProtocol` içindeki köken kapısı
`if (origin !== 'null' && !referrer.startsWith('file://'))` idi. GET fetch'leri
Origin başlığı göndermez → `headers.get('origin')` `null` döner ve
`null !== 'null'` true'dur; özel şemaya (`whisper-pdf:`) giden istekte referrer
da boş gelir → iki koşul birlikte kendi `file://` renderer'ımızın fetch'ini
dış bağlam sayıp 403 döndürüyordu.

**Düzeltme (src/main.js):** Kapı iki ayrı izne bölündü:
`originAllowed = origin == null || origin === 'null' || origin.startsWith('file://')`
ve `referrerAllowed = referrer === '' || referrer.startsWith('file://')`.
Başlık yokluğu 'null'/boş kabul edilir; http(s) kökeni veya dosya-dışı
referrer yine reddedilir. Yetenek anahtarı (64-hex resourceId) ve
`pdfFileAccess` doğrulaması korundu — saldırı yüzeyi genişlemedi:
dış http sayfası Origin'ini taşır ve reddedilir.

## Regresyon kilidi (yeni testler)

- `tests/whisper-pdf-protocol.test.js` (7 test): boş Origin/referrer → 404
  (kapıyı geçer), `Origin: null` → 404, `file://` referrer → 404, http kökeni
  → 403, http referrer → 403, POST/yanlış host → 405, izinli belge → 200 +
  `application/pdf`.
- `tests/browser-view-visibility.test.js` (4 test): gizlenen görünüm
  `-10000` dışında ve boyut korunur; gösterilen görünümde sınır yeniden
  uygulanır; yerleşim senaryosu (boş sekme: tüm görünümler ekran dışı —
  sayfalı sekme: aktif yuvada, arka plan dışarıda); bozulmuş webContents
  dokunulmaz.

**Kırmızı kanıtı (master `f341577`):** aynı iki dosya kopyalanıp koşuldu —
7/11 test düştü: file:// fetch 403 (HTTP 404 bekleniyordu), tüm görünürlük
testleri `bounds.x === -10000` beklerken slot sınırında kaldı.
**Dalda:** 11/11 PASS. Hedefli set toplam 17 test dosya-adımı PASS.

**Uyarlanan stub'lar:** `adversarial-ipc`, `browser-navigation-abort`,
`browser-controls-behavior` — dilimlenmiş handler'lar artık `setBrowserViewShown`
çağırıyor; stub `v.setVisible(shown)` davranışını koruyor.

## Windows etkisi

Her iki düzeltme Windows'a özgü doğrulanmış kusurları giderir: NTP tıklaması
ve PDF okuyucu Windows kullanıcısı için çalışır durumda olmalı. `hideBrowserViewOffscreen`
Linux/macOS'ta da zararsız (sınır değişimi davranışı aynı).

## Çalıştırılmayan kontroller

- Gerçek Windows masaüstünde elle doğrulama (NTP tıklama + PDF açma) — ürün
  testleri koşulmadı; düzeltme vm-dilimli kaynak testleriyle kilitlendi.
- Electron smoke koşusu bu turda çalıştırılmadı.

## Açık işler

- `whisper-pdf` kapısı dış sayfalar için kapalı kalır; okuyucu yolu
  `pdf:open` → `opened.fileUrl` fetch ile doğrulandı (renderer.js:21188).
- Gizli görünüm sınır-politikası Electron sürüm notlarında izlenebilir;
  `setVisible(false)`'ın Windows HWND davranışı belgelenmemiş bir quirks'tür.
