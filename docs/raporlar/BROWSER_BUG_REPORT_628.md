# Rapor 628 — Gerçek kart, işlem kanıtı ve hazırlık/üretim ayrımı

27 Ekim 2026; dal `codex/assistant-evidence628`. Başlangıç `3afd53befa949946010ac4058596b60fe9b338fb`; bitiş ürün `6fee8c7c3d0c1c650da88044007f741313132579`. Kullanıcı önceki beş asistan önerisinin uygulanmasını istedi. Yeni bağımlılık/IPC kanalı, launcher veya CUDA değişikliği yok. Kişisel uygulama ve dosyaları korunur.

## Yapılanlar

1. **Plan ile gerçek kart ayrıldı.** Koleksiyon planı yalnız veri döndürür; uygulanabilir inceleme kartını ayrı `apply_library_collection` çağrısı oluşturur. Bu çağrı üyeliği değiştirmez; insanın Uygula düğmesine basması gerekir. Araç açıklamaları bu ayrımı açıkça anlatır. Bir model plan döndürüp gerçek kartı atlamışsa, en fazla **bir** sözleşme düzeltme turu verilir. Yalnız plan isteyen kullanıcıya zorla kart veya üyelik eklenmez. Genel araç tur bütçesi dörtten altıya çıkarıldı; son tur araçsız finaldir. Sonsuz yeniden planlama/ücretli retry yoktur.
2. **İşlem kanıtı uygulamadan gelir.** Main, gerçekten oluşturduğu kartları ve yalnız veri kalan koleksiyon planlarını sayar. İşlem/plan varsa veya model kart/başlatma/tamamlanma iddiası yazıyorsa yanıtın sonuna EN/TR uygulama doğrulaması ekler: gerçek kart sayısı, hiçbir kartın bu soru tarafından uygulanmadığı, transkripsiyon/dublajın başlamadığı. Modelin düz metinde “kart hazır” demesi gerçek ID veya düğme oluşturmaz. Sonuç ayrıca yapılandırılmış `execution` alanında döner. Bu özet video metadata probe gibi okuma işlemlerinin hiç çalışmadığını iddia etmez.
3. **Tekrarlı kart/bağımlı adım kontrolü.** Aynı model sorusunda aynı araç ve argümanlardan ikinci kart üretilmez; ilk gerçek kart ID'si döner. Çeviri/Whisper önerisi henüz uygulanmamışken ona bağlı ses kartı; referans/config henüz uygulanmamışken üretim/kullan kartı; kitap hazırlama/seçimi uygulanmamışken başlatma/export kartı reddedilir. Kullanıcı önce önkoşulu uygular, kesin iş tamamlanınca Sonuçla devam et kullanır. Bağımsız tüm eylemleri bloke eden bir genel yasak eklenmedi. P08 exact-job/owner/thread/idempotans kontrolleri korunur.
4. **Dil ve ara metin.** Sistem talimatı bütün görünür cümlelerin arayüz dilinde olmasını, araç çağrısı öncesi gereksiz anlatım üretmemesini söyler. Araç turuna ait geçici model metni, tool çağrısı kesinleşince `replace` olayıyla yanıttan çıkarılır; gerçek son yanıt korunur. Plan düzeltmesinden önceki yanlış “kart hazır” metni de kaldırılır. Nihai cevap SSE akışı sürer; bağlantı yarıda koparsa eldeki metin korunur ve otomatik yeniden istek yapılmaz. Bu bir dil filtresi/garantisi değildir; özel ad/alıntı/ID tercüme edilmez.
5. **Windows gerçek kart kabulü.** Modelin önce plan verisini kart diye anlatmasını kasıtlı üreten kontrollü sağlayıcıyla gerçek main/renderer/native overlay/katalog zinciri çalıştırıldı. Düzeltme turu sonrası gerçek kart görünür; üyelik Uygula tıklamasına kadar değişmez. Tıklama iki gerçek fixture kaydı koleksiyona ekler. Sonuçla devam et aynı iki sohbet mesajında sonraki yapım açma kartını getirir; yalnız sonraki Uygula ile doğru yapım detay diyalogu açılır. Sırf metinde araç adı/kart tablosu olması yeterli sayılmaz.

## Canlı denemede bulunan ek kapsam hatası

Tamamlanmış sentetik çeviri sonucu verilip “bitince seslendirmeye hazırla” dendiğinde ilk model denemesi `get_voice_status` ardından **`start_voice_generation` kartı** önerdi. Gerçek üretim uygulanmadı; fakat hazırlama isteğini üretime genişletiyordu. Bu başarısızlık gizlenmedi. `start_voice_generation`, `open_voice_preparation`, `start_book_narration` açıklamaları ve sistem talimatı güçlendirildi: hazır olmak, üretim isteği olmak değildir; “seslendirmeye hazırla” yalnız hazırlama/config yetkisidir. Aynı özgün istek, aynı hazır-fixture durumuyla **3/3 yalnız `open_voice_preparation`** seçti; çeviriyi tekrar çağırmadı. Bu dilsel/model davranışına ilişkin küçük örneklem kanıtıdır; bütün modeller için anlamsal yetki ispatı değildir. Üretim kartları yine insanın açık Uygula tıklamasını gerektirir.

## Değişen her dosya

- `src/assistant-capabilities.js`: koleksiyon veri/kart ve ses/kitap hazırlık/üretim açıklamaları.
- `src/assistant-provider.js`: daha açık dil/önkoşul sözleşmesi; en çok bir eksik-plan-kart kontrol turu; altı tur üst sınırı; araç öncesi geçici metin temizleme ve `onReplace`. Gerçek sonuçları kendi başına uydurup kart üretmez; kayıtlı execute yolunu kullanır.
- `src/assistant-agent-service.js`: tekilleştirme, belirli bağımlılıkları kontrol, gerçek kart/plan sayacı, hata sayımı, EN/TR uygulama doğrulaması ve renderer replace olayı. Aynı kaynağa ait olmayan sonuçlar hâlâ reddedilir.
- `src/renderer/assistant-agent-ui.js`: doğrulanmış replace olayını aktif request/source üzerinde mevcut yanıt ve workspace kaydına uygular. Kaynak/istek değişmişse uygulanmaz.
- `tests/assistant-provider.test.js`: plan→kart onarımı, preface temizleme, plan-only, iptal, hazırlık/üretim sözleşmesi ve mevcut Flex/partial kontrolleri.
- `tests/assistant-agent-service.test.js`: duplicate, bağımlı ses adımı, yalnız veri/0 gerçek kart ve tamamen hayali kart iddiasının uygulama doğrulaması.
- `tests/electron-assistant-evidence.smoke.js`: gerçek native kart→insan tıklaması→katalog→sonuçla devam→yapım sayfası kabulü. Yanlış test selektörü ilk gerçek detay ekranını tanımadı; gözlenen gerçek `mediaTitleDialog` ile düzeltildi, ürün koruması/test eşiği gevşetilmedi.

## Hedefli kontroller

**10 Node test dosyası geçti:** assistant-provider (son 8 test), assistant-agent-service (son 15), assistant-capabilities, assistant-flows, assistant-library-actions, assistant-collections, assistant-app-actions, assistant-overlay, ipc-parity, preload-usage-ratchet. Yedi değişen/yeni JS dosyası `node --check`, `git diff --check` geçti. Kod son küçük talimat değişikliklerinden sonra provider/service tekrar geçti. Test sayısını doldurmak için tam paket çalıştırılmadı.

**Dört native Windows kabulü geçti:** yeni `electron-assistant-evidence.smoke.js`; mevcut `electron-assistant-flows.smoke.js`, `electron-assistant-captions.smoke.js`, `electron-assistant-voice.smoke.js`. Ayrı profiller ve kontrollü sağlayıcı/medya yanıtları; gerçek katalog, diyalog, main, renderer ve native baloncuk kullanıldı. Yeni kart/uygulama doğrulaması TR koyu ekran görüntüsü incelendi. Mevcut flows kontrolü EN açık/dar form ve native Enter'ı da doğruladı. Kullanıcının açık uygulaması kapatılmadı; ham profil/görüntü/loglar `.uiprev/` ve `tmp/` altında Git dışıdır.

## Gerçek DeepInfra tekrar ölçümü

[Anahtarsız sentetik kanıt](DEEPINFRA_LIVE_EVAL_628.json): kullanıcı yetkisiyle kayıtlı anahtar yalnız bellekte, resmi endpoint ve Flex üzerinden kullanıldı. Kaynaklar/okuma sonuçları sentetik; değiştirici callback yalnız `proposed` döndü, kişisel ses/kitap/video/koleksiyon işi uygulanmadı.

- Rapor627'de **0/3** gerçek kart çağrısı veren aynı koleksiyon isteği bu tur **3/3** `search_library → plan_library_collection → apply_library_collection` yaptı (8,7–14,5 sn). Bu üç canlı koşum açıklamalarla doğrudan doğru çağrıyı yaptı; zorunlu onarım yolunun kendisi ayrıca kontrollü native testte sınandı.
- Mevcut altyazı/range/speech, manual YouTube caption ve PDF hazırlama tekrarları **3/3** geçti.
- Çok adımlı çeviri→ses hazırlık ilk aşamasında yalnız çeviri kartı; “yalnız plan, uygulama kartı oluşturma” isteğinde yalnız plan: **2/2** geçti.
- Ara aşamada bir hazırlık/üretim kapsam hatası çıktı; yukarıdaki açıklama düzeltmesi sonrası **3/3** doğru hazırlama kartı. Kanıtta ilk başarısız kayıt da bulunur.
- Toplam **12 canlı koşum, 42 HTTP istek**, geliştirme sürecinde **11 geçiş/1 ara başarısızlık**. Her koşumda sunucu `flex` metadata'sı görüldü; gerçek fatura ölçülmedi. Bu 12 tamamlanmış yanıtta önceki İngilizce “I'll…” ara metinleri kalmadı; her olası dil kaymasına karşı garanti değil.

Gerçek main'deki kart/önkoşul/iş sahipliği korumaları unit+native kabulden; canlı model seçim kanıtı ayrı sentetik kaynaklardan gelir. Bu ikisini “kişisel YouTube videom GPU'da işlendi” diye birleştirmiyoruz. Tam npm test/CI sonucu, normal start.bat açılışı, gerçek YouTube/GPU/dublaj kalitesi bu tur doğrulanmadı. Önceki Rapor626 UI envanter kırmızısı bu işte tekrar koşulmadı/düzeltilmiş sayılmadı. Kod ve belge ayrı commit/push/PR ile ana sürüme teslim edilir; kişisel dosyalar korunur.
