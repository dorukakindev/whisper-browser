# Tarayıcı bulguları tam doğrulama ve uygulama raporu — 2026-09-12

## Sonuç

Tarayıcı rapor kümesindeki numaralı bulgular Hata 1–355 sonuna kadar, ayrıca UI, olay,
güvenlik, kombinasyon ve kozmetik denetim raporlarındaki adlandırılmış maddeler güncel
kaynak ve erişilebilir olay akışlarıyla karşılaştırıldı. Rapor cümlesi tek başına hata
kanıtı sayılmadı. Yalnız güncel kodda ulaşılabilen, kullanıcı etkisi açıklanabilen ve
regresyon testi kurulabilen kusurlar değiştirildi.

Son durumda 62 izlenen kaynak/test dosyasında 1.185 ekleme ve 268 silme vardır. Üç yeni
regresyon testi eklendi. Orijinal bulgu raporları değiştirilmedi. Değişiklikler commit
edilmedi.

Bu rapordaki “incelendi” ifadesi 355 maddenin 355'inin hata olduğu ya da 355 ayrı
düzeltme yapıldığı anlamına gelmez. Korpus çok sayıda yinelenen bulgu, eski satıra göre
yazılmış iddia, zaten düzeltilmiş davranış, güvenlik/ürün politikası ve ancak gerçek
siteyle elle doğrulanabilecek öneri içeriyordu.

## Uygulanan doğrulanmış düzeltmeler

### Altyazı keşfi, ayrıştırma ve dışa aktarma

- CP1254 ile bozuk UTF-8 ayrımı, az sayıda Türkçe karakter içeren metinlerdeki tesadüfi
  UTF-8 çiftlerini de gözeterek düzeltildi; BOM ve UTF-16 yolları korundu.
- TTML'in bozuk namespace kapanışı, numarasız başlayan kompakt SRT, çok dilli SAMI,
  WebVTT voice etiketi, MP4 WebVTT zaman ölçeği ve DASH SegmentList/BaseURL akışları
  için ayrıştırma düzeltildi.
- DASH'te boş URL'li sahte iz üretimi önlendi; göreli/uzantısız captions, subtitles,
  transcript, closedcaption, /sub ve /cc uçları için kontrollü keşif eklendi.
- HLS artımlı altyazı akışında sıra boşluğu ofseti gerçek segment süresiyle ilerletildi;
  aynı kare örneklerinin kararlılık süresini sıfırlaması ve medyaya dayanmayan arka plan
  ilerlemesinin oynatma sayılması önlendi.
- ASS çıktısında literal süslü parantezler ile \
/\
/\\h içeren Windows yolları
  metni değiştirmeden güvenli hale getirildi; iç ayrıştırıcı görünmez koruma işaretlerini
  geri kaldırıyor.
- SRT/ASS çok satırlı çıktıların CRLF tutarlılığı, dışa aktarma zaman dönüşümü,
  geçersiz cue uyarıları ve iki noktalı senkronizasyonun kaynak noktalarını kronolojik
  eşleştirmesi güvenceye alındı.
- Türkçe bul/değiştirde ı ve i artık aynı harf sayılmıyor. “Warning:”, “Note:” gibi
  yapısal önekler konuşmacı etiketi sanılmıyor; gerçek konuşmacı etiketleri korunuyor.
- Hata 215, 221/278, 231, 243, 250, 273–274, 285–289, 295, 328, 332–333 ve
  349–354 çevresindeki doğrulanmış alt başlıklar bu grupta kapatıldı.

### Sayfa çevirisi, terim ve not akışları

- Sayısal başlık blokları kaybolmuyor; blok sırası DOM sırasına sabitlendi ve parçalı
  metin düğümleri eksiksiz yeniden birleştiriliyor.
- PRE/CODE bağlamı korunurken çevrilemez düğümler tarama dışında bırakıldı; tablo
  satırlarına geçersiz çocuk ekleme ve sayfa içi düzeni bozma önlendi.
- Yeniden çeviri oturumu önceki oturumun blok bütçesini devralmıyor. Başarısız rozet
  üzerindeki “Yeniden dene” düğmesi, oturum/blok arada eskise bile beklemede kalmıyor
  (Hata 355).
- Kullanıcı terim öğrendiğinde scheduler bağlamı yeni terminologyVersion ile anında
  yenileniyor; sonraki iş eski önbellek bağlamıyla devam etmiyor.
- Araştırma notlarında satır başı başlık/liste işaretleri Markdown yapısına dönüşmeden
  kaçırılıyor. “İyi” derecelendirilen ve 21 güne ulaşan kartlar bilinen duruma geçiyor
  (Hata 318–319).
- Manga yanıtında ilk ve son köşeli paranteze güvenmek yerine dengeli JSON taraması
  yapılıyor; açıklama içindeki parantezler geçerli yükü bozmuyor.

### Tarayıcı kimliği, gezinme ve pencere güvenliği

- Aynı 16 KiB öneke sahip farklı URL'ler artık aynı medya kimliğini paylaşmıyor.
  Saklanan URL sınırlı kalırken hash tam normalize URL'den üretiliyor.
- YouTube clip kimliği watch?v değerinden önce geliyor; Netflix /browse?jbv adresi
  gerçek içerik kimliğine dönüşüyor (Hata 321–322).
- /auth/key gibi genel uygulama uçları DRM lisansı sanılmıyor; gerçek Widevine/DRM
  desenleri tanınmaya devam ediyor (Hata 323).
- Açılır pencere kayıt defteri 10 pencereyle sınırlandı; yarışta sınırı aşan pencere
  kapatılıyor ve kapanan pencere kapasiteyi geri veriyor.
- İlk gezinme reklam engelleyici hazırlığını beklemiyor; hazırlık arka planda sürüyor.
- Adres önerileri kapatıldığında bekleyen arama zamanlayıcısı ve eski sonuçlar
  geçersizleştiriliyor; gezinme sonrası adres alanı odağı bırakıyor.
- Ctrl+P/Ctrl+Shift+P, sekme aç/kapat/geri aç, yenileme, sekme dolaşımı, sekme
  numarası ve yakınlaştırma kısayolları hem sayfa WebContents akışında hem renderer
  akışında aynı işleyiciye bağlandı. Devre dışı komut artık Enter'ın seçtiği ilk satır
  olamıyor (Hata 326–327).

### Oynatma, overlay ve kullanıcı arayüzü

- Medya seçimi sesli ve gerçekten oynayan ana içeriğe öncelik veriyor; sessize alınmış
  otomatik reklam büyük duraklatılmış ana videoyu geçemiyor. Sesli oynayan AUDIO ise
  duraklatılmış videonun üstünde kalıyor.
- Overlay saydamlığı 0 değeri varsayılanla ezilmiyor. Sürükleme, işaretçi öğe dışına
  çıksa veya pencere odağı kaybolsa da tamamlanıyor; dinleyiciler temizleniyor.
- Overlay satır kutusu content-box hesabıyla taşmıyor. Sekmeler saklanan favicon'u
  güvenli referrer politikası ve hata fallback'iyle gösteriyor.
- Shadowing modu aynı bitmiş cue üzerinde tekrar tekrar duraklamıyor; cue yeniden aktif
  olduğunda normal davranış geri geliyor (Hata 334).
- Renderer günlüğü 500 satır eşiğinde tek tek DOM düğümü silmek yerine tek Range
  işlemiyle 450 satıra iniyor.
- Kapanan sekme geçmişi uzun senkron ofsetini, senkron kayıtlarını, kullanıcı
  düzeltmelerini ve karantina durumunu koruyor. Çok dar iki panel hesabında güvenli
  boşluk genişliği aşmıyor (Hata 301 ve 303).

### Otomasyon, ayarlar, izleme ve PDF

- Otomasyonun kaynak, oturum ve canlı karakter limitleri ayrı Türkçe gerekçeler
  bildiriyor; tamamlanan/iptal edilen geçmişler 1.000 kayıtla sınırlandı
  (Hata 329–330).
- Turnstile betiği bulunan normal bir makaledeki “verification” sözü tek başına
  Cloudflare ara sayfası sayılmıyor; gerçek widget/frame/başlık belirtileri korunuyor
  (Hata 324).
- İzleme klasörü bir işin tamamlandığını ancak seçilen bütün çıktı biçimleri mevcutsa
  kabul ediyor (Hata 336).
- Güvenli ayar deposu çözülemez veya eski anahtar göçü başarısız olursa uygulama boş
  ayarla sessizce devam etmek yerine kullanıcıya hata günlüğü gösteriyor (Hata 344).
- PDF metin öğeleri viewport dönüşümüyle doğru koordinata taşınıyor; döndürülmüş sayfa,
  en sağ parça genişliği, ters sıra/paragraf, kısmi sayfa başarı sayımı ve Windows
  dosya adı temizliği düzeltildi.
- Yerel dosya erişiminde gerçek yol incelemesi ve sürücü harfi öneki eşleşmesi
  sağlamlaştırıldı.

## Değiştirilmeyen rapor maddeleri

Değişiklik yapılmayan maddeler dört sınıfa ayrıldı:

1. **Zaten düzeltilmiş veya yinelenen:** Güncel kaynakta rapordaki eski satır/desen
   bulunmuyor ya da aynı kök neden başka raporda zaten kapanmış durumda.
2. **Yanlış pozitif:** Örneğin webRequest kurulumu WeakSet ile tekilleştirilmiş,
   dosya seçimi ana pencereye modal, NDJSON satır tamponu mevcut, süreç sonlandırma
   /T /F kullanıyor, debugger detach yakalanıyor ve altyazı saati media.currentTime'a
   dayanıyor.
3. **Kasıtlı güvenlik/ürün sözleşmesi:** Yalnız HTTP(S) tarayıcı gezinmesi, site
   uyumluluğunda tam host eşleşmesi, hassas sorgu alanlarının temizlenmesi, atomik
   iki-dosya yazımı, ayar değerlerini reddetme/sınırlama ve “çıkışta bağlantıları
   kapat” davranışları kanıt olmadan gevşetilmedi.
4. **Manuel doğrulama gerektiren öneri:** Belirli gerçek site, DRM/CDP yanıtı, işletim
   sistemi kilidi veya uzun süreli etkileşim gerektiren ve sentetik erişilebilir
   olay yoluyla deterministik üretilemeyen iddialar hata diye işaretlenmedi.

Özellikle Hata 335 ve 337–350 arasındaki değiştirilmemiş iddialar yeniden kontrol
edildi: 335'te karşılaştırılan yol zaten resolvedRoot'tan türetiliyor; 337'nin hata/
iptal yolları queued durumunu sıfırlıyor; 338 legacy ham YouTube kimliği sözleşmesi;
339 Windows hedefi; 340 geçerli FTS5 quoted-prefix sözdizimi; 341 boş sorgu koruması;
342 anlamsal olarak aşırı seçeneği sessiz kırpmak yerine reddetme; 343 mevcut kuyruk
tiplerinde olmayan varsayımlar; 345'in 20–80 sınırı; 346–350'nin tampon, süreç,
debugger, SPA sorgusu ve medya saati korumaları nedeniyle değişiklik gerektirmedi.

## Doğrulama kanıtı

- `npm test`: geçti, çıkış kodu 0.
- `npm run test:electron-bridge`: geçti; izole world 999 köprü doğrulaması tamamlandı.
- `backend\\venv\\Scripts\\python.exe -m py_compile backend\\transcribe.py`:
  geçti, çıkış kodu 0.
- `node --check src\\main.js`, `src\\preload.js`,
  `src\\renderer\\renderer.js`: geçti.
- ASS literal kaçış davranışı yerel ffmpeg/libass render probu ile doğrulandı.
- BROWSER_BUG_REPORT_22 için bağımsız doğrulama betiği 20/20 geçti; ilişkili
  browser-textutil, sponsorblock ve manga testleri geçti.
- Hata 355 için sayfa aksiyonu VM regresyonu ve main kaynak sözleşmesi testleri geçti.
- Altyazı ayrıştırıcı fuzz testi 52.000 örnekte geçti.
- `git diff --check`: temiz; yalnız Windows çalışma ağacı için LF→CRLF uyarıları var.

Tam paket sırasında yakalanan bir test çelişkisi de üretim kodunda düzeltildi: sesli
oynayan AUDIO öğesi tier 6 ile duraklatılmış sesli videonun (tier 5) üstünde; sessiz
oynayan reklam ise tier 4'te kalıyor. Fuzz oracle'ı gevşetilmedi.

## Teslim durumu

- Kaynak ve regresyon testleri çalışma ağacında hazırdır.
- Orijinal rapor dosyaları ve kullanıcıya ait mevcut `scratch/` içeriği korunmuştur;
  yalnız bu doğrulamada üretilen iki geçici ASS render probu silinmiştir.
- Commit veya push yapılmamıştır.

## GÜNCEL BULGU DURUMU — 2026-09-12

### 355 maddelik kümenin kapanış notu

Bu dosya sabit tekil kimliği olmayan 355 eski browser bulgusunu kendi aralıklarıyla birleştiren kanonik rapordur. “Değiştirilmeyen” 335 ve 337–350 aralıkları güncel kaynakta yeniden kontrol edildi; resolved-root, queue terminal, legacy YouTube kimliği, Windows hedefi, FTS5 sorgusu, boş sorgu, ayar reddi, sınırlar, tampon, process-tree, debugger, SPA query ve media clock savunmaları geçerli olduğundan gevşetilmedi.

Bu son turda birleşik rapordan sonra gelen bulgular da kapatıldı:

- **UI:** B-01…B-06 düzeltildi.
- **Browser tam:** picker race ve log trim düzeltildi; DPI/100+ gerçek drop manual.
- **Browser güvenlik:** CSP, media URL, PDF CORS ve packaged remote-debug switch temizliği uygulandı; shared partition ve whitelist'li `openPath` tasarım olarak reddedildi.
- **Derin güvenlik:** F-01…F-04, H-01…H-04, M-01/M-02 düzeltildi; F-05, M-03/M-04 ve FP-01…07 kaynak/test kanıtıyla false olarak reddedildi.
- **İşlem bütünlüğü:** kanonik F1–F6/F8 ve R2/R4/R6/R7 düzeltildi; F7/F9/F10/R3/R5/E1–E13 reddedildi; yalnız yavaş disk R1 manual.
- **Genel kalite:** K-1…K-3, Y-2/Y-4 düzeltildi; Y-1 OS kilidi yönünden kısmi; donanım/ağ/uzun-soak maddeleri manual.

### Ayrıntılı doğrulama dökümü

Tam `npm test` çıkış 0 ve son satır “Tüm testler geçti”; backend 165/165, player 142/142, denetim regresyonu 41/41. Sabit kimliği olmayan eski satırlara uydurma yeni ID verilmedi; bu raporun kendi aralıkları kanonik bırakıldı. Ayrıntılı bulgu/düzeltme/ret/manual matrisi: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.

## AKIŞ, CANLI ALTYAZI VE ARAŞTIRMA ARAÇLARI EK DOĞRULAMASI — 2026-09-12

### Bulgu yanındaki güncel karar

1. **Gerçekçi yerel HLS/DASH senaryoları — UYGULANDI.** Yerel HTTP fixture; eksik
   segment (404), geciken yanıt, sıra dışı gelen segment, seek-benzeri aynı başlangıçlı
   hipotez, HLS discontinuity ve DASH SegmentList akışını gerçek `fetch` üzerinden sınar.
2. **dash.js içerik/kaynak türüne duyarlı cue birleştirme — UYGULANDI (uyarlanmış
   kural).** Aynı metin yalnız konuşmacı, caption modu, bölge, hizalama, yazım yönü ve
   discontinuity sunumu uyumluysa birleştirilir. Interval ağacı alınmadı; ölçülen veri
   boyutunda doğrusal son-cue hızlı yolu yeterlidir.
3. **hls.js segment sınırı/discontinuity yaklaşımı — UYGULANDI.** Playlistte zaten
   hesaplanan `sequence` ve `discontinuity` artık her cue'ya taşınır; reklam/bölüm
   geçişinin iki yanındaki aynı anons yanlışlıkla tek cue olmaz.
4. **Shaka büyüyen altyazı modeli — UYGULANDI.** Aynı başlangıçlı daha uzun hipotez
   öncekinin yerini alır; gecikmiş kısa prefix yanıtı yeni uzun metni geriye götüremez;
   prefix olmayan gerçek düzeltme kabul edilir. Mevcut 650 ms kararlılık kapısı korunur.
5. **Sınır odaklı zamanlayıcı / kare zamanlaması — UYGULANDI.** Sürekli rVFC döngüsü
   kaldırıldı. Bir sonraki cue başlangıç/bitişi hesaplanır, sınırda tek rVFC çalışır;
   seek, hız ve canlı cue yenilemesi zamanlayıcıyı geçersizleştirir.
6. **Servis bazlı uyumluluk ve hata matrisi — UYGULANDI/GENİŞLETİLDİ.** Mevcut 96
   pozitif ve 18 negatif oynatma fixture'ına ek olarak kaynak→gönderilen cümle→başarılı
   yanıt→çıktı/eksik cue bütünlük özeti tanıya bağlandı.
7. **Uzun oturum ve kaynak sızıntısı — DOĞRULANDI.** Gerçek Electron, geçici kullanıcı
   profili, yerel HTTP sayfası ve altyazı yakalama ile 10 ısınma + 200 ölçüm çevrimi
   çalıştı; 200/200 yakalama ve bütün kaynak bütçelerinde `GEÇTİ` sonucu alındı.
8. **Ghostery engelleme kuralı tanısı — UYGULANDI.** Engellenen texttrack/manifest
   benzeri istek, sorgu ve kimlik bilgileri temizlenerek filtre kuralıyla tanı akışına
   yazılır. Son kayıtlar 30 öğeyle sınırlıdır.
9. **Hypothes.is tarzı bulanık alıntı eşleme — UYGULANDI.** Tam eşleşme yoksa blok,
   DOM yolu ve prefix/suffix bağlamıyla sınırlı edit-distance aranır; eşik 0,78 ve yakın
   iki adayda güven farkı yetersizse sonuç `ambiguous` kalır.
10. **Beaker normal kapanış/çökme ayrımı — UYGULANDI.** Oturum şeması v8; çalışırken
    `cleanExit=false`, düzenli kapanışta `true`. Yalnız önceki kayıt gerçekten yarım
    kaldıysa kurtarma uyarısı gösterilir; eski v7 kayıtları çökme diye yorumlanmaz.
11. **TWP metin gruplama/terminoloji — GÜNCEL KODDA MEVCUT, EK YENİDEN YAZIM
    REDDEDİLDİ.** TreeWalker tabanlı blok toplama, parçalı inline metin birleştirme,
    kilitli sözlük ve öğrenilen terminologyVersion akışı mevcut testlerle doğrulandı.
12. **Firefox Translations DOM birleştirme/eski yanıt reddi — GÜNCEL KODDA MEVCUT.**
    MutationObserver artımlı tarama ve sekme generation/oturum kimliği kontrolleri geç
    yanıtın yeni sayfaya uygulanmasını reddediyor; bağımsız yeniden yazım yapılmadı.
13. **Kaydırma konumunu içerikle sabitleme — GÜNCEL KODDA MEVCUT.** Uygulama öncesi
    görünür metin ankrajı/scroll konumu alınarak DOM değişiminden sonra geri kuruluyor;
    zor fixture testleri mevcut sayfa-çeviri paketinde geçiyor.
14. **Mozilla Readability karşılaştırması — UYGULANDI (ölçümlü yerel prototip).** Okuma
    görünümü artık `article/main/[role=main]/body` adaylarını paragraf yoğunluğu, bağlantı
    gürültüsü ve metin uzunluğuyla puanlıyor. En iyi aday yerel kökten en az %15 üstünse
    seçiliyor; aksi durumda mevcut native aday korunuyor. Seçim ve aday puanları
    `readerComparison` tanısında görünür. Harici kütüphane varsayılan yapılmadı.
15. **MHTML sayfa arşivleme — UYGULANDI.** “Sayfayı arşivle” eylemi etkin sekmeyi
    Electron `savePage(..., 'MHTML')` ile kullanıcı seçtiği `.mhtml/.mht` dosyasına
    kaydeder; mevcut PNG ekran görüntüsü ve çeviri Markdown arşivinden ayrıdır.
16. **Mokuro OCR–çeviri–görünüm ayrımı — UYGULANDI.** Dil-özel görsel çeviri
    önbelleğinin yanına hedef dil ve sözlükten bağımsız OCR önbelleği eklendi. İlk görsel
    çözümleme kutu/okuma sırası/kaynak metni OCR katmanına yazar; başka hedef dilde aynı
    görsel bu katmandan metin çeviri yoluna gönderilir ve görsel yeniden OCR yapılmaz.
    Metin endpointi desteklenmiyorsa mevcut görsel yoluna güvenli geri dönüş korunur.
    Eski dil-özel kayıtlar okunduklarında OCR katmanına taşınır; görünüm/düzenleme katmanı
    mevcut `mangaOverlayScript` ve sayfa bölge durumunda ayrı kalır.
17. **Manga sığdırma/okuma sırası — GÜNCEL KODDA MEVCUT.** Dikey yazı, bubble/text
    kutusu, font küçültme, kontrollü kutu genişletme ve DOM/reader-score sırası 91 manga
    testiyle korunuyor. Gerçek sayfa görsel korpusu ayrıca manuel görsel kalite işidir.
18. **Gelişmiş TTML/IMSC — UYGULANDI.** `region`, `origin`, `extent`, `textAlign`,
    `displayAlign` ve `writingMode` stil/region referanslarından çözülüp cue metadata'sına
    taşınır; farklı bölgelerdeki eş metinler korunur.
19. **Playwright uçtan uca — ARAÇ OLARAK AÇIK.** Mevcut Electron köprü smoke ve gerçek
    yerel HTTP fixture'ları davranışı kapsıyor. Somut olarak bu düzeneklerin üretemediği
    bir senaryo belirlenmeden yeni bağımlılık eklemek test kanıtını artırmayacağı için bu
    turda alınmadı.

### Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

- **Eksik çeviri görünürlüğü:** Önceden scheduler sonucu vardı fakat kaynak cue,
  gönderilen/tamamlanan cümle ve dosya/overlay çıktısı tek invariantta görünmüyordu.
  `browser-translation-integrity` özeti eklendi; tanı paneli ve dışa aktarılan tanı
  `sourceCues`, `submittedSentences`, `completedSentences`, `failedSentences`,
  `translatedCues` ve `missingCues` alanlarını taşır.
- **Yanlış cue silme:** Birleştirme yalnız metin/zamana bakıyordu. Konuşmacı, caption
  modu, IMSC sunumu ve HLS epoch'u uyumluluk anahtarına eklendi. Gecikmiş kısa canlı
  prefix ayrı olarak reddedildi; prefix olmayan düzeltmeler bilerek korunur.
- **İşlemci yenileme maliyeti:** Overlay oynayan videoda her rVFC'de yeniden cue
  arıyordu. Cue-sınırı zamanlayıcısı seçildi; video.js tarzı ikinci paralel zamanlayıcı
  eklenmedi. Yeni state, seek ve ratechange eski beklemeyi iptal eder.
- **Tanı kör noktası:** Ghostery sayacı hangi isteğin neden kesildiğini söylemiyordu.
  Güvenli URL ve filtre özeti eklendi; token/query/credential dışarı verilmez ve bellek
  listesi sınırlıdır.
- **Arşiv farkı:** Var olan sayfa çeviri arşivi kaynak/çeviri JSON+Markdown, ekran
  görüntüsü yalnız PNG idi. Tam sayfa kaynağını saklamadıkları doğrulandı; MHTML ayrı
  kullanıcı eylemi olarak eklendi.
- **Readability karşılaştırması:** Native `article/main/body` seçimi bazı sayfalarda
  kısa bir `article` kabuğuna takılabilirdi. Aday puanlama ve %15 üstünlük kapısı eklendi;
  sonuç `extractor` ve `readerComparison` alanlarıyla ölçülebilir. `browser-nine-features`
  testinde belirgin üstün aday seçiliyor, marj yoksa native aday korunuyor.
- **Gerçek SRT örneği — kaynak yankısı:** `4 Dr_g Mules...srt` ve `.tr.srt` üzerinde
  290/290 cue, kimlik ve zaman damgası eşleşti; ancak 27 hedef cue kaynak İngilizcesiyle
  birebir kaldı. Kök neden, mevcut metadata kaydı `completed` dediğinde kaynak yankısının
  tekrar kalite kapısından geçirilmemesiydi. Metadata yoluna da
  `not translation_is_source_echo(entry[2], old[2])` koşulu eklendi; bu cue’lar artık
  yeniden çeviriye gönderiliyor. SRT dosyaları değiştirilmedi; yeni regresyon testiyle
  backend 165/165 geçti.
- **Ret/açık gerekçeleri:** Playwright somut kapsama boşluğu için eklenecek. Readability
  karşılaştırması ölçümlü yerel prototiple kapatıldı; harici kütüphane bağımlılığı,
  gerçek içerik korpusu olmadan varsayılan yapılmadı. Manga OCR ayrımı gerçek eksik kabul
  edilip iki katmanlı önbellek ve metin çeviri geri kullanımıyla kapatıldı. Lisansı
  belirsiz kod kopyalanmadı; davranışlar projeye özgü, sınırlandırılmış uygulamayla yazıldı.
- **Doğrulama:** Nihai `npm test` çıkış 0 ve son satır `Tüm testler geçti` verdi;
  backend 165/165 geçti. Son eklemeler için `browser-subtitles` 74/74, `browser-stream-fixtures`,
  `browser-overlay-controller` 13/13, `browser-manga` 91/91,
  `browser-page-archive`, `browser-adblock`, `browser-foundation`,
  `browser-library-tools` 16/16 ve `browser-translation-integrity` hedefli testleri
  geçti. Electron trusted-bridge smoke testi ve Python `py_compile` geçti;
  `src/main.js`, `preload.js`, renderer ve değişen modüllerde `node --check`, tüm
  çalışma ağacında `git diff --check` çıkış 0 verdi.
- **200 çevrim soak kanıtı:** Yakalama başarı oranı 1,00 (alt sınır 0,98); listener,
  main timer, renderer timer ve GPU process farkları 0. Main heap farkı 3.464.516 bayt,
  renderer heap farkı 187.640 bayt, browser heap farkı 59.812 bayt; renderer/browser
  heap eğimleri 888,072/393,768 bayt-çevrim ile 49.152 sınırının altında kaldı. Geçici
  altyazı dosyası 64/64 LRU sınırında, disk yazımı çevrim başına 6,995/10 kaldı.

### Anlam öncelikli çeviri — ek doğrulama

- **Bulgu:** Cümle grubu sınırı nokta görüldüğünde kesinleşiyordu; üç nokta veya
  bağlaçla biten cue'lar (`I thought…`, `because.`) sonraki cue'dan kopabildiğinde
  model özne/nesne ilişkisini eksik görüyordu.
- **Düzeltme:** Backend ve tarayıcı aynı `SENTENCE_PROTOCOL_VERSION=2` altında
  devamlılık sezgisi kullanıyor. Üç nokta, virgül/noktalı virgül ve yaygın
  bağlaç/edat sonları sonraki cue gelene kadar grubu açık tutuyor; konuşmacı,
  zaman boşluğu, maksimum süre/karakter ve korumalı SDH sınırları aynen korunuyor.
- **Bulgu:** JSON yapısı doğru olsa da sayı veya olumsuzluk düşebiliyordu; bu durum
  daha önce kaynak yankısı/boşluk/zaman denetimlerinden kaçabiliyordu.
- **Düzeltme:** `translation_meaning_issues` sayı dizilerini ve kaynak olumsuzluğunu
  muhafazakâr biçimde denetliyor. Hatalı grup cache'e yazılmıyor, ilk geçişte kabul
  edilmiyor, ikinci geçişte birinci geçişin üstüne yazamıyor; tarayıcı scheduler da
  aynı yanıtı ekrana almadan sınırlı yeniden denemeye bırakıyor. Kaynak ve hedef cue
  sınırları yine değiştirilmiyor.
- **Bağlam:** Tarayıcı cümle isteğinde bağlam satırları yalnız kaynak metni olarak
  kalıyor; konuşmacı etiketi dışarı sızmıyor, yalnız anonim `speaker_present` bilgisi
  taşınıyor. Backend tarafında mevcut konuşmacı etiketi ve otomatik sözlük bağlamı
  gruplu promptta korunuyor. Böylece kişi/zamir kararı için bağlam var, kullanıcı
  verisi niteliğindeki etiketler tarayıcı payloadına gereksiz taşınmıyor.
- **Ret gerekçesi:** Ek bir “sahne özeti” LLM çağrısı eklenmedi; maliyet ve gecikme
  karşılığında ölçülebilir kazanım göstermeden ikinci bir üretim katmanı olurdu.
  Bunun yerine mevcut komşu bağlam, konuşmacı sınırı, terim sürümü ve grup cache
  anahtarı birlikte kullanıldı.
- **Doğrulama dökümü:** Backend `163 geçti, 0 başarısız`; yeni testler sayı/olumsuzluk
  kapısını ve üç nokta/bağlaç devamlılığını doğrudan sınadı. `subtitle-sentence-layout`,
  `browser-workflow-core` ve `browser-translation-refresh` hedefli testleri geçti.
  Tam `npm test` koşusunda yalnız raporun tarihsel test toplamı dışındaki tüm paketler
  yeşil. Güncel tam `npm test` koşusu çıkış 0 ve son satır `Tüm testler geçti` verdi;
  ayrıca `npm run test:electron-bridge`, Python `py_compile`, Node `--check` ve
  `git diff --check` de çıkış 0 verdi.

### Hazır altyazının aşamalı Whisper çıktısıyla ezilmesi — doğrulandı ve düzeltildi

- **Ayrıntılı bulgu:** Kullanıcının olay dökümünde 08:56:57'de hazır `.tr.srt`
  başarıyla `179 blok` olarak yüklendi. Üçüncü aşamanın 08:57:00'daki son 0–6
  saniyelik backend `done` olayı aynı kanonik `.srt` ve `.tr.srt` yollarına birer
  blok yazdı. Güncel iki dosyanın da yalnız bir cue içermesi bu olay sırasını disk
  düzeyinde doğruladı. `finishProgressiveJob` ise seçili altyazı yolunun değiştiğini
  görünce birleşik 307 civarı canlı cue'yu yazmadan dönüyordu. Böylece sorun dosya
  yükleyicide değil, ara aşamaların ortak çıktı adını kullanması ve seçim değişince
  son birleştirmenin atlanmasıydı.
- **Düzeltme:** Her aşamalı oynatıcı işi artık doğrulanan benzersiz
  `-whisper-<iş-kimliği>` son ekli dosyalara yazar; aynı başlıklı hazır dosyaya
  dokunmaz. Renderer → main → Python argüman zincirinde kimlik iki tarafta da dar
  regex ile doğrulanır. Kullanıcı iş sürerken başka altyazı seçse bile kaynak ve
  çeviri parçaları önce benzersiz iş dosyasına birleştirilir, seçili altyazı
  oynatıcıda korunur. Başlangıç konumu ilk 30 saniyedeyse aralık 0'dan başlatılır;
  bu olayda görülen gereksiz üçüncü 0–6 saniye aşaması oluşmaz.
- **Ek çeviri bulgusu ve düzeltmesi:** Dökümde `80` sayısının doğal Türkçe
  `seksen` karşılığı sayısal kayıp sanılarak iki kez reddediliyordu. Türkçe tam
  sayıları yazıyla koruyan çeviriler artık kabul edilir. `negation_missing` regex
  sonucu kesin kanıt olmadığı için tanıda görünmeye devam eder, fakat doğal
  Türkçe çeviriyi otomatik reddeden/cache dışına atan sert kapı olmaktan çıkarıldı.
  Sayı kaybı kesin olduğunda sert kapı korunuyor.
- **Ret gerekçeleri:** “Hazır altyazıyı yüklemek satırları sildi” iddiası
  reddedildi; yükleme günlüğü 179 bloğu doğruluyor, silinme üç saniye sonraki
  backend yazımıdır. “Bittikten sonra bütün video baştan çevrildi” de birebir doğru
  değil: 6–606, 606–1306 ve 0–6 aralıkları ayrı işlendi. Ancak her aşamada tüm
  16,51 MiB YouTube sesinin yeniden indirilmesi gerçek bir verimsizliktir; bu turda
  veri kaybına yol açan dosya çakışması giderildi, ortak indirme önbelleği ayrı bir
  performans işi olarak bırakıldı. Ezilmiş 179 bloklu dosyayı tek bloklu mevcut
  dosyadan güvenilir biçimde geri üretmek mümkün olmadığı için kullanıcı SRT'lerine
  otomatik içerik yazılmadı.
- **Doğrulama dökümü:** `browser-youtube-whisper` başlangıca yakın aralığın iki
  parçaya düştüğünü ve iş son ekinin üretildiğini sınadı. `player-ui` birleşik
  dosya yazımının seçim-değişikliği çıkışından önce olduğunu doğruladı. Backend
  `165 geçti, 0 başarısız`; tarayıcı cümle yerleşim testi `80 → seksen` kabulünü ve
  olumsuzluk sezgisinin sert ret olmadığını doğruladı. Hedefli Node/Python
  sözdizimi kontrolleri ve `git diff --check` çıkış 0 verdi. Güncel tam
  `npm test` son satırı `Tüm testler geçti`; `npm run test:electron-bridge` da
  çıkış 0 verdi.

## 2026-09-12 — 15 önerinin nihai kapanış denetimi

Bu bölüm önceki ara durumların yerine geçen güncel sonuçtur. Bulgular yalnız
kaynakta karşılığı görülen davranış, deterministik test veya bu turda çalıştırılan
soak kanıtıyla kapatıldı. Kullanıcıya ait gerçek profil, anahtar, çerez ve geçmiş
okunmadı; bütün Electron kaynak ölçümleri geçici `userData` ve yerel fixture ile
yapıldı.

### Sonuç özeti

1. **Çökme sonrası toparlanma — TAMAM.** Sekme çökme nedeni politikası, sınırlı
   yeniden yükleme, geri yükleme bileti ve yeni gezinme/sekme nesli geldiğinde eski
   sonucun reddi bağlandı. Sonsuz yeniden yükleme yok; kullanıcı kapatması çökme
   sayılmıyor.
2. **Sekme hibernasyonu — TAMAM, bilinçli olarak kullanıcı eylemli.** Boşaltmadan
   önce medya/form/taslak/aktif iş, split görünüm ve altyazı yakalama kuyruğu
   denetleniyor. Bekleyen veya doğrulanamayan cue varken işlem fail-closed reddediliyor.
   Oturum atomik yazılıyor, sonra WebContents kapanıyor. Otomatik “boşta sekme avcısı”
   eklenmedi: form ve aktif medya için gereksiz veri kaybı riski yaratacağı için
   kullanıcı tarafından başlatılan güvenli boşaltma tercih edildi. Gerçek Electron
   testinde 50/50 boşalt-uyandır çevrimi geçti.
3. **HTTP hata sınıfları ve yeniden deneme — TAMAM.** 404/401 gibi kalıcı yanıtlar
   tekrar edilmiyor; 429 ve 5xx sınırlı backoff kullanıyor; `Retry-After` üst sınırla
   uygulanıyor; timeout tekrar ediliyor, gezinme/kapanış iptali edilmiyor. İmzalı
   segmentte 403, aynı URL'yi döndürmek yerine manifest yenileme eylemi üretiyor.
   HLS metin segmentlerinde byte-range'ın retry sarmalında kaybolduğu ek hata da
   giderildi.
4. **Seek yarışı ve eski sonuç — TAMAM.** Yakalama lineage/epoch bilgisi segment,
   katman, discontinuity ve seek neslini taşıyor. Eski fetch/XHR/CDP teslimatı yeni
   gezinmeye veya seek'e uygulanmıyor; ACK/RELEASE de tab/generation bağlamını son
   kez doğruluyor.
5. **Cue provenance ve kapsama haritası — TAMAM.** Cue'lar acquisition katmanı,
   stream/segment, epoch, discontinuity, otomatik/servis-çevirisi niteliğiyle
   izleniyor. Kapsama özeti zaman aralıklarını birleştiriyor, eksik aralık ve katman
   dağılımını tanıya veriyor. URL yalnız sansürlenmiş biçimde rapora giriyor.
6. **Manifest yenilemede kısmi kaynak ve kullanıcı düzenlemesi — TAMAM.** Aynı
   lineage'da append-only cue'lar var olan kaynağı silmeden ekleniyor; yenileme
   işlemi yeni bir toplu çeviri işi başlatmıyor. Kaynak hash'i değişmemiş cue'nun
   kullanıcı düzeltmesi korunuyor; yalnız gerçekten değişen kaynak yeniden işleniyor.
7. **MP4 WebVTT (`wvtt`) ve TTML (`stpp`) — TAMAM.** `moov/trak/mdhd/hdlr`,
   `trex/tfhd/tfdt/trun/mdat` zaman ve örnek zinciri çözümleniyor. `vttc/payl`
   metni ve boş `vtte` doğru ayrılıyor; `stpp` örneğindeki TTML yerel/medya
   zamanına taşınıyor. Timescale yoksa tahminle yanlış cue üretmek yerine parça
   reddediliyor.
8. **TTML/IMSC ve CEA-608/708 — KISMİ UYGULAMA + TEKNİK RET.** TTML style/region
   zinciri, kalıtım, writingMode ve bölgeye duyarlı cue birleştirme tamam. HLS
   manifestindeki `CLOSED-CAPTIONS`, `INSTREAM-ID=CC1..CC4/SERVICE*` algılanıp
   “desteklenmiyor” tanısı veriliyor. Sıfırdan CEA-608/708 video elementary-stream
   decoder'ı eklenmedi: mevcut yakalama hattı metin/manifest altyazısı işliyor;
   MPEG video bit akışına decoder, field/channel state machine ve kapsamlı yayın
   fixture'ı eklemek ölçütsüz ve yüksek regresyonlu olurdu. Sessizce altyazı yok
   demek yerine kesin tanı ve Whisper alternatifi sunuluyor.
9. **YouTube JSON3/SRV3 ve kaynak niteliği — TAMAM.** JSON3 event/segment yapısı,
   XML/SRV3 metni ve zamanları mevcut ortak parser yolunda çözülüyor. URL/body
   metadata'sından otomatik altyazı, YouTube tarafından çevrilmiş iz ve sunulan
   çeviri dilleri çıkarılıyor; bu bilgi track, cue provenance ve kalıcı asset
   kaydına taşınıyor. Kullanıcı izini servis çevirisiyle sessizce değiştiren bir
   “her zaman translated track seç” kuralı eklenmedi.
10. **Dinamik DOM çevirisi ve eski yanıt — TAMAM.** `childList` yanında
    `characterData` değişiklikleri de yakalanıyor. Her bölüm kaynak hash'i ve iş
    nesliyle bağlı; geç yanıt yeni metne uygulanmıyor. Atomik bölüm çıktısı başarısız
    parçayı kaynak metinle koruyor.
11. **Site bazlı çeviri terminolojisi — TAMAM.** Origin/path kapsamlı profil ile
    kalıcı terim listesi birbirinden ayrıldı; değerler sınırlandırılıp normalize
    ediliyor. İş başladığında ayarlar donduruluyor ve cache anahtarına terim sürümü
    giriyor; başka siteye sızmıyor.
12. **Bulanık alıntı sabitleme — TAMAM.** Exact quote'a prefix/suffix bağlamı,
    text-position, DOM/range konumu ve güven eşikli fuzzy yedek eklendi. Yakın iki
    aday birbirine benziyorsa yanlış kesin sonuç vermek yerine belirsiz dönüyor.
13. **Ghostery/reklam engelleme tanısı — TAMAM.** Genel ayarın yanında siteye özel
    açık `false` değeri korunuyor. Engellenen istekte kategori/kural ve sansürlü
    URL tutuluyor; token, kullanıcı bilgisi, query ve fragment günlük/tanı dışı.
14. **Manga OCR sonucu–çeviri ayrımı ve yerleşim — TAMAM; yerel GPU boşaltma RET.**
    OCR provenance'ı ve normalize metni çeviri/yerleşimden ayrı asset kaydına
    yazılıyor; hedef dil değişince aynı görsel tekrar OCR edilmeden çevrilebiliyor.
    Okuma sırası, uzun Türkçe metin için sığdırma ve dikey yazı testleri korunuyor.
    Manga yolu Electron'dan uzak HTTP modeline istek gönderiyor ve yerel PyTorch
    modeli yüklemiyor; bu nedenle burada sahte bir CUDA `empty_cache` çağrısı
    eklenmedi. Yerel Whisper/pyannote GPU temizliği backend'de zaten ayrı yaşam
    döngüsünde.
15. **Gerçekçi uçtan uca fixture ve Playwright kararı — TAMAM + BAĞIMLILIK RET.**
    Yerel sunucu eksik/geciken/yarım segment, yanlış MIME, byte-range, seek,
    discontinuity, imza yenileme ve DASH eksik segment senaryolarını yürütüyor.
    Mevcut gerçek Electron smoke testleri WebContents, isolated world ve IPC
    köprüsünü doğrudan çalıştırdığı için şu anda yalnız Playwright'ın yakalayacağı
    somut bir hata yolu kalmadı. Sırf araç çeşitliliği için yeni bağımlılık
    eklenmedi; ileride Electron testinin ifade edemediği somut çok-pencere veya
    kullanıcı etkileşimi vakası çıkarsa karar yeniden açılacak.

### Ek bulgular ve yapılan düzeltmeler

- **Tek URL sansürleme kapısı:** Provenance, kapsama, adblock ve dışa aktarılan tanı
  aynı güvenli URL biçimini kullanıyor. `sig`, `token`, `X-Goog-*`, credential,
  query ve fragment çıktıya taşınmıyor; işleme için gereken ham imzalı URL yalnız
  bellek içindeki ağ yolunda korunuyor.
- **Tek tık tekrar üretilebilir hata paketi:** Acquisition plan aşamaları, servis
  sınıfı, hata kodları, kapsama aralıkları, cue sayıları ve ilk 2 KiB ile sınırlı
  sansürlenmiş manifest özeti dışa aktarılıyor. Altyazı metni ve kullanıcı verisi
  pakete eklenmiyor.
- **Kalıcı şema envanteri:** 23 kalıcı şema tek envanter testinde dosya, sürüm ve
  migration testiyle eşleştirildi. Yeni şema veya sürüm değişikliği, envanter ve
  migration kanıtı birlikte güncellenmezse test kırılıyor.
- **Parser fuzz genişletmesi:** MP4 kutu boyu, yarım `mdat`, bilinmeyen `vttc`
  alt kutusu, geri giden `tfdt`, bozuk `trun` ve TTML/VTT/SRT sınırları dâhil
  54.024 vaka çalışıyor; 40.000 differential karşılaştırma var. Sayı koruma kapısı
  için nokta/virgül ondalık yazımı property testi eklendi.
- **Anlam kapısı gölge ölçümü:** Kesin sayı kaybı sert ret olarak kalıyor;
  olumsuzluk sezgisi advisory ölçülüyor. Rapor `evaluated`, gölge-ret sayısı/oranı,
  kesin sayı uyuşmazlığı oranı ve indeksleri ayrı veriyor; doğal `80 → seksen`
  dönüşümü yanlış pozitif olmuyor.
- **Soak CPU/overlay ölçümü:** Ortalama/azami overlay render süresi ve cue-sınırı
  callback sayısı bütçeye bağlandı. Bellek, heap, GPU, timer, dinleyici, disk,
  geçici altyazı LRU ve hibernasyon başarısı aynı raporda.
- **Soak ölçüm hatası:** İlk 50 hibernasyon koşusunda işlev 50/50 başarılı olduğu
  hâlde listener farkı +217 görünüyordu. Sayaç, `replaceChildren` ile DOM'dan
  çıkarılmış düğümleri yaşamaya devam eden dinleyici sayıyordu. WeakRef ve
  bağlı-DOM denetimi eklendi. Kalan +16'nın 15 site-izin select'i ile bir favicon
  dinleyicisinin ilk tembel kurulumu olduğu tür dökümüyle kanıtlandı. Başlangıç
  örneğinden önce tek ölçüm-dışı hibernasyonla yüzey hazırlandı; eşdeğer durumların
  karşılaştırıldığı nihai koşuda fark 0 oldu. Bu düzeltme yalnız eşiği gevşetmedi,
  ölçümün hem sahte pozitifini hem hedef/callback'i hayatta tutma riskini giderdi.

### Nihai doğrulama dökümü

- `npm test`: **çıkış 0**, son satır **“Tüm testler geçti”**.
- Python backend: **167 geçti, 0 başarısız**.
- Parser fuzz: **54.024 vaka**, **40.000 differential**; yaklaşık 390 ms,
  en yavaş vaka 1,921 ms, tepe heap büyümesi 7,8 MiB.
- `npm run test:electron-bridge`: **çıkış 0**; isolated world 999
  page-action/page-blocks geçti, bilinmeyen tip reddedildi.
- Tam kaynak soak: **200/200 yakalama**, **50/50 hibernasyon**, karar **GEÇTİ**.
  Listener farkı 0; main ve renderer timer farkı 0; GPU process farkı 0.
  Renderer heap farkı 876.864 bayt, eğim 2.721,676 bayt/çevrim
  (bütçe 49.152). Browser heap farkı -23.888 bayt, eğim 22,502
  bayt/çevrim. Overlay ortalama/azami render 0,10/0,10 ms
  (bütçe 8/50 ms). Disk yazımı 7,245 işlem/çevrim (bütçe 10);
  Places ve watch-library okumaları 1,0/1,0 (bütçe 1,1).
- `python -m py_compile backend/transcribe.py`, `node --check` (main, preload,
  renderer, resource soak probe ve altyazı parserı) ve `git diff --check`:
  **çıkış 0**. Diff kontrolündeki LF→CRLF mesajları hata değil, Git çalışma
  ağacı satır-sonu uyarısıdır.

### Kapanış kararı

On beş maddenin on ikisi tam uygulama, üçü kapsamı açıkça sınırlandırılmış teknik
kararla kapandı: CEA-608/708 için decoder yerine tespit+tanı, hibernasyonda otomatik
idle eviction yerine güvenli kullanıcı eylemi, Playwright için somut kapsama açığı
oluşana dek bağımlılık reddi. Bunlar “unutulmuş yarım iş” değil; kullanıcı etkisi,
mevcut mimari ve doğrulama maliyeti yazılı ret kararıdır. Bu bölümde doğrulanmadan
“tamam” sayılan madde yoktur.

### Gerçek kabul ve sürümleme eki

- Gerçek Electron altyazı yakalama testi artık yalnız ekranda cue görmeyi değil,
  tanı JSON'unu gerçekten diske yazmayı da denetliyor. Yakalanan altyazı metni ve
  imzalı URL'deki sentetik token dosyada bulunmadı.
- Üç gerçek SRT çifti kalıcı kalite korpusuna alındı. S10E11 486/288 cue ve 421
  kesin engel; S13E04 290/290 cue ve 24 kaynak yankısı; S01E13 1/1 cue ve iki
  minimum-kapsam engeli verdi. Dosyalar değiştirilmedi.
- Sert anlam kapısı 15 bilinen iyi ve 16 beklenen düzeltilmiş altın örnekte %0
  yanlış ret verdi. Korpus yalnız sorunlu örneklerden oluşmuyor.
- Altı tematik kod/test commit'i oluşturuldu: `3944261`, `3fedf25`, `72485dd`,
  `bb3c5cf`, `69f5782`, `4c1ae05`. Push ve tag dış etki oluşturduğu için açık
  kullanıcı talebi olmadan çalıştırılmadı.
- Akış bazında beklenen/gözlenen sonuçlar, ret gerekçeleri ve komut dökümü
  `BROWSER-GERCEK-KABUL-KANITI-2026-09-12.md` dosyasındadır.
