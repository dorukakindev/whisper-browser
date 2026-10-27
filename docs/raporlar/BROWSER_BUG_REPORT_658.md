# Rapor 658 — Asistanın gerçek iş takibi ve doğru altyazı çıktısına erişimi

27 Ekim 2026. Başlangıç master: `00b8135fa7512c67c49037cb89966981e0c5e2a4`. Bitiş ürün commit'i: `d292e5f0959f4b55289fab802690d6f22212742d`.

## Tamamlanan somut paket

Bu çalışma R657'nin ayar bağlantılarını yeniden saymaz. Mevcut iş defteri ve asistan araçları arasındaki eksikleri tamamlar:

1. **Aşama değişiminde eski yüzde kalmıyor.** Eski kod, indirmenin %100 değerini model yüklenirken de tutuyordu. Yeni aşamada yüzde ve sayaç sıfırlanır; veri gelene kadar belirsizdir. İndirme/LLM ilerleme olayları için aşama çıkarılır. Yüzde tüm işin bitiş tahmini değildir.
2. **Başarısızlığın güvenli açıklaması var.** GPU belleği, timeout, yetkilendirme, istek sınırı, disk, bağımlılık, bağlantı ve bilinmeyen hata sınıfları; yalnız sabit kod ve EN/TR açıklama olarak taşınır. Ham traceback, dosya yolu, sağlayıcı metni veya anahtar modele/panele verilmez. Bunlar tanısal ipuçlarıdır; kesin kök neden iddiası değildir.
3. **Süreç tamamlanması ile altyazının eksiksizliği ayrıldı.** Mevcut semantik output contract üzerinden rol/dil/format/toplam/başarılı/başarısız/kısmi bilgisi korunur. Asistan devam makbuzunda bu kanıtı görür; tamamlandı diye kusursuz çeviri veya ses kalitesi iddia etmemesi istenir. Eski `partial` alanı ara çıktı görülmesi demektir; dosyanın kısmi olup olmadığı `result.artifacts[].partial` alanından okunur.
4. **Kesin iş sorgusu ve sonuç kullanma araçları bağlandı.** `get_job_status(job_id?, offset?)` beşli sayfalama yapar, aktif işleri öne alır. `get_job_result(job_id)` gerçek defter sonucunu okur. `use_job_subtitles(job_id, role, allow_partial?)` yalnız bu asistanın başlattığı, aynı kaynağa ait tamamlanmış işin kayıtlı browser track'ini yükler. Ana süreçte ledger ID → özgün backend ID eşleştirilir; renderer aynı backend ID/rol/yol kaydını arar. Başka video, olmayan iş, eksik rol veya izinsiz kısmi sonuç reddedilir. Ham dosya yolu model argümanı değildir. Kısmi kullanım kartında eksik satır uyarısı açıkça bulunur.
5. **Aktif işler eski sonuçların arkasında kaybolmuyor.** Asistanın kısa iş listesi aktif işleri önce gösterir. Başarısızlık açıklaması, ilerleme sayacı ve kısmi çıktı uyarısı panelde yer alır. Native panelin izinli alan projeksiyonu yeni sayısal/enum metadata için ayrıca güncellendi; ilk görsel kabul bu alanların elendiğini yakaladı.

## Gerçek Windows kabulü

`tests/electron-assistant658.smoke.js` ayrı profil açtı. Asistan sağlayıcısı ve browser/YouTube kaynak kimliği kontrollüydü; gerçek YouTube indirilmedi. Yalnız testin medya girdisi yerel SAPI konuşmasıyla değiştirildi. Python subprocess, ffmpeg, faster-whisper, önbellekteki **tiny / CPU / int8** ve dosya yazımı gerçektir; üretim fonksiyonu mock edilmedi. HF offline kullanıldı, ücretli API çağrısı yoktu.

- Asistan kartından ilk 8 saniye için gerçek Whisper başladı.
- Çıktı SRT'sinde şu konuşma oluştu: “The library is open today. We can read a book together.” Tek cue, tamamlanmış source SRT, başarısız cue 0.
- Asistan aynı ledger işinin sonucunu sorguladı; `sourceMatches=true` ve gerçek artifact bilgisi geldi.
- “İşin kaynak altyazısını kullan” kartı tam o backend işinin track'ini yükledi; oynatıcının `subPath` ve cue sayısı doğrulandı.
- Farklı zaman aralığıyla ikinci gerçek Whisper süreci başladı; asistanın kesin iş ID'li durdurma kartından sonra gerçek main terminali `stopped` oldu.
- Sonradan **sentetik** bir GPU bellek hatası deftere gönderildi; açıklamanın native panelde göründüğü ekran görüntüsüyle doğrulandı. Gerçek GPU hatası oluşturulmadı.

[Makine sonucu](ASSISTANT_JOBS_2026-10-27/native-result.json) ve [native panel görüntüsü](ASSISTANT_JOBS_2026-10-27/native-job-result.png). Görüntü ve JSON yalnız kontrollü test verileridir, kişisel profil içermez.

## Kontroller ve başarısız denemeler

- 11 hedefli Node dosyası, **84/84 PASS**: iş defteri, native overlay, main agent, uygulama araçları, continuation, şema, sağlayıcı sözleşmesi, caption/reuse ve mevcut ses/kitap araçları.
- 14 değişen/eklenen JS için `node --check`; staged/unstaged `git diff --check`: PASS.
- `npm run test:electron-bridge`: PASS.
- Son native kabul: exit 0, `resultInspected=true`, `exactOutputLoaded=true`, `realProcessStopped=true`.
- İlk native hazırlıklarında yanlış executable/DOM kimliği ve ardışık soruları uygulama makbuzu bitmeden gönderen test sürücüsü hataları oldu; düzeltildi. İlk gerçek üretim/sonuç yükleme kabulü geçti. Daha kapsamlı kabul, native panel metadata projeksiyonunun eksikliğini buldu; ürün kodu düzeltildikten sonra tam zincir iki kez geçti. Test eşiği gevşetilmedi. Reklam filtresi indirmesi testte dış ağ kapalı olduğundan bilinçli reddedildi; reklam engelleme başarısı iddia edilmiyor.

## Kullanım ve sınırlar

“Bu iş ne durumda?”, “Neden başarısız oldu?”, “Tamamlanan bu işin kaynak altyazısını kullan”, “Bu işi durdur” gibi istekler yeni gerçek araçlara ulaşabilir; değiştiren adımlar karttan uygulanır. Bir modelin her ifadeyi doğru yönlendireceği garanti edilmez.

İş/sonuç sahipliği oturum belleğindedir; uygulama yeniden açıldıktan sonra eski iş için tahmini dosya yüklenmez. Legacy `files` listesi anlamsal output metadata içermiyorsa sonuç rolü uydurulmaz. Henüz browser kaynakları için tam eşleşmeli altyazı yükleme bağlandı; tüm yerel oynatıcı/kitap çıktıları bu yeni araçla yüklenebilir denmiyor. Gerçek YouTube indirme, GPU/CUDA, DeepSeek/Sol çeviri kalitesi, VoxCPM2 ses üretimi, kitap üretimi, DRM, dosya seçici ve `start.bat` açılışı bu tur doğrulanmadı. Tam npm ve CI sonucu beklenmedi; CI kapatılmadı. Asistanın bütün programa hâkim olduğu iddia edilmiyor.
