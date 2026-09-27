# BROWSER_BUG_REPORT_166 — R186 Windows doğrulama turu bulguları

Tarih: 2026-09-28 · Dal: codex/r186-win-i18n-1790560000 · Temel: master `73971ec` (R185 dahil)

Kaynak: Windows doğrulama oturumu `a7e61bd6fa524ef0900f7df95a396880` — Windows Server 2022, 1280×800,
`npm run dev` ile gerçek Electron. 8/8 madde: 7 PASS, 1 FAIL (ekran görüntüsü diyaloğu) + ~20 küçük
i18n kalıntısı. Bu rapor o bulguların düzeltme kanıtıdır.

## Düzeltilen bulgular

### F1 — EN'de ekran görüntüsü kaydetme diyaloğu Türkçe başlık (FAIL)
`saveBrowserPageCapture(tab, title)` gövdesinde `dt()` vardı ama çağrı siteleri sabit TR metin
gönderiyordu → `dt` hiç devreye girmiyor. İki site düzeltildi:
- `browser:capturePage` → `dt('Tarayıcı ekran görüntüsünü kaydet', 'Save browser screenshot')`
- Manga PNG dışa aktar → `dt('Manga katmanını görsel olarak dışa aktar', 'Export manga layer as image')`

### F2 — "Sekme korumalı" modalı EN'de TR kalıyordu
Başlık/açıklama/onay etiketi `openAppDialog`'a ham TR gidiyordu. `interfaceChoice` ile iki dillendirildi;
gerekçe satırları (`Sekme sabitlenmiş.` / `Sekmede devam eden çeviri veya manga işi var.`) sözlüğe eklendi.

### F3 — i18n sözlük boşlukları (~110 yeni giriş)
Windows oturumunda EN modda TR kalan yüzeyler:
- Komut paleti başlıkları/kategorileri (`gezinme`, `yakalama`, `workflow`…) ve disabledReason metinleri.
- Ayarlar: kategori etiketleri (`Gizlilik`, `Oturum`), kategori açıklamaları, arama sonuç sayacı
  (`N ayar bulundu`), `Eşleşen ayar bulunamadı.`, 28 registry girişinin label+description çiftleri.
- Site izinleri: 14 izin etiketi (Kamera/Mikrofon/Konum/…), seçenekler
  (Her seferinde sor/İzin ver/Engelle), yükleme/hata/kayıt mesajları.
- İzleme listesi durumları (`Klasör seçilmedi`, `Seçilmedi`, `Dosya bulunamadı`, `Birinci/İkinci kanal`),
  otomatik-eşitleme ipuçları, bağlantı etiketi sayacı kalıbı (`N bağlantı/form etiketi gösterildi…`).
- Arama sonuçları `Eşleşen ayar bulunamadı.` zaten sözlükteydi; kalan açıklamalar eklendi.

### F4 — `#playerVideoPath` "Seçilmedi" çevrilmiyordu
Düğüm kullanıcı dosya yolu taşıdığı için `ignored` listesinde — observer dokunmuyor (kasıtlı).
Boş durum sabiti `setLocale`'de özel durum olarak elle çevriliyor (cue-list-empty/playerTitle örüntüsü).

### F5 — Komut paleti + ayar sonuçları render-zamanı çevirisi
`renderer-helpers.js`'te palette/settings-search render'ı `window.UiLocale?.t(x) || x` ile sarıldı —
observer'a ek olarak deterministik güvence (mutasyon atlanırsa bile render'da doğru dil).

## Düzeltilmeyen gözlemler (kasıtlı / ertelendi)
- Ctrl+W boş sekmede "Sekme korumalı" onayı: tasarım — sekme koruması flag'i metin üzerinden hesaplanıyor.
- TR log satırları EN modunda TR kalıyor: log'lar tanı amaçlı; tasarım kararı.
- `appMenu` dar pencerede taşma (1000px altı): minör, ayrı turda değerlendirilir.

## Doğrulanmamış sınırlar
Düzeltmeler Node testleriyle kanıtlandı (ui-locale 14/14, palette 6/6, registry, permissions, settings).
Gerçek EN modunda diyalog/palet/izin yüzeyleri Windows'ta görsel el kontrolü önerilir.
