# BROWSER_BUG_REPORT_444 — Dış 407/408/409 paketlerini güncel dalda doğrulama

Tarih: 2026-10-17. Başlangıç: `8ab3ce0e5706ba086052e6e5c9c9a38e54be2e76`.
Bitiş kod: `1fbdfaae404ff98f9f4e69980240ef311bfa72df`.

## Girdilerin ayrılması

Kullanıcının verdiği 407/408/409 Markdown raporları, dört patch ve ZIP içerikleri mevcut kodla karşılaştırıldı; hiçbir patch topluca uygulanmadı, arşiv içindeki repro çalıştırılmadı. Belgelerdeki öneriler görev talimatı sayılmadı. `BROWSER_BUG_REPORT_408.md`, `(1)` ve `(2)` içerikleri aynı; audio-feature-package-408 üç kopyası aynı rapor/README paketidir. `whisper-browser-hata-paketi.zip` içindeki WB407 raporu, ayrı BROWSER_BUG_REPORT_407.md ile farklı bir denetimdir. Önceki repo rapor407/408/409 dosyaları değiştirilmedi.

## Son hata paketindeki doğrulanmış bulgular

| Bulgu | Sonuç ve kanıt |
|---|---|
| WB407-01 anahtarsız yerel sağlayıcı | Düzeltildi. Renderer hazır olma/iş önkontrolü/AI sohbeti seçili endpoint için localhost, 127.0.0.1 ve IPv6 loopback'i kabul eder. Eski custom URL başka sağlayıcının seçimini geçersiz kılamaz. Main IPv6 hostname eşleşmesi düzeltildi. Python girişinde OpenAI SDK'nin boş anahtar reddini aşmak için yalnız loopback'e `local-no-auth` yer tutucusu verilir; gerçek anahtar değildir, ayarlara yazılmaz. Uzak servisler anahtar istemeye devam eder. Gerçek yerel model isteği denenmedi. |
| WB407-02 browser Whisper ses dilinin sıfırlanması | Açık. Browser sayfasında seçilen YouTube audio track dili henüz güvenilir biçimde yakalanmıyor; oynatıcıdaki önceki videonun dilini browser'a kopyalamak yanlış çözüm olur. Bu turda kaynak ses seçimi eklenmedi; varsayılan kaynak kullanımı sürer. |
| WB407-03 dil değişiminin satır başına sayılması | Düzeltildi. Python segment olayına parça yolu ekler. Main bunu dil takipçisine verir; aynı parçada çok segment tek gözlem sayılır. Eski olay biçiminde chunk_done'a kadar aynı kimlik kullanılır. İki gerçek ardışık parça dili değiştirir, tek parçadaki iki satır değiştirmez; switch uyarısı da tek kez gelir. |
| WB407-04 durdururken kabul edilmiş parçaların kesilmesi | Düzeltildi. Sabit15 sn yerine bekleyen parça varken120 sn ilerlemesizlik sınırı; ready/segment/chunk_done süreyi yeniler. Kuyruk boşken15 sn kapanış sınırı korunur. Takılınca eksik parça sayısı açık uyarı olur. Stop sonrası geç ready yakalamayı tekrar aktif göstermez; close timerı temizler. Tamamlanmamış parça için diskten devam özelliği eklenmedi. |
| WB407-05 çeviri kalite işaretinin kayıtta kaybı | Düzeltildi. Scheduler sonucunun qualityIssues/qualityWarning bilgisi JSON varlığa ve arşive taşınır; ilk kayıt ve yeniden açılış cueIdentities üzerinden UI işaretini korur. Metni sonradan değiştirilen satıra eski uyarı yapıştırılmaz. SRT standardında bu metadata bulunmaz; yalnız bağımsız SRT kopyası uyarıyı taşımaz. |
| WB407-06 kalite kesicisini açan son cümle | Düzeltildi. Devam eden işi atlayan aday kabulü, finally aşamasında tetikleyen adayı da whenIdle bitmeden kabul eder. maxAttempts1 ve paralellik1/4 ile dört cümle dört istekle uyarılı tamamlanır, şüpheli sonuç cache'e yazılmaz. |
| WB407-07 ilk saniyelerde eski izleme konumuna atlama | Düzeltildi. Ölçülmüş0/.5/1.9 saniye, geçmişteki800 saniyeye tercih edilir. Geçerli saat yokken geçmiş kullanılabilir; geçmiş de yoksa önceki pending seek temizlenir. |

## Ayrı 407/408/409 raporları ve patch önerileri

| Maddeler | Mevcut kod değerlendirmesi |
|---|---|
| B408-02 ortalama kayma güveni | Düzeltildi. Başlangıç VE bitiş kaymaları üzerinden mean/p95/max tanısı; ortalamanın gizlediği büyük sapma medium güven alamaz, aynı30 sn sınırı maksimuma uygulanır. Bu istatistikler bağımsız konuşma doğruluğu kanıtı değildir. autoApply:false korunur. |
| Derin408 B408-05 optional import önceliği | Düzeltildi. İstek, cue ve yerel ses dosyası doğrulaması srt/ffsubsync importlarından önce yapılır; eksik opsiyonel paket yanlış dosya hatasını maskelemez. |
| 408 B408-04 ve ayrı407 dublaj yol haritası | Bu dal için eski tespit. VoxCPM2 altyazı/metin üretimi, referans sesler, aralık, önizleme ve browser dublajı zaten mevcut; patch ile bunların üzerine yeni eksik bir TTS hattı kurulmadı. |
| Ayrı407 B407-01 ilk ekran loopback | Mevcut sistem sesi yakalama Windows loopback'tir; sekmeye özel ses izolasyonu doğrulanmadı/düzeltilmedi. Çoklu ekran ve başka uygulama seslerinin karışması gerçek donanım testi gerektirir. |
| Ayrı407 B407-02/03; 408 B408-03 | Deneysel konuşma-ayırma SRT sonucunu browser track'ine bağlama ve ayırma/senkron için aşamalı ilerleme hâlâ açık. Mevcut sonuç SRT olarak kaydedilebilir; yeni track/ilerleme UI'ı eklenmedi. |
| Ayrı407 B407-04; 408 B408-01 | Yerel referans gereksinimi mevcut aracın sınırı; browser'dan otomatik indirme bu tur eklenmedi. |
| Ayrı407 B407-05 | Dil değişimi satır/parça sayımı düzeltildi; her iz değişiminde otomatik seçim/mini oynatıcı sabitleme gibi ek UX kapsamı uygulanmadı. |
| Ayrı407 B407-06/07/08 | Sayfa fark görünümü, site terminoloji içe/dışa aktarma ve ertelenmiş blok görünürlüğü geliştirme önerileridir; bu tur uygulanmadı. |
| 409 B409-01 | Sağlanan ilerleme callback'leri mevcut dalda henüz yok; yeni callback'in exception yalıtımı, o patch'in kendi eklediği akışa ilişkindir. Mevcut koda uygulanmış hata düzeltmesi sayılmadı. |
| Derin408 B408-06 /409 B409-02 | dialogue-separated kökeni, henüz eklenmemiş track bağlama yolunun devamıdır. Bu tur provenance şeması genişletilmedi. |
| 409 B409-03 | Linux /tmp/TMPDIR test ortamı sorunu Windows ürün hatası değildir. |
| Ayrı407 oynatıcı/tasarım önerileri | 3sn ses örneği, güven merkezi, dalga biçimli senkron masası, mini iz sabitleme ve renderer modüllere ayırma önerileri bu tur uygulanmadı. |

## Doğrulama ve sınırlar

Windows'ta hedefli kontroller geçti: browser-report444 (3), translation-quality-loop (16), live-asr-fallback (8), audio-switch (15 mevcut + yeni aynı-parça regresyonu), browser-live-asr-pipeline (8), watch-index-assets (20), translation-archive, DOM sink ratchet (2), Python validation444 (3). Main/preload/renderer ve değişen modüller syntax kontrolü, Python py_compile ve diff-check temiz.

Electron trusted-bridge smoke ayrı test penceresinde geçti. İlk node --test çağrısı sandbox spawn EPERM verdi; aynı node:test dosyaları doğrudan node ile geçti. İki eski fixture düzeltildi: fallback harness'ında mevcut dubService stub'ı eksikti; pipeline kaynak dilimi CRLF satır sonlarını tanımıyordu. Assertion kaldırılmadı, ratchet gevşetilmedi.

Yeni bağımlılık/kurulum yok. Asset v2'ye yalnız opsiyonel kalite alanları eklendi; eski kayıtlar okunur, eski kaybolmuş uyarılar geri üretilemez. Yeni NDJSON segment.path alanı geriye uyumludur. Kullanıcı profili/anahtar/ses dosyası kullanılmadı veya Git'e eklenmedi. start.bat/install.bat değişmedi; start.bat üzerinden gerçek ana uygulama açılışı, canlı YouTube/çoklu ses, CUDA/model çıkarımı, gerçek ffsubsync eşlemesi ve tam test paketi bu tur çalıştırılmadı. CI kullanıcının önceki talimatıyla incelenmedi/beklenmedi. Bütün dış rapor maddeleri kapatılmış değildir.
