# Rapor808 — Ürün100 P51–P60 çeviri miktarı ve SRT kodlaması

Başlangıç `284cb1cbe97e97b7058e2966540bfa2c488957c5`; bitiş ürün kodu `b3327040cdbd17fb354b9b8aa9bf9d091b98e550`; dal `codex/product100-translation808`. [Plan](PRODUCT100_2026-10-30.md)60aday işlendi:31iyileştirme,29mevcut,40sürüyor. Bu paket3hedefte geliştirme,7mevcut davranıştır;10yeni bug değildir.

## Doğrulanan sorunlar

P52: Python blocking gate `It fell by5%.`→`5düştü.` içinde yüzde kaybını kabul ediyordu. Browser sayısal gate bunu fark etse de yalnız number_mismatch sınıfına girdiği için lenient yol kabul edebiliyordu. EN/TR için tek korunmuş açık miktarda yüzde biriminin eklenmesi/kaybı ayrı percentage_mismatch hard guard oldu. Çoklu miktar, başka dil, açık kesir/ondalık dönüşümü için yeni kesin anlam iddiası kurulmaz. Gerçek dönüşümü garanti eden genel semantik model değildir.

Doğru `-5`→`eksi beşti` geçmiş zaman eki yüzünden reddediliyordu; sayı çekim eklerine beşti/birdi/beştir eklendi. Pozitif sayı, eksi sözcüğünden sonraki aynı sayı veya ölçekli `eksi5bin` ile korunmuş sayılmaz. Python ve JS yolları hizalandı; olumsuzluk/kip/gerçek sayı kaybı kapıları gevşetilmedi. Static retry rehberine yüzde düzeltmesi eklendi. Cache anahtarındaki önce/sonra bağlamı kaldırılmadı; eski hit'ler her iki hatta güncel gate ile yeniden denetlendiği için protokol epoch'u gereksiz değiştirilmedi.

P53: Windows gerçek hedefli testinde equal-size hızlı video overwrite sonrası eski dublaj otomatik dönebiliyordu. Stat nanosecond alanları tek başına bütün dosya sistemlerinde yeterli değildir. dub-source-identity artık stat yanında en fazla64KiB baş/son SHA256 parmak izi ve okuma sonrası stat doğrulaması kullanır; fd her durumda kapanır. Bu tüm dosyanın hash'i değildir: metadatası tamamen aynı tutulmuş, yalnız okunmayan orta bölgesi değişmiş büyük dosyayı kanıtlayamaz. local-v2→local-v3-edges değişimi eski yerel kayıtların otomatik source eşleşmesini bir defa geçersiz kılar; ses dosyaları silinmez ve explicit kayıt-ID açma korunur. Uzak YouTube kimliği değişmedi.

P59: Python ortak decoder'ın encoding/repair sonucu plan hattında kayboluyordu. dub_plan SourceCues ve plan sourceDecoding döndürür; dub-service yalnız encoding allowlist ve boolean'ı geçirir. UI EN/TR `şu kodlamayla okundu; harfleri kontrol et; kaynak değişmedi` diye açıklar. Otomatik onarım varsa ayrıca belirtilir. Bu heuristic encoding seçimini kesin tespit diye sunmaz. Test UTF8/UTF16/cp1254 gerçek baytları/Türkçe metni ve kaynak baytlarının değişmediğini doğrular.

## Dosya amaçları

backend/sentence_translation.py ve src/subtitle-sentence-layout.js miktar/işaret kapıları; tools/voxcpm2/dub_plan.py plan decoder metadata; src/dub-service.js bounded IPC metadata; src/dub-source-identity.js bounded fingerprint; src/renderer/dub-generator-ui.js temalı read-info. Yeni testler backend/test_translation_quantity808.py,tests/translation-quantity808.test.js; mevcut dub-service,test_dub_plan_regressions ve native795 genişletildi. dub-service.test.js HEAD içinde tek isimde kalan2cp1254 baytı UTF8'e düzeltildi; scriptin ilk dönüşümünde oluşan çiftCR LF de normalize edildi. Bu test kaynak onarımıdır, ürün encoding iddiası değildir.

## Mevcut kalanlar

P51 JobSummary.snapshot yalnız display alanlarını dondurur; model/dil/ses çevirisi modu görünür, endpoint/key/prompt eklenmez. P54 ortak SDH120örnek corpus ve skipped açıklaması; P55 açık speaker/boundary korunur, etiketsiz konuşmacı saptama iddiası yok. P56 cache v6 context_before/after ve şekil/speaker/document alanları korunur. P57 görsel SRT newline whitespace olur, konuşma grubu ayrı; P58 sıfır-süre1ms onarım/sourceordinal ve ters-sırasız açık reddi mevcut. P60 provider unavailable/overload/auth/rate limit sınıfları mevcut. Bunlar yeni özellik sayılmadı.

## Doğrulama

`PYTHONPATH=backend python -m unittest backend.test_translation_quantity808 backend.test_speech_guard802 backend.test_speech_translation backend.test_subtitle_sdh backend.test_meaning_loss_eval tests.test_dub_plan_regressions` →61geçti;120vaka CC0 anlam korpusu eşikleri değişmedi.
`node --test --test-reporter=spec tests/translation-quantity808.test.js tests/subtitle-sentence-layout.test.js tests/job-summary.test.js tests/dub-service.test.js tests/browser-translation-provider-error.test.js tests/translation-cache-fuzz.test.js` →7Node sonuç geçti. Bazı eski dosyalar kendi çoklu assertionlarını tek dosya sonucu raporlar. Lenient scheduler'ın yüzdesi kaybolan adayı tamamlamaması/cachelememesi doğrulandı; coarse metadata fixture gerçek dosya edge okumasıyla kaynak değişimini test eder.
7JSsyntax,5Pythoncompile,diff geçti. Windows `electron-dub-experience795.smoke.js --experience801 --quantity808`14PNG; EN/TR source-decoding notu gözle incelendi. UI metadata controlled transport, gerçek byte decoder testi ayrı Python'dadır. GPU/DeepSeek yeni çağrılmadı; model kalitesi diye sunulmaz. Tam npm/uzun CI beklenmedi.11before-quit/izolefilter uyarısı açık. Yeni bağımlılık yok; sourceDecoding opsiyonel IPC alanıdır, kalıcı proje şeması değişmedi. Kişisel açık uygulama/start.bat korunur.

## Açık kaynak karşılaştırması

[pysubs2 SubRip okuyucusu](https://github.com/tkarabela/pysubs2/blob/master/pysubs2/formats/subrip.py) ve [MIT lisansı](https://github.com/tkarabela/pysubs2/blob/master/LICENSE.txt) incelendi. Ortak mevcut decoder/kimlik sözleşmesini korumak için framework taşınmadı; dış kod kopyalanmadı. README çalışır kanıt sayılmadı.
