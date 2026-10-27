# Rapor 657 — Asistan: 149 bağlı ayar, seçili çeviri modeli ve tarayıcı araçları

2026-10-27. Başlangıç master `0f376d30463d9235f12d58cbbadb02ca9c8690b3`; ürün commit'i `e47203db8081393d8c9c336a4b57687b0ad878a7`. Bu bir genel yeni bug taraması değildir; R654 araçlarının açık uygulama kapsamını genişletir. 149 sayısı bağlı kontrol sayısıdır; 149 bug veya uçtan uca test değildir.

## Uygulananlar

- Dokuz alanda 149 açıkça tanımlanmış, gizli olmayan kontrol: transkripsiyon54, çeviri13, altyazı9, asistan1, temizleme6, oynatıcı8, browser54, görünüm2, okuyucu2. Gerçek DOM seçenekleri, sayısal sınır/adım, devre dışı durumları doğrulanır. Araç açıklamaları 16 seçeneklik sayfalarda taşınır; değerler tamdır. Kaynak/ayar değişince bayat kart reddedilir; başarısız kayıtta yalnız sahip olunan değerler geri alınır. Browser otomasyonu açmak mevcut sayfa çevirisini başlatabildiğinden kartta bu etki açıkça yazılır.
- Kayıtlı altyazı ve asistan modeli ile desteklenen kayıtlı sağlayıcı/model profilleri, anahtar/özel endpoint içeriği modele verilmeden listelenir. Asistan profili altyazı çevirisinde de kullanılabilir. `list_translation_profiles`, `get_translation_profile`, `set_translation_profile` eklendi.
- “Önce Whisper, sonra DeepSeek ile Türkçeye çevir” isteği seçili profilin gerçek sağlayıcı/model/anahtarını o işe dondurur; genel Sol ayarı korunur. Açıkça varsayılan değiştirme istendiğinde ayrı kart, mevcut kasa/yazma akışı üzerinden ilgili kayıtlı anahtarla sağlayıcıyı değiştirir. Anahtarlar model sonucuna veya komut satırına çıkmaz. Çeviri isteklerinde standart katman kullanılır; asistanın mevcut Flex tercihi ayrı kalır.
- Önceki modelle üretilmiş çeviri açıkça seçilen başka modelin işini atlayamaz; eski çevrilmiş kısım bu yeni işe sokulmaz. Whisper reuse karşılaştırması seçilen sağlayıcı/modeli dikkate alır. Model adı içeren komutlar eski regex yönlendiricisinde yutulmaz.
- `get_browser_tabs` kimlik/başlık/aktiflik döndürür, arka plan sayfalarını okumaz. `browser_action` geri/ileri/yenile/yeni sekme/sekme seç/kapat/HTTP(S) adres aç/sayfada bul/yakınlaştır araçlarını mevcut preload/main API'sine bağlar. Kaydedilmemiş sekme zorla kapatılmaz.
- Canlı model sözleşmesinde başarısız arama ile başarılı boş sonuç ayrımı; “önerildi”, “kabul edildi”, “kuyruğa alındı” iddialarının gerçek sonuçla sınırlandırılması güçlendirildi.

## Doğrulanan sorunlar ve kanıt

1. Native browser arama aracı metni düz string yolladığında mevcut API reddetti. `{text, token, next, forward}` sözleşmesine düzeltildi; gerçek native sayfada bul/vurgulama geçti.
2. DeepSeek ilk canlı denemede asistan profilinin altyazıya uygun olmadığını sandı; doğru araç bağlantısına rağmen yanlış yönlendirdi. Profil etiketi, `eligibleFor` ve sistem açıklaması netleştirildi. Aynı komutun sonraki iki canlı denemesinde seçili DeepSeek profilli Whisper+çeviri kartı doğru hazırlandı. Bu modelin her komutta doğru olacağı garantisi değildir.
3. Browser otomasyon anahtarı sayfa çevirisini tetikleyebilirken genel ayar açıklaması “iş başlamaz” diyordu. Kart ve sonuç açıklaması anlık etkiyi doğru bildirir; regresyon kontrolü eklendi.

## Kısa kabul kontrolleri

- 10 hedefli Node test dosyası: **74/74 PASS**. Yeni profil/anahtar ayrımı, sayfalama, 149 gerçek kontrolün şemaya uygun varsayılanı, model reuse, kaynak değişimi, kart kimliği, browser parametreleri ve mevcut kitap/ses yolları dahil. Bütün149kontrol tek tek gerçek Windows'ta değiştirilmedi.
- Değişen/eklenen18JS: `node --check` PASS. `git diff --check` PASS. `npm run test:electron-bridge`: ilk sandbox koşusu Mojo erişim engeliyle açılmadı; native süreç izniyle yeniden çalıştırılınca PASS. Test eşiği değiştirilmedi.
- `electron tests/electron-assistant657.smoke.js --disable-gpu`: ayrı Windows profili, kontrollü sağlayıcı, gerçek main/preload/renderer/overlay/kasa. 5–25s, Whisper+çeviri, ses için çeviri ve DeepSeek seçimi gerçek iş seçeneklerine ulaştı; genel Sol kaldı. Varsayılan DeepSeek/Sol geçişi doğru anahtar kapsamıyla kaydedildi. Üretim başlangıcı kontrollü yakalandı; gerçek Python/GPU/YouTube üretimi yapılmadı. Kaynak sahipliği bu native fixture'da kontrollü, ayrıca hedefli testlerde sınandı.
- `electron tests/electron-assistant-browser657.smoke.js --disable-gpu`: ayrı profil, gerçek native browser ve yerel HTTP makalesi. Adres açma, sekme okuma,125%zoom ve sayfa araması PASS. Gerçek Windows görüntüleri incelendi; kişisel görüntüler Git'e eklenmedi.
- Gerçek DeepSeek, standart katman, sentetik kaynak/araç cevapları: ilk adlandırılmış profil denemesi14.919s başarısız semantik karar; VAD ayar kartı11.271s doğru; başarısız arama8.703s doğru açıklama. Açıklama düzeltmesi sonrası aynı profil komutu30.613s ve12.786s doğru araç/profil/aralık. Son tekrarda metin “kuyruk” ifadesini gereksiz kullandı; sözleşme düzeltildi fakat bu son metin düzeltmesi yeniden ücretli canlı koşulmadı. Hiçbir canlı denemede gerçek medya işi veya ayar kartı uygulanmadı. [İlk ham sonuç](ASSISTANT_CONTROL_2026-10-27/live657-results.json), [iki tekrar](ASSISTANT_CONTROL_2026-10-27/live657-repeat-results.json). Başarısızlıklar saklandı.

## Kullanım

- “Bu videoyu önce Whisper ile çıkar, 5–25 saniyeyi DeepSeek ile seslendirmeye uygun Türkçeye çevir.”
- “Çeviri varsayılanını kayıtlı Sol6.1 profiline değiştir.”
- “VAD eşiğini0,6 yap.” / “Tarayıcıyı yüzde125yakınlaştır.” / “Açık sekmeleri listele.”
- Değiştiren işlemler somut karttan uygulanır. Sadece sohbet cevabı işin uygulandığı anlamına gelmez.

## Sınırlar / kalan kapsam

“Her şeyi yapıyor” iddiası yoktur. Serbest prompt/speaker haritası, klasör izleme kurma, cookie/credential içeriği, yeniden başlatma gerektiren donanım ayarı, keyfi IPC/DOM/shell ve genel dosya işlemleri açılmadı. Yeni araçlar mevcut kitap/ses işlerine eklenmiştir; onların bütün gerçek model çıktıları bu tur yeniden doğrulanmadı. Full npm, CI sonucu, start.bat yeniden açılışı, canlı YouTube/GPU/CUDA/DRM/dosya seçici test edilmedi. install.bat/start.bat ve Python backend değişmedi; yeni bağımlılık, IPC veya ayar dosya şeması yok. Kişisel açık uygulama kapatılmadı. Mevcut eski kasa tasarım incelemesi R649F09-02 bu işle kapatılmış sayılmaz.
