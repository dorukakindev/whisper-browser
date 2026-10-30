# R815 — diğer alanların kapsamı

Ürün tabanı **6a789329d96c4f97cdc17bd9518df0b540b13444**. 21 kaynak SHA, 120 eşleşen tarihsel senaryo/imza. Eski senaryolar bu tur tekrar çalıştırılmış veya yeni bug sayılmaz. [Tam kaynak/ID/mekanizma/imza matrisi](coverage.json).

| Alan | Önceki kapsam | Yeni sınır | Doğrulanmayan |
|---|---|---|---|
| Tanı mahremiyeti + site/path profil hedefi | R69 diğer redactor; R356/13.09.2026.07 derin klasik kısa fixture; R77/R85/R301 profil/zoom | Gerçek producer kırpması, kanonik free-text sır ataması, preview/export/disk ve aynı-ID SPA path sahipliği | Gerçek sağlayıcı mesajı/sır ifşası, kişisel altyazı, native dialog ve gerçek site SPA/IPC sıklığı |
| İndirilen dosyayı yerel oynatıcıya açma | R64-25 file grant; R46 interrupted/persist; R167 terminal resume tasarımı | M4B renderer düğmesi → IPC → gerçek manager uzantı beyaz listesi | Native DownloadItem/save dialog, kodlanmış M4B decode veya fiziksel ses |
| Canlı ASR oturum/iz kimliği ve capture başlangıcı | F20 N0390 saat/source, N0395 worklet yeniden giriş; R648 addModule sırasında uygulama Stop | Stop/restart geriye zamanlı aynı söz ve cue id; addModule await içinde doğal track ended olayı | Native mikrofon/sistem ses paylaşımı, Whisper modeli/GPU ve final SRT |
| Otomasyon gerçek karakter bütçesi + MCP UTF-8 taşıması | R46/Tur4 claim/iptal/timeout recorder; R798 MCP auth/Origin/ASCII/single-body | Gerçek publisher metadata → karar/onay bütçesi; localhost HTTP UTF-8 çok bayt sınırında aynı RPC id | Canlı sağlayıcı/gerçek maliyet, dış MCP istemcisi/stdio, doğal ağ parçalanma oranı |

## Tarihsel bağlar

[Önceki118 eşlemesi](../unseen/findings.json), [Night1000 README](../../../audits/deepseek-night1000-20261027/README.md), [registry](../../../audits/deepseek-night1000-20261027/COVERAGE-REGISTRY.json). Geniş main/renderer kaynak ortaklığı aynı invariantı göstermez. F20 N0390/N0392/N0395 saat/kanal/worklet yeniden girişidir; yeni session→cue kimliği ve listener kurulmadan ended olayı değildir. R356 tam/kısa cue ile genel sansürü; burada producer kırpması ve farklı canonical free-text alanları sınanır.

[Revizyon sınırı](prior-revision-review.json): başka seslendirme/stüdyo merge’i nedeniyle önceki118’in hepsi bugün yeniden açık doğrulandı denmez. Bu tur8 yeni, kendi güncel kaynak hashleri ve bağımsız karşı kontrolleriyle doğrulandı. [Tekrar üretme](REPRODUCE.md), [ana süreç kanıtı](parent-verification.json).

Site izinleri/legacy zoom, workflow recorder eski timeout/claim iptali ve download terminal resume tasarımı incelendi; yeni bulgu diye tekrar sayılmadı. Gerçek UI/yerel aygıt/provider/GPU/mikrofon/codec/DRM/BAT ve dış MCP istemcisi bu kontrollü kanıta dahil değildir.
