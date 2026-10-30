# R815 — az kapsanan alanlar matrisi

31 Ekim 2026, ürün tabanı `db65f2e7f6e7b50649c440cb183cb88863ebf241`. Önceki 103 bulgu yeni sayılmaz. Üç ajan GPT‑6.1 Sol / medium effort. Bu matris dosyaların proje tarihinde hiç okunmadığını iddia etmez; bu turdaki yeni mekanizma sınırını ve kalan boşlukları gösterir.

## packaging

[Alan raporu](packaging/findings.json) · [Ana eşleme](findings.json)

- **domain:** Windows dağıtımı ve kurulum zinciri
- **sources:** tools/package-manifest.js, tools/package-windows.js, tools/install-orchestrator.js
- **prior103:** Kaynak/mekanizma için bulgu yok
- **registry:** Bu üç kaynak için 0 senaryo; aile imzaları aynı invariantı içermiyor
- **historical:** R266/R317 manifest ve gerekli kaynak; R345 farklı .wbp mahremiyet sınırı
- **exercised:** Gerçek packager varsayılanları+filtre+fs.cp, required checker, preflight ve eksik kilit karşı kontrolü
- **unverified:** Tam EXE/temiz VM/BAT etkileşimi, gerçek yayımlanmış paket içeriği, kişisel veri ifşası

## engines

[Alan raporu](engines/findings.json) · [Ana eşleme](findings.json)

- **source:** src/media-torrents.js
- **family:** UE01 / seçim transaction rollback
- **newUnexaminedEdge:** HTTP503 sonrası mevcut job alias mutasyonu ve sonraki pause kalıcılığı
- **sourceSha256:** a6447f3320fa5dd14969358df6eeccf4fd51791069725a1dc1f053aed9953041
- **registrySourceRows:** 0
- **registryFamilies:**
- **registryScenarioIds:**
- **relationship:** Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.

- **source:** src/media-torrents.js
- **family:** UE02 / eşzamanlı seçim transaction
- **newUnexaminedEdge:** Aynı hash, farklı dosya; iki in-flight play ve lost update
- **sourceSha256:** a6447f3320fa5dd14969358df6eeccf4fd51791069725a1dc1f053aed9953041
- **registrySourceRows:** 0
- **registryFamilies:**
- **registryScenarioIds:**
- **relationship:** Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.

- **source:** src/media-torrents.js
- **family:** UE03 / engine startup–quit sahipliği
- **newUnexaminedEdge:** Port tahsisi await sürerken close/before-quit; kapanıştan sonra spawn
- **sourceSha256:** a6447f3320fa5dd14969358df6eeccf4fd51791069725a1dc1f053aed9953041
- **registrySourceRows:** 0
- **registryFamilies:**
- **registryScenarioIds:**
- **relationship:** Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.

- **source:** src/renderer/renderer.js
- **family:** UE04 / native snapshot tüketicisi
- **newUnexaminedEdge:** API sonrası Image.decode await sırasında kaynak/generation değişmesi
- **sourceSha256:** 6f715d67be62b19d794a9f4dbc471206b4d7d9756d60233a51cbb4de46a27f93
- **registrySourceRows:** 20
- **registryFamilies:** F19
- **registryScenarioIds:** N0361, N0362, N0363, N0364, N0365, N0366, N0367, N0368, N0369, N0370, N0371, N0372, N0373, N0374, N0375, N0376, N0377, N0378, N0379, N0380
- **relationship:** N0361–N0380/F19 iş kuyruğu ayar dondurma; native Image.decode sahipliği aynı senaryo değildir.

- **source:** src/native-player.js
- **family:** Native komut ve temp screenshot ömrü
- **newUnexaminedEdge:** B77 tekrar sayılmadı; snapshot consumer downstream sahipliği UE04
- **sourceSha256:** f45125fce23922f55bb4f13d87216a8797ae41b1cdafec5446d94bd8de39c6d7
- **registrySourceRows:** 0
- **registryFamilies:**
- **registryScenarioIds:**
- **relationship:** Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.

- **source:** src/gpu-diagnostics.js
- **family:** GPUInfo gerçek ortam kontrolü
- **newUnexaminedEdge:** Ayrı sentetik Electron profiliyle gerçek gözlem sandbox Mojo AccessDenied nedeniyle engellendi
- **sourceSha256:** 78afb006160e10b0e23e6f474c0a4d11af601c9540beb4e4525f4e3164b675df
- **registrySourceRows:** 0
- **registryFamilies:**
- **registryScenarioIds:**
- **relationship:** Night1000 registry içinde bu kaynak adına bağlı senaryo yok. Bu, tüm tarihsel raporların tarandığı iddiası değildir.

## subscriptions

[Alan raporu](subscriptions/findings.json) · [Ana eşleme](findings.json)

- **source:** src/subscriptions-io.js + renderer30962–31025
- **trigger:** JSON501 → gerçek import click → localStorage → reload
- **registry:** 1000senaryoda açık abonelik anahtar eşleşmesi yok
- **newBoundary:** Modül1000/UI500 ve kalıcı kayıt zinciri
- **unexamined:** Gerçek Windows dosya seçici; 2MiB sınırı aşan dosya

- **source:** src/subscriptions-io.js12–67 + renderer31007
- **trigger:** Unicode çıplak/URL ve case-varyant handle
- **registry:** Açık handle/subscription aile eşleşmesi yok; tarihsel modül testleri var
- **newBoundary:** Gerçek ekleme callback’i ve import kimlik karşılaştırması
- **unexamined:** Canlı handle sahipliği; Unicode casefold/normalizasyon tüm dilleri

- **source:** src/subscriptions-io.js154–158
- **trigger:** Handle-only OPML export/own roundtrip
- **registry:** Tarihsel OPML export/parse testleri var
- **newBoundary:** RSS xmlUrl tüketici sözleşmesi
- **unexamined:** Üçüncü taraf RSS okuyucusu ve canlı YouTube endpoint; bug sayılmadı

- **source:** renderer29137–29185,31128–31164,32040–32043
- **trigger:** İlk açılış → force:true → TTL expire
- **registry:** R815103 içinde bu cache yok; açık abonelik senaryosu yok
- **newBoundary:** Yenile force parametresinin yerel dala taşınması
- **unexamined:** Hesaplı YouTube/Invidious abonelik dalı

- **source:** main19833–19900 + renderer31146–31161
- **trigger:** Gerçek handler → loopback503 → gerçek panel
- **registry:** R160/R354 bounded read/redirect geçmişi var; hata durumunun UI tüketimi ayrı
- **newBoundary:** Tam kaynak arızası başarı/boş akış ayrımı
- **unexamined:** Canlı CDN, redirect sınırları, proxy/TLS, gerçek networkOnline olayları

## library

[Alan raporu](library/findings.json) · [Ana eşleme](findings.json)

- **area:** RSS/Atom ekleme ve yenileme
- **sources:** backend/media_shelf.py, src/media-shelf-service.js, src/renderer/media-shelf-ui.js
- **previous:** Night1000 F39 CSV/ZIP alan birleştirme; backend/test_media_shelf.py mutlak RSS olağan akışı
- **new:** Atom xml:base ve GUID sabitken enclosure değişimi; gerçek Python + handler + disk
- **boundary:** Harici feed/CDN ve ses oynatma yok

- **area:** EPUB metin çıkarma ve okuyucu
- **sources:** backend/media_shelf.py, src/renderer/media-shelf-ui.js
- **previous:** F39 CSV/ZIP alan birleştirme; R612 metadata/nav/noteref ve açık dipnot testleri
- **new:** Normal hidden niteliği; gerçek ZIP/parser/import/open ve JSDOM okuyucu
- **boundary:** DRM/fixed-layout/CSS kaskadı ve native görsel kontrol yok

- **area:** Kayıtlı Spotify eşleşmesinin olağan oynatımı ve modal iptal sahipliği
- **sources:** src/spotify-import.js, src/renderer/spotify-import-ui.js, src/media-shelf-service.js
- **previous:** R699 yeniden eşleştirme korumaları; eski 103 içinde farklı oynatıcı yaşam döngüsü bulguları
- **new:** Boştaki modalın başka tüketicinin bekleyen stream işini iptali
- **boundary:** Hesap/abonelik, canlı metadata indirme ve müzik analizi açılmadı

- **area:** İzlenen klasör
- **sources:** src/watch-folder.js, src/main.js
- **previous:** R66-03 ve R73 çıktı algılama/yeniden kuyruk döngüleri
- **new:** Salt okunur inceleme; yeni strict bulgu yok
- **boundary:** Önceki kökler tekrar sayılmadı; boyut kararlılığı politikası bug sayılmadı

- **area:** Radyo URL kaydı ve klasör müzik içe aktarma sınırları
- **sources:** src/media-shelf-service.js
- **previous:** F39 CSV/ZIP alan birleştirme ailesi
- **new:** Salt okunur inceleme
- **boundary:** Yeni somut disk/tüketici kanıtı olmayan adaylar sayılmadı

## Tarihsel ve açık sınırlar

[Kaynak–senaryo–mekanizma–imza karşılaştırması](registry-comparison.json) 22 güncel kaynak için 100 tarihsel satırı eşleştirir: F15 sayfa çevirisi, F19 kuyruk ayarları, F39 CSV/ZIP alan birleştirme, F44 güvenilir browser bridge ve F50 atomik ayar/sır yazımı. Yardımcı dosya veya geniş main/renderer eşleşmesi yeni invariantın önceden sınandığını göstermez. Bu 100 satır bu tur yeniden çalıştırılmış test veya yeni bug değildir.

Night1000: [README](../../../audits/deepseek-night1000-20261027/README.md) ve [1000 senaryo imzası](../../../audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json). Önceki bulgular [103 eşlemesinde](../hundred/findings.json). F19 N0361–N0380 renderer kuyruğudur; snapshot decode sahipliği onun tekrarı değildir. Aynı kaynak dosyası geniş işlevler içerebilir.

Klasör izleme önceki R66/R73 kökleri yeniden bug sayılmadı. Tam EXE/temiz makine kurulum ve normal start.bat, gerçek GPU adapter/native mpv/peer/DRM, canlı YouTube/Spotify/podcast sunucuları, üçüncü taraf OPML okuyucusu, fiziksel ses/ekran okuyucu ve tüm UI/DPI testleri bu turun sonucu değildir. Engellenen GPUInfo denemesi ve doğrulanmayan native audio-track/venv kısmi temizlik adayları bug değildir. Müzik analizi ve P081–P090 açılmadı.

Yalnız kontrollü fixture/kopya ağaçları; gerçek profil, sır, hesap, cookie veya kişisel medya yok. [Ana süreç doğrulaması](parent-verification.json) beş iş akışını ve karşı kontrolleri listeler.
