# Rapor 542 — Beş alanda kaynak, kanıt, eşleştirme, ses ve görünüm turu

Tarih: 2026-10-25. Depo: https://github.com/dorukakindev/whisper-browser. Dal: `codex/luna-media-home532`, mevcut PR482. Başlangıç `7801dc4a0c757d4c0edee0a19d8da34df5a3acb1`, bitiş ürün `0e91d54fc19b7d949b469db122ece253becd2ae4`. Çalışma kopyası `D:\Whisper Local\tmp\audit470` temiz başladı; ana `D:\Whisper Local` master'ındaki kullanıcı değişiklikleri alınmadı. `origin/master` = `fb86bb3264cecc6acf3d6806b28780468e01072c` bu dalın atası olarak doğrulandı. Ana dal otomatik birleştirilmedi.

## Doğrulanmış nedenler ve sonuçlar

1. **Medya içermeyen sayfalar aynı sohbet anahtarını kullanabiliyordu.** `AssistantWorkspace.key` yalnız çalışma modu/mediaKey kullanıyordu. İki haber sayfasının mediaKey'i aynı/boş olduğunda önceki sohbet bağlamı taşınabiliyordu. Yeni saf kaynak modülü sayfa kimliğini ayırır; URL'deki giriş bilgisi ve ham anahtarlar kayıt anahtarına yazılmaz. Takip parametreleri/normal sayfa çapası ayrıştırılır, SPA `#/...` rotası korunur. Sekme/generation ve sayfa kimliği geç yanıt kontrolüne katılır. Video içeren eski medya sohbetlerinin kayıt anahtarı korunur. Eski belirsiz medya-dışı sohbetler başka bir sayfaya otomatik atanmaz; dosyaları silinmez. Sayfa metni alınamaz veya dönen URL uyuşmazsa modele sayfa içeriğini görmediği açıkça belirtilir.
2. **Yorum önizlemesinden sonra değişen metin eski haliyle gönderilebiliyordu.** Örnek/metin/spoiler seçimi önizleme anına bağlandı; değişirse yeni önizleme gerekir. Kaynak okuması sürerken yapılan metin düzenlemesini geç dönen Browser sonucu artık ezmez. Örnek ve hata sonrası yeniden deneme korunur.
3. **Doğru alıntı genel kanaat veya zevk tahmini doğruluğu demek değildir.** Sonuçta farklı yorum, tekrarlanan metin ve alıntılanan kaynak sayısı modelden bağımsız hesaplanır. Beşten az farklı yorum küçük örnek olarak gösterilir; diğerleri de temsili anket sayılmaz. Özet başlığı yalnız bu örneği kapsar. Kişisel tercih/onaylanmış analiz yokken uygunluk koşullu olarak işaretlenir; alıntının doğruluğu ile iddianın doğruluğu ayrılır. Eşik bilimsel bir güven puanı değildir; olasılık/başarı yüzdesi üretilmez.
4. **Farklı TMDB eşleşmesi eski sağlayıcı bilgilerini yeni filmle karıştırabiliyordu.** Eski ve seçilen başlık/yıl/özet yan yana incelenir. Farklı kimliğe geçiş açık değiştirme onayı ister; yeni sağlayıcı alanları seçili gelir. Seçilmemiş eski sağlayıcı alanları, eski afiş ve eski özet çevirisi temizlenir; IMDb/Letterboxd sağlayıcı puanları da eski yapımdan taşınmaz. Kişisel puan, favori, izleme durumu ve kaynaklar korunur. Aynı kimliğin eksik bilgilerini tamamlama akışı korunur.
5. **Analiz hazırlanırken film yeniden eşleşirse eski analiz yeni filme kaydedilebiliyordu.** Kaydetmede ana süreç film kimliği anlık görüntüsünü doğrular. Yeni analizlere isteğe bağlı kimlik bilgisi eklenir; yeniden eşleştirmeden önceki kayıtlar önceki eşleşme olarak kapalı gösterilir. Eski kimliksiz kayıtlar sessizce yeniden etiketlenmez.
6. **Afiş bulunmayan eşleşmiş film sürekli hazırlanıyormuş gibi görünüyordu.** Gerçek yokluk ve henüz eşleşmemiş yapım durumları ayrı metinler gösterir. TMDB'nin gerçekten afiş döndürmediği fixture ile doğrulandı; sentetik afiş gerçek film resmi diye sunulmadı.
7. **GPU bellek hatasının önerisi kullanıcı için anlaşılır değildi.** Üretimde görülen `KV cache calculation` / güvenli bellek bütçesi / CUDA OOM durumları için EN/TR açıklama ve daha az paralellikle yeniden deneme önerisi eklendi. Ham neden detayda korunur. Referansı değiştirmek gerekmediği belirtilir. Bu açıklama OOM'u çözmüş sayılmaz; GPU motoru/bellek varsayılanları değiştirilmedi.

## Değişen dosyalar

| Dosya | Amaç |
|---|---|
| `src/assistant-source-context.js` | Saf sayfa/sohbet/iş kaynağı kimliği; eski video sohbeti uyumu |
| `src/renderer/assistant-workspace.js` | Yeni sohbet kaynak anahtarı |
| `src/renderer/renderer.js` | Generation/sayfa kontrolü ve okunamayan sayfa bağlamı |
| `src/renderer/index.html` | Kaynak modülü CSP'ye uygun yerel yükleme |
| `src/renderer/media-tools-model.js` | Tekrarlı yorum ve alıntı kapsamı hesabı |
| `src/renderer/review-decision-ui.js` | Önizleme/düzenleme koruması, kanıt kartı, kimlikli kaydetme/eski kayıt açıklaması |
| `src/media-tools-service.js` | Ana süreç kimlik kontrolü ve yeni analizde kimlik kaydı |
| `src/catalog-extensions.js` | İncelenmiş kimlik değiştirme ve eski sağlayıcı verilerinin temizlenmesi |
| `src/renderer/media-catalog.js` | Eski/yeni karşılaştırması, açık alan seçimi, EN/TR yeni metinler |
| `src/renderer/media-catalog.css` | Karşılaştırma kartları, uyumlu iki/tek sütun alan listesi |
| `src/renderer/media-title.js` | Gerçek afiş yokluğu durumu |
| `src/renderer/media-tools.css` | Kanıt kapsamı kartı |
| `src/renderer/dub-generator-ui.js` | Belirli bellek arızasında anlaşılır neden ve öneri |
| `tests/assistant-source-context.test.js` | Sayfa/SPA/generation/eski medya sohbeti sınırları |
| `tests/catalog-rematch.test.js` | Açık kimlik değiştirme, eski alan temizliği ve kişisel veri koruması |
| `tests/review-workflow.test.js` | Bayat önizleme, düzenleme yarışı ve kanıt kapsamı regresyonları |
| `tests/media-tools.test.js` | Yeniden eşleşmiş filme bayat analiz kaydının reddi |
| `tests/dub-generator-ui.test.js` | Bellek önerisi, ham neden ve terminal kontrol durumu |
| `tests/electron-media-polish.smoke.js` | Native pencere, gerçek main/preload, fixture TMDB eşleştirme, sayfa sohbeti ve ölçek kontrolleri |
| `tests/electron-dub-pipeline-playback.smoke.js` | Açık verilen gerçek WAV'ın gerçek oynatıcıda senkron testi |

## Kısa kontroller ve görsel kanıt

- Son ilgili Node koşusu **47 PASS / 0 FAIL**: `node --test --experimental-test-isolation=none tests/assistant-source-context.test.js tests/review-workflow.test.js tests/catalog-rematch.test.js tests/assistant-media-command.test.js tests/assistant-conversation.test.js tests/assistant-threads.test.js tests/media-catalog-store.test.js tests/catalog-metadata-sync.test.js tests/catalog-related.test.js tests/media-tools.test.js`.
- `node tests/browser-dub-audio.test.js`, `node tests/dub-service.test.js`, `node tests/dub-generator-ui.test.js` geçti. `backend/venv/Scripts/python.exe tests/test_dub_timing.py`: **14 test OK**.
- Değişen JS kaynaklarının `node --check` ve `git diff --check` kontrolleri geçti. Ürün Python değişmedi.
- `tests/electron-review-workflow.smoke.js`: native Browser/IPC/okunabilir yorum/gerçek asistan araçları kontrolü geçti; site/TMDB/model yanıtları bu smoke'da fixture. Son kanıt `.uiprev/review-workflow/1792881096702-27180/`.
- `tests/electron-media-polish.smoke.js`: gerçek Windows Electron penceresi, TR, açık/koyu tema; 1440×900 %100, 1080×760 %150 ve 840×760 %125 uygulama zoom'u. İki farklı makale için farklı gerçek kayıtlı sohbet oluşturuldu; ilkine dönüş kendi sohbetini getirdi. Yeniden eşleştirmede kişisel durum korundu. Asistan Gönder kontrolü erişilebilir, yatay taşma yok. Son kanıt `.uiprev/media-polish/1792881478246-15944/`. Tasarım değişikliğinden önce `.uiprev/media-polish/1792880852574-13360/`, karşılaştırma kartları sonrası `1792880938822-28076/` görüntüleri incelendi. Son önce/sonra değişikliklerinde fontlar ve iki frame beklendi. Windows'un gerçek DPI ayarı değiştirilmedi; Electron zoom bu doğrulamanın açık sınırıdır.
- `make-interfaces-feel-better` skill'i kullanıldı. Mevcut token'lar, yazı aileleri, afiş oranı ve kontrol düzeni korundu. Yeni palet, animasyon veya baştan tasarım gereksiz bulundu. Kapsanan ekranlarda görünüm sonucu: **Approve**; farklı monitör DPI/DRM/fullscreen ve tüm ekranlar doğrulanmadı.

## Gerçek sağlayıcı → GPU → oynatma denemesi

İki İngilizce sentetik SRT cue'u kullanıldı. Gerçek OpenAI **gpt-5.4-mini** ve üretim `transcribe:start`, `translateOnly`, `translateForSpeech` hattı iki cue'u **2/2 tamam / 0 başarısız** çevirdi. Olumsuzluk içeren “We have not found the answer yet” → “Cevabı henüz bulamadık”; “Twelve people” → “On iki kişi” korundu. Bu iki cümlenin sonucu bütün çeviri kalitesinin kanıtı değildir. Profil ayrıdır; anahtar argv/log/Git'e yazılmadı.

Üretim `tools/voxcpm2/altyazi_oku.py`, mevcut nano-vLLM/VoxCPM2 ve önceden üretilmiş **sentetik** referansla kullanıldı. Kullanıcının kişisel sesi kullanılmadı. 15 adım/CFG1.65 ve akıcı gruplamada iki cue tek konuşma bloğuna dönüştü. Son çıktıda `ready`, konuşma denetimi `passed`, metin benzerliği0.9375; kayıp/ek sayı ve olumsuzluk işareti yok. Bu ASR eşleşmesidir; insan doğallığı, duygu, klon benzerliği veya dinleyici kalite puanı değildir. Bir grup zamanlamada hızlandırıldı, **0 grup kırpıldı**. WAV ve sync/quality dosyaları yazıldı. Video ekseni11.0sn, ses11.0046458sn. Bu örnek büyük yavaşlatma/stres senaryosu sayılmaz.

**Başarısız ara denemeler saklanır:** İlk harness geçersiz çıktı soneki kullandı; kaldırıldı. Sonraki harness gerçek `.tr.speech.srt` adını `.tr.srt` bekleyerek bulamadı; ürün çevirisi zaten tamamlanmıştı. GPU öncesinde5779/12282MiB kullanım görüldü. Testin0.43 bellek bütçesi KV hesabını negatif yaptı; güvenli otomatik kontrol aşılmadı.1024 model boyu önerisinde varsayılan max-generate-length eşit kaldığı için CLI reddetti; bu harness hatasıdır. Son geçerli deneme1 paralellik/0.65 bütçe kullandı, bir EngineStalled yeniden başlatması sonrası tamamlandı. Son başarılı motor koşusu yaklaşık **5.1 dakika** sürdü. Diğer süreçler durdurulmadı. Ürün varsayılanları bu test parametreleriyle değiştirilmedi. Performans/hang sorununun bütün koşullarda giderildiği iddia edilmez.

Gerçek üretim kanıtı `.uiprev/dub542-live-1792880692723/`: kaynak SRT, `translation-result.json`, gerçek `.tr.speech.srt`, başarısız `synthesis.log`, reddedilen `synthesis-retry.log`, başarılı `synthesis-budget65.log`, `pipeline-dub.wav`, `.sync.json`, `.quality.json`. Bu ham materyaller ignore'da, Git'e dahil değil.

Gerçek WAV ayrıca11sn sentetik video ile `WHISPER_DUB_TEST_OUTPUT=<gerçek WAV> electron tests/electron-dub-pipeline-playback.smoke.js` yolunda açıldı. Gerçek WAV/video decode, üretim BrowserDubAudio bağlama, oynat/duraklat/6sn'ye sar ve kaldırınca özgün mute/rate dönüşü geçti. Örnek ölçüm video1.034105sn/ses1.000839sn. Kanıt `.uiprev/dub-pipeline-playback/1792881396294-26388/`.

## Veri ve sınırlar

Yeni bağımlılık, model indirme, lock veya install/start değişikliği yok. Yeni analizlerde opsiyonel `identity` alanı vardır; eski kayıtlar korunur. Medya-dışı sohbet anahtarı değişti; belirsiz eski sohbetlere tahmini sayfa ataması yapılmadı. `start.bat` ile ana kullanıcı kopyası açılmadı; GPU denemesinde gerekli torch/ffmpeg PATH'i testte açıkça kuruldu. TTS üretimi güncel repo aracı ve mevcut harici motor kurulumuyla çalıştı; bunu temiz kurulum testi sayma.

Tam npm test, CI sonucu, uzun YouTube/video, özgün video duygusu ve kişisel referansla doğallık/klon benzerliği denenmedi. CI açık/arka planda; sonucu beklenmez. Ana master çalışma kopyası, kullanıcı sekmeleri/oturumu ve kişisel dosyalar değiştirilmedi. Ham profil/API/veri/ekran görüntüleri commit edilmedi. Kod ve bu devir raporu ayrı commit'lerdir; PR482 açık kalır.
