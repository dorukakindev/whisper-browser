# Bekleyen işler

Son durum kontrolü: **2026-11-05**. Son ürün `c638d491f08d021aaf166a3bf00be68aa533e152`: asistanın gerçek zevk kanıtları ve doğrulanmış yapım açma sonucu. [Güncel teslim](docs/devir/2026-11-05-1337.md). Onaylı ortak Sahne tasarımı korunur.

**Yeni sohbet başlangıcı:** P025 [PR #842](https://github.com/dorukakindev/whisper-browser/pull/842) ile master'a alındı; doğrulanmış ürün başlangıcı `7bf15f3c2876a5465b0c7f59fff3a037b41aeb69`. Sonraki belge commitleri ürün değişikliği değildir; çalışmadan önce gerçek HEAD/remote ve kişisel farkları yeniden kontrol et. Mevcut görevlerden yarım bırakılmış yeni ürün işi yok; aşağıdaki koşullu/ertelenmiş işler korunur.

Tamamlanmış teslimler açık iş değildir. Eski raporların veya doğrulanmamış kullanım sınırlarının varlığı tek başına ürün hatası sayılmaz. Ayrıntılı geçmiş [devir indeksinde](DEVIR-NOTU.md) korunur.

## İstenen iki canlı kabul — 2026-11-05 13:58

- **Dal/kanıt:** codex/live-assistant-subtitles-20261105; [devir](docs/devir/2026-11-05-1358.md). Ürün HEAD 74ea1ebe704561b284e43df10032a41d4aafb0a7; ürün kodu değişmedi.
- **Asistan:** gerçek yapılandırılmış model test kataloğundan gerekçeli/karşı kanıtlı öneri üretti; modelin detay açma ve planned kartları mevcut inceleme/onay arayüzünden test betiğiyle uygulandı. Gerçek depoda planned ve değişmeyen null tepki okundu; kişisel zevk verisi kullanılmadı.
- **Browser kabulü tamamlandı:** [Gerçek sahne deviri](docs/devir/2026-11-05-1408.md). Resmî Blender tam Sintel videosunda İngilizce 26/Türkçe 29 satırdan eşleşen ilk iki replik, gerçek LG Browser video overlay'inde kontrol edildi. İki dil birlikte göründü; primary +2 sn ile İngilizce gecikti ve Türkçe sabit kaldı; secondary -2 sn ile Türkçe sonraki repliğe geçerken İngilizce ilk replikte kaldı. Yaklaşık 11 sn oynatma, gerçek decode kareleri ve üç görüntü, izin denemesi 0. İlk Türkçe aday 30 sn farklı sürümdü; eşleşen üçüncü aday seçildi. Ürün kodu değişmedi.
- **Sonraki adım:** bu dar kabul kapalıdır; tüm film/sağlayıcı/işletim koşulları için genel senkron garantisi değildir. P004 kalanları [site profili/fullscreen teslimiyle](docs/devir/2026-11-05-1417.md) kapandı.

## Uygulama sırası

1. **P018 — Kaynak erişimi ve kalan canlı sınırlar:** yalnız erişim sağlandığında veya somut ihtiyaçta kısa kontrol; önceki başarılı testleri topluca tekrarlama.
2. **P003 — Kütüphane:** gerçek kullanım ihtiyacında; şu an genel doğrulama kampanyası yok.
3. **P001 — Performans:** ertelendi; benchmark/CPU/matris veya eski dalı otomatik merge etme.


Bu sıra bir tam denetim veya bütün eski raporları yeniden açma planı değildir. Her seferinde tek kapsam kapatılır; yeni somut arıza önceliği değiştirebilir.

## P025 — Asistan zevk dayanakları ve öneriden işlem tamamlandı

- **Kod/dal:** `c638d491f08d021aaf166a3bf00be68aa533e152`, `codex/assistant-taste-actions-20261105`; [devir](docs/devir/2026-11-05-1337.md).
- **Uygulama:** her öneri gerekçesinde gerçek puan kaynağı ve karşıt kanıt korunur. Kabul edilmiş yorum analizi alıntıları ayrı aktarılır; eski analiz tarihsel, varsayılan öncelikler açık tercih sayılmaz. Önerilen yapım diğer bağlamlardan mevcut incelenmiş eylemle açılır; gerçek sayfa sonucu doğrulanmadan başarı bildirilmez. İzleme listesi mevcut önizleme/uygula kapısını korur; ham durum/tepki değerleri EN/TR gösterilir.
- **Kanıt:** 43 hedefli kontrol/~1,14sn, JS sözdizimi/diff; LG1440×900 izole native gerçek katalog→öneri→detay açma, kişisel kayıt önizlemesinin yazmaması ve incelenmiş yürütücünün yalnız planlanan durumu kaydetmesi. Beğeni değişmedi; izin denemesi0. Yeni modül/test dosyası yok.
- **Sınır/sonraki adım:** native kayıtlar test profiline özel kontrollü puan/metadatadır; kişisel veriler kullanılmadı. Gerçek main/preload/renderer servisleri çalıştı; yeni canlı LLM yanıtı veya AI'nin öneri kartını seçmesi/insanın karttaki Uygula tıklaması sınanmadı. Ücretli API, Spotify/DRM/GPU, ASR, matris/CPU kampanyası yapılmadı. Bu dar kapsamda yarım ürün işi yok; somut kullanım hatasında ilgili akışa dön.

## P024 — Podcast günlük kullanım zinciri tamamlandı

- **Kod/dal:** `fac20e3aea47adb8853925c630e3760b22cc71f0`, `codex/podcast-daily-workflow-20261105`; [devir](docs/devir/2026-11-05-1310.md).
- **Düzeltme:** aktif RSS/shelf podcastte “bu bölümü yazıya dök” ve “eksik çeviriyi tamamla” mevcut doğru üretim/strict retry kuyruğuna bağlanır. Kapsam/source/sohbet ve bitiş-kayıt takibi korunur. Çift dilli görünüm podcast asistan bağlamını kaybetmez; “bu ana kadar özetle” tam-transkript UI seçiliyken de watched sınırıyla, soru anında dondurulur. Gelecekteki veya zamansız konuşma bu özete kanıt olmaz.
- **Kanıt:**38hedefli kontrol/~1,5sn; JS/diff. LG1440×900 izole native7akış: kayıtlı gerçek RSS metin+çevirisini35sn/1.5×/study olarak yeniden açma; görünüm değişiminde tek owner; zamansız notun gerçek kaydı; kontrollü web VTT'de arama/takibe dön/önceki-sonraki cümle/hız/döngü; full UI'ye rağmen watched soru paketi. Yeni model/API işi ve izin denemesi0.
- **Sınır/sonraki adım:** önceki12sn Whisper/çeviri çıktıları yeniden kullanıldı; gereksiz yeni canlı sağlayıcı çağrısı yapılmadı. Yeni doğal retry komutu doğru yüzeye kontrollü regresyonda bağlandı; bu tur yeniden canlı sağlayıcı retry'ı veya gerçek AI özet kalitesi denenmedi. Spotify/DRM/GPU kabulü iddia edilmez. Bu günlük kullanım kapsamında açık ürün düzeltmesi yok; somut yeni kullanım hatasında ilgili akışa dön.

## P023 — Agentlarla medya akış denetimi tamamlandı

- **Kod/dal:** `f9a3b2f2c0904618d422fe4067c8c0e492b0fe90`, `codex/media-deep-bug-tour-20261105`; [devir](docs/devir/2026-11-05-1237.md).
- **Düzeltmeler:** oynayan Spotify medya gözlemlendiyse çift dilli toolbar yeniden kaynak diyaloğu açmaz; shelf paused seek/hız hemen kaydedilir; yorum başlangıç reddi/remount iş kilidi ve gecikmiş save'in yeni analizi silmesi önlenir; timed Transkripti çevir hedef dili dondurulmuş kuyruktan kayda taşır; publisher metni değişince eski çeviri/kapsam/notice/retry taşınmaz, güncel aynı-kaynak çevirisi korunur; readonly SRT/VTT Sahne'de ham kod yerine metin gösterir, seek yasağı sürer.
- **Kanıt:**3agent bağımsız inceleme ve çapraz review; yeni repro'lar eski kodda düştü, fixlerle geçti. Son değişen davranış grubu99test/~1,9sn, JS/diff. LG1440×900 izole native: gerçek shelf30sn/1.75× paused konum-hız store'a yazıldı; kontrollü gözlenmiş Spotify URL'si aynı web sahibinde study; kontrollü yorum başlangıç reddi retry'ı açtı ve gecikmiş save yeni sonucu silmedi. Readonly SRT sunumu son native tekrarında temizdi. İzin denemesi0; Computer Use/model/ücretli çeviri/CPU kampanyası/Actions yok.
- **Sınırlar / sonraki adım:** Spotify hesabı/DRM gerçek yayını denenmedi; native Spotify koşulu kontrollü web sahibinde test edildi. Native yorumlar kontrollü cevap/reddir, canlı AI/Letterboxd başarı iddiası değildir. Publisher descriptor değişimi ve timed translation persistence gerçek validator/DOM regresyonlarıyla; yeni live Whisper/çeviri tekrarlanmadı.6mevcut ürün+8mevcut test dosyası, yeni modül/test dosyası yok. Bu kapsamda kalan doğrulanmış ürün hatası yok; yeni somut kullanıcı arızasında ilgili yolu aç, tüm uygulamayı hatasız ilan etme.

## P022 — Kısa medya düğme turu tamamlandı

- **Kod/dal:** `fdf88ceb526d4a50919bf14dc9b5033afe48b328`, `codex/media-button-fixes-20261105`; [devir](docs/devir/2026-11-05-1201.md).
- **Düzeltme:** İşlemler panelindeki Whisper düğmeleri seçili aralığı ve ortak başlangıç kilidini atlıyordu; aynı `startTask` yoluna bağlandı. Panel/oynatma komutlarının senkron ve asenkron hataları görünür bildirilir; reddedilmiş tıklama promise'i sessiz kalmaz. Keşfet menü testinin eksik gerçek MediaVisual bağımlılığı düzeltildi; bu ürün hatası değildir.
- **Kanıt:** kısa başlangıç grubunda67geçiş ve yalnız eksik test bağımlılığından3hata; etkilenen20test ve ilgili15entegrasyon/occlusion testi sonradan geçti. Native LG1440×900 üzerinde11kontrol geçti: Browser menü/arama/indirme/kayıtlılar/panel, aynı kontrollü web medyasında çift dil↔podcast, RSS kütüphanesi/arama/Sahne/işlemler, canlı Keşfet detay ve yorum alanı girişi. Konsol hatası0, izin denemesi0.
- **Sınır/sonraki adım:** yeni ASR/ücretli çeviri veya AI yorum analizi çalıştırılmadı. Browser medya/iz testi kontrollü yerel HTML5/WebVTT, RSS kayıtlı gerçek yayıncı, Keşfet listesi/detayı canlı Cinemeta; bunlar tüm YouTube/Spotify/sitelerin garantisi değildir. Native ana pencere PNG'si alt WebContentsView video yüzeyini içermez; boş dikdörtgen video arızası kanıtı sayılmaz. Bu kapsamda yarım ürün işi yok; yeni somut hata halinde yalnız o akışa dön.

## P021 — Podcast kapsamı, eksik çeviri ve kanıt erişimi tamamlandı

- **Kod/dal:** `64f273eebcf3d2ae55fffade263ca65c3288d2a5`, `codex/podcast-range-recovery-20261105`; [devir](docs/devir/2026-11-05-1140.md).
- **Uygulama:** ortak Sahne’de tam bölüm/seçili aralık ve gerçek süre özeti; mevcut Whisper kuyruğu ile kaynak zamanlarını koruyan işlem. Asistan karma saniye/dakika aralıklarını tanır. Doğrulanmış kısmi SRT çevirisinde başarılı satırlar korunup yalnız eksikler mevcut sağlayıcıyla tamamlanır. Kütüphaneden bölüme bağlı pasaj/sözcük/notlar açılır; sayfa yenilenmesi açık notları kapatmaz. Zevk kanıtında günlük/kütüphane/model ayrımı ve mevcut düzeltme girişleri görünür.
- **Kanıt:**108 hedefli JS kontrolü/~3,3sn,3 Python testi/~0,15sn, JS sözdizimi/diff. LG1440×900 ve1000×800; asistanın doğal komutuyla gerçek30–42sn CUDA Whisper + çeviri4+4cue. Sonuçtan kontrollü eksiltilen yalnız1satır canlı sağlayıcıyla tamamlandı; diğer3satır ve zamanları değişmedi. UI tekrarında yeni model işi yok, nottan mevcut bölüme dönüş geçti, izin penceresi denemesi0.
- **Sınır:** eski metadata'sız/forSpeech kısmi çeviriler güvenli tek-satır yeniden denemeye uygun sayılmaz; düğme gerekçeyle kapalıdır, sessiz tam-çeviri yok. Seçili aralık yalnız Whisper/Whisper+çeviri içindir. Görüntü ve kaynak zamanı kanıtlanmamış RSS sonuçları salt okunur kalır. Dolu zevk profili kanıtları DOM testleriyle; native gerçek boş profil ve düzeltme girişiyle doğrulandı. Spotify/DRM/yeni hesap veya bütün sağlayıcılar yeniden test edilmedi.
- **Sonraki adım:** bu kapsamda yarım ürün işi yok; yeni somut kullanım sorunu bildirilmedikçe geniş test/performans kampanyası açma. P020'nin eski aralık eksikliği bu teslimle kapanmıştır; geçmişteki test sınırı ihlali kaydı silinmedi.

## P020 — Podcast okuma, asistan ve kaynak bağlı notlar tamamlandı

- **Kod/dal:** `53d1c9c83c79810a20bdfeda20ba7936e727fc90`, `codex/podcast-reading-workflow-20261105`; [devir](docs/devir/2026-11-05-1040.md).
- **Uygulama:** zamansız tam metin mevcut çeviri sağlayıcısıyla ayrı, salt okunur çeviri olarak kaydedilir; kaynak/çeviri yeniden açılır. Asistan gerçek iş kimliğini ve kalıcı sonucu bekler; Türkçe “yazıya dök” komutu, durdurma ve geç sonuç sınırları korunur. Seçili cümle/sözcük ve not mevcut araştırma defterine, kaynak kimliğiyle kaydedilir; zamansız nota sahte zaman verilmez.
- **Kanıt:** son hedefli grup77test/~3sn; ilgili feed/shelf regresyonları, JS/diff. LG1440×900 ve1000×800, gerçek sağlayıcıyla196karakter metin çevirisi; son güvenli30–42sn CUDA small + çeviri4+4cue, asistanın bitişi beklemesi ve yeniden açmada yeni iş olmaması. İzin denemesi0. Son12sn aralığı test main IPC korumasıyla sabitlendi; ürünün podcast aralık desteği iddiası değildir.
- **Sınır:** ilk canlı testte UI aralığı tam-bölüm işlemi tarafından temizlendi,15dk bölüm işlendi ve çeviri kısmi kaldı; kullanıcının3–4dk test sınırı aşıldı. Hata gizlenmedi, uzun deneme tekrarlanmadı; son kontrol12sn ile sınırlandı. Spotify hesabı/DRM ve tüm sağlayıcılar yeniden doğrulanmadı. Ayrıntı devirde.
- **Devam:** bu kapsamda yarım ürün işi yok; yeni toplu test/performans kampanyası başlatma.

## P019 — Tam v2 entegrasyonu tamamlandı

- **Durum:** kullanıcının doğrudan uygulama talimatıyla tam `files (6).zip` v2 kompozisyonları mevcut sahipler üzerinden entegre edildi; ara ZIP ve örnek veriler alınmadı. Ortak aktif Podcast/Çift dilli görünüm ve asistanın mevcut davranışı korunur; bunları yeniden tasarlamak bu teslimin şartı değildir.
- **Dal / kod:** `codex/claude-v2-native-integration-20261105`, ürün `e174602e05bea8df96bc12ebb3a616e1461f5920`. [Devir](docs/devir/2026-11-05-0904.md).
- **Kanıt:** değişen davranışlara kısa Node/DOM regresyonları; LG ikinci monitörde izole Windows sayfaları, canlı Cinemeta detay/listesi, kayıtlı yayıncı RSS'i. Son yerleşim düzeltmeleri monitör kullanılmadan Electron offscreen render ve RSS → mevcut kuyruk → ortak çift dilli görünüm ile doğrulandı. İzin denemesi ve konsol hatası 0.
- **Görsel sınır:** ilk v2 turunun sonunda LG ayrılmıştı. [2026-11-05-0950 kalite turunda](docs/devir/2026-11-05-0950.md) podcast geniş/dar ve RSS ortak çift dilli görünüm yeniden ikinci LG üzerinde doğrulandı. Dolu yorum/analiz ve dolu ağın native görseli bu kısa turda alınmadı; DOM/kalıcılık testleri native estetik kanıtı sayılmaz.
- **Tam sonraki adım:** ürün için yeni toplu test veya yeniden tasarım işi yok. LG erişilebilir olduğunda somut bir görünüm sorunu bildirilirse yalnız ilgili sayfayı kısaca kontrol et. Model/GPU/Spotify canlı ASR bu tasarım tesliminde yeniden sınanmadı; önceki canlı başarı veya sınırlar değişmiş sayılmaz.

## Birleşik Podcast/Çift dilli görünüm — 08:20

- **Tamamlanan ürün:** `152389cdcc1725e0afd989a046e2e49157dee93e`, dal `codex/unified-browser-study-20261105`; [devir](docs/devir/2026-11-05-0820.md). Browser, ana sayfa, RSS/shelf ve yerel girişler tek browser temelli kompozisyonu kullanır; oynatma/işlem sahipleri korunur. Ayrı podcast deck'i kaldırıldı, ileri araç düğümleri korunur; 1.75 hız sonraki bölüme taşınır.
- **Kanıt:** 35 hedefli test + iki browser betiği; izole Windows RSS/yerel/kontrollü browser ve geniş/dar kontrol; son koşularda konsol hatası/izin denemesi 0. Gerçek model/Spotify/mpv bu tur yeniden sınanmadı.
- **Devam:** P019 tasarım geliştirmeleri aynı ortak bileşen üzerinde yapılacak; ayrı kaynak tasarımı yeniden kurulmayacak. Önceki paketin aktif ekran PNG'leri bu son birleşik düzenin birebir referansı sayılmaz. Zamansız metin çevirisi P020 ile tamamlandı; kalan klasik okuma sınırlarının tümü bu sunum işiyle kapanmış sayılmaz.

## P018 — Kullanıcı podcast listesi: dış kaynakta kalan erişimler

- **Durum:** bağlantı/Spotify kod düzeltmesi tamamlandı; kullanıcı listesindeki 60 öneriden 54 RSS ve 1 Spotify kaynağı kişisel kütüphaneye eklendi. Beş öneride kullanılabilir kaynak/kimlik doğrulanamadı; bunlar ürün bug'ı diye sunulmaz.
- **Dal/PR:** `codex/podcast-sources-spotify-20261105`; ürün `12aaf3de93b3e5534df02ea1c770b6e81dace2a6`. [Devir](docs/devir/2026-11-05-0717.md).
- **Kanıt:** 42 Node ve 8 Python hedefli kontrol; Windows mevcut browser'a doğrudan Spotify geçişi ve 55 kaynaklı kütüphane geniş/dar görünümü. Dosya izin denemesi 0. Spotify'da medya oynarken podcast girişi RSS aramasına dönmez; gerçek Spotify sesiyle Canlı Whisper/çeviri bu turda doğrulanmadı.
- **Kalan kabul:** beş yayının doğru, erişilebilir resmî kaynağı; ayrıca içe aktarılan bir yayındaki istenen eski bölüm ilk 200 kaydın dışında. Kişisel ayrıntılar yalnız `artifacts/podcast-import-2026-11-05/EKLEME-NOTU.md` içindedir, Git'e girmez.
- **Tam sonraki adım:** erişilebilir doğru yayıncı/RSS bilgisi elde edilirse yalnız kalan kaynakları tekrar çöz; benzer isimli programı otomatik ikame etme. Spotify canlı ASR ancak gerçekten oynayan ve mevcut browser tarafından gözlenen medyada, açık sistem sesi onayıyla doğrulanır; hesap/DRM sınırını aşma veya tam bölüm indirme başarısı iddia etme. Geniş test kampanyası başlatma.

## D001 — Rapor indeksindeki 12 eksik bağlantı tamamlandı

- Mevcut takipli R835, R837–842, R845, R847, R849, R851–852 bağlantıları eklendi; kişisel/untracked rapor yayımlanmadı. Eski raporlar yeni açık bug sayılmaz. [Teslim](docs/devir/2026-11-05-1040.md). Ana kopyanın R516 kişisel indeks farkı güncellemede korunur.

## P004 — Browser paneli kısa canlı kabulü tamamlandı

- **Durum:** üç kısa kabul adımı kapandı; yeni ürün düzeltmesi gerekmedi. Önceki panel/menü özellikleri main'de.
- **Gerçek altyazı/sahne:** [EN/TR indirme, çift dil ve bağımsız kayma](docs/devir/2026-11-05-1408.md).
- **Yeniden açma:** [güncel devir](docs/devir/2026-11-05-1417.md). Aynı izole test profili iki ayrı Electron sürecinde açıldı; gerçek Blender origin'inde site ölçeği1.12/satır aralığı11 ve localStorage işareti geri geldi. Başka origin'de ölçek1, site ayarı taşınmadı. Otomatik site başına çerez kapsayıcısı iddiası yok.
- **Fullscreen/Shadow DOM:** gerçek uzak Sintel videosu kontrollü açık shadow içine alındı; gerçek sağlayıcı EN/TR katmanı normal/tam ekran/çıkış/kapalı/yeniden açık durumlarda doğrulandı. Sayfa CSS'i katmanı bozmadı, tek overlay kaldı; sayfa ana dünyası ayrıcalıklı API/izole controller globalini görmedi. LG görüntüleri ve gerçek decode kareleri, birkaç saniye oynatma; son iki süreçte dosya izin denemesi0. Fullscreen izni yalnız test profilinde mevcut site izin kaydıyla verildi.
- **Sınır/sonraki adım:** kontrollü açık Shadow DOM düzenidir; bütün canlı siteler, kapalı shadow root, DRM, hesap/CUDA veya kişisel profil için genel kabul değildir. Bu dar P004 kapsamında açık iş yok; yeni somut arızada yalnız ilgili akışa dön. Uzun iş iptali ancak gerçek takılma/ihtiyaçta incelenir.
- **Dal:** codex/browser-profile-fullscreen-20261105; ürün başlangıç/bitiş81b83025610e38fff54aac855c907e08966bff77; yalnız belge PR'ı. Computer Use, dosya izin penceresi ve geniş kampanya yok.

## P003 — Film kütüphanesinin kullanım sınırları

- **Durum:** ihtiyaç halinde; aktif ürün düzeltmesi yok. Onaylı film tasarımı PR808 ile main'de, tekrar merge veya tasarım onayı beklemiyor.
- **Kanıt:** [PR808 teslimi](docs/devir/2026-11-04-0936.md), main geçmişinde PR808 merge'i `459bf2e0bbbf0bfb19566ed16080806bb6e76126`.
- **Doğrulanmamış:** büyük kişisel kütüphanenin tüm yönetim yolları ve canlı TMDB'nin bütün koşulları. Kişisel veriler toplu test malzemesi yapılmaz.
- **Dal/PR / sonraki adım:** yeni dal yok; kullanıcı gerçek kullanımda bir sorun bildirdiğinde yalnız o işlem kısa yeniden üretilir. Genel katalog testi ve tasarım yenilemesi başlatılmaz. Performans ayrı P001'dir.

## P001 — Sinematik hareket performansı

- **Durum:** ertelendi, bloklayıcı değil. Mevcut onaylı Home/Keşfet/film tasarımları main'de; eski performans denemesi otomatik alınmayacak.
- **Dal/PR:** `codex/cinema-performance-round5` / [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805), 2026-11-05 kontrolünde hâlâ açık ve birleşmemiş. Bu dalın teslimi `5aa8e5637786093f3864ca31ec88b49b856b5630`; güncel master'dan eski.
- **Kanıt:** [eski performans kaydı](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md). O revizyonda 1440 detay/scroll maksimumları 69,5/55,5 ms, 1920 detay 20,8 ms idi; güncel main ölçümü değildir.
- **Sonraki adım:** yalnız görünür bir takılma bildirildiğinde güncel main'de kısa yeniden üretim ve hedefli düzeltme. Yeni CPU/frame hedefi, uzun benchmark veya boyut matrisi başlatılmaz. Eski hedefler karşılandı diye gösterilmez.

## Aktif podcast düzeltmesi — 07:54

- **Doğrulanmış ürün:** `c99bbe77b4b82345aaaa32be003a0619e99f95c1`, dal `codex/podcast-scene-actions-20261105`; görünür yazıya dök/çevir ve ses kontrolü, sesli çift dilli kompozisyon, native üst alan, RSS asistan yönlendirmesi. [Devir](docs/devir/2026-11-05-0754.md).
- **Kanıt:** 47 kısa test, izole Windows gerçek RSS oynatma sahibi ve geniş/dar görünüm; izin denemesi 0. Gerçek Whisper/çeviri üretimi bu turda yeniden çalıştırılmadı; bu tek başına yeni bug görevi değildir.
- **Kalan:** P019 uygulandı; aktif Podcast/Çift dilli görünüm mevcut ortak browser bileşenidir. Yeni maket beklemek bir uygulama şartı değildir. Zamansız yazı çevirisi P020 ile tamamlandı; diğer tarihsel sınırlar somut ihtiyaç olmadan yeniden açılmaz.

## Kısa kalite/performance turu — tamamlandı

- **Dal / kod:** `codex/media-quality-performance-20261105`, `0d3c9b9a964be756848701010147d7b54fefa5f9`. [Devir](docs/devir/2026-11-05-0950.md).
- **Düzeltmeler:** bölüm başına transkript IPC'si ve tam metin aktarımı kaldırıldı; RSS/legacy eş kayıtta canonical durum kaybolmaz. RSS grupları bir kez indekslenir. Arama değişmeyen kapak/abonelik DOM'unu korur; geç bölüm açılışı ayrılmış kütüphanede araç çalıştırmaz. RSS kapağı/yayıncısı/etiketi ve salt okunur zaman açıklaması doğru; boş altyazı kutusu gizli.
- **Kanıt:** 45 hedefli regresyon ve son etkilenen iki kontrol, sözdizimi/diff; izole LG1440×900 ve1000×800. Kütüphane208ms, bir arama2,5ms, açılışta bölüm başına workspace IPC0. Tek kontrollü800kayıt sayfa okuması29,13→12,66ms; genel uygulama/CPU/kararlılık benchmarkı değildir.
- **Kalan / sonraki adım:** bu değişikliklerde yarım iş yok. Eski PR805 otomatik alınmadı; sırf doğrulanmamış genel sınırlar için yeni test kampanyası başlatılmaz. Yeni somut sorun olursa ilgili sayfa/iş sahibi üzerinde kısa yeniden üretim yapılır.

## Main'de tamamlananlar — tekrar yapılmayacak

| Kapsam | Main teslimi / kanıt |
|---|---|
| D002: Güncel görsel öncelik | [Belge teslimi](docs/devir/2026-11-05-0724.md). Görünüm en önemli öncelik; genel sakinlik/minimalizm ve düşük hareket kısıtları kaldırıldı. Ürün kodu değişmedi. |
| P018 ürün: RSS zorunluluğu olmadan Spotify girişi ve gerçek kaynak kaydı | [Teslim](docs/devir/2026-11-05-0717.md), ürün `12aaf3de`. Program/bölüm linki, doğrudan mevcut browser, medya gözlendiğinde görünüm geçişi, güvenli büyük RSS/kütüphane sınırları. Kalan dış kaynaklar yukarıda. |
| P017: Gerçek podcast kütüphanesi ve yerel sinema Sahnesi | [Teslim](docs/devir/2026-11-05-0628.md), ürün `b71d6fae`. Abonelik/arama/kuyruk/çift dilli açılış, mevcut video üzerinden bölüm ve sözcük işlemleri; 26 kısa test ve izole Windows geniş/dar kontrolü. |
| P016: Sahne v2 podcast/çift dilli entegrasyonu ve uyumlu medya cilası | [Sahne teslimi](docs/devir/2026-11-05-0600.md), ürün `683b7bc6`. 13 kısa kontrol; Windows HTML5 yerel/web geçişleri, seek ve klasik dönüş. Main/yerel SHA son teslimde doğrulanır. |
| P005–P007: V3, native tasarım, katalog, podcast temeli, browser menüsü | PR809/810 ve [17:30 teslimi](docs/devir/2026-11-04-1730.md); native kabul verilmiş, eski onay/merge bekleme kayıtları geçersiz. |
| G1–G5: podcast planı, güncel denetim düzeltmeleri, uyumlu eski paketler, kısa bug turu | PR812–815 ve [sıralı son teslim](docs/devir/2026-11-04-1833.md). |
| P008–P009: canlı podcast örneği, asistan ve zevk profili | [Canlı kabul](docs/devir/2026-11-04-2302.md), [asistan/profil](docs/devir/2026-11-04-2341.md). |
| P010–P013: web çift dilli/podcast, yeniden açma, yan panel ve menüler | Yukarıdaki P004 kanıtları; main'de. |
| P014–P015: görünür girişler, Spotify linki → RSS → gerçek Whisper/çeviri | PR823/824, [doğrudan girişler](docs/devir/2026-11-05-0317.md), [son canlı zincir](docs/devir/2026-11-05-0323.md). NPR'de 12 saniye CUDA small + DeepInfra 4+4 cue; görünüm korunarak yeniden açma geçti. |

Spotify/RSS farklı ses sürümleri otomatik aynı zaman ekseni sayılmaz; eşitliği kanıtlanmayan yeniden açılışta kaydın salt okunur gösterilmesi bilinçli güvenlik sınırıdır. Tüm Spotify bölümlerine erişim/indirme garantisi yoktur.

Genel ses/model kalitesi, bütün siteler, uzun işlerin tüm hata koşulları, kişisel start.bat oturumu, fiziksel HDR/çok kanallı çıkış ve Windows UNC/reparse/safeStorage'ın bütün koşulları tam doğrulanmış değildir. Bunlar somut arıza olmadan yeni geliştirme görevi oluşturmaz. DRM aşma kapsam dışıdır.

Sahne için mpv canlı kabulü dosya erişim onayı gerektirdiğinden test korumasında durduruldu; pencere açılmadı ve tekrar denenmedi. Windows browser ana PNG yakalamasındaki `UnknownVizError` görsel doğrulama sınırıdır; görüntü alma atlanarak kalan gerçek WebContents/video/seek/dar görünüm/geri dönüş kontrolleri geçti. Yeni Whisper/çeviri/Spotify canlı zinciri bu UI turunda yeniden çalıştırılmadı; önceki kanıt geçerlilik sınırları korunur. Bu sınırlar yeni teyitli ürün bug'ı veya geniş test görevi değildir.

## Çalışma sınırları

Kısa hedefli kontrol; Computer Use ve dosya erişim penceresi yok. GitHub Actions yok; commit/PR/merge başlıklarında `[skip ci]`. Kişisel manifest/indeks/start.sh farkları ile korunan `src/media-source-envelope.js` ve `tests/media-source-envelope.test.js` dosyalarına dokunma. Her yeni işte güncel dal/HEAD ve ilgili son devir kontrol edilir.
