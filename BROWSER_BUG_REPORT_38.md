# Tarayıcı açıklar kapanış doğrulaması — Rapor 38

**Tarih:** 2026-09-16

**Depo/dal:** `dorukakindev/whisper-browser` / `master`

**Başlangıç ürün commit'i:** `073ac36b02572eef4b60a1068d10d7c9e6895c94`

**Kapsam:** B60, B64, B100 alt maddesi, `paths:scanMedia` ve önceki devir notundaki “denetlenmeyen beş bölge” iddiasının güncel kaynakta doğrulanması.

## Sonuç özeti

- **2 benzersiz kusur doğrulandı ve düzeltildi.**
  - BUG-38-01 · P3: bırakılan medya yollarının ana süreçte kullanıcı onayı/provenans sınırı olmadan toplu taranabilmesi.
  - BUG-38-02 · P4: katalog içe aktarma önizlemesinin başka yetkili pencere tarafından iptal edilip sahibinin token'ının düşürülebilmesi.
- **B64 kapatıldı:** üç ayrı önizleme/token ailesinde yanlış gönderici, yanlış token/tür, TTL ve tek kullanımlılık davranışları çalıştırılan testlerle kapsandı.
- **B60'ın kalan kısmı bug olarak kabul edilmedi:** somut alt kusurlar önceki turda kapalı; bütün asenkron üreticileri yeni bir immutable-context protokolüne taşımak, yeni deterministik yeniden üretim olmadan mimari göç önerisidir.
- **B100 spec alt maddesi bug olarak kabul edilmedi:** kuyruksuz transkripsiyonun renderer reload sonrasında yeniden bağlanması önceki raporda da yeni kurtarma özelliği olarak ayrılmıştır.
- “Beş bölge denetlenmedi” cümlesi mutlak hâliyle doğru değildir. Rapor 31 ayar/session IPC, kuyruk ve oynatıcı yollarında somut kaynak ve davranış kanıtları içerir. Buna karşılık `transcribe.py`, tüm capture dalları ve bütün Node yardımcılarının eksiksiz satır-satır denetlendiği de bu turda iddia edilmemektedir.

## BUG-38-01 · P3 — Bırakılan medya taraması ana süreçte açık onaya bağlı değildi

### Bulgu

`paths:scanMedia` yalnız yetkili ana renderer göndericisini kontrol ediyor, ardından renderer'dan gelen mutlak yolları doğrudan `scanMediaFromPaths` işlevine veriyordu. Normal preload yüzeyi `File` nesnelerini `webUtils.getPathForFile` ile çözdüğü için sıradan UI akışı daraltılmıştı; ancak ana süreç renderer beyanını bağımsız olarak kanıtlamıyordu. Önceki B80 ham IPC sızıntısı kapalı olduğundan bunu güncel üründe doğrudan disk okuma exploiti diye sunmak doğru değildir. Yine de renderer ele geçirilmesi veya ileride köprünün yanlış genişletilmesi durumunda geniş klasörlerin kullanıcıya ikinci bir güven sınırı göstermeden taranması mümkün kalıyordu.

### Düzeltme

- `src/main.js:13344` — `inspectMediaScanRoots` yalnız 1–1000 öğelik listeyi, kanonik mevcut klasörleri veya desteklenen medya dosyalarını kabul ediyor.
- `src/main.js:13357` — `authorizeMediaScanRoots` native Türkçe onay diyaloğu gösteriyor; güvenli varsayılan **İptal**.
- Kullanıcı diyaloğu açıkken junction/symlink hedefi değişmiş olabileceği için yollar onaydan sonra yeniden çözülüyor; önceki ve sonraki kanonik kökler birebir eşleşmezse tarama yapılmıyor.
- `src/main.js:13403` — handler yalnız onaylanan kökleri tarıyor; iptal veya doğrulama hatası boş sonuç döndürüyor.

### Doğrulama

- `tests/adversarial-ipc.test.js`: native onay yokken tarayıcının hiç çağrılmadığını, onaydan sonra yalnız verilen köklerin tarandığını davranışsal olarak sınar.
- `tests/audit-report-regressions.test.js`: üretim handler'ının gerçekten `authorizeMediaScanRoots` kapısına bağlı olduğunu statik olarak doğrular.
- Tam `npm test` paketi ve Electron güvenilir köprü smoke testi geçti.

### Sınır

Native diyaloğun gerçek Windows görseli bu turda ekran görüntüsüyle manuel doğrulanmadı. İşlev ve güvenli varsayılan test/metin düzeyinde doğrulandı.

## BUG-38-02 · P4 — Başka pencere katalog önizlemesini iptal edebiliyordu

### Bulgu

`src/media-catalog-service.js` içindeki `import-apply` token sahibini denetlerken `import-cancel` yalnız token değerine bakıp kaydı koşulsuz siliyordu. Aynı servise yetkili başka bir pencere token'ı öğrenirse sahibinin bekleyen içe aktarma önizlemesini iptal edebilirdi. Bu veri yazma veya dosya okuma yetkisi vermiyor; önizleme yaşam döngüsünde pencere-arası hizmet engelleme/tutarsızlık oluşturuyordu.

### Düzeltme

`import-cancel`, token kaydındaki `sender` kimliğini olay göndericisiyle eşleştirmeden önizlemeyi artık silmiyor. Bilgi sızıntısını önlemek için yabancı iptal isteği yine genel `{ ok: true }` yanıtı veriyor.

### Doğrulama

`tests/media-catalog-service.test.js`, başka sender'ın iptal isteğinden sonra gerçek sahibin aynı token'ı başarıyla uygulayabildiğini doğruluyor. Aynı test yanlış sender apply, yanlış token, tüketilmiş token ve süresi dolmuş token yollarını da çalıştırıyor.

## B64 · Önizleme/token matrisi — KAPATILDI

| Sistem | Yanlış sender | Yanlış token/tür | Tekrar kullanım | TTL |
| --- | --- | --- | --- | --- |
| Medya katalog içe aktarma | Davranış testi | Davranış testi | Davranış testi | Davranış testi |
| Çalışma alanı/paket önizleme | Davranış testi | Paket token'ıyla `folder-apply` reddi | Davranış testi | Davranış testi |
| Altyazı kodlama önizlemesi | Sekme bağlı üretim sözleşmesi mevcut | Davranış testi | Davranış testi | Davranış testi |

Ek olarak katalog `import-cancel` yolu da sender sahipliğine bağlandı. Önceki rapordaki “üç altyapıda TTL/tek-kullanım matrisi yok” sınırı artık geçerli değildir.

## B60 · Ret gerekçesi

Rapor 30'da B60'ın somut parçaları kapatılmıştı: unload sırasında scheduler/manga/sayfa işlerinin iptali, çeviri alanlarının sıfırlanması, kaynak hash'inin yazılması ve uzun track kimliğinin normalize edilmesi. Kalan “121 asenkron üreticinin tamamını immutable event-context protokolüne taşı” ifadesi:

1. ulaşılabilir olay yolu ve deterministik yeniden üretim vermiyor;
2. mevcut scheduler/generation/media kimliği ve bayat sonuç kapılarını yanlışlayan bir test sunmuyor;
3. geniş, çok modüllü protokol göçü istiyor.

Bu nedenle bug diye uygulanmadı. Yeni bir bayat olay örneği bulunursa ilgili üreticiye dar düzeltme ve yarış testi eklenmelidir; kanıtsız toplu göç bu raporun kapanış koşulu değildir.

## B100 spec alt maddesi · Ret gerekçesi

Kuyruksuz tek transkripsiyon işinin renderer reload sonrasında yeniden bağlanması mevcut davranışın yanlış çalıştığını gösteren bug değil, yeni bir kurtarma özelliğidir. Rapor 31 de diğer yedi somut B100 kusurunu kapatırken bu alt maddeyi özellikle ayırmıştır. Bu turda özellik kapsamı genişletilmedi.

## “Denetlenmeyen beş bölge” iddiasının doğrulaması

- **Yanlış/genel ifade:** settings/session IPC, kuyruk ve player çekirdeğinin hiç denetlenmediği doğru değil; Rapor 31 bunlarda somut kaynak yolları, reprodüksiyonlar ve regresyonlar içeriyor.
- **Doğru sınır:** `backend/transcribe.py`, bütün capture dalları ve tüm Node yardımcılarının eksiksiz satır-satır incelendiğine dair tek bir bütünsel kanıt paketi yok.
- **Bu turun kapsamı:** alıntılanan açıkları hedefli olarak doğrulamak ve kanıtlanan kusurları düzeltmekti; “tüm kaynak yeniden denetlendi” iddiası yapılmıyor.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

### Değişen ürün kodu

- `src/main.js`: medya tarama kök doğrulaması, açık native kullanıcı onayı, güvenli İptal varsayılanı ve onay sonrası TOCTOU yeniden doğrulaması.
- `src/media-catalog-service.js`: `import-cancel` sender sahipliği.

### Değişen testler

- `tests/adversarial-ipc.test.js`: onaysız taramanın yan etkisiz reddi.
- `tests/audit-report-regressions.test.js`: üretim handler bağlantısı.
- `tests/media-catalog-service.test.js`: sender/token/tek-kullanım/TTL ve yabancı iptal matrisi.
- `tests/workspace-restore-regressions.test.js`: paket token sender/tür/tek-kullanım/TTL matrisi.
- `tests/browser-feature-services.test.js`: kodlama önizleme token yanlış/tek-kullanım/TTL matrisi.

### Çalıştırılan doğrulamalar

- `npm test` — **GEÇTİ**, çıkış kodu 0; son satır “Tüm testler geçti”. Node paketi, 54.024 parser fuzz vakası, 6.000 watch-library fuzz örneği ve Python `test_transcribe.py` 180/180 dâhil.
- `npm run test:electron-bridge` — **GEÇTİ**, çıkış kodu 0.
- `node --check src\main.js` — **GEÇTİ**.
- `node --check src\media-catalog-service.js` — **GEÇTİ**.
- `backend\venv\Scripts\python.exe -m py_compile backend\transcribe.py` — **GEÇTİ**.

### Çalıştırılmayanlar

- `npm run test:soak` bu hedefli turda yeniden çalıştırılmadı; değişiklikler kaynak yaşam döngüsü veya uzun oturum bütçesi algoritmasına dokunmuyor.
- Gerçek sağlayıcı/API çağrısı yapılmadı.
- Native onay diyaloğu manuel ekran görüntüsüyle sınanmadı.

### Nihai durum

- Doğrulanmış iki kusur düzeltildi.
- B64 test-kapsamı sınırı kapandı.
- B60 kalan mimari önerisi ve B100 yeni özellik talebi bug gibi uygulanmadı; ret gerekçeleri yukarıda kayıtlı.
- Tüm-repo eksiksiz denetim iddiası yapılmadı.
