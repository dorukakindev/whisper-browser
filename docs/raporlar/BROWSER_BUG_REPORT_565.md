# 565 — Okuyucuda seek ve konum

Eski HEAD'deki gerçek metadata handler'ıyla repro: kullanıcı4s seçtikten sonra metadata olayında kayıtlı8s uygulanıyor. PDF kutusu ve sağ metin doğrudan seek/play yapıyor, metadata handler'ı bu niyeti bilmiyordu. Ayrıca source unload sonrası timeupdate/konum dinleyicileri bağlı kaldığından sıfırlanmış konum kayda sızabiliyordu.

Yeni yerel `ReaderAudioControl` metadata gelmesini bekler; hızlı tıklamalarda son istek kazanır. Açık kullanıcı seek'i kayıtlı konumdan önceliklidir. Sonlu/aralık içi zaman doğrulanır; metadata10s timeout/error ve reader kapanışında bekleyen listener/timer temizlenir. PDF kutusu ve metin aynı yolu kullanır. Kapanışta gerçek konum unload'dan önce kaydedilir, ardından progress/pause/ended/metadata bağlantıları kaldırılır; metadata yüklenmemiş ses sıfır konum yazmaz. Normal kaldığın yer/autoplay korunur.

16 hedefli sonuç ve CSP5 kontrolü geçti. Gerçek Windows native PDF kutusu odaklanıp Return/char/keyup ile aktive edildi; ses2.5s'den gerçek fixture grup başlangıcı1s'ye seek edip oynadı. `.uiprev/book-reliability549-1792904038690` exit0; PDF/asistan seçimi/Review/M4B raf decode da geçti. İlk iki klavye denemesi yalnız keyDown/Up Enter kullandığından düğme tetiklenmedi; mevcut repo native test dizisi kullanıldı, ürün kapısı/eşik gevşetilmedi. Gecikmiş metadata/race/timeout kontrollü testlerdir; gerçek GPU/TTS/canlı sağlayıcı/kişisel start.bat ve CI doğrulanmadı.

N35 kabul kapsamı tamam. N42/N46 okuyucu yaşam döngüsü ilerledi; bütün tarayıcı/ses sürücüsü kombinasyonları tamam denmez. Yeni bağımlılık/kalıcı şema yok; self CSP ile yüklenen yerel modül eklendi.
