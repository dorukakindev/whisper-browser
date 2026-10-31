# Kritik kapsamın son kabul kontrolleri — 31 Ekim 2026

Temel: master `e19f66f5` / PR737. Kullanıcı sayı kotasını kaldırdı; bu belge 200 adayın tamamlandığı iddiası değildir. Bu turda yeni kritik ürün hatası bulunmadı, ürün kodu değiştirilmedi. Zaten doğru davranışlar kabul testleriyle kanıtlandı.

## Gerçek transkripsiyon ve ana sayfa devamlılığı

`tests/electron-whisper-home-continuity.smoke.js` normal uygulama kuyruğu üzerinden gerçek `backend/transcribe.py` alt sürecini çalıştırır. Önbellekteki tiny/faster-whisper CPU int8 modeli, yerel Windows SAPI sentetik İngilizce konuşmayı gerçekten transkribe eder; model veya sonuç olayları taklit edilmez. Model indirimi yapılmaz.

Gerçek alt süreç sürerken Ana sayfa → aynı iş/kaynakla geri dönüş → tekrar Ana sayfa → gerçek tamamlanma → sonuçla özgün oynatıcıya dönüş geçti. Tek backend süreci, exit 0, gerçek 14 satırlık SRT; sonuç Ana sayfa odağını çalmadı. Native test de exit 0. İlk test hazırlığında tek dosyayı kuyruğa ekleme varsayımı düzeltildi; üretim kodu değiştirilmedi. Kanıt `native-whisper-home.json`, render `whisper-returned-result.png`.

## Gerçek normal ve ses için çeviri

Aynı sentetik İngilizce SRT, `tools/translation-deepseek-live.cjs` üzerinden gerçek üretim Python çeviri hattında iki modda çalıştırıldı. DeepInfra / `deepseek-ai/DeepSeek-V4.1-Flash-1017`, **standard**, Flex kullanılmadı. Normal 2, speech 5 HTTP 200 isteği; her iki backend exit 0. Dokuz cue’nun tamamı çevrildi; boş/eksik/başarısız/zaman uyumsuzluğu yok.

Sayı/kapsam, kısmi olumsuzluk, açık neden/dışlanan neden, unless/even-if koşulu, izin/yasak, iki konuşmacılı sahiplik/alıcı, kâr→zarar ve zamansallık/nedensellik için sekiz vakanın anlamı kaynakla ayrıca okundu. İlk geçiş ve son çıktılar iki modda da aynı dokuz metni korudu. Bu sonuç yalnız kalite metriğinin sıfır olmasına dayanmıyor. Ayrıntı `live-meaning-review.json`, karşılaştırılabilir gerçek metinler `source.srt`, `normal.srt`, `speech.srt`.

Nüans: brother doğal biçimde cinsiyet belirtmeyen kardeş olarak çevrildi; sahiplik ve alıcı karşıtlığı korundu. Tam sözcüksel eşdeğerlik veya genel hatasızlık iddiası yok. Ses için çeviri her iyi ilk cümleyi değiştirmek zorunda değildir; bu örnekte zoraki yeniden yazma olmadı.

Kullanıcının önceden açıkça izin verdiği kayıtlı DeepInfra anahtarı, mevcut güvenli broker üzerinden yalnız süreç belleği/IPC/HTTPS Authorization içinde kullanıldı. Komut satırı, rapor ve kaynak dosyalarına yazılmadı; kişisel ayarlarda değişiklik yapılmadı. Ham yerel istek kayıtları bu teslime alınmadı; yalnız sentetik metin ve güvenli sayısal kanıt eklendi.

## Asistanın gerçek arayüzü

`tests/electron-assistant-acceptance-final.smoke.js`, gerçek native overlay/main ve kontrollü yerel HTTP/SSE ile uzun yanıt, çok uzun kod satırı, akış sürerken yukarıdaki metni okuma, yeni yanıta kaydırma, araç kartı ve ayrı onay panelini sınar. TR/EN × koyu/açık × normal/dar ebeveyn pencerede sekiz durum; 16 kontrollü sağlayıcı isteği, native runner exit 0.

Normal ebeveyn 1440×1000 iken panel 480×720; dar ebeveyn 480×640 iken panel 456×576. Metinler birbirini ezmiyor, kod kendi alanında yatay kayıyor, belge taşmıyor, composer/durdur/gönder/arama görünür. Onay bölümü gerektiğinde kendi içinde kaydırılabiliyor; düğmeler yalnız dış ekran sınırıyla değil gerçek hit-test ve İptal tıklamasıyla da doğrulandı. İlk bakışta kırpık görünen kontrol kaydırmayla erişilebilir çıktı; bu davranış keyfi bug sayılmadı. Renderlar incelendi; örnek `assistant-narrow-review.png`, ölçümler `native-assistant-ui.json`.

Web Interface Guidelines becerisi ve güncel [resmî kurallar](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) incelemeye yardımcı oldu. Bu, uygulamanın bütün ekranlarında tüm erişilebilirlik kurallarının geçtiği iddiası değildir.

## Tekrar üretim ve sınırlar

- `electron tests/electron-whisper-home-continuity.smoke.js` (Windows, mevcut tiny cache ve backend gerektirir).
- `electron tests/electron-assistant-acceptance-final.smoke.js` (yerel SSE, dış API gerektirmez).
- `electron tools/translation-deepseek-live.cjs --run-live-speech-translation --source <source.srt>`; normal için `--normal-translation`. Bu opt-in komut gerçek ücretli inference kullanır, kayıtlı anahtar broker’ı gerektirir; anahtar argv’ye verilmez.
- Native Windows koşuları kendi izole profillerini açtı, kişisel uygulamayı kapatmadı.

Bu tur GPU dublajı veya insan dinleme karşılaştırması yapmadı. Önceki gerçek VoxCPM2/GPU A-B kanıtı `../natural-turkish-dubbing-2026-10-31/` içinde, kendi sürümü ve sınırlarıyla korunur. Akustik doğallık/oyunculuk üstünlüğü matematiksel veya ASR metin eşleşmesiyle kanıtlanmış değildir.

Son tam yerel sonuç ve kaynak sabitliği `validation.json` içinde tutulur. Ana dal teslimi mevcut sürekli kullanıcı onayıyla yapılır; uzun CI beklenmez.

## Son yerel sonuç

727 Node + 171 Python dosyalı tam yerel koşu exit 0; 1627 kaynak dosyası koşu boyunca sabitti. Ardından yalnız smoke seçicisine açık `--model` kategorisi eklendi; gerçek model/cache gerektiren test normal `--all` kapsamına zorla sokulmadı. Beş gerçek seçici yolu spawn sınırında doğrulandı, üç JS dosyasının syntax/UTF-8 kontrolü geçti. Ürün kodu bu tur değişmedi; tam paket bu test-seçici uzantısından sonra tekrar koşulmadı. Model kabulü ayrıca açık seçici üzerinden gerçek çalıştırılır ve sonucu validation.json’a eklenir.

Açık seçicinin gerçek çalıştırılması da tamamlandı: `node tests/run-electron-smokes.js --model` exit 0, tek gerçek backend exit 0; tekrar koşuda 24 cue çıktı. İlk kabul koşusunda 14 cue vardı. Bu kabulün ölçütü deterministik satır sayısı değil, gerçek işin sürmesi, tek süreçte tamamlanması ve kendi SRT’sinin doğru oynatıcıya yüklenmesidir. İki ayrı receipt korunur; ASR kalite karşılaştırması yapılmadı.
