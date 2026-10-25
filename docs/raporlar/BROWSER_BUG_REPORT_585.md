# Rapor 585 — Gerçek GPU ses karşılaştırması ve doğrulanmış kalite kapıları

25 Ekim2026. Başlangıç master `fdba0f4b02a8ffe42c5f62fbc055f946910a3516`; dal `codex/dub-quality585`; ürün bitişi **`91bb0a331475c027bbcff22068fd1e1abbf15109`**. Kullanıcı video/aralık için “fark etmez”, ilk iki sesi dinleme için “sonra dinlerim” dedi. Bu nedenle öznel doğallık kazananı seçilmedi ve kişisel varsayılanlar değiştirilmedi.

## Gerçek deney

Kaynak [NASA NTRS19940010921](https://ntrs.nasa.gov/citations/19940010921): NASA hükümet eseri için public-use kaydı. İndirilen67MBvideo [Commons kaydı](https://commons.wikimedia.org/wiki/File:President_Kennedy_speech_on_the_space_effort_at_Rice_University,_September_12,_1962.ogv) üzerinden alındı; yeniden yayımlanmadı. Orijinalde102,6–227,6sn aralığı,125sn. Yerel small Whisper CPU ile İngilizce çıkarıldı; yarım başlangıç/bitiş kesildi.36cue için Türkçe kontrol metni elle gözden geçirildi. Bu **uygulamanın ücretli API çevirisinin ölçümü değildir**. Aynı zamanda3kısa sayfa/358kelimelik özgün Türkçe kitap anlatısı hazırlandı; gerçek bir uzun kitabın tamamı değildir.

RTX4070SUPER12GB üzerinde mevcut nano-vLLM/VoxCPM2 ve önceden izinli aynı referans/döküm kullanıldı. Motorun dosyaları, kişisel profil ve açık uygulama değiştirilmedi.15adım,CFG1,65,temperature0,8,seed42,parallel2,ayrıntılı ASR. Akıcı280karakter/18sn ve kısa250karakter/12sn üretim yoluyla karşılaştırıldı. Her varyant ayrı taze önbellek, aynı sıcak model oturumu kullandı. Gruplama değişince doğal olarak grup tohumları da değişebilir; sonuç yalnız gruplamanın nedensel ispatı değildir. AI metin düzenlemesi kapalı; gözden geçirilmiş aynı metin karşılaştırılır.

| Varyant | Grup | Üretim+kontrol duvar süresi | WAV | Ready/review/failed |
|---|---:|---:|---:|---:|
| Video akıcı |10|169,859sn|127,005sn|7/3/0|
| Video kısa |16|167,672sn|127,005sn|13/3/0|
| Kitap akıcı |13|232,078sn|196,851sn|13/0/0|
| Kitap kısa |46|306,469sn|226,053sn|45/1/0|

Dört nihai WAV sonlu, dijital clip oranı0, peak≈0,794. İlk üretimde son WAV ASR benzerlikleri sırasıyla0,9461/0,9389/0,9791/0,9749; dört dosyada da uzun atlama span'i0 ve eksik sayı listesi boş. Bunlar kelime kelime tamlık veya doğallık garantisi değildir. İki kitap nihai bütünlük kabulünü geçti. Videolar ASR miktar/ad/anlam işaretleri nedeniyle **review** kaldı; bunlar gizlenmedi.

Akıcı kitap bu metinde daha az parça ve yaklaşık74sn daha kısa üretim süresi verdi. Bu mevcut akıcı varsayılanı korumak için destekleyici nesnel kanıttır, insan kulağıyla üstünlük kanıtı değildir. Kullanıcı sonra dinleyeceği için yeni varsayılan dayatılmadı.

## Bulunan ve düzeltilen gerçek sorunlar

1. **Çeviri yanlış reddi:** “cannot help, but create…” olumlu kaçınılmazlık kalıbı olumsuzluk kaybı sayılıyordu. Yalnız tanınan devam fiilli dar kalıp maskelenir; “cannot help the child”, “cannot help, but I can listen” ve ayrı gerçek “not” korunur. “Some would have us stay…” → “kalmamızı ister/istemesi” irade çevirisi de yanlış modalite kaybı sayılıyordu. Yalnız açık hedef irade biçimleri ve kaynak would-have-person kalıbı için dar maske; diğer must/should/conditional işaretleri korunur. Aynı125sn kontrolün10tam konuşma grubunda önce2yanlış ret, sonra0. Ham36kısa cue'da Türkçe söz dizimi işaretleri komşu cue'ya taşıyabilir; bu sonuç bütün tekil cue'ların kusursuz olduğu anlamına gelmez.
2. **ASR sayı eşdeğerliği:** beklenen “elli bin”, tanınan“50.000” veya“50 bin” olduğunda ek sayı alarmı çıkabiliyordu. Dotted biçim yalnız beklenen tam miktarla eşleşirse açılır; açık sayı+bin/milyon/milyar miktar olarak değerlendirilir.50ile50bin, yanlış/ek miktar ve tekrar hâlâ reddedilir. Yeni negatif test50→50bin kör noktasını da ortaya çıkardı ve kapattı. Üretimdeki sayıları keyfi yeniden yazmaz; doğrulama karşılaştırmasını düzeltir.
3. **ASR özel ad eki:** “Venüs’e” → “Venüse” apostrofsuz tanıma kök kaybı sanılıyordu. Yalnız beklenen tam kök ve kapalı Türkçe ek listesi aynıysa eşdeğer; Venise/Vene gibi başka kökler veya adın yokluğu kabul edilmez. “Venus’a” gibi kök/ek farkı bu dar kuraldan geçmez. Yumuşak/fuzzy ad benzerliği eklenmedi.
4. **Kalite ekranı açıklaması:** grup yalnız “Dinleyerek kontrol edin” diyordu. Artık açılır ayrıntıda sayı, özel ad, olumsuzluk, birim, tekrar, olası atlama/ek konuşma nedenleri ve istenen metin gösterilir. Metin `textContent` ile,8000karakter sınırıyla; ASR'nin yanılabileceği ve dinlemek gerektiği açık. Mevcut grubu dinle/düzenle/yeniden üret akışı korunur.

## Yalnız sorunlu grup onarımı

Video akıcı grupta9,10,11,12kaynak kimlikleri (4.grup) için ASR “kullanmayı” yerine “kullanmadı” anlam işareti buldu. Bunun gerçek ses hatası mı, ASR hatası mı olduğu insan dinlemesi olmadan kesin söylenmedi. Yalnız bu grup mevcut `--force-groups` ile yeni tohumla yeniden üretildi; başlangıçtaki10ses önbelleğinden **9'unun SHA256'sı birebir aynı**. Backendmetrics9cachehit/1generated/1attempt/0retry, sentez21,219sn. Yeni grup ready,ASR0,9362,anlam/sayı/olumsuzluk/uzun atlama işareti yok. Nihai birleştirilmiş dosyada anlam işareti düzeldi; “Venüs” tanıması hâlâ review, başarılı diye sunulmadı. Özgün A/B dosyaları değiştirilmedi.

Yeni karşılaştırma kuralları aynı önceden tanınmış dört metne ayrıca uygulandı; orijinal üretim raporlarının üzerine yazılmadı. Akıcı videoda50bin ve Venüse yanlış alarmları kalktı, gerçek inceleme işareti korundu. Kısa videoda “Venus’a” hâlâ işaretli. İki kitap son kontrolü geçti. Eski önbellekler silinmedi/topluca yeniden üretilmedi.

## Dosyalar ve kullanım

- `backend/sentence_translation.py`: iki dar İngilizce kalıp yanlış reddi. `tools/voxcpm2/dub_quality.py`: miktar ve tam ad+ek ASR karşılaştırması.
- `renderer/dub-generator-ui.js`, `index.html`, `media-experience.css`: gruptaki inceleme nedeni ve kaynak metni, iki dil, tema uyumu.
- `tools/voxcpm2/audition.py`: opt-in GPU hazır kontrolü, yeni klasör/sıcak motor/ayrı cache,4varyant, nihai ASR, tarafsız `listen.html`, hiçbir varsayılanı değiştirmeyen sonuçJSON'u. `--prepare-controls` yalnız SRT üretir, GPU/ağ yok. README açık kullanım ve sınırlar.
- `tools/voxcpm2/testdata/audition_controls.json`: kamu konuşması/gözden geçirilmiş TR ve özgün kitap metni; özel referans/ham medya içermez. Kaynak/timeline bilgisi yeniden üretim için kayıtlıdır.
- Yeni `backend/test_audition.py`, `test_dub_grouped_numbers.py`, `test_speech_control_idioms.py`; güncellenen UI/native testleri gerçek yeni sınırları korur. Rakam/negatif/ad kapıları gevşetilmedi.

Yerel sesler: ignored `tmp/quality585/audition/`:4WAV/sync/quality/performance/MP3, `listen.html`, orijinal `results.json`, CPUtranskriptleri ve `revalidation-patched.json`. Onarılmış alternatif `tmp/quality585/repair2/repaired.wav` / `.mp3`, `repair-result.json`. Bu dosyalar yerelde tutulur; kişisel ses/referans/transkript/log Git'e gönderilmez. `clip.mp4` orijinal karşılaştırma videosudur; adaptive zaman haritası uygulanmış bir dublaj MP4'ü olduğu iddia edilmez.

## Doğrulama, başarısız ilk denemeler ve sınırlar

- Son hedefli25PythonunittestPASS;6Node/CSPPASS;py_compile/node--check/diff temiz. Kabul testindeki “blocked_gpu” çıktısı mocked güvenlik vakasıdır; gerçek GPU engeli değildir.
- Mevcut120anlam-kaybı korpusu başlangıç koduyla birebir karşılaştırıldı, sonuç değişmedi:58accept,62reject,0false-reject;21blockingfalse-accept(18kapı dışı argo/hitap+3yakalanabilir sayı),18meaningfalse-accept. Bu **tüm anlam kontrolleri kusursuz** değildir; önceden var olan3sayı blocking açığı bu turun iki deyim düzeltmesinden bağımsız açık kayıttır. Eşik/test silinmedi.
- Gerçek Windows UI exit0 `.uiprev/dub-runtime/1792947738144-19500`; açıklama gerçekten görünür, darkTR/lightEN125% görüntüleri incelendi. İlk görünümde kapalı üst details nedeniyle screenshot açıklamayı göstermiyordu; test gerçek görünür yüksekliği denetleyecek şekilde düzeltildi. Yerel dört ses karşılaştırma sayfası ayrı Electron profilinde4audio/0yataytaşma ile açıldı, üst/alt görüntü incelendi; bu gerçek GPU deneyinden ayrı UI kanıtıdır.
- İlk tek-grup onarım yardımcı betiğinde Windows `__main__` koruması eksikti, spawn erken kapandı; özgün cache/sesler korundu. Koruma eklenip ayrı repair2'de başarıyla tekrarlandı. İlk negatif50vs50bin testi kırmızı oldu ve miktar karşılaştırması düzeltilmeden başarılı sayılmadı. Başlangıç kodu karşılaştırma kopyasında abbreviationsJSON'u ilk kez eksikti, tamamlanıp eşitlik doğrulandı.
- Motor kapanınca0computejob/≈11GBboş GPU doğrulandı; kişisel uygulama/eğitim işi öldürülmedi. Üretim bağımlılığı/kurulum/ayar şeması değişmedi. Tam suite/canlı ücretli çeviri/DRM/kişiselstart.bat yok. CI açık kalır, sonucu beklenmez. Kişisel ana kopya bu tur değiştirilmedi; ayrı PR teslimi. Öznel dinleme ve yeni varsayılan seçimi kullanıcı sonraya bıraktığı için açık; eksik kanıt “doğal/kusursuz dublaj” diye sunulmaz.
