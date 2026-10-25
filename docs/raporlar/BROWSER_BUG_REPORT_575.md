# Rapor 575 —100 bölüm dışa aktarma ve okuyucu kaynak ölçümü

P08,25 Ekim2026. Başlangıç `560c2c59a519be78d49a648d1e856c25ce1acf38`; ürün bitiş `e80ebdefcfe293e59d46a74e27e113cf9366c1db`. Dal `codex/book-reliability549`, PR487.

## Ölçüm ve ürün iyileştirmesi

`node tools/measure-book-export.js tmp/book-export575-stream.json`,100 adet birer saniyelik kontrollü24kHz PCM bölümü gerçek kitap hizmeti üzerinden yakalar, ters verilen seçimi doğal sırada M4B'ye yazar,100 bölüm başlığı/başlangıcı ve100sn süreyi ffprobe ile doğrular, tamamını FFmpeg ile çözümler. GPU/TTS veya100saatlik kitap değildir. Geçici kaynaklar yalnız aracın mkdtemp ile oluşturduğu doğrulanmış ölçüm klasöründe tutulup temizlenir. Normal npm test'e bu ölçüm eklenmedi.

İlk yöntem100 WAV'ı eşzamanlı input ve concat filtresinde açıyordu. Kaynak tüketimi ölçülünce, tam doğrulanmış ve fmt alanı birebir aynı WAV'larda ffconcat demuxer yolu eklendi. Dosyalar ardışık okunur; ffmpeg komut satırına100 uzun yol yerine playlist/meta yolu gider. Format bilinmiyor veya farklıysa mevcut yeniden örnekleme/concat filtresi korunur. Tek bölüm de eski yolu kullanır. Dosya/ses silme veya kalite onayı yok.

| Tek Windows ölçümü | Önce | Sonra |
|---|---:|---:|
| Gerçek çıktı |100 bölüm/100sn|100 bölüm/100sn|
| Export duvar süresi |4,66sn|4,45sn|
| Encoder duvar süresi |1,82sn|1,62sn|
| Encoder argv öğesi |224|28|
| Tahmini Windows komut satırı UTF16 karakteri |17996|673|
| FFmpeg gözlenen en yüksek thread |206|21|
| FFmpeg gözlenen en yüksek handle |1417|258|
| FFmpeg peak working set |32,4MiB|16,6MiB|
| Node peak RSS |52,0MiB|52,3MiB|
| Eşzamanlı/açık kalan medya süreci |1 /0|1 /0|

Her koşuda103 medya çağrısı var:100 seri süre probu, encode, son probe ve tam decode. Süre farkı tek kontrollü ölçümdür; genel hız oranı/statistiksel performans garantisi değildir. Windows FFmpeg sayacı50ms örneklemeyle alınmıştır (önce27,sonra24 örnek); peak working set işlem özelliğidir, thread/handle gözlenen tepelerdir. Süreçler/monitorler kapanmış, exporter destroyed listener sayısı0 ve aktif kaynak listesinde yalnız stdout PipeWrap kalmıştır. Probe/meta işlemlerinin zamanı toplamda baskındır; korunan format/süre denetimi kaldırılmadı.

İlk ölçüm aracı başlığı Sayfa1 sanıp durdu; kaynak import gerçekte Page/Sayfa1 üretir. Beklenti gerçek imported.chapter.title ile karşılaştırılacak şekilde düzeltildi. Bu ürün başlık hatası değildir. Son iki ölçüm tam encode/metadata/decode geçti.

## Biçim ve iptal doğruluğu

Mevcut RIFF/RF64 doğrulayıcısı genişletilerek yalnız bilinen tam fmt düzeni için formatKey döndürür; eski validVoiceOutput API'si boolean kalır. Çerçeve/veri sınırları denetlenir, ham dosya bütünü belleğe alınmaz. Playlist yalnız doğrulanmış birebir formatlarda; yeni satırlı yol reddi ve tek tırnak/Unicode yol kaçışı var. Türkçe/O'Neil klasöründe gerçek FFmpeg okuması geçti.24/48kHz farklı bölümlerde eski filtre yolu gerçek M4B/metadata/tam decode ile2sn doğru çıktı verdi. Gerçek çok bölümlü playlist iptalinde ffmpeg close beklenir; hedef eski dosya korunur, geçici M4B/meta/ffconcat temizlenir ve kilit bırakılır.

## Tekrarlı okuyucu ölçümü

Native Windows ayrı profil `.uiprev/book-reliability549-1792924009107`, exit0. Okuyucu gerçek PDF/ses/vurgu ile12 kez açılıp editöre döndü;2,6,12 döngüde CDP tam GC sonrası sayaç alındı. Her kapanışta PDF canvas ve yüklenmiş audio src yokluğu doğrulandı. Ölçüm yaklaşık2,82sn:

| Sayaç | Başlangıç |2/6/12 döngü sonrası |
|---|---:|---|
| DOM document |5|5 /5 /5|
| DOM node |17043|17043 /17043 /17043|
| JS event listener |1853|1853 /1853 /1853|
| Heap kullanılan byte |6306640|6358656 /6395260 /6521924|
| Renderer working set KiB |229116|220100 /224592 /222124|

DOM/listener artışı gözlenmedi. Heap +0,21MiB; genel sıfır sızıntı veya saatlerce kullanım garantisi değildir. Bu ölçüm yeni okuyucu ürün kodu değişikliği gerektirmedi. Native mevcut kitap/PDF/EPUB/M4B/yer imi/plan/deneme/dar ekran akışlarını da geçti.

## Dosyalar ve teslim

`src/book-export-inputs.js`: güvenli aynı-format playlist seçimi. `src/voice-output.js`: paylaşılan doğrulamadan bounded format kimliği; boolean uyumu. `src/media-workflows.js`: stream/fallback argümanları, doğru metadata input indeksleri, iptalde playlist temizliği. `tools/measure-book-export.js`: açıkça çalıştırılan gerçek100bölüm/Windows kaynak ölçümü. İki export testi ve native smoke: biçim/iptal/Unicode ve reader yaşam döngüsü.

14 hedefli PASS: book-export-inputs, book-export, report518, report521, media-workflows, dub-service. Syntax/diff temiz. Ham ölçümler tmp/book-export575-baseline.json, tmp/book-export575-stream.json ve native reader-lifecycle.json; kişisel profil/görüntü/raw ölçümler Git'e eklenmedi. Yeni runtime bağımlılığı/kurulum/şema yok; geçici ffconcat dosyası vardır. Gerçek TTS/GPU/live API/DRM/kişisel start.bat/fullsuite/CI yok. Master merge yok. P08 tamam; P09/P10 açık.
