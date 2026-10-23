# Rapor529 — Ses üretiminde görünür aşamalar, toplu yeniden deneme ve önceki çıktı

2026-10-23. Depo: https://github.com/dorukakindev/whisper-browser
Dal ve açık teslim PR'ı: `codex/deep-audio528`, https://github.com/dorukakindev/whisper-browser/pull/481
Başlangıç HEAD `e5af87f25cb25a490bb4d33d9af451bed05919c8` (önceki Rapor528 dahil).
Başlangıç/güncel master `fb86bb3264cecc6acf3d6806b28780468e01072c`.
Bitiş ürün kodu `6fd868ca83c58493c5c95cc2030625d118e0e031`.

Kullanıcı 'devam geliştirmeler yap' dedi. Bu tur hata sayısı doldurulmadı; üç bağlantılı kullanım iyileştirmesi uygulandı. Ayrı dal güncel master tabanlıdır; önceki açık PR481 aynı ses akışına ait olduğundan onun üzerinde devam edildi. Kullanıcı talimatı gereği kendimiz merge etmeyiz.

## Geliştirmeler ve önceki eksikler

### 529-01 — Gerçek aşama ve aşama bekleme süresi

Önceki gösterim yalnız tamamlanan grup sayısını artırıyordu. Son grupta ASR doğrulaması, verifier kapanışı, zamanlama veya son WAV işlemi beklerken sayaç değişmiyor; kullanıcı bunun hangi iş olduğunu göremiyordu.

Backend artık yalnız sayısal/izinli alanlarla DUB_ACTIVITY {group,total,stage,attempt} ve DUB_PHASE gönderir. Aktif parça için ses üretimi, AI konuşma düzenlemesi, metin denetimi gösterilir; tek aktif parçada sıra/toplam ve deneme numarası görünür. Paralel üretimde aşama başına aktif grup sayısı ve en uzun bekleyen parçanın mevcut aşama süresi gösterilir. Referans hazırlama, denetimi kapatma, zaman çizelgesi, dosya yazma ve dengeleme de ayrı son aşamalardır. Sayaç bir saniyede bir güncellenir; bu gerçek aşamada geçen süredir, kalan süre tahmini veya donma kanıtı değildir.

Main yalnız group/total1–5000, izinli stage ve0–50 attempt alanlarını iletir. Olaydaki metin veya bilinmeyen alanlar log/renderer'a aktarılmaz. Eski job olayları UI'ı değiştirmez, Durduruluyor durumunda ilerleme durumu yeniden yazılmaz. Tamamlanan grubun aktif kaydı silinir. Yeni IPC kanalı yok; mevcut dub:event genişletilir. Bu olaylar üretim NDJSON günlüğünde zamanlarıyla tutulur; kayıtlı subtitle metni eklenmez.

### 529-02 — İşaretli parçaları tek seferde yeniden üret

Eksik parçaları tamamla eski anlamını korur: hazır dosyaları yeniden üretmez. Kontrol gerektiren ama diskte WAV'ı olan parçalar için eskiden her parçayı tek tek seçmek gerekiyordu. Yeni **İşaretli parçaları yeniden üret** düğmesi yalnız review/failed grupları seçer, ready grupları dışarıda bırakır. Seçili parçayı yeniden üret de korunur. Yeni düğme sonuç/son isteğin olmadığı, üretim veya başka ses işi sürdüğü durumda kapalıdır. Taşınabilir proje çalıştırılabilir eski bir engine isteği sayılmadığından onun için düğme açılmaz.

Main birden fazla seçimi5000 anahtar ve80000 birleşik karakterle sınırlar. Toplu seçim Windows komut satırı sınırını aşmamak için inputDir/force-groups.json dosyası üzerinden --force-groups-file ile geçer. Tek grup eski --force-groups argümanını kullanır. Python100000 byte dosya sınırı, JSON liste/tür/key doğrulaması ve tekilleştirme yapar. Seçim dosyası yalnız bu işin sahipliğindedir; başarısızlık/iptalde temizlenir, kaynak SRT korunur. Üretim öncesi mevcut plan anahtarlarıyla üyelik denetimi devam eder. Log settings.regeneratedGroups yalnız sayı tutar.

Bu düğme yeniden üretimin kaliteyi mutlaka iyileştirdiği anlamına gelmez. Farklı seed denenir; sonuç yine kalite kapılarından geçer. Başarısız yeniden üretimde gerçek eski sesi koruyan Rapor528 onarımları aynı PR'dadır. Metin veya ayar değiştiyse önbellek adresi farklılaşabileceğinden buna bağlı başka parçalar da üretilebilir; bütünü hiçbir koşulda sabit kalır garantisi verilmez.

### 529-03 — Yeni deneme önceki dinlenebilir çıktıyı kaybettirmesin

Önceden yeni job başlangıcında output=null yapılır ve preview/workspace temizlenirdi. Dosya diskte kalsa da başlangıç reddi veya iptalden sonra tek görünür dinleme/açma yolu kaybolurdu. Yeni denemede aynı medya bağlamına ait önceki çıktı görünür kalır; **Yeni üretim sürüyor; önceki ses aşağıda korunuyor** açıklaması, eski dosya adı ve dinleme kontrolü korunur. Videoya bağlama ve workspace işlemleri üretim boyunca kilitlidir; önceki ses dinlenebilir/açılabilir. Başlangıç reddi veya iptal eski oynatılabilir kaydı silmez. Yeni başarılı ya da açıkça kurtarılmış çıktı geldiğinde yeni kayıt onun yerini alır.

Başka medyaya geçişte önceki çıktıyı yeni işin sesi gibi korumamak için medya kimliği kontrol edilir. Eski auto-attach Promise'i yeni job'ın durum mesajını ezemez; current job ve lastRequest kimliği koşulu eklendi. Üretim metni düzenlemesi kapalıysa no-op rewrite aşaması gönderilmemesi için auto_fit kapısı çağrıdan önce uygulanır.

## Görünüm ve kullanım

Altyazıdan ses üret penceresinin alt durum bölümünde yeni aşama satırı kendiliğinden görünür. **Parça sonuçları ve yeniden üretim** bölümündeki yeni düğme bütün işaretli sonuçları seçer. Üç düğme mevcut flex-wrap düzenini kullanır, yeni renk/ikon veya bağımsız tasarım sistemi eklenmez. frontend-design becerisi mevcut ink/grafit ve amber tasarımını koruyan küçük ekler için uygulandı. Tüm yeni sabit ve dinamik etiketler TR/EN'dir; kaynak dosya adı/metin arayüz çevirisine verilmez.

## Doğrulama

- Son Node hedefli koşum:11 dosya/runner26 test,0 hata. dub-service, dub-generator-ui, dub-workspace-ui, player-dub-ui, ui-locale, ui-locale-dedupe, ui-locale-dynamic, ui-locale-userdata, report528-audit, report527-audit, browser-translation-merged.
- Son UI test eklemesinde bulk düğmesinin review/failed seçip ready'yi dışarıda bıraktığı, aynı medya için başlangıç reddi/iptal sonrası eski audio src'nin korunduğu tekrar doğrulandı. Eski eksik tamamlama forceGroups=[] sözleşmesi değiştirilmedi.
- Python8 ilgili dosya57 yöntem geçti: test_audio529, test_dub_generation_quality, test_dub_module_paths, test_dub_resume, test_dub_lifecycle, test_dub_timing, test_audio528, test_dub_plan_regressions. İçinde gerçek ffmpeg normalizasyonu da vardı. Yeni test_audio529(3) BOM/5000 anahtar/yanlış tür/bozuk JSON/boyut sınırı; gerçek üretim orkestrasyon fixture'ında generate→verify stage sırası ve kişisel metnin olayda bulunmaması.
- IPC testinde izinli activity alanları iletilir, invalid group>total reddedilir. Çoklu key için argv yerine sahip olunan dosya kullanılır; iş başarısızsa dosya silinir. Sözdizimi ve git diff --check geçti.
- Windows gerçek Electron render'ı, ağ kapalı ve ayrı sentetik profil:1400×1000 TR hazır/çalışan,680×900 EN çalışan ekranları capturePage ile alınıp gözle incelendi. Dialog scrollWidth=clientWidth sırasıyla1078/644; footer altı969<1000 ve872<900. Yeni düğme hazır durumda açık, işte kapalı; eski ses notu görünür ve61/61 verify aşaması TR/EN doğru.
- Görsel fixture ve PNG/ölçüm tmp/audio529-ui altında ignored; kullanıcı uygulaması/profili kullanılmadı, Git'e ham görüntü alınmadı. İlk görsel fixture denemesinde fonksiyon döndüren executeJavaScript sonucu clone edilemedi; yalnız fixture düzeltilip tekrarlandı, ürün bug sayılmadı.
- İlk locale dedupe hedefli koşumu yeni referans etiketinin İngilizce eşanlamlı anahtarını yakaladı. Test gevşetilmeden mevcut kanonik TR etiketine geçildi ve test geçti.

## Sınırlar

Tam npm test veya yeni CI sonucu beklenmedi; testler kapatılmadı. Bu tur gerçek Whisper/VoxCPM2 GPU, kişisel sesle dinleme/uzun üretim, canlı AI/YouTube/DRM ve normal start.bat açılışı yok. Görsel kontrol gerçek Electron renderer ama sentetik IPC/model verisidir; model kalitesi kanıtı değildir. Genel Electron bridge önceki528 turunda geçti, bu tur gereksiz tekrarlanmadı. start.bat/install.bat ve dış VoxCPM2 değişmedi; yeni bağımlılık/model/kalıcı ayar şeması yok. İki küçük protocol olayı ve force-groups-file CLI seçeneği eklenir. Önceki düzeltmeler PR481'de birlikte korunur. Ana Windows master kopyası ve yerel kullanıcı belgeleri değiştirilmedi, merge yapılmadı.
