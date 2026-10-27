# Rapor661 — Yerel CLAP müzik benzerliği, Paket2

2026-10-27. Repo https://github.com/dorukakindev/whisper-browser. Dal codex/music-similarity661. Başlangıç master `6d702b05c1bbadf1d8c4749533a52dc4f809abc0`; bitiş ürün kodu `2d2ba14b6ce1577a58117c4f95de05f2e0cd6579`.

## Kullanım ve kapsam

Müzik → Analiz et → Arşivimde benzerleri. Referansı ve isteğe bağlı saniye aralığını seç → Benzer parçaları bul. Katalog mevcut Müzik rafındaki yerel dosyalardır. Model ilk kez gerekiyorsa CLAP hazırla düğmesi615MB resmî ağırlığı indirir. Bu makinede model kuruldu ve doğrulandı. Uzun parçadan en fazla altı eşit dağılmış10sn kesit; kısa parçalar gerçek süreyle, model girdisinde repeatpad. Tüm şarkının kesintisiz dinlendiği iddia edilmez. Sessiz/bozuk dosyalar sahte sıfır vektörle indekslenmez; hata sayısında görünür. Dosya başına1GB ve aralık1sn–30dk; kitaplık5000kayıt. İlk büyük tarama CPU'da uzun sürebilir; ilerleme ve iptal mevcuttur.

Sonuçta gerçek CLAP benzerliği, örneklenen kesit sayısı ve en yakın eşleşen aralık gösterilir. Puan olasılık veya insan beğenisi değildir. Sıralama0.7×referans kesitlerinin en iyi eşleşme ortalaması +0.3×en iyi kesit çifti cosine; -1..1. Aynı model/ön işleme/sürüm zorunlu. Aynı içerik hash'i ve kaynak ID dışlanır; aynı sanatçıyı dışla yalnız bilinen metadata varsa etkin. Sonuçlar20ile sınırlı, eşit skordaIDile deterministik. Sanatçı tahmini yapılmaz.

A/B karşılaştır seçilen aday kesitini açar. A referansı, B adayı oynatır; aynı anda ikisi çalmaz. RMS tabanlı dinleme seviyesi eşleme yalnız sesi kısar, kaynak dosyayı değiştirmez. Bu eşleme LUFS veya algılanan yüksekliğin kusursuz eşitliği değildir. Hızlı A/B geçişindeki beklenen AbortError artık başarısızlık olarak gösterilmez; diğer oynatma hataları korunur.

## Model, lisans ve Windows ortamı

- Resmî [LAION model](https://huggingface.co/laion/clap-htsat-unfused), Apache2; revizyon `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`.
- `pytorch_model.bin`614525833bayt; SHA256 `1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb`. Resmî revizyon, doğrulanmış hash, restricted `weights_only=True`, local_files_only, custom code yok. ModelCPU/2thread, her aramada bir kez yüklenir; tüm vektörler cache'teyse yüklenmez. Aramalar arasında model sıcak tutulmaz.
- Mevcut makinede Torch2.6.0+cu124 / Transformers4.57.6 / NumPy2.4.6 ile gerçek çalıştı; mevcut ortamda pip veya Torch yükseltmesi yapılmadı. Model `.to('cpu')`; GPU kabulü veya hız iddiası yok.
- Repo core kilidiTorch2.5.1olduğundan temiz kurulumda aynı runtime varsayılmadı. Opsiyonel `install-music.bat` ayrı backend/music-venv oluşturur; CPU torch2.6.0resmî PyTorchCPUindeksinden, transformers4.57.6 ve numpy2.2.6requirements ile kurulur. Ana CUDAvenv değişmez. Ayrı ortam varsa o, yoksa uyumlu mevcut ortam seçilir. Runtimekapısı eksik/eski ortamda install-music.bat yönlendirmesi gösterir. Yeni installer temiz makinede çalıştırılmadı; syntax/kod incelendi.
- Ağırlıklar backend/models/music-clap altında, Gitignore; kaynak ses internete yüklenmez. İndirme kesintisinde Range devamı ve son SHA kontrolü. İlk istemci aktarımı durdu; Windowscurl180sn sınırında542MB'ye geldi, ürün devam kodu kalanını tamamladı ve hash geçti. İzole ortam kurulumunun internet erişimi gerektirir.

## Kod ve kalıcılık

backend/music_similarity.py pinned model hazırlama,6kesit temsili512boyut, cosine ve per-track cache. src/music-similarity.js tek worker koordinasyonu, katalog/path doğrulama, kesinID sonuç bağlama, runtimekapısı. src/music-analysis-service.js ortak iş/iptal/progress sözleşmesine search/prepare; main.js model/runtime yolları. RendererJS/CSS sekmeler, liste, A/B ve responsive; metadata başlığı. .gitignore yeni ortam/model. Yeni Python/Node/native testleri.

Cache userData/music-vectors altında dosya gerçek yolu/boyut/mtime_ns/seçim/model-space anahtarlı; içerikSHA duplicate kontrolüne dahil. Dosya stat değişirse yeniden embedding; aynı stat korunarak dışarıdan yapılan değişiklik şu an tespit edilmeyebilir. Cache'e her sorguda tüm içerik hash'i yeniden hesaplanmaz. Model-space değişince eski vektörler karşılaştırılmaz. Cache dosyaları otomatik evriltilmez; çok büyük arşivde disk boyutu ölçümü sonraki iyileştirmedir. Cache'de ses yok; temsil/path hash'i ve içerik hash'i var. Kaynak dosya değişmez.

## Kontroller ve gerçek kanıt

- Node hedefli komut: music-analysis, music-similarity, coverage-map, ipc-parity:10PASS. Önceki analiz iptal/cache/sender kapıları; yeni kaynakID/skor/path bağlama ve model eksikliği. IPC278handle/17on, yeni kanal eklenmedi.
- Python test_music_similarity.py:5PASS; range-window planı, sıfır/NaN/boyut reddi, model-space/duplicate/self, artist ve indirme resume/hash kapısı.
- JS node --check, Python py_compile, git diff --check:PASS. Tam npm test/uzunCI beklenmedi, CI kapatılmadı.
- Gerçek CPUCLAP iki CC-BY3örneğinde çalıştı. [Vibe Ace](https://librosa.org/data/audio/Kevin_MacLeod_-_Vibe_Ace.txt), Kevin MacLeod/FMA; [Jazz Trumpet Loops](https://librosa.org/data/audio/sorohanro_-_solo-trumpet-06.txt), Mihai Sorohan/Freesound. Librosa resmî test kaynakları, indirme hashleri kanıtJSON'da. Audio repoya eklenmedi.
- İlk10snVibeAce referansı: aynı kesitin0.5gain WAV'ı cosine0.98517; farklı trompet0.32726. Bu yalnız pozitif/negatif entegrasyon kontrolüdür; geniş müzik kalitesi, kör kullanıcı tercihi veya CLAP'ın diğer modellerden üstünlüğü kanıtı değildir.
- Native `electron tests/electron-music661.smoke.js --disable-gpu`:son koşu `.uiprev/music661/1793126326549`, PASS. Gerçek model/ffmpeg/main/renderer; kitaplıkID, aralık, sıralama, A/B, yaklaşık0.5referans seviye eşleme, aynı sanatçı dışlama, cache>=3,720pxyatay taşma yok,kapanış. Fixtureprofil, gerçek kişisel kitaplık/anahtar kullanılmadı. Gerçekhoparlörle insan dinleme değerlendirmesi yok. Model indirme E2E ürünCLI ve ayrı resume testiyle; UI'dan615MBindirme tekrar edilmedi.
- İlk görüntü incelemesinde A/B play iptali kullanıcı hatası gibi görünüyordu, düzeltildi ve native assertion eklendi. Dosya düzenleme sırasında oluşan encoding bozulması gerçek ekran kontrolünden önce giderildi; son TR ekran doğru. Native11before-quit listener uyarısı sürer, gizlenmedi.

## Görsel inceleme ve sınırlar

frontend-design/make-interfaces-feel-better: mevcut grafit/amber, IBM Plex Sans; ses analizi/benzerler sekmesi, liste ve A/B yüzeyi gerçek geniş/dar görüntüde incelendi. Sonuçlar kopya dashboardkartlarına bölünmedi; skor/model/örnekleme anlamı açıklanır. Focus, tablo sayı genişliği,44pxsekme ve160msgeçiş, reduced-motion korunur. Animasyon %10araç incelemesi, ekran okuyucu ve lighttheme kabulü yapılmadı.

İnternet/Cyanite araması, duygu/enstrüman modeli, çoklu referans/çeşitlilik filtreleri ve asistan müzik araçları bu paket dışıdır. start.bat/install.bat değiştirilmedi; kişisel açık uygulama kapatılmadı. Temiz Windows install-music ve büyük5000parça performansı doğrulanmadı. Sonraki paket internet adayları ile sesle doğrulanmış sonuçların açık ayrımı; daha sonra geniş dinleme/model karşılaştırması.
