# Browser Bug Report 89 — R92/R93 ve Program 83–85 Yeniden Doğrulaması

Tarih: 2026-09-20

Başlangıç ürün kodu: `92190e626ab0945721c946d7ced535f9b764b36a`

Düzeltme ürün kodu: `b112a03bdd7f339279553cedd627c5c879808edf`

## Sonuç

Yerelde kalan `PROGRAM_BUG_REPORT_83.md`, `84.md`, `85.md`, R92 devir notu ve dört R92/R93 prob dosyası güncel ürün koduna karşı yeniden çalıştırılıp kaynak çağrı yollarıyla denetlendi. Prob dosyalarının çok sayıdaki kırmızı sonucu gerçek ürün hatası değildir: testlerin bir bölümü iç fonksiyonları dışa aktarılmış sanıyor, bir bölümü ise ürün sözleşmesinin tersini bekliyor.

- Ürün kodunda düzeltilen: **6 doğrudan/defansif sorun**.
- Aynı denetimde bulunan ek gizlilik sertleştirmesi: **1**.
- Davranışı değiştirilmeden açıklığa kavuşturulan: medya zaman üst sınırı saniye cinsinden **1000 saat**.
- Reddedilen/teorik/kanıtsız iddialar: aşağıdaki tablolarda ayrı gösterildi.

## Uygulanan düzeltmeler

1. `browser-event-envelope`: `null` ve ilkel context artık hata atmadan boş güvenli bağlama dönüşür.
2. `browser-session-store`: dışa açık migration yardımcısı doğrudan çağrıldığında da sürümü 8 olarak döndürür.
3. `browser-translation-scheduler`: `NaN`/sonsuz zamanlı cue'lar 00:00 cue'ya dönüştürülmez; boş/geçersiz dağıtım güvenli `[]` verir.
4. `browser-transcript-search`: sonsuz/NaN zaman `Infinity:NaN:NaN` yerine `00:00` olur.
5. `browser-fonts`: geçici dizin temizleme hatası asıl ffmpeg/font hatasını maskelemez.
6. `secret-store`: `myApiKeyBackup` gibi adın ortasında API anahtarı belirten alanlar dışa aktarımdan çıkarılır; `tokenBudget` gibi sır olmayan alanlar korunur.
7. Session ve kapalı-sekme medya zaman üst sınırına açık saniye sözleşmesi/sabit adı verildi; davranış değiştirilmedi.

## R92 bulguları

| Kimlik | Karar | Kanıt / işlem |
|---|---|---|
| R92-01 font `finally` hata maskelemesi | **Gerçek, düzeltildi** | Temizlik hatası yalnız başarılı ana işlemde yüzeye çıkar; asıl hata varsa korunur. |
| R92-02 `persistedMediaId` split | **Yanlış pozitif** | İlk parça servis, kalan parçaların tekrar birleştirilmesi çok-noktalı içerik kimliğini bilerek korur. |
| R92-03 site izinlerinde origin kaybı | **Yanlış pozitif / beklenen ret** | Geçersiz URL ve http(s) dışı şemalar kalıcı izin anahtarı olamaz. Geçerli Unicode IDN native URL ile punycode'a dönüşür. |
| R92-04 atomik JSON temp çakışması | **Kanıtsız** | API senkron; aynı JS iş parçacığındaki çağrılar örtüşmez. Süreç kimliği süreçler arasında ayrıdır. |
| R92-05 redaksiyon case sensitivity | **Asıl iddia yanlış, komşu açık düzeltildi** | Regex zaten `i` bayraklıydı. Ancak `myApiKeyBackup` son ek taşımadığı için sızabiliyordu; düzeltildi. |
| R92-06 CJK fold | **Yanlış pozitif** | Unicode `\p{L}\p{N}` CJK/Kiril/Arap harflerini koruyor. |
| R92-07 scheduler cue end hesabı | **Gerçek kenar durum, düzeltildi** | Sonlu olmayan start/end artık açıkça eleniyor. |
| R92-08 mini-player close tekrarı | **Yanlış pozitif** | `currentWindow` kimlik kapısı ve `window = null` ikinci restore'u engelliyor. |
| R92-09 resources catch | **Bilgi notu** | Kullanıcı etkili deterministik hata yolu yok. |
| R92-10 terminal gate çift settle | **Yanlış pozitif** | `settled` ilk çağrıdan önce atomik olarak true; paket testi aynı sözleşmeyi doğruluyor. |
| R92-11 acquisition sequence overflow | **Pratik bug değil** | Modül kontrollü modulo uygular; kimlikte zaman da vardır, gerçekçi çakışma reproducer'ı yoktur. |

## R93/R95 bulguları

| Kimlik | Karar | Kanıt / işlem |
|---|---|---|
| R95-01 null event context | **Defansif açık, düzeltildi** | Üretim caller'ı çoğunlukla koruyordu; dışa açık API artık tüm girdilerde güvenli. |
| R95-02 position/duration birimi | **Yanlış pozitif** | Alan saniye; `3.600.000` saniye = 1000 saatlik bilinçli uzun-medya sınırı. 1 saate indirmek uzun yayın verisini keserdi. |
| R95-03/R95-11 gap boundary | **Yanlış pozitif** | Prob `First sentence.` ile biten tamamlanmış cümleyi sonraki cümleyle birleştirmeyi bekliyor. Noktalama flush'ı doğru kalite davranışıdır; `>` sınırı sorun değildir. |
| R95-04 translate-only overwrite | **Yanlış pozitif** | Kod hedef kaynakla aynıysa `.ceviri` qualifier kullanıyor; çıktı transaction ile stage/rollback edilir. Rapor da reproducer sunmuyor. |
| R95-05 migration version | **API tutarsızlığı, düzeltildi** | Normalleştirici maskeliyordu; dışa açık migration artık kendi sözleşmesini tamamlıyor. |
| R95-06 boş translation dağıtımı | **Defansif açık, düzeltildi** | Üretim caller'ı önceden reddediyordu; yardımcının kendisi artık güvenli boş sonuç verir. |
| R95-07 transcript clock | **Gerçek, düzeltildi** | `Infinity` doğrudan `Infinity:NaN:NaN` üretiyordu. |
| R95-08 IDN reddi | **Yanlış pozitif** | Kullanılan `xn--example-9ua.com` ve `xn--tr-ua.com` native URL açısından geçersizdir. `bücher.example` doğru biçimde `xn--bcher-kva.example` olur. |
| R95-09 playback truthy string | **Yanlış pozitif** | Medya olayı sözleşmesi boolean'dır; `'yes'` kabul etmek tip gevşetmesi ve yanlış oynatma koruması üretir. |
| R95-10 3-level secret merge | **Yanlış pozitif** | `setPath` keyfi güvenli derinliği destekler; prob ise kasa sözleşmesindeki string yerine obje vermiştir. |
| R95-12 offset 60 | **Yanlış test beklentisi** | Kanonik sabit `MAX_ABS_OFFSET_SECONDS = 86400`; test 60 varsaymıştır. |
| R95-13 envelope fuzz | **Kısmen defansif, düzeltildi** | Null/ilkel context güvenli hale geldi; rastgele payload nesne değilse zaten `{value}` zarfına alınır. |
| R95-14 `splitBrowserBounds({})` | **Yanlış pozitif** | Boş ama mevcut bounds nesnesi minimum güvenli yerleşime normalize edilir; yalnız bounds yokluğu `null`dır. |
| R95-15 `reorderIds` referansı | **Yanlış pozitif** | Yeni normalize edilmiş dizi dönmesi dış mutasyonu engelleyen doğru davranıştır. |
| R95-16 boş `mediaId` | **Yanlış pozitif** | Kimlik URL/service/contentId üzerinden kanonik olarak yeniden oluşturulur. |
| R95-17 `normalizeRecoveryJob` export değil | **Yanlış pozitif** | Bu iç şema yardımcısıdır; dış API sözleşmesi değildir. |

## Test kanıtı

- `node tests/report89-audit-regressions.test.js`: **10/10 geçti**.
- İlgili browser foundation/workflow/resources/subtitle testleri geçti.
- `npm test`: sandbox içi ilk koşuda alt süreçler `EPERM` ve Python keşfi nedeniyle çevresel olarak başarısız oldu; aynı kaynak, yetkili normal Windows çalışma ortamında yeniden koşuldu ve **tüm test dosyaları geçti**. Python ana paketi `192/192`; watch migration `161/161`; 54.024 parser fuzz vakası temiz.
- Değişen yedi JS dosyasında `node --check` ve `git diff --check` geçti.

## Sınırlar

- R92/R93 prob dosyaları ana test paketine alınmadı; hatalı iç-API ve ters sözleşme beklentileri taşıyorlar.
- Bu tur gerçek sağlayıcı çağrısı, kullanıcı profili veya gerçek kullanıcı verisi kullanmadı.
- Electron görsel akışı değişmediği için yeni ekran görüntüsü testi gerekmiyor.
