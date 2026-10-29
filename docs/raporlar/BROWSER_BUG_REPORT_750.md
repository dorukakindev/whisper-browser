# Rapor 750 — Türkçe ses doğrulamasında yanlış dil ve dürüst kalite kanıtı

## Kanıtlanan sorun

R749 iki gerçek GPU grubunu review bırakmıştı. Yeni ses üretmeden aynı final WAV'ın sync/grup audioStart/audioEnd sınırlarıyla iki parçası alındı. Aynı cached small/CPU int8,beam3,VAD ve previous-context kapalı ayarıyla otomatik dil ile açık Türkçe karşılaştırıldı. İki kısa Türkçe ses de otomatik modda **en** seçildi, Latin/İngilizce benzeri hece dökümü verdi. Bu, yalnız kötü telaffuz kanıtı olarak yorumlanamaz; doğrulayıcı dil seçimi de ölçümü bozuyordu.

## Düzeltme

- `tools/voxcpm2/dub_quality.py verification_request`: beklenen metinde Türkçeye özgü ğ/Ğ/ı/İ/ş/Ş işaretlerinden biri varsa `language=tr` ekler. Sadece ö/ü/ç, İngilizce/Almanca/Fransızca örnekler veya ASCII Türkçe bu ipucuna yetmez; otomatik tanıma korunur. Bu tam dil sınıflandırıcı değildir ve tüm diller için garanti verilmez. Kaynak referansın İngilizce olması hedef dublaj dilini belirlemez.
- `backend/dub_verify.py`: isteğe bağlı kısa dil kodunu doğrular ve gerçek model.transcribe language alanına bağlar. Hedef cümle/kelimeler/initial_prompt verilmez. Çıktıda modelin bildirdiği language ve sonlu0–1 languageProbability varsa döner. Açık language ile modelin language alanı bağımsız akustik dil doğrulaması değildir; zorlanan seçim bilgisi olarak okunmalı.
- `tools/voxcpm2/altyazi_oku.py SpeechVerifier`: aynı request builder'ı kullanır, kalite grubunda requestedLanguage/recognizedLanguage kanıtını tutar. Mevcut speech_check eşikleri ve sayı/olumsuzluk/omission kapıları aynıdır.
- `tools/voxcpm2/accept_dub.py`: finalWAV kabul aracı aynı dil request sözleşmesini kullanır. Kişisel/gerçek metin ASRpromptuna katılmaz.
- `backend/test_dub_verify.py`, yeni `backend/test_verification_language750.py`, `tests/test_dub_acceptance.py`: doğru tr aktarımı, geçersiz tür/kod reddi, yalnız gerekli ortografik ipucu, transport ve kanıt alanları, final kontrolünün aynı yolu kullanması.

Yeni model indirilmedi, yeni TTS/GPU üretimi yapılmadı, eşik gevşetilmedi. Eski cache WAV/JSON kayıtları silinmedi veya otomatik review→passed yükseltilmedi. Daha önce üretilmiş sesin yeni denetimle otomatik tekrar işlenmesi bu paketin özelliği değildir; mevcut kayıtlar tarihsel sonuçlarıyla kalır. Yeni doğrulama istekleri bu yolu kullanır. Ek private NDJSON dil/yanıt alanları geriye uyumludur; anaIPC/ayar/kalıcı sürüm migrasyonu yok.

## Aynı dosyada gerçek A/B

[Ham kısa kanıt](evidence750/same-waveform-language-ab.json); son ses değişmez, groupcrop aynı:

| Grup | Otomatik dil / benzerlik | Açık Türkçe / benzerlik | Sonuç |
|---|---|---|---|
|1|en /0.0000|tr /0.2000|review korunur|
|2|en /0.2963|tr /0.8000|review korunur|

Türkçe ipucu dökümü daha anlamlı yaptı; gerçek telaffuz kusuru ile küçükmodel ASR yanılması hâlâ ayrılmadı. Birinci grupta beklenen fillerin önünde ifadesi hatalı döküldü; ikinci grupta hortumları yerine ortamları yazıldı. Bu farkların tümü sesin kötü veya iyi olduğu iddiasına çevrilmez. İnsan dinlemesi yok. R749'daki ilk/retry skorları farklı üretim/crop olduğundan bu A/B ile birebir skor karşılaştırması yapılmaz. Aynı crop içinde iki ayarın farkı esas alınır.

[Gerçek güncellenmiş worker](evidence750/real-worker.json): backend private NDJSON worker, aynı2crop,2request,exit0; tr metadata ve tanınan metin döndü. YerelCPU smallcached, kişisel ses yok. Ağ/ücretliAPI/GPU yok. Bu gerçek ASR kanıtıdır; model-free transport testinin yerine geçirilmez.

## Test ve kaynak

[Eski worker regresyonu](evidence750/worker-before.txt): yeni language testi parentta KeyError ile kırmızı; parametre modele gitmiyordu. Son testler: verifier3, transport/language2, audit527deadline/malformed5, finalacceptance3 =13PASS. Acceptance testi bilerek blocked_gpu fixture'ı basar; gerçek GPU engeli veya yeni GPU denemesi değildir. Pythoncompile/diffPASS.

[faster-whisper resmî transcribe kaynağı](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) language=None ile algılama ve language verilince o tokenizer dilini kullanma ayrımını destekler. Mevcut API kullanıldı, harici kaynak kodu kopyalanmadı. Lisans MIT; yeni bağımlılık/sürüm/kurulum değişikliği yok.

UI/CSS değiştirilmediği için yeni görüntü testi yapılmadı; önceki UI görselleri bu değişikliğin estetik kanıtı değildir. Windows Türkçe yollarla gerçek CPU worker çalıştı; start.bat/install/CUDAkişiselprogram değişmedi. Tamtest/CI beklenmedi. İnsan kalite kabulü, ASCII-Türkçe dil seçimi, çokdilli ses ve review'ın manuel yeniden değerlendirme UX'i açık kalır.90aktifhedef sürer; müzik eklenmedi.
