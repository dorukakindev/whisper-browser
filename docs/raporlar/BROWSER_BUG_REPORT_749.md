# Rapor 749 — Gerçek YouTube zincirinde seçili çeviri ve dublaj aralığı

## İki doğrulanmış ürün hatası

1. Seçili2–10sn aralığıyla cümle gruplaması farklı kapsam kullanıyordu. Aralık dışındaki İngilizce cue, aynı Türkçe bütün cümlenin içinde locked_translation olarak aynen korunmaya zorlanıyordu. Sağlayıcı ya parçayı İngilizce tutuyor ya bütün cümleyle parçalar eşleşmiyordu. Kalite kapısı doğru reddediyordu; kapı gevşetilmedi. `translation_sentence_groups` doğal mevcut grupları seçili/seçili-değil sınırında ayırır. Aralık dışı metin context_before/after olarak modele görünür, hedef items grubuna karışmaz. Orijinal çıktı zamanları/aralık dışı metin korunur. Aralık parser'ı ortaklaştırılıp negatif/nonfinite/ters sınırlar erken reddedilir.
2. Yerel oynatıcıda SRT'den yapılan aralık çevirisi, videoya bağlı dublaj aralığını kaybetti. Meta input'u SRT idi; eski clipStart/End ana formdan kalabilir ve video kimliği değildi. Renderer `subtitlePlayback` ile yerel video+tam translateCueRange gönderir. Main yalnız translateOnly/yerel işte ve yetkili medya dosyasında kabul eder, aralık uyuşmazlığını reddeder. Yetkili dosya statı başlangıçta alınır; sonuçta aynı stat ve SRT hash'i mevcut provenance kaydına bağlanır. Değişen video/SRT veya eski bağlamsız dosya otomatik aralık alamaz. Yeni satır zamanlarından tahmin yapılmaz.

## Dosya amaçları

- `backend/transcribe.py`: ortak translation_cue_interval ve seçili aralık cümle sınırı; hem ses hem normal çeviri mevcut speaker/SDH/gap sınırlarını korur. Düzenleme alanının dışındaki kaynak, tamamlanmış hedef parça olarak aynı gruba girmez. Mevcut gerçek tamamlanmış çevirileri koruma akışı kaldırılmadı.
- `backend/test_translation_range749.py`: gruplayıcı ve gerçek translate-only SRT hattı; dış metin context olarak kalır, yalnız seçili ikiID çevrilir, satır zamanları korunur; finite/sınır testleri. Speech editörünün ikinci isteği kasıtlıdır: ilk test bir istek varsaydığı için düzeltilip iki isteğin kapsamı esas alındı.
- `src/local-subtitle-context.js`: translationSnapshot yetki/stat/aralık doğrulaması ve translateOnly için yalnız bu snapshot'tan provenance üretme. Eski ana-form clip aralığı SRT dosyasına medya diye bağlanmaz.
- `src/main.js`: snapshot'ı mevcut transcribe:start ve jobMeta'ya bağlar; history.video gerçek yetkili video olur. `src/renderer/renderer.js`: yalnız yerel player aralıklı çeviride ilgili video/range snapshot'ını gönderir.
- `tests/local-subtitle-context712.test.js`: doğru video, kesirli aralık, değiştirilmiş medya, eksik yetki, uyuşmayan aralık ve eski bağlamsız işi kontrol eder.
- `tools/video-live-pipeline.cjs`: yeni açık opt-in `--youtube-captions` modu gerçek mevcut kısa YouTube fixture'ını probe/download/manual-caption ile alır, gerçek oynatıcı kaynak izine yükler, canlı standart DeepSeek speech çevirisini başlatır, otomatik çeviri ikinci izini korur, diskten yeniden okunan provenance'ı doğrular, gerçek GPU üretir ve use/play/pause yolunu sınar. Varsayılan sentetik Whisper modu korunur. GPU önkoşulu9500MiBfree; başka süreç sonlandırılmaz.

Yeni bağımlılık veya IPC kanalı yok. `subtitlePlayback` isteğe bağlı transcribe request metadatasıdır, engine argv'sine gizli veya yol parametresi olarak eklenmez. History mevcut subtitleContexts alanını kullanır. Eski ayarlar/çıktılar taşınmadı. Tasarım/CSS değiştirilmedi.

## Önce/sonra kanıt

[İlk gerçek çelişen payload şekli](evidence749/conflicting-range-shape.json): grup[1,2,3],item3aralıkdışılocked. Gerçek DeepSeek önce4istek/6satırdan2eksik partial; üretim başlatılmadı. [Kontrollü parent regresyonu](evidence749/range-before.txt): iki testte1FAIL/1ERROR; biri gruplayıcı sınırı, diğeri gerçek translate-only output başarısızlığı. Son3testPASS. Mevcut20speech testPASS; Node14PASS (10caption+4localcontext), history13PASS; Pythoncompile, JSsyntax ve diffPASS. Kontroller anlam/sayı/olumsuzluk eşiğini düşürmez.

İlk canlı tekrar düzeltme sonrası tam çıktı yazdı ama kabul aracı yalnız Whisper done.translation beklediği için kırmızı oldu. Translate-only gerçek sözleşmesi done.outputs role=translation/status=complete/completed/failed kullanılarak düzeltildi; test kolaylaştırılmadı. Ardından gerçek translation tamamlandı fakat dublaj range=null kırmızısı ikinci ürün kökünü kanıtladı. İlk başarılı son zincir52.713snTTS üretti ancak runner çeviriyi kaynak picker'ından tekrar yüklediği için iki-iz kanıtı değildi. Son runner bu gereksiz seçimi kaldırıp gerçek otomatik kaynakEN/çeviriTR izlerini korudu.

Bir sonraki gerçek koşu kullanıcı kesintisi sırasında GPU aşamasında sona erdi; süreç handle'ı bulunamadı ve Windows electron/python envanterinde süreç yoktu. O koşu tamamlandı sayılmadı. Yeni son koşu gerçekten exit0 ve acceptance artifact üretti. Son küçük güçlendirme (request.range ile translateCueRange birebir eşitliği) bu koşu başlarken eklendi; bu ek kapı4Node testinde ayrıca geçti, canlı koşuda range değerleri zaten eşitti. Son runner'a capture öncesi250ms eklendi; bu bekleme yeni gerçek GPU koşusu diye sayılmadı.

## Gerçek son zincir

[Sanitize teknik/kalite sonucu](evidence749/real-chain-summary.json):
- Anonim `https://www.youtube.com/watch?v=jNQXAC9IVRw`: gerçek probe, en manual altyazı ve en fazla240p video indirmesi. Kişisel çerez/hesap yok.
- Açık kaynakEN izi → gerçek üretim translate-only backend → DeepSeek standard2HTTPistek → seçili2–10sn Türkçe speechSRT,4xx/5xx veya structuralret yok. Aralık dışı cue'lar kaynak metin olarak korunur; tüm video Türkçeye çevrildi iddiası yok.
- Çeviri otomatik ikinci iz olarak bağlandı. Aynı SRT yeniden readSubtitle ile okununca2–10s metadata doğrulandı. prepareCurrent aynı aralığı yeniden seçim olmadan aldı. UI seçimi fiziksel OS dialog yerine sentetik file-picker adapteridir; main yetkilendirme/IPC gerçek.
- RTX4070SUPER, üretim öncesi10679MiBfree. Sentetik WindowsSAPI referansla kurulu gerçekVoxCPM2/nano-vLLM,15adım/4kapasite/detailedverification. İki grup gerçekten üretildi,0cache;58.531sn,11.432snWAV,fullFFmpegdecodeexit0. Aşamalar loglarda örtüşebildiğinden toplanıp toplam süre denmedi.
- Aynı indirilen fiziksel videoya Use ile bağlandı; seçili aralık öncesi özgün ses, aralık içi dublaj/mute ve pause nativeassertPASS. Sync8video/11.432audio; konuşmayı korumak için video yavaşlar, accelerated/clipped/overflow0. Browser native stream veya tekbuton otomatik tüm üretim değildir.

## Ses kalitesi kabulü AÇIK

İki grup da review. Birinci grubun ilk ASRbenzerliği0.0, izole yeniden denemesi0.7273. İkinci grup0.25. Denetim metinleri rapor JSON'unda kısa sentetik-hedef karşılaştırması olarak tutulur. Örneğin düzgün görünen Türkçe cümlenin ASR'si heceleyerek/yanlış algılanmış; gerçek telaffuz mu doğrulayıcı dil/ASR davranışı mı, bu test ayırmaz. Bir önceki koşuda ikinci grup0.8696passed çıkmış olması sonraki review'ı geçersiz kılmaz. İnsan dinlemesi yapılmadı; doğal/ruhu korunmuş/kusursuz dublaj veya P039/P040/P050tamam iddiası YOK. Çıktı dosyası varlığı teknik üretim kabulüdür; kalite kabulü değildir. Sonraki yüksek faydalı iş bu review/ASR uyuşmazlığıdır.

Gerçek son pipeline screenshot'u yakalama anında devam eden stüdyo karesini gösterdiği için final-estetik kanıt diye yayımlanmadı. Renderer snapshot zamanlaması için runner'a capture beklemesi eklendi; ürün tasarımı düzeltildi iddiası yok. İzole uygulama ve önceki pipeline hazırlık görüntüleri incelendi; yeni geniş/dar estetik kabul yok. Ham profil, medya, WAV ve HTTP promptları Git'e konulmadı.

## Kaynaklar, Windows ve sınırlar

Mevcut uygulamanın scene_context_bounds/sentence_groups ve local-subtitle-context hash/stat kayıtları yeniden kullanıldı; yeni üçüncü taraf kodu eklenmedi. Önceki paketlerde incelenen resmî yt-dlp extractor/artifact yolu kullanılır; bu paketin metin gruplama doğruluğu kendi gerçek payload ve regresyonlarından kanıtlanır. License/dependency/kurulum değişikliği yok.

Windows PowerShell/UTF8/Türkçe yollar ve mevcut motor CUDA gerçek kullanıldı. start.bat/install.bat aynı, kişisel uygulama/profil değiştirilmedi. İzole native başlatma tam start.bat/kurulum/DRM kabulü değildir. Mevcut11listener ve kontrol dışı başlangıç Invidious trending ağhata mesajları görüldü; bu mod müzik analizi testi değildir ve bu ağçağrılarından başarı çıkarılmadı. UzunCI/tamtest beklenmedi.90aktifhedef sürer; müzik kapsam dışı.
