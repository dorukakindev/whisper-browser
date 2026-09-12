# Tarayıcı ve Altyazı Akışı — Gerçek Kabul Kanıtı

**Tarih:** 2026-09-12
**Kapsam:** Electron çalışma yüzeyi, yerel HLS/DASH ağ fixture'ları, altyazı
yükleme/çeviri rolü, seek/manifest/hibernasyon yaşam döngüsü, tanı paketi
mahremiyeti ve gerçek kullanıcı SRT çiftlerinden kalite ölçümü.

Bu döküm yalnız bu turda bizzat çalıştırılan komutların sonuçlarını kaydeder.
Kullanıcının gerçek Electron profili, çerezleri, anahtarları veya geçmişi
okunmadı. Electron kontrolleri geçici `userData` ile yapıldı; kaynak ve hedef SRT
dosyaları salt okunur ölçüldü ve değiştirilmedi.

## Kabul sonuçları

| Akış | Beklenen davranış | Gözlenen davranış | Karar |
|---|---|---|---|
| Yerel HLS/DASH fixture | Eksik/geciken/yarım segment, yanlış MIME, discontinuity, byte-range ve DASH eksiği deterministik oluşmalı | HLS 404, gecikme, yarım yanıt, yanlış MIME, imza yenileme ve DASH eksik segment senaryolarının tamamı geçti | GEÇTİ |
| İmzalı segment 403 | Aynı süresi dolmuş URL'yi körlemesine denemek yerine manifest yenilenmeli | `refresh-manifest` kararı üretildi; `Retry-After` kullanan 429 ayrı sınırlı retry olarak kaldı | GEÇTİ |
| Seek yarışı | Seek öncesi başlayan gecikmiş XHR yeni epoch'a cue taşımamalı | Eski yanıt reddedildi, seek sonrası yeni yanıt kabul edildi | GEÇTİ |
| Electron altyazı yakalama | Gerçek WebContentsView içindeki `<track>` yakalanmalı, kaynak rolü ve overlay korunmalı | Bir cue yakalandı; `subRole=source`; aynı metin overlay'de `display=flex` olarak görüldü | GEÇTİ |
| Tanı paketi gerçek dışa aktarımı | JSON gerçekten yazılmalı; altyazı metni ve imzalı URL sırrı bulunmamalı | Dosya yazıldı; `Electron tarayıcı altyazısı` ve `ELECTRON_SMOKE_SECRET` için sızıntı yok | GEÇTİ |
| Yerel/YouTube/tarayıcı altyazı çıktısı | Çeviri rolü ve kaynak–çeviri çifti birbirini ezmeden yüklenmeli | Üç tekil yükleme yolu ve çift yükleme geçti; `pending=false`, kaynak ve çeviri metinleri ayrı kaldı | GEÇTİ |
| Responsive/yaşam döngüsü | Geniş/dar görünüm, panel, fullscreen, medya komutu, çökme/uyanma ve kapanış tutarlı kalmalı | 1366×768, 1920×1080 ve 940×680 altında toplam 15 görünüm durumu; fullscreen, play/pause, izin reddi, unresponsive→responsive ve sekme yaşam döngüsü geçti | GEÇTİ |
| Isolated-world bridge | Yalnız tanımlı sayfa eylemleri çalışmalı | World 999 page-action/page-blocks geçti; bilinmeyen tip reddedildi | GEÇTİ |
| Kalıcı şema envanteri | Sürüm/migration kanıtı olmayan kalıcı şema görünür biçimde kırılmalı | 23 şema/protokol envanter testi geçti | GEÇTİ |
| Tam otomatik paket | Node ve Python paketlerinin tamamı yeşil olmalı | `npm test` çıkış 0; son satır `Tüm testler geçti`; backend 167/167 | GEÇTİ |

## Gerçek SRT kalite korpusu

Bu korpus uygulamanın geçmişte ürettiği bozuk dosyaları “yeşile boyamak” için
değil, aynı arızaların tekrar görünür olmasını sağlamak için kalıcı bir regresyon
tabanıdır. Bu nedenle `npm run audit:subtitle-corpus` komutunun mevcut üç çiftte
**başarısız çıkması beklenen ve doğru sonuçtur**.

| Çift | Kaynak | Hedef | Eşleşen | Kesin engel | Sonuç |
|---|---:|---:|---:|---:|---|
| Border Security S10E11 | 486 | 288 | 202 | 421 | Hedef 480 alt sınırının altında; 284 kaynak zamanı hedefte yok, 86 fazladan hedef zamanı, 49 kaynak yankısı, 1 sayı uyuşmazlığı |
| Border Security S13E04 | 290 | 290 | 290 | 24 | Zaman kapsamı tam; 24 İngilizce kaynak yankısı |
| Border Security S01E13 | 1 | 1 | 1 | 2 | Hem kaynak hem hedef beklenen 175 cue alt sınırının altında; dosyalar tek cue'ya çökmüş |

Korpus SHA-256 ile dosya kimliğini kaydeder ve cue numarasına değil kesin zaman
aralığına göre eşler. Kullanıcının SRT dosyalarına otomatik düzeltme yazılmadı.

### İyi kontrol ve altın düzeltme kümesi

- Bilinen iyi çeviri: **15 örnek**, sert yanlış ret **0**, yanlış ret oranı **%0**.
- Beklenen düzeltilmiş çıktı: **16 örnek**, sert yanlış ret **0**.
- Bir iyi örnekte olumsuzluk sezgisi yalnız inceleme uyarısı verdi; cache/API
  retry tüketen sert ret üretmedi.

Bu iki yönlü ölçüm, kapının yalnız kötü örnek yakalayıp iyi çevirileri sessizce
düşürmesini önler.

## Kabul sırasında bulunan ve düzeltilen ek sorunlar

### Native görünürlük doğrulama yarışı

- **Ayrıntılı bulgu:** Responsive Electron smoke ilk toplu koşuda 940×680
  `sidebar-closed` durumunda bir kez yanlış `nativeVisible=false` okudu; aynı test
  tek başına tekrarlandığında geçti. Renderer DOM durumu anında değişirken
  WebContentsView görünürlüğü IPC üzerinden sonradan ana sürece ulaşıyordu; test
  ara durumu nihai sonuç sanıyordu.
- **Düzeltme:** Her responsive matris satırı, native görünürlüğün beklenen değere
  en çok üç saniyede ulaşmasını bekliyor; ardından kesin assertion yapıyor.
- **Doğrulama:** Düzeltilen deneyim smoke testi art arda üç kez ve son kabul
  turunda bir kez daha geçti.
- **Ret gerekçesi:** Üretim görünürlük mantığına gecikme veya sabit `sleep`
  eklenmedi. Kanıt, üretim durumunun doğru fakat test okumasının yarışlı olduğunu
  gösterdi; düzeltme yalnız eventual IPC durumunu ölçen test katmanına yapıldı.

### Tanı paketine cue metni sızma savunması

- **Ayrıntılı bulgu:** Mevcut JSON şeması cue dizilerini dışa aktarmıyordu; ancak
  sağlayıcı kaynaklı bir hata metni gelecekte cue'yu `message` veya `detail`
  alanına taşıyabilirdi. Yalnız mevcut çağrı noktalarının temiz olmasına güvenmek
  kalıcı mahremiyet garantisi değildi.
- **Düzeltme:** Son JSON snapshot'ının bütün metin alanları, bellekteki yakalanmış
  cue metinlerine karşı süzülüyor. Sekiz karakterden kısa cue'lar sıradan tanı
  sözcüklerini parçalamamak için yalnız alanın tamamıyla eşleştiğinde gizleniyor.
- **Doğrulama:** Saf test, önekli uzun cue ve tam alan kısa cue sızıntısını
  doğruladı. Gerçek Electron dışa aktarımı da yakalanmış altyazı görünürken JSON
  yazdı ve hem cue metni hem URL token'ı için negatif arama geçti.
- **Ret gerekçesi:** Hata ayrıntılarının tamamını kaldırmak reddedildi; servis ve
  hata sınıflandırmasını işe yaramaz hâle getirirdi. Dar içerik süzme uygulandı.

## Uzun koşu kanıtı

Bu kod durumu için önceki aynı turda çalıştırılan tam soak sonucu:

- Yakalama: **200/200**.
- Hibernasyon: **50/50**.
- Listener, main timer, renderer timer ve GPU process farkı: **0**.
- Overlay ortalama/azami render: **0,10/0,10 ms**; bütçe **8/50 ms**.
- Geçici altyazı LRU: **64/64**.
- Nihai karar: **GEÇTİ**.

Yeni son katman tanı süzgeci için ayrıca 20.000 cue'luk sentetik ölçüm yaklaşık
**68 ms** sürdü; dışa aktarım kullanıcı eylemli olduğu için bu değer kabul
bütçesinin içindedir.

## Çalıştırılan komutlar

```text
node tests/browser-stream-fixtures.test.js
node tests/browser-capture-recovery.test.js
node tests/browser-subtitle-retry.test.js
node tests/manifest-processing.test.js
node tests/electron-subtitle-output-smoke.js
node tests/electron-browser-experience-smoke.js
node tests/electron-browser-subtitle-smoke.js
npm run test:electron-bridge
npm run audit:subtitle-golden
npm run audit:subtitle-corpus
npm test
python -m py_compile backend/transcribe.py
node --check src/main.js
node --check src/renderer/renderer.js
git diff --check
```

## Sürüm noktası ve geri alınabilirlik

Değişiklikler kod ve testi birlikte tutan tematik commit'lere ayrıldı:

- `3944261` — altyazı çeviri kalite tabanı ve gerçek/altın korpus
- `3fedf25` — sayfa çeviri bağlamı, bulanık alıntı ve site terminolojisi
- `72485dd` — HLS/DASH/MP4 yakalama, provenance ve yaşam döngüsü
- `bb3c5cf` — reklam engelleme tanısı ve tanı paketi mahremiyeti
- `69f5782` — overlay/soak ölçümleri ve kalıcı şema envanteri
- `4c1ae05` — seek/manifest/hibernasyon/main-renderer entegrasyonu

### Bilinçli olarak uygulanmayan dış işlem

`git push` ve `git tag` bu kabul turunda çalıştırılmadı. Bunlar uzak depo ve sürüm
adlandırması üzerinde kalıcı dış etki oluşturur; kullanıcı açıkça `push et ve tag
bas` dediğinde önerilen `v1.1-browser-hardening` etiketi, o anda güncel ve temiz
HEAD tekrar doğrulandıktan sonra oluşturulmalıdır. Yerel sürüm noktası ve tematik
geri alma birimleri hazırdır; uzak yedek henüz oluşmamıştır.

## Sınır ve ret gerekçesi

Kamuya açık gerçek bir serviste zorla 403 üretmek kabul ölçütü yapılmadı. Bir
servisin CDN/manifest akışına müdahale etmek deterministik değildir ve gerçek
profil/çerez kullanımı gerektirebilir. Yenileme davranışı yerel fixture'da; gerçek
WebContents, IPC, overlay ve dosya dışa aktarımı ise geçici profilli Electron'da
ayrı ayrı doğrulandı. Bu, gerçek servis uyumluluğu iddiası değildir; kullanıcıda
karşılaşılan yeni bir site arızası sansürlü tanı paketiyle korpusa eklenmelidir.
