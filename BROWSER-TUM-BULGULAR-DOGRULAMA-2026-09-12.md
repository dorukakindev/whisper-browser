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

Tam `npm test` çıkış 0 ve son satır “Tüm testler geçti”; backend 162/162, player 142/142, denetim regresyonu 41/41. Sabit kimliği olmayan eski satırlara uydurma yeni ID verilmedi; bu raporun kendi aralıkları kanonik bırakıldı. Ayrıntılı bulgu/düzeltme/ret/manual matrisi: `AUDIT-KAPANIS-MATRISI-2026-09-12.md`.

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
  backend 163/163 geçti.
- **Ret/açık gerekçeleri:** Playwright somut kapsama boşluğu için eklenecek. Readability
  karşılaştırması ölçümlü yerel prototiple kapatıldı; harici kütüphane bağımlılığı,
  gerçek içerik korpusu olmadan varsayılan yapılmadı. Manga OCR ayrımı gerçek eksik kabul
  edilip iki katmanlı önbellek ve metin çeviri geri kullanımıyla kapatıldı. Lisansı
  belirsiz kod kopyalanmadı; davranışlar projeye özgü, sınırlandırılmış uygulamayla yazıldı.
- **Doğrulama:** Nihai `npm test` çıkış 0 ve son satır `Tüm testler geçti` verdi;
  backend 162/162 geçti. Son eklemeler için `browser-subtitles` 74/74, `browser-stream-fixtures`,
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
