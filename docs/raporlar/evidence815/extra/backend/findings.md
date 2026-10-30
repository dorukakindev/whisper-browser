# R815 ek backend denetimi — yalnız raporlama

HEAD `55bfcca53a995e1217edb547655a50720ff59320`; master. **5 doğrulanmış kök, 7 uygulanabilir geliştirme önerisi.** Eski54bulgu ve ilk turun10backend bulgusu tekrar sayılmadı. Kaynak SHA256, ölçümler ve kontroller [findings.json](findings.json) içinde.

AGENTS/YENI-BILGISAYAR/güncel devir ve gece1000 README+registry okundu. F12/F18/F19/F25 ve senkron aileleriyle karşılaştırıldı; arşivdeki genel normal/sıra/iptal imzaları yeni çalıştırıldı diye sayılmadı. Yeni tetikleyici ve önceki kayıt ilişkisi her bulguda yazılıdır.

Tekrar komutları:

```powershell
& backend/venv/Scripts/python.exe .tmp/extra815-backend/probe.py
& backend/venv/Scripts/python.exe .tmp/extra815-backend/sync-cancel-probe.py
```

Her iki prob exit0 ile bitti; bu mevcut hataları gözlemleyen denetim probudur, düzeltme iddiası değildir. Yeni paket/model/anahtar kurulumuna gerek olmadı. GPU kullanılmadı. Bir test çocuğu native Windows terminate ile sonlandırıldı; gerçek kullanıcı uygulaması kapatılmadı.

## XB01 — P2: Geçerli WebVTT cue gövdesindeki NOTE/STYLE/REGION konuşması siliniyor

**Konum:** `backend/transcribe.py:9699`. **Yöntem:** Gerçek translate_existing_subtitle ve VTT parser; sağlayıcı çağrısı gerekmez.

**Tekrar:** Geçerli VTT zaman satırının altına NOTE this is spoken dialogue. yaz; aynı dil EN→EN çevirisini başlat. STYLE/REGION ayrı negatif çeşitlerdir.

**Gözlenen:** parse_subtitle_entries=[]; gerçek dosya işi Altyazi okunamadi veya bos hatası verir. A spoken note. kontrolü bir cue olarak kalır.

**Beklenen:** Metaveri yalnız yeni NOTE/STYLE/REGION blok başlığında tanınmalı; zaman satırından sonraki cue gövdesi metindir.

**Etki/kök:** Altyazı satırları sessiz kaybolur; tek cue dosyası bütünüyle kullanılamaz. Kök: paragraf filtresini mevcut cue gövdesine de uygulama.

**Önceki kayıt:** R815-B35/B39/B40 farklı ASS çizimi, entity provenance ve inline timestamp mekanizmalarıdır; bu yeni metadata/body sınırıdır. F18 N0341–0360 ile aile örtüşür.

**Sınır:** Native UI/model kalitesi değil; geçerli dosyadan gerçek backend hata yolu.

## XB04 — P2: Altyazı referans hizalamasında örtüşen cue katmanları güven puanını şişiriyor

**Konum:** `backend/browser_align.py:53`. **Yöntem:** Gerçek browser_align.align, gerçek srt/ffsubsync parser; ffsubsync çıktısı kontrollü.

**Tekrar:** Dört zaman bölgesinde aynı ilk3sn boyunca iki geçerli eşzamanlı referans cue; her bölgede10sn hedef cue. Kontrollü hizalama hedefi bu10sn pencerelere getirir.

**Gözlenen:** overlapBefore=0, overlapAfter=.6, confidence=medium. Gerçek referans zaman birleşimi yalnız .3 hedef kapsamına sahiptir.

**Beklenen:** Aynı referans saniyesi bir hedef cue için bir kez sayılmalı; .3 örtüşme .45 medium eşiğini geçmemeli.

**Etki/kök:** Kullanıcı zayıf eşlemeyi orta güvenli sanabilir. Kök: referans aralıklarının birleşimi yerine her örtüşmenin ayrı toplanması.

**Önceki kayıt:** R815-B42 checkpoint diarization kaybından farklıdır. F18/F41 benzeri senkron ailelerinin genel dönüşüm kayıtları mevcut; bu çift katmanlı güven metriği yeni tetikleyicidir.

**Sınır:** autoApply=False korunur; yanlış hizalamanın otomatik uygulandığı veya gerçek ffsubsync modelinin bu sonucu ürettiği iddia edilmez.

## XB05 — P2: Doğru milyar değerleri ASR doğrulamasında sayı kaybı/ekleme diye reddediliyor

**Konum:** `tools/voxcpm2/dub_quality.py:74`. **Yöntem:** Gerçek SpeechVerifier.check sınıfı ve generation_status; kontrollü ASR yanıtı.

**Tekrar:** Beklenen Dünya nüfusu sekiz milyar insanı geçti.; tanınan Dünya nüfusu 8 milyar insanı geçti.; numericReference doğru8milyar.

**Gözlenen:** Review; similarity=.7273, missing_numbers=[8], added_numbers=[8000000000]. Doğru50bin kontrolü review=False; yanlış9milyar review=True.

**Beklenen:** Sekiz milyar ile8milyar aynı miktar olarak karşılaştırılmalı; yanlış9milyar ayrı kalmalı.

**Etki/kök:** Doğru uzun belgesel/ekonomi cümlesi gereksiz sentez/ASR tekrarına ve manuel incelemeye düşer. Kök: mixed_number milyarı rakama açıyor, spoken_text/integer_words üst sınırı1milyarın altı; iki normalizasyon yönü tutarsız.

**Önceki kayıt:** R815-B37/B38 yanlış isim/miktar sahipliği için yanlış kabul mekanizmalarıdır; bu doğru büyük miktarın yanlış ret mekanizması. test_dub_grouped_numbers yalnız50bin/1milyon kapsar; F25 aile örtüşmesi.

**Sınır:** Kontrollü ASR transportu; canlı motorun nasıl ses ürettiği veya milyarı nasıl döktüğü iddia edilmez.

## XB06 — P2: Senkron işi ortak iptal/geçici dosya yaşam döngüsüne katılmadığı için ses kalıntısı bırakıyor

**Konum:** `backend/transcribe.py:10253`. **Yöntem:** Gerçek FFmpeg PCM çıkarımı; native Windows child process terminate; sentetik4sn WAV. Ek kooperatif iptal kontrolü gerçek pipeline controller ile.

**Tekrar:** WHISPER_JOB_TEMP_DIR ve WHISPER_CANCEL_FILE vererek sync_subtitles çalıştır; gerçek ses çıkarımı sonrasında iptal et/çocuğu sonlandır.

**Gözlenen:** 128078bayt audio.wav, main-owned klasörü dışında system-temp/whisper_sync_* altında kalır. Normal tamamlanışta scratch temizlenir. Çıkarımdan hemen sonra gerçek controller markerı oluşturulan ayrı koşu yine done ve synced.srt yazar.

**Beklenen:** Scratch main-owned iş kökü içinde olmalı ve extract sonrasındaki hesaplama/yazım iptal checkpointlerine katılmalı.

**Etki/kök:** Büyük/tekrarlı iptallerde tam medya PCM sesi disk tüketir ve iş temizliği bu sesi kaldıramaz; iptal sonrası final de yazılabilir. Kök: sync alt modunun ham tempfile.mkdtemp ve eksik stage checkpointleriyle ortak job protokolünden ayrılması.

**Önceki kayıt:** Önceki54 içinde yok. R815-B42 resume diarization başka downstream ses kapsamı sorunudur. F16/F41 senkron/iptal aileleriyle ilişkili; pipeline_control.job_temp_directory doğru kontrol örneğidir.

**Sınır:** Yalnız sentetik128KB ses; kişisel medya yok. Tüm gerçek kullanıcı uygulamasının iptal edildiği iddia edilmez; sahip olunan test child öldürüldü. İki gözlem tek yaşam döngüsü kökü sayıldı.

## XB07 — P1: Dizi kanon hafızası sonradan oluşunca exact çeviri cache eski terminolojiyi geri getiriyor

**Konum:** `backend/transcribe.py:4125`. **Yöntem:** Gerçek llm_translate, SeriesMemory dosya kilidi/atomik kayıt ve exact cache; kontrollü OpenAI sağlayıcı.

**Tekrar:** Önce Synthetic_Show.S01E02 içinde The captain is nearby.→Kaptan yakınlarda. çevirisini cachele. Sonra öncekiS01E01 kanon kararını captain=Reis olarak gerçek SeriesMemory.merge ile kaydet. S01E02yi yeniden çevir.

**Gözlenen:** Yeni prompt hint captain=Reis içerir; ikinci iş0sağlayıcı çağrısıyla Kaptan yakınlarda. getirir. Cache kapalı1çağrı kontrolü Reis yakınlarda. döndürür.

**Beklenen:** Modele verilen kanon bağlamı değişince exact cache ve fuzzy scope bu yeni kanon kimliğini ayırmalı.

**Etki/kök:** Bölümler sıra dışı çevrildiğinde sonradan edinilen seri tutarlılığı önceki cache tarafından etkisizleştirilir. Kök: system_prompta series_hint ekleniyor ama translate_cache_key çağrısına veya tm_scopea kimliği taşınmıyor.

**Önceki kayıt:** R815-B41de exact key kullanıcı sahne notunu doğru ayırırken TM fallback yanlış kullanıyordu; burada yeni tetikleyici sonradan oluşan önceki bölüm kanonu ve ilk exact cache katmanı, notlar hiç değişmiyor. F12 N0221–0240 cache ailesiyle ilişkili.

**Sınır:** Ücretli API kullanılmadı. Kanonun dil kalitesi değil, gerçek dosya/cache invalidation davranışı kanıtlandı.

## Geliştirme önerileri — bug sayısına eklenmedi

### XI01: Sıcak motor kapasitesinin yeniden boyutlandırılmasını açık politika yap

**Fayda:** 4paralel yüklü motorun8isteğini sessizce4te tutması yerine kullanıcı GPU bütçesi/yeniden yükleme kararını anlar.

**Kabul ölçütü:** Kontrollü4→8 senaryosunda yeterli kapasite varsa güvenli motor yenilenir veya8in sonraki soğuk başlangıçta uygulanacağı açık gösterilir;4→4 gereksiz yüklemez.

### XI02: Üretim öncesi kaynak ses parçası kimliğini tek tarifte dondur

**Fayda:** Referans hazırlama, prosody, arka plan ayırma ve Whisper farklı çok dilli kanalları sessizce seçmez.

**Kabul ölçütü:** Çok sesli sentetik MKVde seçili kanal kimliği bütün alt işlere taşınır; belirsiz YouTube çok dilinde seçim veya sınırlı uyarı olur. Kişisel sağlayıcı ayarı değişmez.

### XI03: Kısa örnek için gerçek tahmini süre ve bütçe göster

**Fayda:** Tek büyük cue veya yavaş konuşma örneğinin beklenenden uzun sürmesi önceden görülür.

**Kabul ölçütü:** Örnek planı kaynak aralığı, seçili grup, tahmini ses/sentez süresini gösterir;55sn hedefi aşılınca açık neden ve kapsam seçimi vardır; metin otomatik kesilmez.

### XI04: Kalite kartında akustik, ASR ve insan dinlemesini ayrı kanıtlar olarak tut

**Fayda:** Ready/Review tek rozeti doğrulayıcı yokluğu veya yalnız kelime benzerliğiyle insan doğallığı onayını karıştırmaz.

**Kabul ölçütü:** Saved project→reopen sonrasında acoustic checked, ASR passed/review/unavailable/not_checked ve listening unchecked/checked ayrı korunur; hiçbir kontrollü ASR testi insan dinlemesi diye işaretlenmez.

### XI05: Senkron önizlemesinde ölçülebilir güven özeti sun

**Fayda:** Sessiz/ritimsiz kaynakta0korelasyon veya az destek yanlış bir başarı hissi oluşturmaz.

**Kabul ölçütü:** Aktif ses oranı, aday offset/ratio skoru ve zayıf/bağlı sonuç görünür; sessiz4sn fixture kesin hizalanmış diye sunulmaz. Kaynak/önceki çıktı kullanıcı kararı olmadan değişmez.

### XI06: Dublajı dışa aktarmadan önce kısa lokal karışım önizlemesi ve hedef preflightı

**Fayda:** Uzun render öncesi ses katmanı seviyesi, hedef disk alanı ve dosya sistemi sınırları anlaşılır.

**Kabul ölçütü:** Aynı mix/sync motoruyla seçili5–10sn önizleme; sessiz/tepe sınırı görünür. Yetersiz boş alan veya exclusive-install desteği eksik hedef render başlamadan açıklanır; kullanıcının kişisel ses/ayarları değiştirilmez.

### XI07: Canlı ASR dil geçişinde düşük güvenli ara gözlemlerin politikasını açıklaştır

**Fayda:** Bir önceki dilde fallback ile çözülen kararsız parçanın dil değiştirme aday sayacını kesip kesmediği belirli olur.

**Kabul ölçütü:** ENyüksek→TRyüksek→DEdüşük/ENfallback→TRyüksek senaryosunun beklenen durumu ürün kararı olarak belgelenir; ardından gerçek sesli dil değişimi/kararsızlık kabulü yapılır. Araya yüksek güvenliEN girince mevcut reset korunur.

## Dışarıda bırakılan adaylar

- XB03: Ardışık yüksek güvenli gözlemler sayılırken düşük güvenli gözlemleri yok saymak olası tasarım politikası; ad/yorum tek başına kesin hata sözleşmesi değil. XI07 önerisine taşındı.
- CANDIDATE-speaker: [man] etiketi plan metninde görülüyor ama gerçek sentezde okunma etkisi kanıtlanmadı; bug sayılmadı.
- XB02: Sıcak4→8 kapasite davranışı ölçüldü fakat mevcut otomatik kapasite politikasına karşı kesin işlev sözleşmesi yok; XI01 geliştirmesi yapıldı, bug sayılmadı.

Kaynak/UI/test/kurulum/Git değişmedi. Ücretli API, gerçek Whisper/GPU/TTS veya insan dinlemesi yapılmadı. FFmpeg gerçek PCM çıkarımıdır. Kontrollü model/ASR/provider bulguları model kalitesi iddiası değildir. Ham kişisel veri kullanılmadı.
