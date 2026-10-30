# R815 100 hedefi — backend alt raporu

**6 yeni doğrulanmış kök.** Önceki78 ID mappingi ve gece1000registry önce okundu. Bu ajan düzeltme yapmadı. Başlangıç `da773134a3e744885592bafa008f81f03bcdf878`; nihai kanıt `ae0a61a7b42c58d78bb7317680cf8f8133d5e027`. Ortakmaster R816 ürün işiyle ilerlediği için altı bulgu güncel kaynakta yeniden çalıştırıldı; karma revizyon başarı iddiası yok.

Tekrar: `& backend/venv/Scripts/python.exe .tmp/hundred815-backend/probe.py`; son koşu exit0. Sonuç [observations.json](observations.json); kaynak SHA256/bağımlılık sürümü ve ayrıntılı kanıt [findings.json](findings.json).

## HB01 — P1: Yalnız noktalama düzeltmesi kaynak olumsuzluğunu tersine çeviren yanıtı başarılı sayıyor

**Konum:** `backend/transcribe.py:3147`. **Yöntem:** Gerçek transcribe→FFmpeg→llm_postprocess→SRT yazıcı/OutputTransaction; Whisper ve OpenAI yanıtları kontrollü.

**Tekrar:** ASR kaynak Please do not open the red door.; yalnız llm_fix_punctuation açık. Sağlayıcı finish_reason=stop ile Please open the red door now. verir.

**Gözlenen:** Gerçek final SRTde Please open the red door now.; llm_progress done1 failed0, done.warnings=[]. Noktalama kontrolü hello world→Hello, world. kabul edilir.

**Beklenen:** Yalnız noktalama seçildiğinde sözcük/olumsuzluk/komut anlamı değişmemeli; sözleşme dışı çıktı korunmuş kaynak ve açık uyarıyla reddedilmeli.

**Etki ve kök:** Kaynağa ters düşen komut son altyazıya sessiz yazılır. Kök: kabul kapısı yalnız yaklaşık kelime/karakter büyüklüğüyle çalışıyor; seçili punctuation-only işleminde anlam taşıyan sözcük değişimini korumuyor.

**Önceki kayıt:** R815-B37/B38 ASR sonrası ses doğrulayıcısının yanlış kabulleriydi; bu ses modeline gitmeden kaynak transkripsiyonunu değiştirip son SRTye yazan ayrı LLM temizleme yolu. F14/F17 aileleriyle genel örtüşme; önceki78 içinde yok.

**Sınır:** Gerçek ücretli LLMnin bu yanıtı verdiği iddia edilmez. Kontrollü sağlayıcının belirgin anlam değişimini gerçek tüketicinin kabulü kanıtıdır.

**Gerçek final/karşı kontrol:** Hatalı final `pipeline-meaning\pipeline-source.srt` SHA256 `f14bb68e1abf96a3a791020b4060a2d2847631174e75ffc9ccaaf6e86b2c3c51`; kontrol `pipeline-punctuation-control\pipeline-source.srt` SHA256 `6c54782fb5aac9de48dea52763d4f5af8d5fce7e3b57fd1e56d5d4391650a91e`. Hatalı final uyarıları: []. Kontrol finali yukarıdaki anlamlı metni korur; JSONda tam içerik/ilerleme tutulur.

## HB02 — P2: Bir veya iki kelimelik kaynakta LLM büyüklük koruması devre dışı kalıyor

**Konum:** `backend/transcribe.py:3158`. **Yöntem:** Gerçek llm_postprocess ve tam transcribe/FFmpeg/final SRT tüketicisi; kontrollü ASR/editor.

**Tekrar:** Tek kelime Hello. kaynağına800kelime/6800karakter geçerli JSON edit cevabı ver. Aynı cevabı4kelimelik This is original text. kaynağına da ver.

**Gözlenen:** Tek kelimede6800karakter kabul, SRT6834karakter; cleanup done1 failed0 ve cleanupwarnlist boş. Tam tüketici ayrıca genel800kelimelik noktalama uyarısı üretir; bu boyut/uydurma ret uyarısı değildir ve dosya korunmuş kaynak yerine yeni metni içerir.4kelimelik kontrol gerçek finalSRTde kaynak metni korur, cleanupfailed1ve1/1reddi uyarısı vardır.

**Beklenen:** Kısa kaynakta da mutlak/göreli metin bütçesi aşımı reddedilmeli; birleşik kelime ayırma gibi küçük büyümeler desteklenebilir.

**Etki ve kök:** Tek kısa cueya yüzlerce uydurma kelime yazılır; okunamaz dosya ve gereksiz downstream kaynak tüketimi. Kök: words_off yalnız ow>=3 veya spaceless script durumunda true olabilir; chars_off tek başına hiçbir üst sınır sağlamaz.

**Önceki kayıt:** HB01 yaklaşık aynı uzunlukta anlam ters çevrilmesini; bu farklı short-input koşulunun boyut savunmasını kaldırmasını gösterir. Boyut eşiğini düzeltmek HB01i çözmez; anlam demirleriHB02nin mutlak kaynak bütçesi yerine geçmez. Önceki78de yok.

**Sınır:** 800kelime sentetik, ücretli sağlayıcı ve OOM/çökme iddiası yok; büyüklük kabulü ve gerçek dosya sonucu ölçüldü.

**Gerçek final/karşı kontrol:** Hatalı final `pipeline-expansion\pipeline-source.srt` SHA256 `6be36f5f4e925c82a9e4457eaa0c8a5f944c0d11b565011f45e2f8c939c9ee33`; kontrol `pipeline-size-control\pipeline-source.srt` SHA256 `994c7dea18133eba179f259a5c45a285e2025f01090c93c34c773ef68af0fec3`. Hatalı final uyarıları: ["Noktalama uyarısı: 800 kelimelik kesintisiz bir bölüm bulundu. Daha temiz sonuç için LLM ile düzeltme → Noktalama seçeneğini açın."]. Kontrol finali yukarıdaki anlamlı metni korur; JSONda tam içerik/ilerleme tutulur.

## HB03 — P2: LLM temizlemede kalıcı401 hatasından sonra kuyruktaki her paket sağlayıcıya gönderiliyor

**Konum:** `backend/transcribe.py:3169`. **Yöntem:** Gerçek ThreadPoolExecutor/llm_postprocess istek ve route_error_is_fatal yolu; kontrollü OpenAI401.

**Tekrar:** 90cue, llm_workers=1, ilk ve bütün sağlayıcı çağrıları status_code401 invalid_api_key. Aynı corpus için mevcut llm_translate fatal kontrolünü çalıştır.

**Gözlenen:** Temizleme3APIisteği yapar; ilk401 sonrası iki queued paket daha gönderilir. Çeviri negatif kontrolü1istekte durur. Kaynak metin korunur,90/90uyarı vardır.

**Beklenen:** Bilinen kalıcı kimlik/yetki hatası sonrası henüz başlamamış paketler aynı iş için tekrar gönderilmemeli; kaynak korunup terminal hata raporu kalmalı.

**Etki ve kök:** Uzun dosyada her30cue için boşa istek ve gecikme; geçersiz hesapta sağlayıcı baskısı artar. Kök: request() fatal hatayı yalnız o pakette fırlatır, havuzun queued işlerine ortak stop işareti ulaşmaz.

**Önceki kayıt:** llm_translate fatal_stop koruması zaten var; farklı cleanup yolu. Gece F13/F14 hata/timeout kayıtları genel aile kanıtıdır; önceki78de bu kuyruk mekanizması yok.

**Sınır:** Gerçek401servisine veya ücretli sağlayıcıya çıkılmadı; kontrollü hata sınıfı gerçek istek/havuz yolunu çalıştırır. Metin kaybı iddia edilmez.

## HB04 — P1: Adaptive indirme başarısız yeniden denemede önceki sağlam video dosyasını siliyor

**Konum:** `backend/media.py:482`. **Yöntem:** Gerçek FFmpeg MP4, gerçek loopbackHTTP ve download_stream tüketicisi; ağ hatası gerçekHTTP404.

**Tekrar:** Önce aynı Synthetic media/fixture kimliğiyle1sn yerelHTTP videosunu başarılı indir. Aynı çıktı klasörü/başlık/ID ile ikinci isteği404vererek tekrar başlat.

**Gözlenen:** İlk6584bayt sağlam MP4ün SHA256sı alındı; ikinci HTTPError sonrası önceki final dosya yok.404FFmpeg başlamadan gelir.

**Beklenen:** Yalnız mevcut çağrının oluşturduğu partial/staged dosyalar temizlenmeli; önceki tamamlanmış final korunmalı.

**Etki ve kök:** Tek ağ hatası önceki başarılı indirmeyi kalıcı kaybettirir. Kök: except BaseException her out_path varlığını bu çağrıya ait sayıp unlink ediyor.

**Önceki kayıt:** R302 indirme güvenlik kontrolünü ve yarım çıktı temizliğini kaydeder; o ifade önceki tamamlanmış dosya sahipliği sınırını doğrulamaz. R815-B19 MHTML partial overwrite ayrı modül/protokol; backend adaptive video cleanup yeni mekanizma.

**Sınır:** Yalnız test klasöründeki sentetik MP4 silindi. Loopback dışında ağ yok; kişisel medya veya dosya silinmedi.

## HB05 — P1: YouTube ses dilini değiştirmek aynı videoID dosyasından eski dildeki sesi geri kullanıyor

**Konum:** `backend/transcribe.py:359`. **Yöntem:** Gerçek yt-dlp selector+HTTP downloader, gerçek FFmpeg Opus fixtureları ve T.download_youtube. Yalnız YouTube extractor metadata kontrollü.

**Tekrar:** Aynı video için EN440Hz ve TR880Hz iki mevcutwebm ses formatı sun. Önce audio_lang=en indir; aynı klasörde audio_lang=tr iste. Ayrı yeni klasörde TR kontrolünü indir.

**Gözlenen:** İkinciTR isteğinde /tr HTTPisteği hiç yok; aynıID.webm ve ENhash döner. Yeni klasördeTR /tr isteği oluşur ve farklıhash gelir.

**Beklenen:** Gerçek format/dil değişince eski ses yeniden kullanılmamalı; disk kimliği seçili dil/formatı ayırmalı veya mevcut dosyanın tarifi doğrulanmalı.

**Etki ve kök:** Oynatıcıda TR seçen kullanıcı Whispere ENses gönderebilir; yanlış dil/kaynak bağlamı ve boşa transkripsiyon. Kök: outtmpl yalnız%(id)s.%(ext)s; yt-dlp aynı uzantı dosyasını already-downloaded sayıyor, audio_lang kimliğe katılmıyor.

**Önceki kayıt:** R815-B41/B70 LLM çeviri hafızasının prompt bağlamıydı; burada medya baytları indirilmeden önceki ses parçası/dil kimliği eksik. Önceki78de yok; F16 kırpılmışmedya kaynak ailesiyle ilişkili.

**Sınır:** Gerçek YouTube bağlantısı/hesap gerekmedi. Kontrollü extractor metadata dışında gerçek kurulmuş yt-dlp indirme/yeniden kullanım davranışıdır; frekanslar dil semantiği değil kesin farklı stream baytlarıdır.

## HB06 — P1: LLM temizleme açık length bitişini yok sayıp kesik metni final SRTye yazıyor

**Konum:** `backend/transcribe.py:3136`. **Yöntem:** Gerçek transcribe/FFmpeg/cleanup/final writer; kontrollü OpenAI finish_reason=length.

**Tekrar:** İki cümleli geçerli kaynak; sağlayıcı ilk cümleyi içeren geçerliJSON ama finish_reason=length döndürsün. Kaynağın son uyarı cümlesi yoktur.

**Gözlenen:** Kesik ilk cümle sonSRTye yazılır; llm_progress done1 failed0, done.warnings=[]. Açık token truncation sinyali hiç okunmaz.

**Beklenen:** Sağlayıcı length bitişi, içerik JSON olsa da eksik kabul edilmeli; kaynak korunup paket yeniden denenmeli veya açık başarısız sayılmalı.

**Etki ve kök:** Kaynak cümle/uyarı kaybı tam temizleme gibi yayımlanır. Kök: cleanup cevap protokolünde choices[0].finish_reason incelenmeden content parse edilip kabul edilir.

**Önceki kayıt:** HB01 stop ile dönen tam görünümlü anlam terslemesi, HB02 kısa kaynak boyut kapısıdır. length kontrolünü eklemek onları çözmez; bu ayrı provider terminal sözleşmesi. Çeviri yolunda truncation mekanizması mevcut. Önceki78de yok.

**Sınır:** Gerçek model token limitine sokulmadı; sağlayıcının açık terminal bayrağına üretim tüketicisinin verdiği yanıt kanıtlandı.

**Gerçek final/karşı kontrol:** Hatalı final `pipeline-length\pipeline-source.srt` SHA256 `ec5f8e231d59b82d759ceae203f878ff609d7f7b11a9b76231fa15b601d938b5`; kontrol `pipeline-length-control\pipeline-source.srt` SHA256 `f606080462fb1f626ed337d237d5fdf28bd627cbe18d15b855a857078e6b6ba0`. Hatalı final uyarıları: []. Kontrol finali yukarıdaki anlamlı metni korur; JSONda tam içerik/ilerleme tutulur.

## Dışarıda bırakılanlar

- CANDIDATE-container: MP4 video+Vorbis webm ses mevcut gerçekFFmpeg ile başarıyla remuxlandı; bug değil.
- CANDIDATE-missingkey: Anahtarın boşluğu destek/politika sözleşmesi net olmadığından bug sayılmadı.
- speaker-label-GPU: GPU hazır11005/12282MiB,0compute; System.Speech sentetikreferans üretimi kullanılabilirvoice/securitysetting engeline takıldı. Kanıtlı mevcut sentetikreferans yok; kişisel varsayılan okunmadı, GPUmodelbaşlatılmadı, etiketin gerçekten okunması iddia edilmez.

Ürün/test/ayar/kurulum/Git/docs değişikliği yok. Ücretli API yok. Gerçek FFmpeg/yt-dlp/loopbackHTTP kapsamı ile kontrollü ASR/LLM kapsamı ayrıdır. Native UI, model kalitesi, fiziksel ses veya genel npm/CI başarısı iddia edilmez.
