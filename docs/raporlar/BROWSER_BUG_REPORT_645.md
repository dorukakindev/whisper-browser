# Rapor 645 — Kitapta üretim öncesi durdurma ve sabit başlangıç kapsamı

Başlangıç `f88541f8c8e0530bc7bee6657f02d01de665c037`; ürün `27426e57b85c5b7e839be9a2fe5d026c6a86b989`. Aynı asenkron başlangıç ailesi; her test ayrı bug sayılmaz.

## Eski kodda doğrulanan sorunlar

- Bölüm kaydı beklerken Stop/kapatma isteği `stopRequested=true` yapıyordu; save dönüşünde bu bayrak false'a sıfırlanıp görünmez üretim başlayabiliyordu. Gerçek generate fonksiyonu testi eski kodda1start/0beklenen ile kırmızıydı.
- Seçili bölümler ve voicePrefs save sonrasında okunuyordu. Beklerken değişiklik iki bölümün/başka referansın üretilmesine veya işin başka projeye yönelmesine yol açabiliyordu. Gerçek fonksiyon repro'ları2start/1beklenen ve farklı kaynakta1start/0beklenen ile kırmızıydı.
- Hazırlanmış ama motoru hiç başlamamış istekte Stop, kalıcı activeJob/pending kaydını bırakıyordu. Yeni exact unprepare yolu yalnız kendi başlamamış isteğini bırakır; mevcut ses, kalite ve sonraki iş korunur.

## Uygulama

Başlangıç projesi/dialogu, seçili bölüm dizisi ve ses tercihleri ilk await öncesinde sabitlenir; iptal niyeti yalnız başlangıçta temizlenir. Save/prepare/fresh-plan sonrasında kapsam ve iptal tekrar denetlenir. Kapatılmış veya başka kaynakta kalan iş yeni üretim başlatmaz. Geç ilerleme başka dialoga yazılmaz. Başarısız save'in özgün hatası sonraki cleanup read'iyle maskelenmez.

Mevcut `media-workflows:request` kanalına iç `book-unprepare {id,chapter,jobId}` eylemi eklendi. Yetki/chapter/jobId, pending ve activeJob exact eşleşmesi aranır; çalışan ses veya export varken reddedilir. Save başarılı olmadan pending silinmez. Yeni kalıcı şema yok, eski çıktı/denemeler silinmez. Kabul callback'i başlangıçtaki selectedCount'u taşır; asistanın tek-job kimliği sonradan değişen seçime bağlı kalmaz.

## Kanıtlar

- `book-generation-stop645.test.js`:6davranış; save sırasında stop/close, başlangıç seçimi/ref, farklı kaynak, prepared stop, save hatası, asistan iptali/save veya force-plan beklemesi. İlk4eski-kod kırmızısıdır; refaktörde save-error korunması ayrıca kırmızı→yeşil doğrulandı, ayrı eski ürün hatası sayılmadı.
- `book-unprepare645.test.js`: gerçek servis, önceki hazır sesi koruma, eski isteğin yenisini silememesi, çalışan sesin korunması, idempotans ve invalid chapter.
- İlgili önceki kitabın capture/render/adaptör kontrolleriyle21/21 hedefli Node geçti; JS syntax/diff temiz. Eski regenerate fixture'ı kapalı dialog kullanıyordu; gerçek davranış için açık dialog ve books callback'iyle tamamlandı, assertion'lar korunur.
- `electron-book-stop645.smoke.js`: gerçek Windows main/preload/renderer, ayrı profil ve kontrollü IPC gecikmesi. Üç iptal fazında0motor start,1exact unprepare; ardından yalnız kontrollü kabul modunda iki sentetik start. Gerçek modele girilmez.
- Aynı native testte kalıcı şema fixture'ı1.000bölümle açıldı. Son koşu84,1ms,4.122DOM node,12.700.000byte renderer JSheap örneği. Diğer kısa koşular74,3/93,5ms idi. Tek cihaz/kısa örnekler genel performans veya toplam süreç belleği ölçümü değildir; import/parser/GPU benchmark'ı değildir.
- Son bölüm1000erişildi; gerçek AssistantAppActions üzerinden998–1000seçimi kalıcı dosyada997/998/999olarak ve UI'da3checkbox olarak doğrulandı. Ardından tek bölüm start acceptance exact jobId, gerçek yerel10sn sessiz WAV metadata/vurgu ve regenerate forceAll acceptance geçti. Model/plan yardımcıları kontrollüdür; sessiz WAV/ready raporu işitsel kalite kanıtı değildir.
- Son native exit0 `.uiprev/book-stop645/1793093312779-22268`; durdurulmuş üretim ve son bölüm seçim görüntüleri önceki aynı akış koşularında incelendi. İlk genişletilmiş dinleme denemesi yanlış test kapsayıcısı seçicisi yüzünden timeout oldu; ses öğesi doğru yerden seçilince geçti, ürün bugı sayılmadı.

UI tasarımı, dependency veya schema version değişmedi. Gerçek VoxCPM2/GPU, aktif GPU işinin native kill'i, sağlayıcı veya YouTube/start.bat bu pakette denenmedi. Kişisel app kapatılmadı. Uzun CI beklenmez.1000hedef çalışması devam eder.
