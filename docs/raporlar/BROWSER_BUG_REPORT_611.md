# Rapor 611 — Task02 bağımsız doğrulama ve kaynaklı asistan araması

Tarih: 26 Ekim 2026. Depo: https://github.com/dorukakindev/whisper-browser.
Başlangıç: `81a0dd81297755314d24eceead018e8fa94cbcb5`. Ürün bitişi: `71a0c90852be1ffc7441f00743161c119b0054db`. Dal: `codex/translation-audit611`.

## Paket ve yöntem

`TASK-02-96b204f1-AUDIT.zip`, SHA256 `e3e781a0e927475cc37a3259fc5984a2f66836ec2c27695c22700c72428eb2ba`; CRC kontrolü geçti. Denetçinin kaynak tabanı `96b204f12dbf300edcc65756a6207ce5eca9d703`, güncel kaynakla aynı değil. Paket görevi/tavsiyesi otomatik talimat sayılmadı. Probe yardımcıları incelendi; yalnız localhost sahte sağlayıcı ve açıklanmış SDK shim'i kullanıldı. Gerçek üretim gruplama/kapı/cache/yazıcı yolları çalıştı; model kalitesi ölçülmedi.

15 dış probe önce ve sonra ayrı dizinlerde koştu, hepsi tamamlandı (exit 0). Bu çıkış kodu bulguların sıfır olduğunu göstermez: senaryo sonuçları ayrıca incelendi. Ham kişisel profil/görüntü/yerel çıktılar Git'e alınmadı.

## 22 bulgunun kararı

| Bulgu | Karar | Uygulanan değişiklik veya sınır |
|---|---|---|
| F-01 İngilizce contraction özel ad sayılıyor | Düzeltildi | Kapalı zamir/contraction listesi, I'm/I'll/I'd ve Don't gibi biçimler ad sayılmaz. 13 doğru ad/contraction örneğinde yanlış ret yok. |
| F-02 Kesme ekli adlar | Düzeltildi | Kaynak ve hedefte açık ekin kökü karşılaştırılır. Ahmet's→Ahmet'in kabul, Mehmet'in ret. |
| F-03 Cümle başı yakın yazımlı ortak sözcükler | Düzeltildi | Doctor/Police/Hotel/Professor/Radio/Taxi ve Let's başta ad takası sanılmaz. Gerçek benzer ad takası kontrolü korunur. |
| F-04 Ondalık ve kaynak yereli | Düzeltildi | 0.500→0,5, decimal sıfırları, EN/TR ayraçları ve kaynak dili kabul yoluna taşındı. 2.750 EN ondalığı TR binlik kopyasıyla karışmaz. |
| F-05 Saat/ondalık yerelleştirme | Düzeltildi | EN→DE/FR, TR→EN 12/24 saat ve FR 17h30. p.m. iç noktası ön işlemde bölünmez. Sayıyla yazılan EN hedef karşılığı da tanınır. Bu her dilin bütün saat deyimleri için garanti değildir. |
| F-06 Olumsuzluk ekleme | Düzeltildi, dar kural | Kısa açık olumlu cümleye olumsuzluk eklenmesi engellenir. Deyim/karmaşık karşıtlıklar evrensel regex ile reddedilmez. |
| F-07 Elma/Arabama yanlış olumsuzluk kanıtı | Düzeltildi | Çıplak -ma/-me yerine kapalı emir kökleri; eksiz isimler olumsuzluğu gizlemez. |
| F-08 Eksi işareti kaybı | Düzeltildi | Python imzalı miktarı korur; eksi 5 doğal karşılığı kabul, 5 ret. Tüketilmiş sayı yerine başka sayı parçacığı oluşmasını önleyen maskeleme eklendi. |
| F-09 Yer değiştiren skor/oran/miktar | Kısmen | Açık skor/oran çiftlerinin sırası korunur; 3-1→1-3 ret. Telefon ve 2-3 aralığı yanlış skor sayılmaz. Sayıları farklı isimlere bağlama/özne-nesne rolleri için genel semantik doğrulama hâlâ yok. |
| F-10 Türkçe kaynak kapıları | Kısmen | Kaynak dili aktarılır; TR→EN olumsuzluk, açık zorunda/mecbur/belki ve miktar bağlamındaki basit yazılı TR sayıları kontrol edilir. Diğer dillerin tüm morfolojisi desteklenmiş değildir. |
| F-11 Ses çevirisinde özetleme | Kısmen, görünür uyarı | Belirgin kelime+karakter kısalması `translation_coverage` ve warn_list ile kullanıcıya bildirilir. İki açık eksiltme uyarılır, sadık kontrol uyarılmaz. Kısa hedef her zaman kötü değildir; bu yalnız danışma sinyalidir, eksik her önermeyi kesin yakalamaz. |
| F-12 JS/Python kalite farkı | Kısmen | Browser'da olumsuzluk ve açık zorunluluk/ihtimal kaybı da sert kapıdır. 19 ortak kabul/ret satırı iki tarafta kilitli. Tam ad/birim/tarih/rol/çok dilli dilbilgisi paritesi iddia edilmiyor. |
| F-13 Auto-lenient biçim kaybını geçiriyor | Düzeltildi | Yalnız number_mismatch gevşetilebilir. Commit/cache yollarında biçim ve anlam kaybı tekrar kontrol edilir. 4 sayı hatası sonrası iki kötü yapısal/polarite adayı kabul edilmedi. |
| F-14 Cache hit sayacı sıfırlıyor | Hata olarak kabul edilmedi | Sayaç sözleşmesi ardışık başarısızlıklar. Geçerli cache başarısı sıfırlamayı sürdürür. Dış J-C probe'unda cacheHits=0: “cache hit etkisi” iddiası bu probe ile kanıtlanmıyor. Ücret azaltmak için güvenlik kapısını erken kaldırmadık. |
| F-15 Kapanış etiketi önünde newline | Düzeltildi | HTML/ASS/♪ sırası korunur, kapanış etiketi/nota önünde sarkan yeni satır eklenmez. Gerçek SRT/VTT/ASS yazıcı çıktıları incelendi. |
| F-16 ASS PlayRes | Düzeltildi | Kaynak konumları ürünün 1920×1080 düzlemine ölçeklenir. 1280×720 (640,60)→(960,90), kontrol/default aynı. Bilimsel sayı gösterimi kullanılmaz. Bütün kaynak ASS stilini kayıpsız aktarma özelliği değildir. |
| F-17 Diarization öncesi birleşim | Düzeltildi, korumacı yol | Diarize açıkken konuşmacı bilinmeden üç birleşim yapılmaz. Konuşmacı dönüşlerinin bir cue içinde geri döndürülemez yutulması önlenir. Diarize kapalı/ses etiketsiz durumda konuşmacı tahmini garanti değildir. Gerçek pyannote koşulmadı. |
| F-18 Sınırdaki sıfır süreli word | Düzeltildi | Kapalı uç ve aynı milisaniye hassasiyetinde aralık karşılaştırması. 10.466 word taramasında kayıp 0 (ara düzeltmede 189 yuvarlama kaybı vardı, o da kapatıldı). |
| F-19 Boşluksuz balanced sarma | Düzeltildi | CJK/Thai metni kaybetmeden, birleşen işaretleri ayırmadan satırlar oluşturulur; ikinci sarma aynı. Dilbilimsel Thai kelime bölme değil; max_lines uğruna metin kesilmez. |
| F-20 Prompt golden eskiliği | Düzeltildi | Mevcut HTML/ASS/♪ koruma talimatı golden'a alındı, refine değişmedi. 6 prompt testi geçti. |
| F-21 Geçersiz sayı test fixture'ı | Düzeltildi | Kimlik/naming/recovery senaryolarının sahte çevirileri doğru sayıları korur; kapı gevşetilmedi. İlgili 17 denetim ve 224 transcribe testi geçti. |
| F-22 Uçuşta istek iptali | Kısmen | İlk istekten önce, retry aralarında ve yanıt sonrasında checkpoint. İptal sonrası tamamlanan yanıt kabul edilmez. Başlamış uzak HTTP/ücret işlemini geriye alamayız; senkron SDK çağrısının ağ beklemesi mevcut timeout'a bağlıdır. |

Özet: 16 kayıt için hedeflenen hata yolu onarıldı, 5 geniş kapsamlı kayıt kısmen giderildi, 1 kayıt ürün bugı olarak kabul edilmedi. “22'sinin hepsi tamamen çözüldü” denmiyor. Kaynakta bozuk etiketi modelin kendiliğinden onarması da etiketi eksiksiz koruma sözleşmesiyle aynı değildir; T15 beklentisi bu yüzden otomatik kabul edilmedi.

## Ek gerçek onarımlar

- Aynı sayı çiftinin ilk elemanı tüketilince kalan tire ikinci elemanı negatif sayıya çevirmesin diye nötr maske kullanılır. Doğru skor/telefon kaybolmaz.
- 0.5 kg→500 gram için açık değer eşitliği kontrolü; rastgele “hedefte sayı var” kuralı eklenmedi.
- 2.5 million→2,5 milyon ölçekli miktar demiri ve float toleransı; büyük ölçekli sayıyı doğru çeviren satır reddedilmez.
- Saat işareti olan “Saat 17.30” bir saatlik süre sanılmaz; başlangıçtaki Saat özel ad sayılmaz.
- SRT testleri kaynak/çeviri dosyalarını değil, yalnız sahte fixture beklentilerini düzeltiyor. Kullanıcının mevcut altyazıları değişmedi.

## Asistan neden interneti aramıyordu, şimdi nasıl kullanılır?

Önceki sohbet yolu yalnız mevcut sayfa/video bağlamını alıyordu; bir arama aracı bağlı değildi. Yeni composer düğmesi **Search web / Web’de araştır** ile kullanıcı sorusunu ayarlı sağlayıcının `/responses` uç noktasına `web_search` ve `tool_choice: required` gönderir. Yalnız soru gönderilir; bütün kişisel video metni otomatik eklenmez. Yanıt tamamlanmış gerçek tool çağrısı ve yerel sağlayıcı URL citation'ları içermelidir. Kaynaklar tıklanabilir ve sohbet kaydında korunur.

Desteklemeyen sağlayıcı/model açık hata verir; gizlice başka sağlayıcıya geçilmez, anahtar başka domaine taşınmaz. Bu butonun ayarlı sağlayıcıda arama kullanım ücreti olabilir; otomatik çağrı yok. 60 sn üst sınır, iptal, kapatılan pencere temizliği, tek aktif istek ve bayat kaynak kimliği kontrolü var. Mevcut normal sayfa/video sohbeti korunur. OpenAI resmi sözleşmesi: https://developers.openai.com/api/docs/guides/tools-web-search . Kişisel GPT proxy'sinin bu aracı desteklediği doğrulanmadı.

## Dosya amaçları

- `backend/sentence_translation.py`: ad/sayı/saat/anlam ve biçim kapıları.
- `backend/transcribe.py`: kaynak dilinin kabul/cache yoluna taşınması, coverage olayı, iptal, konuşmacı öncesi birleşim koruması, word aralığı, ASS ve boşluksuz sarma.
- `src/subtitle-sentence-layout.js`, `src/browser-translation-scheduler.js`: browser anlam kapıları ve gevşek kabul sınırı.
- `src/assistant-web-research.js`: yetkili IPC, Responses aracı, sınırlar, citation doğrulaması.
- `src/main.js`, `src/preload.js`: mevcut güvenli sağlayıcı ayarlarını kullanarak yeteneği köprüye bağlar.
- `src/assistant-overlay.js`, `src/renderer/assistant-overlay.{html,js,css}`, `src/renderer/global-assistant.js`, `src/renderer/renderer.js`: açık arama düğmesi, kaynak linkleri, doğru sohbet ve kaynak sahipliği, iptal ve coverage bildirimi.
- `backend/test_audit611.py`, `backend/testdata/translation_gate_shared611.json`, `tests/{assistant-web-research,translation-audit611}.test.js`: yeni anlamlı regresyonlar.
- `backend/test_transcribe.py`, `backend/test_translation_audit_2026_09_22.py`, `backend/testdata/translate_prompt_golden.json`, `tests/subtitle-sentence-layout.test.js`: önceki sözleşme beklentilerinin gerçek davranışa göre düzeltimi; test silinmedi/eşik gevşetilmedi.

## Kontroller ve gerçek sınırlar

- Teslim kontrolü: 11 hedefli test dosyası + değişen JS ve Python sözdizimi, tamamı exit 0. İçlerinde transcribe **224**, golden **6**, eski translation audit **17**, yeni audit **9**, web **3**, scheduler **2**, assistant overlay **1**. Backend sentence module ayrıca **125** kontrol geçti. Cache/threads/fuzz hedefli testleri geçti.
- Ürünün etiketli korpusu: 58 doğru örnekte 0 yanlış ret; 44 hedeflenebilir yanlışın 44'ü ret. Bu sayılar tüm doğal dil kalitesi değildir.
- Dış 12 satır dosya zinciri: eski strict 5 satır İngilizce kalıyor/7 istek; yeni 12/12 doğru kabul/1 istek. Speech eski 12 istek, yeni 2 istek (ilk geçiş+refine); çıkışta İngilizce 0.
- 100 vakalık dış geniş korpusta rol, cümle düzeyinde olumsuzluk taşıma, zaman/bağlaç ve eksiltme örnekleri hâlâ kaçabilir. Basit işaret denetimi bunlara tam semantik güvence değildir. Son iki yanlış ret (saat kısaltması/ölçek) ayrı gerçek llm_translate localhost akışında kapatıldı, 1'er istekle kabul edildi. Tüm 100 senaryo son iki edit sonrasında yeniden koşulmadı.
- Windows Electron: kişisel uygulamaya dokunmadan ayrı profil + localhost kontrollü Responses sağlayıcısı. Arama yanıtı, kaynak butonu, desteklenmeyen model hatası, EN/TR ve daraltılmış pencere görüntüsü doğrulandı; yatay taşma false. Görseller Git dışında.
- `start.bat`/`install.bat`, bağımlılık ve kalıcı veri şeması değişmedi. Ücretli/kişisel API, gerçek arama modeli, Whisper/GPU/CUDA/DRM/pyannote ve normal kişisel start.bat oturumu kabulü koşulmadı. Tam npm test/uzun CI beklenmedi; CI kapatılmadı.
- Kişisel OFFLINE-MANIFEST, INDEX516 ve 115 untracked dosya commit kapsamı dışında tutulur. Önceki PR509/rapor610 YouTube oynatma onarımı master'da; tekrar uygulanmadı ve adblock kapatılmadı.
