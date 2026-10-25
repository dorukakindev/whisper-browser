# Rapor545 — Konuşma bütünlüğü, uzun tek satır ve ham ses kalite kapısı

2026-10-25. Repo https://github.com/dorukakindev/whisper-browser. Dal codex/dub-fluency545; başlangıç master b147597519f5bdb99041ef24429ff3724cf66480; bitiş ürün/test **056e0870459f6b021348e74f4c3a29d3e00cb02f**. D:\Whisper Local\tmp\audit470 temiz checkout kullanıldı. Ana D:\Whisper Local master ve önceden kirli kullanıcı belgeleri/untracked dosyaları değiştirilmedi. Kullanıcı son önerideki ses/çeviri iyileştirmelerine “tamam yap” dedi; güncel AGENTS gereği PR hazırlanır, otomatik merge yapılmaz.

## Teyit edilen sorunlar ve uygulama

### 1. Uzun tek cue gruplama sınırını aşıyordu

Mevcut akıcı planlayıcı yalnız birden çok cue birleştirirken karakter/süre sınırı uyguluyor. Tek kaynak satırı veya elle gözden geçirilmiş uzun metin bölünmeden modele gidebiliyordu. Kelime silmeden model isteğini sınırlamak için yeni dub_utterance.py,420karakter üzerini mevcut cümle/yan-cümle sınırı yordamıyla dengeli bloklara ayırır.420uygulamanın muhafazakâr eşiğidir, resmî bir model garantisi değildir. Bölünemez tek token ortadan kesilmez; dolayısıyla mutlak420garantisi yoktur. Normal kısa gruplar aynı tek istek yolunu korur. Kaynak ID, SRT ve video zaman çizelgesi değişmez. Aynı özgün referans ve seed bütün alt bloklara gider; üretilen ses sonraki prompt'a zincirlenmez.

Parçalar yalnız eksik noktalama durakları eklenerek, konuşma üst üste bindirilmeden birleşir. Ham parça kalite puanı son sese taşınır; her parça bozuksa dalga formu sırf “başarılı” denmez. Geçerli ama inceleme isteyen aday korunup mevcut sınırlı retry/ASR yoluna gider. İptal/istisna mevcut grup koruma yoluna iletilir. Yeni uzun-cue yöntemi kendi ses/cache ve rapor kimliğini kullanır; eski sesler/raporlar silinmez. Kısa, AI düzenlemesiz parçaların kimliği korunur.

Yeni gerçek üretim regresyonu eski uret() fonksiyonunda kırmızı:1istek; son kodda birden fazla boundedistek, bütün sözcükler aynı sırada, tek özgün grup anahtarı ve tam metne ASR doğrulamasıyla yeşil. Bu bir takılma olasılığı azaltma önlemidir; tüm metinlerde timeout olmayacağı iddiası değildir.

### 2. Doğrulama retry'si kırpılmayı son işlemle gizleyebiliyordu

İlk dalga formu ASR incelemesi istediğinde ikinci aday önce prepare/finish ile attenuate ediliyor, sonra akustik değerlendirme yapılıyordu. Kontrollü kırpılmış ikinci aday, tepe düşürülünce puan0ve ASRpassed ile ilk kullanılabilir sesi değiştirebiliyordu. Son kod candidate_raw üzerinden puanlar; eşik kararını son işlem öncesi verir. İlk kullanılabilir kayıt korunur. Yeni regresyon orijinal kodda ready!=review ile kırmızı; son kodda review ve özgün .1tepe dalga formu korunarak yeşil. Bu, düzeltmeden önceki gerçek kod yolu üzerinde çalıştırıldı.

### 3. Metin düzenleyici ünlem ve tereddüdü silebiliyordu

safeShortening soru işaretlerini koruyordu ama ünlem/üç nokta için kanıt yoktu. “Dur!”→“Dur.” veya “Belki...”→“Belki,” kabul edilebiliyordu. Artık ünlem ve tereddüt sayıları değişirse otomatik düzenleme reddedilir; ...ile…eşdeğer sayılır. Bu tek başına tüm duygu/anlam eşdeğerliğinin kanıtı değildir. Sorular/sayılar/olumsuzluk/adlar/birimler için mevcut korumalar sürer.

Ses için ilk çeviri ve kaynakla karşılaştıran refine geçişi, retorik soru, ünlem, yarım düşünce, alıntı ve anlamlı tekrarların işlevini korumayı açıkça ister. Yeni duygu/sahne etiketi eklenmez. Normal çeviri promptu değişmez. Doğal Türkçe editörünün systemtalimatı ve payload sözleşmesi aynı ilkeyi taşır; komşu metin salt bağlamdır. Yeni speech-v7-delivery-contract backend ve browser reuse metadata'sında birlikte kullanılır; v6çeviriler yeni denemede sessizce onaylı sayılmaz. Eski dosyalar silinmez. Editör kimliği speech-editor-v4-delivery-contract, eski editör önbelleğini ayırır.

## Gerçek GPU ve dinleme kanıtı

İki120süreli cue'da580ve611karakter, toplam1191karakter Türkçe anlatım; sentetik temiz referans, aynı döküm/seed/15adım/CFG1.65/temperature.8/concurrency2. RTX4070 SUPER ve nano-vLLM/VoxCPM2. Zaman çizelgesi122s; konuşma yaklaşık80s, cue arası ve sonundaki video boşlukları korunuyor. Kullanıcının gerçek kişisel sesini/API anahtarını veya YouTube hesabını kullanmadık.

| Deneme | Model s | Referans s | Birikimli sentez s | ASR s | Duvar s |
|---|---:|---:|---:|---:|---:|
| Önce |12.218|1.985|128.439|üretim içi unavailable|84.062|
| Yeni bounded yol |11.375|1.906|144.578|16.000|103.829|

Önemli test düzeni hatası: baseline kod kopyası tmp altına taşındığı için ROOT.parents üzerinden verifier script yolu yanlış kaldı. Bu yüzden orijinal üretim review/unavailable idi; başarı diye gizlenmedi. Aynı önce.wav içindeki iki gerçek grup sonradan aynı small/int8 CPU Whisper ve aynı speech_check ile tekrar kontrol edildi:6.422/6.656s, review=false, benzerlik .9487/.9615. Yeni iki grup üretim içinde ready/passed (.9615/.9487), eksik/eklenen bölüm, sayı ve olumsuzluk işareti yok. ASR doğal duyulma veya kusursuz kelime doğruluğu kanıtı değildir. Sentez süreleri paralel işlerin birikimidir; walltime değildir. Yeni yol bu koşuda daha hızlı değildi; hız veya algısal üstünlük iddiası yok.

GPU üretiminden sonra ham puanı taşıma ve rapor-kimliği izolasyonu sonlandırıldı; bu ek korumalar kontrollü regresyonlarda sınandı. Tam GPU koşusu tekrar edilmedi. Son CLI iki tamamlanmış cacheparçasını kullanıp generated_groups=0ile aynı yeni WAV'ın SHA256birebir eşini üretti (placement/file wall2.813s; süreç açılışı dahil hız ölçümü değildir).

Yerel, Git dışı kanıtlar:
- tmp/dub545-audio/önce.wav, sonra.wav, sonra-final.wav; before.log, after.log, final-cache.log.
- tmp/dub545-audio/baseline-post-verification.json ve verify-before.log.
- tmp/dub545-audio/comparison/listen.html ve comparison.json: yan yana gerçek sesler; otomatik kazanan yok. Kullanıcı dinleme kararı bekleniyor.
- .uiprev/dub-pipeline-playback/1792886800898-21532/results.json: gerçek yeni WAV native Electron decode/play/pause/seek/orijinal mute-rate restore geçti; kullanılan video sentetik.

## Hedefli kontroller

- backend/venv/Scripts/python.exe tests/test_dub_utterance.py:4geçti.
- Aynı Python ile tests/test_dub_generation_quality.py:19geçti; tamamlanan parçaların korunması, son parça stall/retry ve iptal yolları dahil.
- backend/test_speech_translation.py:17geçti; iki geçişte sözleşme, normal mod izolasyonu ve eski/yeni cache ayrımı.
- tests/test_report494_audio.py:6geçti.
- node tests/dub-text-guard.test.js ve dub-editor-request.test.js:geçti.
- browser-youtube-whisper, speech-translation-ui:geçti. report518-regressions:5geçti.
- dub-service:geçti; worker+handoff:3geçti.
- assistant-overlay:1geçti; aynı webContents'in alt frame'leri de reddedildi. Önceki raporun IPC şüphesi güncel kodda bug olarak doğrulanmadı: owner/ownView sender+mainFrame kontrolü zaten var. Ürün güvenlik kodu değiştirilmedi.
- Değişen JS node --check, Python py_compile ve git diff --check:geçti.

Tam npm test/CI beklenmedi; önceki tam CI'da rapor544'te listelenen sorunlar açık. CI kapatılmadı, başarılı denmez. Normal start.bat temiz açılışı/install.bat/gerçek YouTube/DRM/farklı kart ve kişisel ses benzerliği bu turda doğrulanmadı. UI kontrolü/görünümü değişmedi; yeni browser metadata davranışı hedefli fixture ile, ses oynatma gerçek Windows Electron ile sınandı. Canlı ücretli sağlayıcı kullanılmadı: çeviri iyileşmesi talimat/sözleşme ve kontrollü sağlayıcı test düzeyinde, gerçek model kalite iddiası değildir.

## Dosya amaçları ve uyumluluk

- tools/voxcpm2/dub_utterance.py yeni boundedüretim,altyazi_oku.py entegrasyon/ham kalite/cache-rapor kimliği.
- src/dub-text-guard.js vurgu/tereddüt kapısı; dub-editor-request.js açık teslim sözleşmesi; main.js editör sürümü.
- backend/transcribe.py konuşma promptları ve protocol; renderer/renderer.js browser metadata/reuse eşleşmesi.
- backend/test_speech_translation.py, test_dub_utterance.py, test_dub_generation_quality.py yeni regresyonlar; browser-youtube-whisper/report518 yeni protokol fixture'ları; dub-text-guard/dub-editor-request sözleşme kontrolleri; assistant-overlay altframe negatifleri.
- AGENTS.md sayaç545, rapor INDEX ve tarihli devir indeksi belgeleridir.

Yeni bağımlılık/model/lock/kurulum değişikliği yok. NVIDIA/Python/FFmpeg süreçleri yalnız teste ait; kişisel uygulama kapatılmadı. Ana sürüm/yerel kullanıcı ayarları değiştirilmedi. PR incelemesi ve öznel A/B dinleme kaldı.

## İncelenen resmî kaynaklar

[OpenBMB VoxCPM2 kullanım rehberi](https://openbmb.cn/docs/en/guides/voxcpm/voxcpm-2) uzun metinlerde cümle/paragraf bölmeyi ve karşılaştırmada sabit seed öneriyor. [VoxCPM kullanım belgeleri](https://voxcpm.readthedocs.io/en/latest/usage_guide.html) doğru referans dökümünü ve reference/prompt ayrımını açıklıyor. [Resmî model kartı](https://huggingface.co/openbmb/VoxCPM2) kontrolün ve uzun girdinin değişkenliğini açıklar. Bunlardan doğrudan kod kopyalanmadı; mevcut yerel sınır/retry/bitirme yordamları genişletildi. Model kartındaki48kHz bilgisi eski16kHzörneğiyle çelişebildiğinden kod mevcut gerçek server.sample_rate'i kullanır; örnek sabiti kopyalanmadı.
