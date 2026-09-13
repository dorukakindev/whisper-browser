# Whisper Local — Altyazı ve Yeni Özellikler Uçtan Uca Sertleştirme Raporu

Tarih: 13 Eylül 2026

## Sonuç

Bu turda altyazının kaynaktan alınmasından çevrilip diske yazılmasına, oynatıcıda
gösterilmesine ve yeni tarayıcı/öğrenme özelliklerinin uzun oturum davranışına kadar
olan hat uçtan uca incelendi. Doğrulanan kusurlar kod ve regresyon testleriyle
düzeltildi. Tam test paketi, Electron güven köprüsü ve 400 çevrimlik kaynak soak
testi geçti.

“Kusursuz” sözcüğü mutlak ve kanıtlanamaz bir garanti olarak kullanılmadı.
Doğrulanabilen sonuç şudur: bilinen kayıp, üzerine yazma, tekrar başlama, kaynak
yankısı, SDH, bağlam, önbellek, seek, asenkron yarış ve kaynak sızıntısı sınıfları
artık yürütülebilir testlerle korunuyor; desteklenen girdiler geçersiz olduğunda
uygulama sessiz başarı vermek yerine güvenli ve görünür biçimde başarısız oluyor.

## Bulguların kısa durumu

- **[DÜZELTİLDİ] Eksik çevirinin nihai .tr.srt üzerine yazılması:** Tamamlanan,
  başarısız ve toplam cue sayıları uzlaştırılıyor. Eksik iş “tamamlandı” sayılmıyor;
  sonuç .tr.partial.srt / .dual.partial.srt olarak ayrılıyor.
- **[DÜZELTİLDİ] Hazır SRT eklenince satırların kaybolması:** Ham SRT katı olarak
  ayrıştırılıyor; blok sayısı, kimlik, zaman, boş gövde ve serileştirme sonrası
  yeniden okuma sözleşmesi doğrulanmadan dosya değiştirilmiyor.
- **[DÜZELTİLDİ] Tek başına çeviri sırasında parçalı dosya güncellemesi:** SRT,
  çift dilli SRT, metadata ve istenen diğer çıktılar tek işlemde hazırlanıyor;
  biri başarısızsa işlem geri alınıyor.
- **[DÜZELTİLDİ] Çeviri bittikten sonra sürecin yeniden başlamış görünmesi:**
  done, error ve süreç exit olayları tek terminal karara bağlandı. Kuyruk
  yalnız gerçek süreç kapanışında ilerliyor; aynı iş iki kez tamamlanmıyor.
- **[DÜZELTİLDİ] Kaynak metnin çeviri diye kabul edilmesi:** Kısa, yalnız
  noktalaması değişmiş ve biçimsel olarak kamufle edilmiş kaynak yankıları retry
  olmadan önbelleğe giremiyor; gerçek özel adlar gereksiz yere reddedilmiyor.
- **[DÜZELTİLDİ] Whisper halüsinasyon filtresinin gerçek kısa konuşmayı silmesi:**
  “Thank you”, “Bye” gibi kısa replikler yalnız sessizlik/düşük güven kanıtıyla
  eleniyor; ölçüm yokluğu artık halüsinasyon kanıtı sayılmıyor.
- **[DÜZELTİLDİ] SDH temizliğinin satır içi konuşmayı yok etmesi:** Güvenli
  etiketler model girdisinden temizleniyor, salt SDH cue ve kaynak zaman çizelgesi
  korunuyor; dengeli parantez ve konuşmacı öneki ayrımı testli.
- **[DÜZELTİLDİ] Bölümler arası karakter/terim tutarsızlığı:** Dizi/sezon/bölüm
  tanıma, kanonik kararlar ve kalıcı dizi hafızası eklendi. Uyumsuz, bozuk veya
  daha yeni şemalı bellek dosyası sessizce ezilmiyor.
- **[DÜZELTİLDİ] Fuzzy TM’nin ya hiç fuzzy olmaması ya da anlamı bozarak
  eşleşmesi:** Yazım hatası ve zararsız dolgu farkları yeniden kullanılabiliyor;
  sayı, olumsuzluk, modal, zamir, özel ad, soru ve anlamlı noktalama çapaları
  uyuşmadan eşleşme yapılmıyor.
- **[DÜZELTİLDİ] Canlı/büyüyen altyazının kısa gecikmiş hipotezle gerilemesi:**
  yalnız tam-prefix gerilemesi reddediliyor; gerçek düzeltme korunuyor.
- **[DÜZELTİLDİ] Segment/discontinuity sınırında yanlış cue birleştirme:** Katman,
  stream, epoch, discontinuity, region, writing mode, konuşmacı ve caption modu
  provenance içinde ayrılıyor.
- **[DÜZELTİLDİ] Cue döngüsünün manuel seek/bölüm değişiminden sonra eski satırı
  döndürmesi:** Döngü durumu seek, scrub, bölüm ve sıfır süreli cue sınırlarında
  güvenle sıfırlanıyor.
- **[DÜZELTİLDİ] Link hints’in aynı-origin iframe’de iki kez kurulması:** Sahiplik
  üst frame’e verildi; cross-origin frame bağımsız kalıyor. Shadow DOM/iframe
  taraması sınırlı ve temizlenebilir.
- **[DÜZELTİLDİ] Hız/filtre/ses normalleştirme yaşam döngüsü:** Site sonradan
  kendi CSS filtresini değiştirirse kullanıcı filtresi onu ezmiyor. Geçici DOM
  ayrılmasında AudioContext kapatılmadığı için aynı medya yeniden bağlanabiliyor;
  normalleştirme kapatılınca doğrudan ses yolu geri kuruluyor.
- **[DÜZELTİLDİ] Tam sayfa yakalama ile mevcut CDP debugger sahipliği yarışı:**
  devam eden attach bekleniyor; yalnız yakalama işleminin kendisinin bağladığı
  debugger güvenle ayrılıyor.
- **[DÜZELTİLDİ] Dark Reader eski isteğinin yeni sayfaya CSS uygulaması:**
  istek sıra/sekme/kuşak kapısıyla reddediliyor. Üretilen CSS iki milyon karakter
  sınırını aşarsa kesilerek bozulmuyor, tamamen reddediliyor.
- **[DÜZELTİLDİ] Yerel tam metin indeksinin kapatıldıktan/temizlendikten sonra
  gecikmiş işi yazması:** Opt-in varsayılanı kapalı; generation kapısı eski
  çıkarımı ve temizleme yarışı sonrası upsert’i reddediyor.
- **[DÜZELTİLDİ] SponsorBlock geçici kapatmada eski bölümlerin geri gelmesi:**
  açık ağ isteği geçersizleştiriliyor, skip ve chapter listeleri anında
  temizleniyor, geç yanıt tekrar uygulanmıyor.
- **[DÜZELTİLDİ] SponsorBlock chapter doğrulama boşluğu:** Başlık kontrol
  karakterleri ve fazla boşluklardan temizleniyor; kısa/bilinmeyen videoda iki
  saatten uzun şüpheli chapter reddediliyor. Chapter hiçbir zaman skip eylemi
  olarak uygulanmıyor.
- **[DOĞRULANDI] Anki .apkg dışa aktarımı:** İçerik argv’ye değil stdin’e
  gidiyor; HTML escape ediliyor, medya yolları pakete sızmıyor, içerik hash’li
  ad kullanılıyor, çıktı atomik. İki dışa aktarımda GUID/model/alan şeması
  kararlılığı gerçek ZIP+SQLite açılarak doğrulandı.
- **[DOĞRULANDI] Gerçek dünya parser korpusu:** Altı fixture ve 12 cue canlı
  ağsız, sentetik metinli, provenance ve SHA-256 kilitli; JSON3, srv3, TTML,
  HLS WebVTT timestamp map, bozuk WebVTT ve milisaniyeli envelope kapsanıyor.
- **[DOĞRULANDI] Yeni özelliklerin uzun oturum sınırları:** 400/400 altyazı
  yakalama ve 50 çevrimlik hibernasyon testi geçti; listener/timer/GPU process
  artışı olmadı.

## Gerçek SRT dosyalarının salt okunur sonucu

Bu dosyalar değiştirilmedi. Sonuçlar geçmişte üretilmiş dosyaların mevcut
durumudur; yeni kodun yeniden üretimde sağlayacağı sonucu temsil etmez.

- **[MEVCUT DOSYA BAŞARISIZ] Border Security S10E11:** kaynak 486 cue, hedef
  288 cue, tam zaman eşleşmesi 202, engelleyici bulgu 421. Bunların içinde 284
  eksik hedef, 86 fazladan/farklı zamanlı hedef, 49 kaynak yankısı ve 1 sayı
  uyuşmazlığı var.
- **[MEVCUT DOSYA BAŞARISIZ] Border Security S13E04:** kaynak 290, hedef 290,
  zaman eşleşmesi 290; fakat 24 kaynak yankısı nedeniyle kabul edilmedi. Satır
  sayısı eşitliği tek başına çeviri başarısı değildir.
- **[MEVCUT DOSYA BAŞARISIZ] Border Security S01E13:** kaynak dosya 1 cue, hedef
  dosya 1 cue. Manifestin en az 175 cue beklentisine göre hem kaynak hem hedef
  eksik. Kaynak zaten çökmüş olduğundan kodun hedefi “düzeltmesi” güvenli değildir.
- **[DOĞRULANDI] Altın kalite kümesi:** 15 iyi örnek + 16 beklenen düzeltme;
  engelleyici yanlış ret oranı yüzde 0, sonuç geçti.
- **[DOĞRULANDI] Harici SDH korpusu:** 17 geçerli çift, 1 açıkça dışlanan
  sıfır-cue hedef; minimum zaman hizası 1, minimum cue tutma oranı 0,982,
  sonuç geçti.

## Retler ve sınırlar

- **[RET — KAPSAM/GÜVENLİK] Eski gerçek SRT dosyalarını otomatik onarma:** Bu
  tur kod düzeltme ve salt-okunur kalite denetimiydi. Özellikle S01E13 kaynak
  dosyasının kendisi 1 cue olduğu için tahminle diyalog üretmek veri uydurmak
  olurdu.
- **[RET — KANIT YOK] CEA-608/708’i tam decoder olarak uygulamak:** Gömülü iz
  tespiti ve “bu akış ayrı decoder gerektiriyor” tanısı var. Gerçek kullanım
  korpusu ve ölçülmüş ihtiyaç olmadan yeni decoder yüzeyi eklenmedi.
- **[RET — GEREKSİZ BAĞIMLILIK] Playwright eklemek:** Mevcut saf durum
  testleri, Electron isolated-world bridge smoke’u ve gerçek Electron soak
  hedeflenen yarışları kapsadı. Kapsanamayan somut bir akış çıkmadan ikinci
  E2E sürücüsü eklenmedi.
- **[SINIR] Canlı ücretli çeviri sağlayıcısı çağrısı yapılmadı:** Anlam
  kapıları sahte sağlayıcı yanıtları, altın küme ve gerçek geçmiş SRT çiftleri
  üzerinden ölçüldü. Bu, modele bağlı dilsel mükemmelliği garanti etmez; model
  hatasını sessiz kabul etmeme ve eksik çıktıyı nihai dosya saymama garantisini
  güçlendirir.
- **[SINIR] Gerçek SRT manifesti makineye bağlıdır:** Telifli SRT’ler repoya
  alınmadı; %USERPROFILE%/Downloads dosyaları silinirse bu üç çiftin denetimi
  çalışmaz. Kalıcı regresyon koruması repodaki altın ve sentetik fixture
  kümelerinde sürer.

## Doğrulama özeti

- npm test — **GEÇTİ**, çıkış kodu 0, son satır “Tüm testler geçti”.
- backend/test_transcribe.py — **173 geçti, 0 başarısız**.
- backend/test_export_anki.py — **3/3 geçti**; gerçek .apkg ZIP ve SQLite
  içeriği açıldı.
- Anki IPC sözleşmesi — **7/7 geçti**.
- Gerçek dünya parser korpusu — **6 fixture, 12 cue, hash/provenance OK**.
- SponsorBlock — **14 çekirdek + 13 chapter/UI testi geçti**.
- Electron bridge — **GEÇTİ**; güvenilir köprü ve Dark Reader CSS
  üretim/temizleme akışı isolated world 999 üzerinde doğrulandı.
- JavaScript node --check — main, preload, renderer ve değişen yardımcılar
  **GEÇTİ**.
- Python py_compile — transcribe, Anki, dizi hafızası, fuzzy TM ve SDH
  modülleri **GEÇTİ**.
- npm run test:soak — **GEÇTİ**:
  - yakalama başarı oranı 1 (400/400),
  - hibernasyon başarı oranı 1 (50 yapılandırılmış çevrim),
  - işlenmemiş promise reddi 0,
  - listener delta 0,
  - main timer delta 0,
  - renderer timer delta 0,
  - GPU süreç delta 0,
  - ortalama/maksimum overlay render yaklaşık 0,10 ms,
  - disk yazma 7,1175 işlem/çevrim (üst sınır 10).
- git diff --check — **GEÇTİ**; yalnız mevcut LF→CRLF bilgilendirme uyarıları.
- scratch/ ve whisper-audit-2026/ — **KORUNDU**, içerikleri değiştirilmedi.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

### 1. Nihai altyazı dosyası bütünlüğü

**Bulgu:** Çeviri çağrısı kısmen başarılı olduğunda üretilen hedef liste kaynak
sayısını karşılamasa bile nihai adla yazılabiliyor; kullanıcı bunu tam çeviri
sanabiliyordu. Hazır SRT yeniden eklendiğinde aynı yol geçerli dosyayı boş/kısa
sonuçla değiştirebiliyordu.

**Düzeltme:** Kaynak cue toplamı, tamamlanan ve başarısız cue sayıları ortak çıktı
sözleşmesinde uzlaştırıldı. Katı SRT serileştirici her blok için kimlik, zaman
sırası, pozitif aralık, boş olmayan metin ve yeniden ayrıştırmada birebir blok
sayısı istiyor. Tüm ilgili çıktılar atomik işlemde hazırlanıyor. Eksik çeviri
yalnız .partial adına yazılıyor; önceden var olan nihai dosya korunuyor.

**Doğrulama:** Çeviri tamamı hata, bir bölüm hata, yanlış sayaç, boş cue, bozuk
zaman, serileştirme farkı, dosya ortasında yazma hatası ve rollback senaryoları
tam pakette geçti.

### 2. Süreç yaşam döngüsü ve “yeniden çeviriyor” görünümü

**Bulgu:** Backend done yayımladıktan sonra renderer işi erken idle kabul
edebiliyor; ardından Python exit olayı aynı kuyruğu yeniden hareket ettiriyor
veya geç olaylar yeni işe karışabiliyordu.

**Düzeltme:** İş kimliği/kuşak kontrolüne doneHandled ve exitSeen terminal
kilitleri eklendi. Kuyruk ilerleme kararı süreç kapanışına bağlandı; promise hata
ve finally yolları tek seferlik temizlik yapıyor. Eski işin olayları yeni aktif
işe uygulanmıyor.

**Doğrulama:** Deterministik done+exit, error+exit, terminalsiz code=0,
cancel→start ve 25.000 rastgele interleaving testi geçti. Player UI’daki
“kuyruk sıradaki işi done değil exit olayında başlatıyor” kabul testi geçti.

### 3. Anlamlı çeviri, bağlam ve hafıza

**Bulgu:** Salt kelime/satır eşleştirmesi kısa repliklerde bağlamı kaçırıyor;
tam eşleşme önbelleği küçük yazım farkında gereksiz API çağrısı yaparken gevşek
fuzzy eşleşme olumsuzluk, sayı veya karakteri yanlış taşıyabilirdi.

**Düzeltme:** Cümle grubu, önce/sonra bağlamı, konuşmacı sınırı, dizi kanonu ve
proje hafızası prompt bağlamına bağlandı. Fuzzy TM yalnız güvenli yazım/dolgu
farkına izin veriyor; sayı, olumsuzluk, modal, zamir, özel ad, soru ve anlamlı
noktalama çapaları zorunlu. Kaynak yankısı ve sert anlam kapısı geçmeyen sonuç
retry/cache zincirine güvenli biçimde giriyor; kabul edilmeden cache’e yazılmıyor.

**Doğrulama:** İyi çevirilerde engelleyici yanlış ret oranı yüzde 0. Yazım hatası
ve dolgu pozitif; sayı/olumsuzluk/zamir/isim/içerik sözcüğü farkları negatif
fixture olarak geçti. Dizi hafızası gelecek şema dosyasını değiştirmeme testi
geçti.

### 4. SDH ve transkripsiyon kaybı

**Bulgu:** Genel regex ile köşeli parantez veya müzik işaretli satırı tamamen
atmak, konuşma ile aynı cue içinde bulunan SDH bilgisini ve bazen gerçek kısa
diyaloğu silebiliyordu.

**Düzeltme:** SDH temizleme ayrı modüle alındı. Dengeli etiket, konuşmacı öneki,
satır içi etiket ve salt SDH ayrılıyor. Temizlenmiş metin modele giderken kaynak
cue/zaman korunuyor. Halüsinasyon elemesi kısa repliği yalnız düşük güven veya
sessizlik kanıtıyla atıyor.

**Doğrulama:** Modül testleri, 17 çiftlik dış korpus ve backend halüsinasyon
fixture’ları geçti. Minimum dış korpus cue tutma oranı 0,982; zaman hizası 1.

### 5. Tarayıcı altyazı yakalama ve oynatma

**Bulgu:** Canlı büyüyen metin, gecikmiş kısa yanıtla küçülebiliyor; farklı
discontinuity/region/konuşmacı cue’ları salt metin benzerliğiyle birleşebiliyor;
seek ile cue döngüsü yarışabiliyordu.

**Düzeltme:** Büyüyen cue gerileme kapısı, provenance uyumluluk anahtarı,
segment-epoch-discontinuity ayrımı ve sınır odaklı zamanlayıcı uygulandı. Cue
döngüsü açık kullanıcı seek’i, scrub, bölüm değişimi ve geçersiz cue’da
sıfırlanıyor.

**Doğrulama:** 77 tarayıcı altyazısı testi; HLS gecikme/eksik/discontinuity,
DASH eksik segment, wvtt/stpp, canlı JSON3 büyümesi ve zaman sıçraması testleri;
400/400 soak yakalaması geçti.

### 6. Yeni tarayıcı ve öğrenme özelliklerinin sağlamlaştırılması

**Bulgu:** Yeni özelliklerin her birinde ayrı yaşam döngüsü riski vardı:
iframe’de çift link-hint kurulumu, siteden kopup geri gelen videoda ölü ses
grafiği, tam sayfa yakalamada başkasına ait debugger’ı ayırma, eski Dark Reader
CSS’i, FTS temizleme yarışı ve SponsorBlock geç yanıtı.

**Düzeltme:** Her akış sekme/kuşak/istek sırası veya açık sahiplik kuralına
bağlandı. Site tarafından değiştirilen filtre korunuyor; geçici medya ayrılması
AudioContext’i öldürmüyor. FTS varsayılan kapalı ve temizlenebilir. SponsorBlock
temporary kapatma açık isteği iptal edip chapter/skip durumunu boşaltıyor.

**Doğrulama:** Link hints 11, medya denetleyicisi 25, sayfa yakalama 18,
sayfa-index entegrasyonu 15, Dark Reader 9, SponsorBlock 14 ve chapter/UI 13
hedefli test geçti. Electron isolated-world smoke ve tam soak bunların birlikte
çalışmasını doğruladı.

### 7. Reddedilen genişletmelerin gerekçesi

CEA-608/708 için tam decoder ve Playwright bağımlılığı, bu turun ölçülmüş
kusurlarını kapatmak için gerekli değildi. İlkinde gerçek kullanım korpusu ve
başarı ölçütü yok; ikincisinde aynı olay yolları Electron’un kendi bridge ve soak
testleriyle kapsanıyor. İki ekleme de daha geniş regresyon yüzeyi oluşturacağı
için “özellik varmış gibi görünme” amacıyla eklenmedi. Mevcut 608/708 tespiti
sessiz yanlış parse yerine destek sınırını tanıda gösteriyor.

### 8. Kapanış kararı

**Kabul:** Kod düzeyinde bulunan tüm yeniden üretilebilir kusurlar düzeltildi;
hedefli, tam, Electron ve uzun oturum doğrulamaları yeşil.

**Kabul edilmeyen eski çıktılar:** Üç gerçek SRT çiftinin hiçbiri kalite
kapısından geçmedi. Bu dürüstçe korunmuş bir sonuçtur; kod düzeltmesinin eski
dosyaları geriye dönük olarak iyileştirdiği iddia edilmedi.

**Kalan operasyonel sınır:** Yeni sürümle aynı üç videoyu yeniden çevirmek,
seçilen LLM’in dil kalitesini gerçek sağlayıcı üzerinde ayrıca ölçer. Yeni
korumalar, bu yeniden üretimde eksik/bozuk sonucu nihai başarı diye kaydetmez.
