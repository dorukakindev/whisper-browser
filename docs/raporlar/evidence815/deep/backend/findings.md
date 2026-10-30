# R815 Backend denetim alt raporu — salt raporlama

Kaynak HEAD `6b3df86e35db8bc3271440f06c779cfb0acb2c22`, master, Windows, Python backend venv. Ürün/test/Git değişikliği yapılmadı. Tekrar: `& backend/venv/Scripts/python.exe .tmp/deep815-backend/probe.py`. Sentetik dosyalar, kontrollü sağlayıcı ve kontrollü ASR yanıtları kullanıldı; gerçek model kalitesi, fiziksel ses veya native UI kabulü iddia edilmez. Kanıt `observations.json`; kaynak prob `probe.py`. Probda kontrol edilen hata davranışları başarılı bir düzeltme anlamına gelmez.

Gece1000 README ve registry önce okundu. İlgili F14 N0261–0280, F18 N0341–0360, F21 N0401–0420, F25 N0481–0500 kayıtları `prior-coverage.json` içinde saklandı. Bu kayıtların normal/sınır/dönüşüm imzaları bu dosyadaki belirli çok-dil dual çakışması, karma-dil speech atlama, ASS çizimi, gövde zaman aralığı, ASR kişi/miktar sahipliği, VTT literal etiket/inline timestamp ve kullanıcı sahne notu→TM fallback senaryolarını belgelenmiş bağımsız kanıt olarak içermiyor. Geçmiş1000 yeniden çalıştırılmadı veya yeni keşif sayılmadı. R179 aynı-dil kapısının eklenmesini, R206 açık kaynak dilinde kapı denetimini tarihsel doğru olarak kaydeder; aşağıdaki BE02 farklı auto+karma uzun speech girdisidir. R301 browser ASS çizim desteği kaydeder; BE03 backend çeviri parser'ının ayrı yolu. R733/808 çeviri sayı kapıları BE06'daki ASR doğrulaması değildir.

## BE01 — P1: Başka hedef dilde çeviri önceki çift dilli dosyayı eziyor

Konum: `backend/transcribe.py:166` (translation_output_labels; variant yoksa dual stem hedef dili içermez), `:9353` (translate_existing_subtitle dual_path), normal transkripsiyonda aynı yol `:8355`.

Tekrar: aynı `dual-source.en.srt` için dual_subtitle açık önce TR, sonra DE çevirisi üret. İki işlem gerçek translate_existing_subtitle/yazıcı/OutputTransaction yolunu kullanır; yalnız sağlayıcı cevabı kontrollüdür. Gözlem: `dual-source.tr.srt` ve `.de.srt` ayrı korunurken her iki çift dilli çıktı `dual-source.dual.srt`; ilk `Rapor hazır.` ikinci çalışmadan sonra `Der Bericht ist fertig.` olur. Beklenen: her hedef dil/qualifier için ayrı çift dilli çıktı veya açık üzerine-yazma kararı. Etki: önceden oluşturulmuş hedef-dil dual çıktısı sessiz kaybolur. Kök: dual dosya kimliğinden hedef dilin düşmesi; genel yazıcı veya API hatası değil.

## BE02 — P1: Auto kaynakta Türkçe açılış, kalan İngilizce konuşmayı çevrilmiş gibi tamamlıyor

Konum: `backend/transcribe.py:3911–3925` (ilk40satır çoğunluk sezgisi), `:9090–9096`, `:9135` civarı same_language kolu; speech ön işleminde rolling tekilleştirme kapalı `:8942`.

Tekrar:100cue; ilk40 `Bu iş için şimdi hazırız.`, kalan60 `We need to finish this important report.`; translate_for_speech=True, language=auto, target=tr. Gerçek dosya çeviri akışı. Gözlem:0sağlayıcı çağrısı, çıktı60İngilizce cue içeriyor; output status=complete, failed=0. Aynı girdiye açık language=en negatif kontrolü1sağlayıcı çağrısı yapar. Beklenen: Türkçe satırlar korunurken İngilizce satırlar çevrilir veya karma dil işi tam çeviri kabul edilmez. Etki: dublaj hazırlığı İngilizce kalan çoğunluğu tamamlanmış Türkçe sayabilir. Kök: dosyanın ilk40satırına ait çoğunluk sinyalinin tüm dosya için kesin aynı-dil atlaması olması.

## BE03 — P2: ASS vektör çizim koordinatları gerçek çeviri girdisi oluyor

Konum: `backend/transcribe.py:9730–9762`, özellikle `:9761` tüm override etiketlerini siler ama `\p1` çizim durumunu izlemez; `:8916` parse_subtitle_entries → translate_existing_subtitle.

Tekrar: geçerli [Events] Dialogue `{\p1}m 0 0 l 100 0 100 100{\p0}` ve sonraki `Hello there.`. Gözlem: gerçek translate_existing_subtitle sağlayıcı sınırı iki giriş görür; ilki `m 0 0 l 100 0 100 100`. Beklenen: çizim komutları çeviri/konuşma metni sayılmaz; metin moduna dönüş sonrası gerçek yazı varsa yalnız o korunur. Etki: çizim koordinatlarına ücretli çeviri, saçma metin/konuşma ve yanlış cue sayısı. Kök: ASS çizim durumunun backend ayrıştırıcıda yokluğu. Browser ASS desteği bunu savunmaz.

## BE04 — P2: SRT gövdesindeki zaman aralığı dublajda hayalet cue ve kimlik kayması üretiyor

Konum: `tools/voxcpm2/dub_plan.py:15`, `:76–106`; çağıran gerçek plan `:194` ve `src/dub-service.js:261`.

Tekrar:1.cue gövdesi `Use this interval:\n00:00:02,000 --> 00:00:03,000\nfor the title.`, 2.cue normal. Gözlem: backend parse_subtitle_entries doğru2cue ve literal zaman metnini korur; gerçek D.plan(grouping=satir)3grup döndürür. İlk metin `Use this interval:`, hayalet grup2 `for the title.`(2–3sn), gerçek cue2 artık source_id3. Beklenen: gövde zaman metni yeni başlık sayılmaz; kaynak2cue ve kimlik korunur. Etki: zaman metni okunmaz, devamı yanlış aralığa yerleşir, sonraki düzeltme/prosody source_ids kayar. Kök: dublaj parser'ı her TIME_RE eşleşmesini cue sayıyor; backend separator/identifier kontrolü burada yok.

## BE05 — P2: ASR'de yalın özel ad değişimi passed/ready kalıyor

Konum: `tools/voxcpm2/dub_quality.py:204–214` yalnız hemen apostrof izlenen adları seçer; `:224` generation_status. Gerçek `tools/voxcpm2/altyazi_oku.py:93–139` SpeechVerifier.check ve `:445` durum çağrısı.

Tekrar: uzun, aynı Türkçe bağlam ardından beklenen `Mehmet toplantıya katıldı.`, kontrollü ASR `Ahmet toplantıya katıldı.`. Gerçek SpeechVerifier.check sınıfı AST ile engine yüklemeden çalıştırıldı; stdin/stdout kontrollü subprocess cevabı. Gözlem: similarity=.9444, missing_names=[], review=False, verifier.status=passed, generation_status(0,...)=ready. Aynı metin kontrolü passed; olumsuzluk ters çevirme kontrolü review. Beklenen: açıkça değişen yalın kişi adı review; adın Türkçe ek/apostrof almaması korumayı düşürmemeli. Etki: yanlış kişiyi söyleyen kayıt güvenilir hazır diye gösterilir ve cache'de saklanabilir. Kök: ad çıkarma regex'inin yalnız apostroflu isimlere uygulanması. Bu canlı TTS'nin isim değiştirdiği iddiası değil; gerçek doğrulayıcının kontrollü yanlış-ASR'yi kabul kanıtıdır.

## BE06 — P2: Aynı sayıların kişiler arasında takası ASR miktar kapısından geçiyor

Konum: `tools/voxcpm2/dub_quality.py:79–87` (Counter miktarları sıra/özne bağından koparır), `:175–186` (sayı-birim eşlemesi yalnız bilinen fiziksel birimlerde), `:214–224`; aynı SpeechVerifier.check→generation_status üretim zinciri.

Tekrar: aynı uzun Türkçe bağlam ardından beklenen `Ali beş, Ayşe on kitap aldı.`, ASR `Ali on, Ayşe beş kitap aldı.`. Gözlem: similarity=.9048; spoken_number_mismatch=False, semantic_mismatch=False, review=False; gerçek verifier passed ve generation ready. `Ayşe on`dan `on` tamamen çıkarılan negatif kontrolü review=True. Beklenen: miktarların sahipliği değiştiğinde review. Etki: aynı miktarlar anılsa da yanlış kişiye/adrese bağlanan konuşma hazır sayılır. Kök: sayıları ve birimleri çoklu küme olarak kontrol edip ilişkisel sıralamayı göz ardı etme; BE05 özel-ad regex'inden bağımsızdır. Model/akustik başarı iddiası yok.

## BE07 — P2: Literal WebVTT etiketi yeniden dışa aktarımda gerçek stile dönüşüyor

Konum: `backend/transcribe.py:9715` civarı _VTT_CHARREF çözümü; `:1964–1986` izinli HTML/VTT etiketlerini koruyan vtt_escape_cue_text.

Tekrar: `literal-tags.vtt` gövdesi `Type &lt;b&gt;hello&lt;/b&gt; to enter the tag.`; gerçek translate_existing_subtitle language=en,target=en,formats=vtt. Gözlem:0sağlayıcı çağrısıyla çıktı `Type <b>hello</b> to enter the tag.`. Beklenen: ekranda görünen `<b>`/`</b>` literal metni korunur; parse→write işlemi bunu kalın stil koduna çevirmemeli. Etki: kod/işaret anlatan altyazıdaki gerçek içerik kaybolur. Kök: karakter referansları çözülünce literal '<' ile gerçek başlangıç etiketinin kökeninin kaybolması. BE08'in timestamp tanımama kökünden farklı.

## BE08 — P2: WebVTT inline zaman etiketi çeviriye konuşma, çıktıya görünen metin olarak taşınıyor

Konum: `backend/transcribe.py:9641–9727` parse_srt(vtt=True), `:1964–1986` kaçış, `:8916` gerçek hazır-altyazı yolu.

Tekrar: geçerli VTT cue `Hello <00:00:02.000>world.` (1–4sn). Gözlem: gerçek TR çeviri sağlayıcı girişinde `Hello <00:00:02.000>world.`; aynı-dil VTT yazımında `Hello &lt;00:00:02.000>world.`. Beklenen: inline zaman kontrolü konuşma düz metni değildir; metin `Hello world.` korunmalı, destekleniyorsa timing metadata olarak kalmalı. Etki: karaoke/YouTube VTT'deki kontrol zamanları kullanıcıya görünür, modele/dublaj girdisine sızar. Kök: VTT timestamp token'ının parse edilmemesi; literal entity etiketiyle ilgili BE07'den farklı giriş ve düzeltme gerekir.

## BE09 — P1: Kullanıcı sahne notu değişince eski çeviri fuzzy hafızadan geri geliyor

Konum: `backend/transcribe.py:4231–4250` tm_scope_identity, `:4300–4305` tm_context, `:4420` TM fallback; exact cache ise sahne notunu doğru içerir `:3719–3720`.

Tekrar: gerçek llm_translate kontrollü OpenAI ile `The bank is very close.` ve aynı cache/input. İlk scene_context={'location':'financial district'}→1istek ve `Banka çok yakın.`. Sonra scene_context={'location':'river bank'} ve sağlayıcı yeni cevap `Nehir kıyısı çok yakın.` verecek. Gözlem: exact cache key farklı olduğu halde ikinci iş0istek yapıp `Banka çok yakın.` getirir. Cache kapalı negatif kontrolü1istek yapıp `Nehir kıyısı çok yakın.` alır. Beklenen: açık kullanıcı bağlamı değiştiğinde önceki bağlamın çevirisi otomatik yeniden kullanılmaz. Etki: kullanıcı sahne bağlamını düzelttiği halde aynı yanlış anlam geri gelir; kullanıcı değişikliğinin etkisiz görünmesi. Kök: exact cache ayrıştırılmışken ikinci katman TM scope/context'in scene_context'i içermemesi. BE02'nin dil atlama yolundan bağımsızdır.

## Sınırlar

9 bağımsız kök raporlandı; aynı kökün çok örneği ayrı sayılmadı. Dublaj kalite iki senaryosu gerçek SpeechVerifier sınıfının kontrollü ASR yanıtı ile doğrulanmasıdır; modelin böyle ses ürettiği veya Whisper'ın canlı yanlış döküm yaptığı iddia edilmez. BE03 sağlayıcı sınırına ulaşmayı doğrular, ücretli sağlayıcının çizimi nasıl çevireceğini iddia etmez. Ürün değişikliği, regresyon testi ekleme, kurulum, kişisel ayar, gerçek anahtar/profil veya git mutasyonu yok. Native Windows UI, start.bat, tam npm suite, GPU ve CI koşulmadı.

## BE10 — P2: Checkpoint'ten devamda korunmuş eski cue'lar konuşmacı kimliğini kaybediyor

Konum: `backend/transcribe.py:7582–7584` resume sesini son sınırdan kırpar; `:7933` eski cue'ları birleştirir; `:8075–8084` diarization yalnız kırpılmış WAV üzerinde çalışır; `:8125` civarı assign_speakers bütün cue'lara yalnız bu suffix span'lerini uygular. Checkpoint `:7291` konuşmacı span'lerini saklamaz.

Tekrar:12sn kontrollü yerel WAV için geçerli checkpoint cue'ları0–2,3–5,8–10sn, last_time10. Diarize=True ve resume=True ile gerçek T.transcribe çağrısı; Whisper/diarization sağlayıcıları kontrollü, tüm ön/son işleme ve gerçek JSON yazıcı çalışır. Gözlem: extract_audio clip_start8; sonuç eski0–2 ve3–5cue speaker=null, yeni8–10 ve10–12cue SPEAKER_00, done.warnings=[]; diarization başarılı mesajı vardır. Resume kapalı kontrolünde üretilen tüm cue'lara SPEAKER_00 atanır. Beklenen: devam edilen işin önceki bölümleri de konuşmacı analizi kapsamına alınır veya atlanan kapsam açıkça uyarılır; tam dosyanın konuşmacı ayrımı tamamlanmış gibi sessiz bırakılmaz. Etki: uzun dosyada kesinti sonrası çoğu konuşmacı ayrımı kaybolur, sonraki konuşma kimlikleri farklı ses bölümünde sıfırdan oluştuğu için yeniden adlandırma bağlamı da tutarlı değildir. Kök: ham checkpoint cue'larını geri birleştirirken downstream diarization'a tam ses bağlamını geri getirmeme.

Ek tekrar: `& backend/venv/Scripts/python.exe .tmp/deep815-backend/resume-probe.py`; kanıt `resume-observations.json`. Kontrollü CPU/model sağlayıcıları kullanıldı; gerçek GPU/pyannote başarısı iddia edilmez. Toplam bu ekle **10 bağımsız kök**; üstteki9sayısı bu ek öncesi alt turdur.
