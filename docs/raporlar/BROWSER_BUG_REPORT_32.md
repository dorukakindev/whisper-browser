# BROWSER BUG REPORT 32 — 15 Eylül kapanış regresyonları

Bu rapor, 25–31 numaralı bug raporlarının toplu düzeltmesinden sonra çalıştırılan tam test paketinin bulduğu üç uyuşmazlığı güncel kaynakta yeniden sınıflandırır. Bulgular rapor iddiasına göre değil, ulaşılabilir ürün yolu ve davranışsal test sonucuna göre kapatılmıştır.

## B105 · P2 — B61 düzeltmesinde eski değişebilir medya kimliği kapısı kalmış [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]

- **Kanıt:** `src/main.js` içindeki çeviri scheduler `isCurrent` kapısı, scheduler nesnesi ve sekme kuşağına ek olarak her kontrolde `browserWatchMediaId(tab) === tab.translationMediaIdentity` koşulunu yeniden hesaplıyordu. İlk stream kimliği evlat edinildiğinde bağlam taşınsa bile bu eski koşul zamanlamaya bağlı olarak geçerli işi bayat sayabiliyordu.
- **Düzeltme:** Geçerlilik, immutable scheduler sahipliği, `tab.generation` kuşağı ve başlangıçta sabitlenen temel `tab.mediaId` değerine bağlandı. İlk manifestte sonradan evrilen `streamMediaId` geçerli işi iptal etmiyor; gerçek temel medya değişimi ve kuşak değişimi geç sonucu reddediyor.
- **Regresyon:** `tests/report-29-31-regressions.test.js`, scheduler kurulumu içinde eski `browserWatchMediaId` kapısının bulunmadığını ve kuşak/scheduler sahipliğinin korunduğunu doğruluyor.

## RET-32-01 — `watch:start` dizin testi ürün hatası sandı [SONUÇ: REDDEDİLDİ · TEST DÜZELTİLDİ]

- **İddia:** Klasör izleme bir dosya yolunu klasör kabul ediyordu.
- **Ret gerekçesi:** Güncel ürün yolu önce `canonicalLocalPath(dir)` ile `target` üretiyor, sonra `fs.statSync(target).isDirectory()` koşulunu uyguluyor. Test yalnız eski değişken adı olan `fs.statSync(dir)` metnini aradığı için doğru davranışı başarısız saydı.
- **Test düzeltmesi:** `tests/validation.test.js` artık hem kanonikleştirmeyi hem kanonik hedef üzerinde `isDirectory()` kontrolünü ayrı ayrı doğruluyor. Ürün kodu bu bulgu için değiştirilmedi.

## RET-32-02 — Kütüphane altyazı araması testleri izin bağımlılığını vermedi [SONUÇ: REDDEDİLDİ · TEST DÜZELTİLDİ]

- **İddia:** SRT, ASS, VTT ve Windows-1254 altyazı araması ürün içinde topluca bozulmuştu; 10.000 kayıt testinde sonuç sayısı sıfırdı.
- **Ret gerekçesi:** İzole testler `main.js` kaynak bloğunu `new Function` ile çalıştırırken B83 güvenlik düzeltmesinin zorunlu kıldığı `subtitleFileAccess` nesnesini enjekte etmiyor ve sentetik dosyalara kullanıcı izni eşdeğeri grant vermiyordu. Üründe grant'siz yolların okunmaması beklenen güvenlik davranışıdır.
- **Test düzeltmesi:** Her iki test gerçek `SubtitleFileAccess` kullanıyor ve yalnız kendi geçici sentetik altyazı dosyalarını grant ediyor. Kalıcı kütüphane veya içe aktarılan paket yollarına otomatik grant eklenmedi; böylece B83 keyfi yerel dosya ifşası yeniden açılmadı.
- **Regresyon:** Biçim/kodlama araması 8/8; 10.000 kayıt arama, event-loop bırakma ve iptal testi 8/8 geçti.

## RET-32-03 — Electron link-hints smoke aralıklı başarısız oluyor [SONUÇ: REDDEDİLDİ · TEST YARIŞI DÜZELTİLDİ]

- **İddia:** Gerçek Electron belgesinde `a` ipucu tuşu hedefi etkinleştirmiyordu.
- **Kanıt ve ret gerekçesi:** Atomik tanı çağrısı başarısız anda `{clicks:0, labels:[], active:false}` döndürdü; yani tuş dinleyicisi değil, katman tuştan önce kapanmıştı. Test hemen öncesinde `setZoomFactor(1)` çağırıyor, Electron ise bu çağrı döndükten sonra gecikmiş `resize` yayımlıyordu. Link-hints katmanının resize sırasında kapanması beklenen ürün davranışıdır.
- **Test düzeltmesi:** Zoom sıfırlamasından sonra katman kurulmadan önce 80 ms yerleşme beklemesi eklendi. Etkinleştirme kontrolü tek tarayıcı çağrısında click/katman/etiket tanısı döndürüyor; yeniden hata olursa neden görünür kalıyor.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

| Kimlik | Kaynak sınıflandırması | Uygulanan işlem | Doğrulama |
|---|---|---|---|
| B105 | Ulaşılabilir, zamanlama-bağımlı ürün hatası | Değişebilir stream kimliği kapısı kaldırıldı; scheduler + kuşak + sabit temel medya kimliği korundu | Rapor 29–31 ve arka-plan gezinme regresyonları geçti |
| RET-32-01 | Testin uygulama değişken adını ezberlemesinden doğan yanlış pozitif | Davranış sözleşmesine dayalı iki statik kontrol | Validation 27/27 |
| RET-32-02 | Eksik test bağımlılığı/izin kurulumu; ürünün grant reddi doğru | Gerçek erişim sınıfı ve sentetik dosya grant'leri eklendi | Kütüphane 8/8, performans 8/8 |
| RET-32-03 | Zoom sonrası gecikmiş resize ile katmanın beklenen temizliği; ürün hatası değil | Zoom yerleşme beklemesi + atomik tanı | Electron köprü smoke ardışık koşularla doğrulandı |

### Güvenlik kararı

Kayıtlı `subtitlePaths` değerlerini uygulama başlangıcında otomatik grant etme fikri denendi ve reddedildi: `.wbp`/kütüphane içe aktarımıyla ekilmiş bir yolun kullanıcı onayı olmadan okunmasına yol açarak B83'ü geri getirirdi. Nihai ağaçta böyle bir otomatik grant yoktur.

### Tam paket durumu

- `npm test`: **GEÇTİ**, çıkış 0; son satır `Tüm testler geçti` (Python `test_transcribe.py` 178/178 dâhil).
- `npm run test:electron-bridge`: zoom yarış düzeltmesinden sonra **üç ardışık koşu GEÇTİ**.
- `npm run test:soak`: **GEÇTİ**; 400/400 yakalama, 50/50 hibernasyon, 0 işlenmemiş Promise reddi ve 24/24 kaynak bütçesi sınır içinde.
- Python `py_compile` ile `transcribe.py`; Node `--check` ile main/preload/renderer: **GEÇTİ**.
- `git diff --check`: **GEÇTİ**.
