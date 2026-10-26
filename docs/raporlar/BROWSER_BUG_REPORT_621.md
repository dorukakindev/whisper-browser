# Rapor 621 — P04: YouTube altyazı seçimi, iş bazlı çeviri ve kalite kapısı

Başlangıç master `0d9932f38c7c4ffe9dba31587c7074760db3b835`; ürün commit'i `44a67fe8c1c90bdb291bad44ef250c66755a793b`. Dal `codex/assistant-subtitles621`. Kullanıcının P04 için “yap” talimatı uygulandı. P02 ana agent ve P03 main iş deposu korunur.

## Kullanılabilir işler

Kayıtlı araç sayısı 19 oldu; kaynak türüne göre yalnız ilgili küme modele sunulur. Yeni beş araç:

| Araç | Gerçek bağ |
|---|---|
| probe_video_captions | Mevcut media.py probe yolu; yalnız sahipliği doğrulanmış açık YouTube sekmesi |
| translate_video_captions | Probe'da gerçekten dönen manual/auto dil kimliğini indir, mevcut kaynak yükleme ve yalnız-çeviri hattına ver |
| research_web | Mevcut assistant-web-research.research ve sağlayıcının Responses web_search yolu; gerçek kaynak bağlantıları |
| load_caption_track | Mevcut gerçek track_id ile useBrowserTrack(false); çeviri başlamaz |
| open_subtitle_editor | Gerçek U kimliğinin değişmemiş satırına mevcut browser/local editörünü aç; araç dosya kaydetmez |

`start_whisper` ve `translate_captions` artık hedef dil, başlangıç/bitiş ve seslendirmeye uygun çeviriyi iş bazında alır. Genel dil/ses ayarı değiştirilmez. Mevcut Whisper kaynağı bulunduğunda ses yeniden işlenmeden aynı ortak yalnız-çeviri işlevi çağrılır. `makeTransBtn` mantığı `startPlayerSubtitleTranslation(config)` olarak tek yerde korunur; yeni bir çeviri motoru yazılmadı. Yerel/buton/eski yeniden-çeviri yolları aynı işlevi kullanır.

Örnek: “Bu videonun kaynak altyazısını bul; 5–25 saniyeyi Almancaya seslendirmeye uygun çevir.” Model önce gerçek dilleri sorgular, sonra seçilmiş kimlikle işlem kartı oluşturur. Kart uygulanmadan indirme/çeviri başlamaz. Kullanıcının açık, eski basit video komutları mevcut doğrudan yolunu korur; farklı dil/aralık/ses için çeviri veya henüz yakalanmamış altyazı istekleri araç döngüsüne aktarılır. Altyazı yoksa sessizce Whisper başlatılmaz.

Probe listesi elle yazılmışları, ardından EN/TR adaylarını öne alır; en çok 80 temiz kayıt döner ve kırpılma bayrağı vardır. Otomatik kaynak kartta açıkça yazılır. Kimlikler sender/kaynak/thread/generation/aralık ve beş dakikalık probe kaydıyla doğrulanır; uydurma veya eski kimlik indirme kartına dönüşmez. Kart uygulama tek-kullanım ve kaynak kontrolünü tekrar yapar. Yeni indirme yolu 100 saniyelik bounded eylem süresi kullanır; diğer eylemler 30 saniyede kalır. Kaynak değişirse eski indirilmiş dosya yeni videoya bağlanmaz.

Aralık mevcut backend'in kesişen cue/tam cümle mantığına gider; sınırdaki cümle kesilmez. Aralık dışı metin mevcut backend sözleşmesine göre korunabilir; bu dosyanın her satırının yeniden çevrildiği anlamına gelmez. Ondalıklı saniyeler yuvarlanıp yanlış aralığa dönüştürülmez. Önceki farklı hedef dil çıktısı mevcut çeviri diye yeniden kullanılmaz. `en-orig` gibi kaynak etiketleri mevcut dil normalleştiricisinden geçer.

İşlem kartında dil adı, kesin aralık/tüm video, ses için çeviri ve otomatik kaynak bilgisi görünür. Altyazıdan ses üretimi bu adımda başlamaz. Editör açmak da otomatik dosya yazmak değildir; mevcut kaydetme kontrolü kullanıcıdadır.

## Main iş takibi ve kaynaklı araştırma

P03 deposuna gerçek media probe/altyazı indirme süreçleri, captured-caption scheduler ve aktif sayfa çeviri blok işleri bağlandı. Sonuçlar model `get_job_status` ve baloncuk İşler bölümündedir. İptal tam süreç/scheduler/job nesnesiyle eşleşir; eski kimlik yeni işi durduramaz. Gezinme/explicit stop eski caption kaydını kapatır. Probe sırasında sohbet iptali yalnız o probe işinin iptalini ister.

Sayfa işinin arşiv/sonuç yazımı sırasında hata oluşursa kendi trace kimliği failed olur; sonraki işi yanlışlıkla kapatmaz. Başarısız retry eski başarılı çeviriyi korusa bile yeni deneme completed sayılmaz. Sayfa güvenlik/Cloudflare hazırlığı değiştirilmedi; ledger yalnız gerçek blok işi oluştuktan sonra başlar. Başlangıç hazırlığı henüz bu listede bir aktif blok işi değildir. Captured caption işi yalnız yakalanmış kapsamın çevirisidir; tüm videonun altyazısının elde edildiği iddia edilmez.

Araştırma mevcut sağlayıcının desteklediği web_search özelliğine bağlıdır. Desteklenmiyorsa kaynaklı sonuç uydurulmaz. Main'in doğruladığı kaynaklar nihai yanıtın son Web kaynakları bölümüne eklenir; native source düğmeleri bu kanonik son bölümü kullanır. Anahtar, yerel yol ve ayarlar modele açılmaz. Bu turda ücretli web araması yapılmadı.

## İki başlangıç kırmızısının ortak gerçek kökü

`translationBlockingIssues('I have 3 apples.', '3 elmam var.', 'tr')` → yanlış `negation_added`. Genel `\p{L}{2,}m[ae]m` deseni sahiplik sözcüğü “elmam”ı ve “tamam/hamam” gibi olumlu sözcükleri olumsuz fiil sanıyordu. Bu nedenle temiz yanıt cache'e yazılmıyor ve geçici hatadan sonraki temiz yanıt reddediliyordu.

Bu belirsiz birinci tekil olumsuzluk dalı, bilinen fiil kökleri ve gerçek çekimleriyle sınırlandı. Sayı, diğer olumsuzluk/modal ve biçim kapıları kaldırılmadı. Yeni karşılaştırma “elmam/tamam/hamam”ı kabul eder; “Gelemem/Yapmam/Sevmem/Okuyamam”ın olumlu İngilizce kaynakta eklenen olumsuzluk olduğunu ve “I cannot come → Gelebilirim” kaybını hâlâ reddeder. Scheduler kalite eşiği ve cache koşulları gevşetilmedi.

Sonuç: daha önce kayıtlı iki kırmızı dahil **browser-translation-quality-loop 16/16 geçti**. Dilbilimsel kapsamlı çözüm iddiası yok; bu seçici bir kalite sezgisidir.

## Doğrulama

20 hedefli Node test dosyası exit0: assistant-caption-actions (5), assistant-caption-jobs (1), assistant-agent-service (6), assistant-capabilities, assistant-video-command (8), assistant-provider, assistant-jobs, assistant-web-research, assistant-app-actions daha önceki kabul; browser-page-translation-main, browser-youtube-whisper, browser-translation-quality-loop (16), subtitle-sentence-layout, browser-translation-refresh/reliability/job-context/cache, translation-review-surface, queue-lifecycle, ipc-parity ve coverage-map. Değişen JS sözdizimi ve git diff --check geçti. IPC 276 handle/17 on/37 send; eksik/çift/yetkisiz kanal yok. Sayı test senaryosu toplamı değildir; dosya listesi kapsamı belirtir.

Eski VM fixture'ları yeni ortak işlev/assistantJobs bağına göre güncellendi. Testin eski click-wrapper metin sınırı yeni named function sınırına taşındı; bayrak temizliği assertion'ları korunur. Caption kaynağı yokken yeni beklenen davranış “Whisper çalıştırmadan probe araç döngüsüne devret” olarak doğrulanır. Sayfa VM testi main history'de başarılı ve başarısız terminali ayrıca doğrular. Bu kontrol, ilk uygulamada hook'un yanlış restore fonksiyonuna konmasını yakaladı; gerçek blok işi sonuna taşındı ve restore yolundaki tanımsız job erişimi teslim öncesi kaldırıldı.

Dört gerçek Windows Electron kabulü exit0:
- `electron-assistant-captions.smoke.js`: gerçek main/renderer/native overlay, gerçek yerel HTTP tool modeli, gerçek dosya-yetki/altyazı okuma ve ortak çeviri işlevi. Probe ve medya subprocess fixture; transcribe başlangıcı yakalanır. Üç model isteği, bir subtitle indirmesi; kart uygulanmadan indirme yok. Backend'e gidecek seçenekler target=de, range=5:25, forSpeech=true, translateOnly=true, input=Türkçe kaynak.srt, youtube yok; kayıtlı UI tr/forSpeech=false/aralık korunur. Son kanıt `.uiprev/assistant-captions/1793051818558-24672`.
- `electron-assistant-video.smoke.js`: mevcut üç video komutu/aralık/iptal/sonuç ve kompakt UI.
- `electron-assistant-page.smoke.js`: gerçek sayfa komut yönlendirmesi, kontrollü sonuç; paid çağrı yok.
- `electron-browser-trusted-bridge.smoke.js`: mevcut güvenilir köprü, TextTrack/EME/shadow/iframe akışı.

Koyu 1440×1000 ve açık 720×680 testlerinde native baloncuk 480×616; yatay taşma ve görünmez gönderme yok. İşlem kartları gerçek görüntülerden incelendi. Kanıtların tamamı ayrı fixture profilidir; kişisel görüntü/log/oturum Git'e alınmadı. Native test gerçek YouTube/gerçek model veya ses kalitesi kanıtı değildir. Normal start.bat/install.bat, GPU/DRM ve Python test paketi koşulmadı; Python ve başlatıcılar değişmedi. Kişisel şifreli profili kopyalayan canlı page testi bu turda özellikle kullanılmadı.

## Sınırlar / devam

Tam npm test ve uzun CI beklenmedi; CI kapatılmadı. Gerçek sağlayıcı/model, YouTube erişimi/cookie/yaş sınırı, otomatik kaynak doğruluğu veya üretilmiş çevirinin edebî kalitesi denenmedi. Genel kalite iyileşti iddiası yerine gerçek yanlış pozitif kökü ve kontrollü aktarım kanıtı verildi. Yeni dependency/kurulum/kalıcı ayar migrasyonu yok. Browser ASR, burn-in ve book workspace işleri hâlâ kendi kontrollerinde; alan paketlerinde ele alınır. Otomatik dosya düzenleme/kaydetme eklenmedi; editör yönlendirmesi mevcut kaydetme akışını korur.

Sıradaki P05: dublaj, yerel/video referansı, müzik/tempo/duygu, kalite grubu aç/dinle/yeniden üret ve doğru videoda sesi kullan/özgün sese dön. Bu pakette ses üretildiği veya dinlenerek kalite onayı alındığı iddia edilmez.
