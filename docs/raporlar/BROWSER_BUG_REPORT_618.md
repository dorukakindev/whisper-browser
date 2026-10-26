# Rapor 618 — Asistan P01: YouTube komutları ve sağlayıcı araç akışı

Repo: https://github.com/dorukakindev/whisper-browser. Dal: `codex/assistant-operations618`.
Başlangıç HEAD: `45065768acba7155343a3b598404833b203806d3`.
Bitiş ürün commit'i: `33036ef7fd4c6ed08a080ad70c789679b3a8203d`.

## Teslim

Kullanıcı 45 maddelik asistan kapsamını paketli uygulamayı istedi. [Sekiz paketlik tam plan](ASSISTANT_PACKAGES_2026-10-26.md) kalan kapsamı ve kabulü kaydeder. Bu tur P01'dir; tüm programa hakim model araç döngüsü tamamlandı iddiası yoktur.

Üç açık eylem mevcut uygulama yollarına bağlandı: yakalanmış kaynak altyazıyı çevirme, yalnız Whisper ve Whisper+çeviri. Yeni pipeline veya bağımlılık yok. YouTube baloncuğunda üç kısa eylem görünür. Whisper aralığı kabul edilir; belirsiz aralık tüm videoya sessizce genişlemez. Eksik kaynak, farklı kayıtlı hedef dil ve henüz desteklenmeyen aralık/ses çevirisi açık bildirilir. Kaynak yokken kendiliğinden Whisper çalışmaz.

## Doğrulanmış kökler ve onarımlar

1. Rapor617'de teyit edilen tekrarlı/cumulative `function.name` ve ID delta'ları eski kodda kör ekleniyordu. Standart parçalı akış korunarak tam/cumulative tekrar ayırt edildi. JSON argümanları standart delta olarak biriktirilmeye devam eder. Test hem gerçek parçalara bölünmüş adı hem tekrarlı tam adı sınar.
2. Araç çağrısındaki sağlayıcı `extra_content` benzeri opaque alanlar sonraki istekte düşüyordu. SDK model dump/nesne alanları üzerinden, boyut sınırıyla taşınır. Sentetik Gemini benzeri thought signature sonraki turda doğrulandı. Gerçek Gemini/DeepSeek isteği veya bütün reasoning protokolleri doğrulanmış sayılmaz.
3. Yeni komut adaptörünün ilk kontrolünde, diskte benzer bir eski track bulunmasının başarılı yükleme sanılabileceği görüldü. `startBrowserYoutubeWhisper` artık gerçekten yüklendi/yeniden kullanıldı veya yeni job başlatıldı sonucunu döndürür. Asistan çıktının yalnız varlığından başarı çıkarmaz. Progressive ve batch çeviri sonucunun yükleme/kısmi bilgisi gözlenir.
4. Hazırlık sırasında iptal veya kaynak değişimi geç bir başlangıca dönüşmesin diye mevcut `useBrowserTrack` ve Whisper girişine iptal/sahiplik kontrolü eklendi. İptal cevabı gelmeden çeviri durdu denmez; başarılı durdurma çalışan kimliğini temizler, hazırlanmış cue'ları korur.
5. Çeviri ilerlemesi gerçek browser event gate'inden sekme/generation/track kimlikleriyle aktarılır. Hazırlık sırasında kaçan olaylar main snapshot'ından okunur. Kuyruk/retry bitmeden tamamlandı denmez; yalnız yakalanmış parça varsa kapsam belirtilir. Kaynak değişiminde eski sonuç doğrulanmış sayılmaz.
6. Yeni beş eylemli boş görünüm Windows ekran görüntüsünde başlığı sıkıştırdı. Boş ekran iki sütunlu, mesaj alanı küçülebilir/kaydırılabilir hale getirildi; kök sayfa kayması engellendi. Gerçek native testte headerTop pozitif, scrollY=0, gönderme alanı pencere içinde. YouTube kaynak türü main overlay temizleyicisinden açık boolean olarak geçirilir; sayfa açıklaması yerine video yönlendirmesi gösterilir.

Bu liste aynı kökün farklı testlerini ayrı bug diye saymaz. Yeni özellik geliştirilirken bulunan riskler eski sürümde yaşanmış kullanıcı hatası olarak sunulmaz.

## Kontroller

- `node tests/assistant-video-intent.test.js`: 2 test geçti; üç niyet, olumsuz/alıntı/özellik sorusu, zaman ve dil ayrımı.
- `node tests/assistant-video-command.test.js`: 7 test geçti; mevcut track/Whisper ayrımı, doğru kaynak olayı, aralık aktarımı, geç iptal, tam videoya ve yanlış dile sessiz fallback reddi, sahte reuse reddi, hazır cue'ların iptalde korunması.
- `python -m unittest discover -s tests -p test_assistant_stream.py -v`: 10 test geçti. Parçalı ve tekrarlı araç çağrısı, metadata, kopan yanıt, iptal, yerel HTTP/SSE UTF-8 kontrolü. Gerçek ücretli API yok.
- `assistant-page-command`: 5 geçti; `assistant-overlay`: 1 geçti; `assistant-conversation`: 5 geçti; `assistant-native-boundaries`: 2 geçti; `coverage-map`: 4 geçti.
- `node tests/browser-youtube-whisper.test.js`: mevcut URL/niyet/reuse/aralık/race kontrolleri geçti.
- `browser-translation-quality-loop.test.js`: **14 geçti,2 başarısız**. Aynı iki test başlangıç master'ında da aynı şekilde başarısız: temiz gevşek sonucun cache'e yazılması (satır87), geçici hatanın yeniden denenmesi (satır110). Scheduler dosyası bu tur değişmedi. Kök neden henüz ayrıştırılmadı; P04'e açık iş kaydıdır, yeşil sayılmaz.
- JS sözdizimi: main,preload,renderer ve değişen yardımcılar; Python `py_compile` assistant_stream/transcribe; diff whitespace kontrolleri geçti.
- `electron-browser-trusted-bridge.smoke.js`: gerçek süreç çıkışı0; izole köprü/TextTrack/EME/shadow/iframe/link/DarkReader kontrolü geçti.
- `electron-assistant-video.smoke.js`: gerçek Windows main+native overlay IPC; kontrollü kaynak ve motor sınırı. Aralık300–600, translate=false; mevcuttrack yolunda yeni Whisper çağrısı yok; iş sürerken cancel, hata ve3/8→8/8 ilerlemesi görüldü. Native sonuç `ok:true`. Koyu1440×1000 ve açık720×680 ana pencere; açık overlay480×616, send592.67, headerTop4.67,scrollY0, yatay belge taşması0. Kısa öneri şeridi küçük yükseklikte tasarımsal yatay kaydırılabilir.

İlk `node --test` sandbox spawnEPERM verdi; aynı test dosyaları doğrudan Node ile çalıştırıldı. Bir fixture'da kaynak seçici silinmiş track'i dönüyordu; fixture gerçek seçim mantığına uyarlandı. Bu test hatası ürün kusuru diye sayılmaz. Native UI ilk yakalamaları/son durum karşılaştırıldı; son dört görüntü yerel `.uiprev/assistant-video/1793046512149-20792/` içindedir, Git'e eklenmez.

## Tasarım skill incelemesi

`make-interfaces-feel-better` uygulandı; kapsam yalnız bu asistan boş/progress/sonuç durumları, plain CSS ve mevcut token/font/hareket sistemi.

| Kategori | Kanıt | Sonuç |
|---|---|---|
| Tipografi | Gerçek koyu/açık görüntüler ve video yönlendirme metni | Mevcut fontlar korundu; yanlış web sayfası bağlamı düzeltildi |
| Yüzeyler | Boş ekran başlığı, beş eylem, input, dar pencere ölçüleri | Başlık kayması iki sütun ve küçülebilen log ile giderildi |
| Hareket | Mevcut UiMotion ve 500ms yerleşmiş durum | Yeni hareket sistemi yok; bu tur yavaşlatılmış tam animasyon denetimi yapılmadı |
| İkonlar | Mevcut baloncuk/kontrol ikonları ve aynı eylem okları | Yeni ikon kitaplığı/emoji yok |
| Performans |650ms tek job gözlemi, terminalde interval/listener temizliği | Modele veya diske yoğun polling yok; uzun soak koşulmadı |

## Sınırlar ve sonraki paket

Windows asıl hedeftir. Türkçe yollar/UTF-8 ve gerçek native UI kontrol edildi. `start.bat`/`install.bat` değişmedi; test backend çağırmadığı için doğrudan Electron çalıştı. Bu, normal `start.bat` GPU/CUDA/DRM ve gerçek YouTube ağ doğrulaması değildir. Kişisel açık uygulama kapatılmadı. API anahtarı, kullanıcı profili, ham kişisel çıktı Git'e alınmadı. Tam npm test ve uzun CI beklenmedi.

Sıradaki P02: gerçek capability envanteri, ortak AppActions/registry, kaynak manifesti ve sağlayıcıya sunulan genel araç yürütmesi. P01'in açık komut kuralları, bütün program için model tabanlı eylem seçiminin yerine geçmiş sayılmaz. P03 sohbet kilidi ve main iş sahipliğini; P04 eksik dil/aralık/probe ve kalite test köklerini tamamlayacak.
