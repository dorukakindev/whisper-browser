# Bekleyen işler

Son durum kontrolü **2026-11-06**. Son ürün `2c1935b5eacf1fc22163eea2c597574182f5169f`. [Güncel teslim](docs/devir/2026-11-06-0643.md).

**Yeni sohbet başlangıcı:** P025 [PR #842](https://github.com/dorukakindev/whisper-browser/pull/842) ile master'a alındı; doğrulanmış ürün başlangıcı `7bf15f3c2876a5465b0c7f59fff3a037b41aeb69`. Sonraki belge commitleri ürün değişikliği değildir; çalışmadan önce gerçek HEAD/remote ve kişisel farkları yeniden kontrol et. Mevcut görevlerden yarım bırakılmış yeni ürün işi yok; aşağıdaki koşullu/ertelenmiş işler korunur.

Tamamlanmış teslimler açık iş değildir. Eski raporların veya doğrulanmamış kullanım sınırlarının varlığı tek başına ürün hatası sayılmaz. Ayrıntılı geçmiş [devir indeksinde](DEVIR-NOTU.md) korunur.

## Birikmiş işlerin GitHub teslimi — 2026-11-08 09:35

- Kullanıcı toplu commit/push/master teslimini onayladı. Ürün `253cb1f2704fad704a86b0899441b80e925f3d7c`; dal `codex/media-journey-hardening-20261107`. 34 ürün/test dosyası, 220/220 hedefli kontrol ve 26 JS sözdizimi kontrolü. [Kümülatif teslim](docs/devir/2026-11-08-0935.md).
- Önceki Sahne/Browser/not/sonuç kabulleri kapalı; yeni engellenmiş ürün işi yok. Canlı asistan → kaynaklı podcast yanıtı → pasaj/not zinciri sonraki ayrı geliştirme turudur; bu GitHub tesliminde yeni model çağrısı yapılmaz. Tarihsel “commit bekliyor” ifadeleri kendi turunun anlık durumudur; bu kullanıcı onayı onların bekletmesini kaldırır.
- Kişisel manifest/rapor indeksi, start.sh farkı ve eski kişisel DEVIR bağlantısı korunarak commit dışında kalır. Test çıktıları/görseller/loglar stage edilmez. PR/merge/yerel master eşitliği yayınlama sonrasında doğrulanır; sonuç gerçekleşmeden gerçekleşmiş sayılmaz.

## Sahne birleşik kabul kapanışı — 2026-11-08 09:25 (yerel)

- **Kapandı:** 09:09 turunun açık YouTube 1.25×/+0.2s/B→A/reset kabulü gerçek LG ve native video saatiyle tamamlandı. A=134.12s/B=139s, B yakınına atlamadan sonra gerçek video 135.253s'ye döndü; aynı medya/sekmede loop kapalı ve kaynak kayması sıfır. Aynı 2.129 satırlık gerçek kayıtlı iz; yeni canlı caption çekimi değildir. Not → aynı video/121.922s dönüş ve site CC yalıtımı geçti. [Devir](docs/devir/2026-11-08-0925.md).
- Son kodla gerçek Podcast tek kayıt/defter düzenleme/yeniden açma/A→B→A/4s dönüş ve Browser 120/40 metin/taslak/odak geçişi geçti. 159 hedefli kontrol, JS sözdizimi ve diff temiz. Yeni somut görsel kusur veya engellenmiş ürün işi kalmadı; bu tur ürün kodu değişmedi.
- Dal `codex/media-journey-hardening-20261107`; yerel/uzak master SHA `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + korunmuş farklar. Commit/push yok. Yeni üretim/model/ASR/çeviri, ses kalitesi ve start.bat/CUDA kabulü yapılmadı; bağımsız tarihsel sınırlar korunur.

## Sahne sağlamlaştırma — 2026-11-08 09:09 (yerel)

- Doğrulanan: aynı cue kimlikli farklı izde yanlış taslak/yeniden bağlama ve reddedilen not açılışı odağı düzeltildi; stale zaman eylemi transport yenilemesinde kapalı kalır. Kayıtlı üretim okuma hatası eşleşmezlik sayılmaz; yeniden denetleme/yükleme, önceki çıktıyı koruma, animasyon/odak ve gerçek sessiz yükleme/bağlama LG/IPC ile kontrol edildi. [Devir](docs/devir/2026-11-08-0909.md).
- **09:25 kapanışında tamamlandı — önceki canlı kabul:** Browser cümle döngüsünde aralık içi seek'in B geçişini yutması testle yeniden üretildi/düzeltildi; aralık dışına kaçış, duraklatma, başka sahip ve başarısız/geç komut sınırları hedefli testte geçti. Bu not anında birleşik 1.25×/+0.2s/B→A/reset turu kesinti ve oturum beklemesi nedeniyle açıktı; yukarıdaki gerçek kapanışta tamamlandı. Yeni canlı altyazı çekimi iddiası yok.
- Dal `codex/media-journey-hardening-20261107`, HEAD `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + korunmuş farklar; commit/push yapılmadı. Önceki kesin sonraki adım 09:25 kaydındaki gerçek kabulde uygulandı.

## Sahne görevleri, defter ve kurtarma — 2026-11-08 08:35 (yerel)

- Tamamlandı: kararlı İşlemler odağı/kaydırma, gizlenen iş düğmesinden doğru odak dönüşü, not/İşlemler örtüşmesini önleme ve görünür taslak işareti. Yerel/Browser Sahne'den mevcut araştırma defterine doğrudan giriş; aynı kaydı düzenleyip yeniden açma. Eski Browser/yerel kurtarma callback'i yürütmede doğrulanır; yeni kaynakta reload/load/relink/picker başlatmaz. Defter alan/sekmeleri ve yalnız bu yüzeyde açık/koyu tema mirası düzeltildi.
- Kanıt: 160 hedefli kontrol; gerçek LG izole not/defter/kayıt/kaynak dönüşü; gerçek Browser WebContents ile 120/40 kaynak/çeviri, 1.5×/arama/takip/geçiş; kontrollü gerçek HTTP 503 → aynı kaynağın onaylı 18s konumundan oynatma → başka sekmede eski callback'in sıfır gezinmesi. [Devir](docs/devir/2026-11-08-0835.md).
- Dal `codex/media-journey-hardening-20261107`; yerel HEAD ve bu tur salt okunur doğrulanan uzak master `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + korunan yerel farklar. Commit/push yok. Yeni engellenmiş ürün işi yok. Canlı yayıncı/üretim veya gerçek izin penceresi kabulü değildir; sınırlar ve başarısız ilk düzenek denemeleri devirde ayrıdır.

## Sahne okuma ve not sürekliliği — 2026-11-08 08:12 (yerel)

- Tamamlandı: Podcast/Çift dilli/Browser aynı medya okuma durumu, pasaj ve not taslağı; görünüm değişirken tek kayıt makbuzu; iz değişiminde taslak/uyarı ve açık yeniden inceleme; uzayan çeviride kaynak satırı/odak; durdurulmuş/kısmi iş ve eksik çeviriyi öncelikli tamamlama. Mevcut İşlemler ve ileri seçenekler korunur; not/panel ana ve pasif eylem kontrastı düzeltildi.
- Kanıt: 163 hedefli kontrol; Windows LG izole gerçek main/preload/IPC not kaydı → başka bölüm → doğru kaynağa 4s dönüş; gerçek Browser WebContents saatinde takip/arama/geçiş, 120 satır + 40 çeviri altında okuma konumu ve odak, Browser'a dönüp aynı medyayı yeniden açınca taslak/pasaj korunması. [Devir](docs/devir/2026-11-08-0812.md).
- Dal `codex/media-journey-hardening-20261107`; HEAD `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + korunan yerel farklar. Commit/push yapılmadı. Yeni engellenmiş ürün işi yok. Taslak bellektedir; süreç yeniden başlatmasından sonra kaydedilmemiş taslak iddiası yok. Kısmi iş durumu kontrollüdür; canlı model/Whisper/çeviri/üretim çağrılmadı. Önceki bağımsız canlı kabuller korunur.

## Sahne günlük kullanım devamı — 2026-11-08 07:45 (yerel)

- Tamamlandı: seçili kaynak pasajının revizyonlu/geçici asistan bağlamı ve görünür önizlemesi; so-far kapsamını genişletmeme. Kaynak değişiminde geç komut/panel hatası bastırma, hazırlık/kapsam kilidi, Enter/Uygula/odak ve modified-key korumaları. Kaynak açıklaması mevcut asistan disclosure'ında öne taşındı.
- Gerçek LG Podcast: 1.5×/4–10s loop/aktif satır/odak, seçili pasaj → gerçek overlay, A→B sırasında eski hazırlık hatası ve pasajın taşınmaması geçti. Browser Podcast/Study, arama/seek/elle takip/Konuşmaya dön kontrol edildi. 165 hedefli test + 3 dondurulmuş sınır servis testi geçti.
- Dal `codex/media-journey-hardening-20261107`; HEAD `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + korunan yerel farklar. Commit/push yok. [Devir](docs/devir/2026-11-08-0745.md). Yeni engellenmiş ürün işi yok; gerçek model/ASR/çeviri/üretim bu tur çağrılmadı, kontrollü hazırlık canlı iş başarısı sayılmaz.

## Dublaj, kuyruk ve Browser devamı — 2026-11-08 06:56 (yerel)

- Tamamlandı: mevcut kaynak/dublaj zinciri yerel ve Podcast oynatıcıda gerçek LG penceresiyle açıldı, kayıtlı ses doğru kaynağa yüklenip bağlandı; duraklatılmış kaldı. Podcast A sesi B'ye taşınmadı. Gerçek mpv ile otomatik devam, hata → aynı bölümde retry ve süreç yeniden açılışında 2 satır kuyruk/4.95s/1.25×/transkript doğrulandı.
- Browser'ın geciken gerçek altyazı IPC yanıtı sekme/yeni video sınırında reddedildi; Sahne kullanıcı kapattıktan sonra geri açılmadı. Kayıtlı çeviri başarısı ve generation korunması, sona ulaşmış RSS resume, erken native hata, tek yükleme durumu/başlık görünümü düzeltildi. 84 hedefli test; son panel değişiminden sonra 18 ilgili test tekrar geçti.
- Dal `codex/media-journey-hardening-20261107`; yerel HEAD/uzak master `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + yerel farklar. Commit/push yok. [Devir](docs/devir/2026-11-08-0656.md). Yeni engellenmiş ürün işi yok. İşçi/ses/ağ kontrollüdür; canlı yayıncı ve gerçek VoxCPM2 kalitesi başarısı sayılmaz.

## Canlı kabul devamı — 2026-11-08 (yerel)

- Dal/HEAD: `codex/media-journey-hardening-20261107`, `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + yerel farklar; commit/push yok. [Devir](docs/devir/2026-11-08-0622.md).
- Önceki canlı yorum analizi engeli, özel kullanıcı onayıyla yalnız geçici şifreli Electron bağlamı kullanılarak kapandı: tek canlı istek HTTP 200, 15/15 kontrollü yorum kapsamı. Kopya işlem sonrası kaldırıldı. Canlı Letterboxd çekimi veya canlı hata/yeniden deneme kabulü sayılmaz.
- CSS sonrası gerçek YouTube kabulü kapandı: 2.129 zamanlı satır, Podcast aktif satır, Study geçişi, site CC/metin gizleme, Browser'a dönüşte kapalı Sahne. LG üzerinde native gerçek video kompoziti incelendi.
- Kuyrukta başka açıcıyla geçersizleşen sıradaki bölümün yanlış sahiplik/başarı kusuru düzeltildi. Önce kırmızı/sonra yeşil test ve ilgili toplam 53 test geçti.
- **Kapandı — önceki native yükleme kabulü:** yerel ve Podcast kaynak/inceleme/yükleme/gerçek sese bağlama, sessiz açılış ve başka bölüme taşınmama bu turun kontrollü gerçek LG/oynatıcı kabulünde doğrulandı. [Devam teslimi](docs/devir/2026-11-08-0656.md).

## Altı kullanıcı akışı — 2026-11-07 20:52 (yerel, commit edilmedi)

- Dal `codex/media-journey-hardening-20261107`; taban/HEAD `3ddf7522a0b6545a7c27abfc01dbc47ccb134ef4` + yerel düzeltmeler. [Devir](docs/devir/2026-11-07-2052.md). Bu tur için commit/push yapılmadı; kullanıcının commit bekletme tercihi korunur.
- Tamamlanan düzeltmeler: geciken kayıtlı alıntı açılışı başka sekmeye seek göndermez; aynı sekmede farklı medya/sürüm ve başarısız seek başarı sayılmaz. YouTube Sahne CSS'inin site CC yazısını yeniden görünür kıldığı çift yazı kusuru düzeltildi. Kalıcı kaynaklı taslakta dayanak inceleme/eksik-değişmiş sürüm görünümü var; yeniden açılan sohbetin not kartı geçici arama haritasına bağlı kalmadan gerçek kayıt/revizyonla doğrulanır.
- Gerçek Windows LG: erişilebilir YouTube videosu + 2.129 gerçek zamanlı altyazı satırı → 2:05 civarında Podcast aktif satırı → Çift dilli → Podcast → Browser; kısa ve sessiz oynatma. İki yerel kontrollü Browser sekmesinde kaynak/konum/mod/bağımsız kayma, arka plan duraklatma; gerçek açıcıda gecikmiş A sonucu B'ye dokunmadan reddedildi. Not kaydı → süreç yeniden açılışı → iki dayanak → bağımsız düzenleme → bayat uyarısı; AI notu değişmedi. 232 hedefli test geçti.
- **2026-11-08 tarihinde kapandı (yukarıdaki devam kaydı) — önceki canlı yorum analizi engeli:** izole Electron süreci mevcut şifreli sağlayıcı kasasını okuyamadı; sıfır API isteği gönderildi. Bu sağlayıcı/model arızası olarak sınıflanmaz. Kesin sonraki adım: aynı Windows kullanıcısının şifreleme bağlamında güvenli kasanın erişimini doğrula; anahtarı dışarı çıkarmadan mevcut yetkili ayar yükleyicisiyle 15 yorumluk tek isteği başlat ve tüm uygun yorumların kapsamını/gerçek alıntılarını kontrol et. Erişim yokken yeni ücretli istek veya anahtar taşıma yok.
- **2026-11-08 tarihinde kapandı (yukarıdaki devam kaydı) — önceki canlı sınır:** YouTube altyazı izi her yeni oturumda gelmedi. İz geldiği oturumda gerçek zamanlı okuma/geçiş kabulü var; CSS düzeltmesinden sonraki canlı iz tekrarında iz gelmediği için tam sağlayıcı son karesi kapanmadı. Ürünün aynı CSS kuralları gerçek Chromium'da görünür → gizli → geri görünür olarak doğrulandı. Kesin sonraki adım: mevcut doğru sürümlü kayıtlı YouTube iziyle aynı videoyu aç, uygulama yazısı varken site CC'nin gizli olduğunu ve Browser'a dönüşte tercihin korunduğunu kısa kontrol et.
- Gerçek VoxCPM2 üretimi/mpv ses kalitesi ve normal start.bat/CUDA bu tur çalıştırılmadı. Önceki üretim-geçmişi gerçek ortam kabulü ayrı kalır; yeni üretim gereksiz yere başlatılmadı.

## Kaynağa dönüş, araştırma defteri ve çok-not — 2026-11-07

- Tamamlanan ürün: `b893eef9c812dbb8e51aeb164cf496c2740070b2`; dal `codex/source-return-notebook-20261107`. Claude pkg3, pkg1/pk2 dosyalarının tamamını kapsayarak entegre edildi; önceki yerel yorum düzeltmeleri korundu. [Teslim](docs/devir/2026-11-07-2010.md).
- Podcast/katalog/YouTube kaynağına sürümlü dönüş; defterde kaynak süzgeci, kaynak/çeviri/not ayrımı, revizyon çatışması ve taslak/odak korunması; asistanda yerel not araması, seçili karşılaştırma, kaynak açma ve düzenlenebilir/önizlemeli kaynaklı yeni not tamamlandı. 237 hedefli test geçti. Gerçek Windows LG Electron'da kontrollü modelle iki not → taslak → elle düzenleme → önizleme/onay → tek kayıt; gerçek Browser sahibiyle yerel autoplay sayfasında sessiz/duraklatılmış kaynak açma doğrulandı.
- **Kalan gerçek ortam kabulü:** canlı YouTube, mpv sesi ve gerçek VoxCPM2 üretimi bu görevde denenmedi. Kesin sonraki adım: izole LG profiliyle kayıtlı bir üretimden Podcast/yerel/YouTube kaynağına dön; doğru sürüm/konum ve manuel oynatmaya kadar sessizliği kısa gerçek denemeyle gözle. Yeni ücretli model/ASR işi otomatik başlatılmaz.
- **Eski kayıt sınırı:** güvenilir konumlayıcısı olmayan üretimler başlık/dosya adı benzerliğinden açılmaz; aynı açık kaynak veya açıklamalı elle açma yolu korunur. Yeni kayıtlar mevcut main-owned kimliklerden konumlayıcı üretir; eski kayıtlara tahmini toplu göç yok.
- **Not kapsamı:** yerel düz metin eşleşmesi; bir istekte en fazla 8 seçili not. Kaynaklar değişince taslak onayı reddedilir. Kaydedilmemiş asistan taslağı 10 dakika sonra yeniden hazırlanmalıdır; kalıcı not kartı güncel kayıt/revizyonla yeniden doğrulanabilir. Kaydedilmiş not ve dayanak kimlikleri kalıcıdır.
- Yorum analizi: gerçek hata/sonuç bağlantısı ve kompakt okuyucu düzeltmeleri bu teslimdedir. 15/15 yorumun kontrollü gerçek istek gövdesine gittiği önceki yerel kabul korunur. Mevcut 48 yorum/60 bin karakter bütçesi ve spoiler dışlaması önizlemede açıklanır; kullanıcının canlı sağlayıcısı bu tur denenmedi.

## Asistan kümülatif entegrasyonu — 2026-11-07

- Doğrulanmış ürün `65e3a0ee564d2acda8a06b7a66bd3d7f471d9146`; dal `codex/assistant-pkg7b-completion-20261107`. [Teslim](docs/devir/2026-11-07-1840.md). Pkg7b önceki paketleri kapsar; yinelenen yamalar uygulanmadı. Kodda yarım kalan yeni entegrasyon yok.
- **Kaynak dönüşü sınırı güncellendi:** yeni Podcast/katalog/YouTube kayıtları için sürümlü konumlayıcı ve doğrulanmış açıcı tamamlandı; konumlayıcısız geçmiş kayıtların güvenli ret sınırı üstteki teslimde açıklanır.
- **Kalan gerçek ortam kabulü:** canlı model, gerçek VoxCPM2 işçisi, mpv sesi ve Windows uyku/süreç yeniden kullanımıyla kira davranışı bu turda yeni canlı üretimle gözlenmedi. Kesin sonraki adım izole LG profili ve mevcut yetkili sağlayıcıyla kısa bir kesitte üretim → kesinti → yeniden açılış → geçmişten sonuç/önizleme → onay akışını gözlemek; yeni ücretli otomatik tekrar yok, Podcast işlemi 3–4 dakikayı aşmasın. Kitap bölümü ve groupTakes gibi birebir yeniden kurulamayan işler mevcut açıklamalı ret sınırını korur.

## Asistan kaynak, onay ve iş dayanıklılığı — paket 1–3 (2026-11-07)

- **Tamamlanan — Dilim 1 (paket 1–3):** podcast araması → yapılandırılmış kaynak kartı → karttan doğrulayarak açma (gerçek açıcıyla uçtan uca sınandı) → mesaj düzeyi dayanak görünümü → kaynaklı not (taslak/düzenleme/önizleme/onay, tek kayıt) → onay makbuzu ve belirsiz sonuç → ölü düğmesiz onay kartları. [Devir ve kanıt](docs/devir/2026-11-07-1305.md). Temel `5e0df1fd52b189de5799d1f8fad65473167a2eed`.
- **Tamamlanan — Dilim 1 hata düzeltmesi (paket 4a):** podcast notunda onaylanmamış metnin eski onayla yazılması, sohbet değişince/iptalden sonra yazma, iptal yanıtının yazılmış notu inkâr etmesi ve committed hatasının “kaydedilmedi” sayılması giderildi; yazıcı tek modüle çıkarıldı. [Devir ve kanıt](docs/devir/2026-11-07-1415.md). Dilim 1’in kalan testleri (kaynak değişince kayıtlı alıntı, kullanıcı içeriği metin/çeviri dışı) paket 4b’de eklendi.
- **Tamamlanan — Dilim 2 hizmet katmanı (paket 4b):** kalıcı kayıt mevcut `dub-logs/*.json` özetidir (ikinci depo yok); `src/dub-run-ledger.js` başlangıç kaydına sabitlenmiş seçenekleri (kaynak kimliği, altyazı özeti, aralık, profil, doğrulama, zamanlama, sözlük; ses yalnız özet olarak) ve örnek kirası ekler. Eski “running” kaydı yaşa/PID’ye göre değil kira + kalp atışı + PID birlikte değerlendirilerek canlı (başka örnekte)/kesilmiş/belirsiz sınıflanır; okuma hiçbir şey yazmaz; ilk terminal sonuç kazanır (geç/tekrarlanan olay bitmiş işi veya yeni işi değiştirmez); işçinin tamamlanma işareti kalıcı yazılır, doğrulanmış geçerli ses yalnız bu kanıtla ve açık kurtarma eylemiyle kurtarılır; sahipsiz ses listelenir, hiçbir bölüme/zaman eksenine bağlanmaz; yarım JSON diğer kayıtları gizlemez ve silinmez. Yeniden deneme: sabitlenmiş seçenekler ve saklı girdi kopyası (özet doğrulanır), güncel ayarla ayrı önizleme, tek kullanımlık onay (çift/eşzamanlı/kaybolan cevap tek üretim), değişen ayar/kaynak onayda reddedilir, başarısız deneme önceki çıktıya dokunmaz. IPC `dub:runs` (list/recover/retry-preview/retry-approve): yetkili gönderici, yalnız kayıt kimliği, arayüzden yol/kimlik kabul edilmez (`startGeneration` güvenilir girdiyi yalnız süreç içi çağıran alır). [Devir ve kanıt](docs/devir/2026-11-07-1520.md).
- **Tamamlanan — Dilim 2 arayüzü (paket 5):** dublaj panelinde “Son çalışmalar” (liste, ayrıntı, kurtarma, salt dinleme, “Bu bölüme yükle”, iki ayrı yeniden deneme önizlemesi) gerçek DOM → preload → ana süreç işleyicisi → arayüz zinciriyle sınandı; zor kabuller A (ses referansı), B (servis–arayüz yarışları) ve C (kalıcı kayıt) kapandı (C3 ve ses-silinmesi gerçek kusurdu, düzeltildi; C1/C2/C4/C5 zaten doğruydu, kanıtı testte). [Devir ve kanıt](docs/devir/2026-11-07-1640.md).
- **Tamamlandı — paket 7b yerel entegrasyonu:** gerçek dublaj köprüsü, asistan üretim araçları, not düzenleme/odak ve A/B zincirleri alındı. Dayanak şeridi, mesaj içi atıf düğmeleri, kaynak satırları ve işlem/medya ayrımı tamamlandı. Yerelde ek olarak gerçek kaynak dönüşü ve işçi hata metninin modele sızmaması düzeltildi. [Son kanıt ve teslim](docs/devir/2026-11-07-1840.md).
- **Görsel/odak kabulü tamamlandı:** paket karşılaştırmaları ve yerel comparison.html oluşturuldu; Windows LG’de gerçek main/preload/overlay/not penceresiyle kaynaklı not önizleme/kayıt ve aynı açıcıya odak dönüşü geçti. Koyu/açık asistan ve not son görüntüleri incelendi. Yeni canlı model/VoxCPM2 üretimi bu kabulün parçası değildir.
- **Bilinen sınırlar:** makbuzlar bellek içidir (yeniden başlatmada gider; eski kart “doğrulanamıyor” der). “Atıf yapıldı” yalnız `[işaret]` biçimindeki kaynak işaretleriyle ayrılır; web kaynakları bu ayrımın dışındadır. Not yazma mantığı `src/research-annotation-writer.js` modülüne çıkarıldı ve testler aynı modülü çalıştırır; `main.js` içindeki ince sarmalayıcı (`saveResearchAnnotation`) gerçek ana süreçte çalıştırılmadı.
- **Canlı kabul (bu ortamda yapılamaz):** Windows Electron/LG izole profilinde kayıtlı podcast araması → kart → “Ana git”/“Metni aç” → “Not olarak kaydet…” (düzenle, önizle, kaydet, pencereyi işlem sırasında yenile, tekrar kaydet: tek not) → bölümü silip kartı ve notu yeniden aç (salt okunur, neden görünür) → bir onayı çift tıkla/işlem sırasında yenile. Not penceresi açıkken asistan katmanının gizlenip kapanınca geri geldiği Windows’ta gözlenmedi. Native mpv ve gerçek sağlayıcı gözlenmedi.

## Menü ve panel tasarımı — 2026-11-07

- CP2 entegrasyonu ve eksik panel bağlantıları tamamlandı. Dal `codex/panel-redesign-completion-20261107`; [teslim ve kanıt](docs/devir/2026-11-07-1115.md). Paket sonrası asistan/Sahne, altyazı gruplama/zaman özeti, EN/TR ve açık tema eksikleri tamamlandı; eski “unit test çalışmadı” durumu güncel değildir.
- **Kalan canlı kabul:** dublajın gerçek sağlayıcıyla üretim evreleri bu UI turunda yeni ses üretilerek denenmedi. Kesin sonraki adım izole LG profilinde mevcut yetkili sağlayıcıyla kısa aralıkta hazırlık/onay/üretim/sonuç ve mevcut sonucu koruyan hata/yeniden deneme yolunu gözlemek. 3–4 dakika sınırı ve izin kapıları korunur. Kontrollü 16 durum testi canlı üretim değildir.

## Claude Podcast / Browser / asistan entegrasyonu — 2026-11-07

- **Doğrulanmış ürün tamamlandı:** `3ed735be2ffbc34552cec0a91d6106695e302326`, dal `codex/claude-podcast-context-dub-20261107`, yayın [PR #896](https://github.com/dorukakindev/whisper-browser/pull/896). [Entegrasyon ve kanıt](docs/devir/2026-11-07-1021.md). V5 önceki WIP dilimlerini kapsar; yinelenen ZIP’ler yeniden uygulanmadı. Zamansız çeviri bağlamı, VTT→SRT, ortak dublaj paneli, kaynak/iz yarışları ve ilk/ devam Podcast soru sınırı tamamlandı. Üç eski Podcast test düzeneğinin nedenleri ayrıldı ve düzeltildi; bu dosyalar artık geçiyor.
- **Windows Electron kabulü:** İzole LG oturumunda gerçek renderer/main/IPC ve kontrollü yerel medya kullanıldı. Browser Podcast dublaj düğmesi, RSS bölümünden VTT çevirisiyle dublaj paneli, tek medya sahibiyle görünüm geçişi, canlı satır/arama/takip, A/B duraklatma ve kaymanın geri gelmesi, aynı sayfada farklı doğrudan videoda sıfırlama, fullscreen, açık Shadow DOM’da site altyazısını gizleme/geri alma ve asistanın aynı bölüme dönüşü geçti. Dosya/izin penceresi açılmadı.
- **Kalan gerçek sağlayıcı kabulü:** Bu teslimde yeni canlı model, Whisper, çeviri veya VoxCPM2 sesi üretilmedi; native mpv oynatma ve gerçek YouTube sağlayıcı yarışı gözlenmedi. Kesin sonraki adım: mevcut yetkili sağlayıcı ve izole LG profiliyle aynı ses sürümüne ait kısa bir Podcast kesitinde bağlamlı çeviri → iz/aralık önizlemesi → VoxCPM2 üretim → kendi bölümünde sonucu yeniden açma; 3–4 dakikayı aşma. Ardından gerçek erişilebilir YouTube’da aynı sekmede yeni video ve iki sekmede geciken sonuç kabulünü tekrarla. Kontrollü medya başarısı bu canlı kabullerin yerine geçmez.
- **Kimlik sınırı:** Yeni aynı-sayfa video koruması genel sayfalardaki seçilmiş doğrudan medya dosyasını tanır; sağlayıcı video kimliği, blob ve manifest akışları mevcut sahiplerinde kalır. Kapalı Shadow DOM içine erişim sağlandığı iddia edilmez.

## Claude kümülatif teslimi — açık canlı kabuller

- Paket temeli `a97dc03bbbac83105492c9c777acc0d7dc2b3cda`, teslim dalı `codex/claude-cumulative-20261107`. [Devir ve kanıt](docs/devir/2026-11-07-0605.md).
- Keşfet ve film/dizi detayı sonraki Claude paketinde geliştirildi; aynı adlı 2019/2023 yapımların yarışı, üyelik ve geri dönüş kontrollü Windows Chrome’da doğrulandı. [Yeni entegrasyon](docs/devir/2026-11-07-0808.md). Gerçek Electron/sağlayıcı ve yorum dönüşü kabulü açık; sonraki adım LG’de izole profilde iki gerçek yapımın detay/yorum/geri akışını ve Browser araç çubuğunu karşılaştırmak. Kontrollü katalog ve afişler canlı metadata kanıtı değildir.
- Gerçek YouTube ve Letterboxd sağlayıcılarından bu paket için yeni canlı kanıt yok. Yetkili erişimle aynı sekmede yeni video, iki sekmede geciken altyazı/çeviri ve site altyazısının Shadow DOM tam ekran dönüşünü kısa izole turda sına. Letterboxd için doğru film/yıl, gerçek sayı ve spoiler seçimini izinli Browser yoluyla kontrol et.
- İlk Podcast “bu ana kadar” isteğinin servis isteği ve devam sınırı kontrollü testlerle kapandı; [güncel entegrasyon](docs/devir/2026-11-07-1021.md). Canlı model ve yorum örneği kimliği için sonraki adım gerçek girişten sağlayıcı isteğini izole ve yetkili koşulda yakalamak. Asistanın çok adımlı kaynak zinciri ve özgün yorum kartı bu paketle eklenmedi.

### Claude Keşfet görsel teslimi — 2026-11-07

- Ürün `f3950c8445eeda709ab672405e4df58b966429af`, dal `codex/claude-discovery-delivery-20261107`, yayın [PR #895](https://github.com/dorukakindev/whisper-browser/pull/895). İlk yerel teslimden sonra kullanıcı GitHub yayını ve master’a birleştirmeyi ayrıca yetkilendirdi. [Entegrasyon](docs/devir/2026-11-07-0808.md) · [Yayın kaydı](docs/devir/2026-11-07-0815.md).
- Üçüncü ZIP ilk iki teslimin tamamını kapsıyor; yinelenen arşivler ikinci kez uygulanmadı. Teslim edilen ürün farklarının tamamı alındı. Entegrasyonda erken çıkarma isteği, bayat hero üyeliği/odak, açma simgesi ve kaynak okuma hatasının yanlış etiketlenmesi ayrıca düzeltildi.
- **Kalan gerçek kabul:** Windows Chrome’da gerçek renderer ve kontrollü servisler kullanıldı; gerçek Electron IPC, Cinemeta/TMDB/Letterboxd ve kişisel katalogla canlı kabul yapılmadı. Kesin sonraki adım LG’de izole profilde aynı adlı iki yapımda ekle → geri → detay → çıkar → vazgeç → yeniden çıkar → onay yolunu çalıştırmak; liste konumu, üyelik, kişisel alanlar ve kaynak şeridini karşılaştırmak. Dosya seçme/yeniden bağlama penceresi açma.
- Önceki pakette bulunmayan Browser/Sahne, Asistan ve Podcast çeviri/dublaj kodu sonraki V5 entegrasyonunda alınıp güçlendirildi; güncel durum ve kalan canlı kabul yukarıdaki [2026-11-07 entegrasyonunda](docs/devir/2026-11-07-1021.md).

## Sahne ve Browser — güncel kabul

- **Tamamlanan kabul.** İki gerçek altyazılı sekmede kimlik, konum, iz ve bağımsız kaymaların geri yüklenmesi; aynı YouTube bölümünde beş hızlı Browser/Podcast/Çift dilli geçişi; Podcast canlı satır, cümle döngüsü, 1,5× hız, elle kaydırma ve konuşmaya dönüş; dar video üzerindeki iki dil ve site altyazısının geri gelmesi doğrulandı. Önceki tur ayrıntıları devir indeksinde korunur.
- **Tam yeniden başlatma.** İzole LG uygulaması temiz kapatılıp yeni Electron sürecinde aynı profille açıldı. Kütüphaneden bölüm açma, iki kayıtlı izi, −0,1/+0,1 kaymaları, konumu ve Podcast tercihini geri getirdi. Bu kabul, kayıtlı bölümü kütüphaneden açmayı içerir.
- **YouTube boş yanıt sınırı.** Aynı otomatik altyazı isteği ilk açılışta HTTP 200 ve boş gövde, yeniden yüklemede 2.129 satırlık JSON verdi. Yeni **Altyazıyı yeniden dene** düğmesi kontrollü boş yanıttan sonra aynı kaynağa döndü ve gerçek iz geldi. Ayrı canlı denemede mevcut iki iz ve kaymalar korundu. Sağlayıcı boş yanıt vermeyi sürdürürse sonraki adım aynı videoda Browser CC seçimini kontrol etmek.
- **İki iz türü.** TED videosunun canlı seçicisinde otomatik iz sunulmadı. İki türü aynı videoda seçilebilir kılan kaynak bulunduğunda aynı konumda elle hazırlanmış → otomatik → elle hazırlanmış geçişini yapıp kayma ve etkin satırı karşılaştır. [Son kontrol](docs/devir/2026-11-06-1735.md).
- **İki sekmede ses ve dar okuma.** İzole LG oturumunda Blender ve YouTube ön planda sesli, arka planda duraklamış ve sessiz olarak Chromium tarafından raporlandı. 680×700 Sahne’de etkin çeviri, arama ve iki izin zaman kontrolleri doğrulandı. [Kanıt ve sınırlar](docs/devir/2026-11-06-1735.md).
- **Tek altyazıyla sekme yarışı ve klavye.** Kontrollü geciktirilen altyazı okuması yeni sekmenin durumunu değiştirmedi. İlk videoda konum ve kayma geri geldi. Dar Sahne’de tam cümle, odak dönüşü, canlı takip ve arama klavyeyle doğrulandı. [Devir](docs/devir/2026-11-06-1740.md).
- Ürün paketi yerel `master` üzerinde `a7c60e21354505f7d22bab1862792665a645b823`. [Güncel doğrulama](docs/devir/2026-11-06-1724.md).
- **Genel arayüz denetimi kapandı.** Altı eski beklenti güncel giriş ve sahiplerle karşılaştırıldı. Kaynak değişirken geciken bitişin ilerlemesi ve altyazı yenilemede odak kaybı ayrıca düzeltildi. 153 arayüz denetimi geçti. [Güncel teslim](docs/devir/2026-11-06-1713.md).
## Sahne görünüm düzeltmeleri — 2026-11-06

- Doğrulanan ürün: `ef6a5f3d`, dal `codex/stage-composition-fixes-20261106`. Podcast/Çift dilli/Browser dönüşü, video alanı, dil seçimi, etkin satır konumu ve dar pencere kısa izole LG turunda kontrol edildi. [Devir](docs/devir/2026-11-06-0942.md).
- Sınır: gerçek YouTube videosu oynadı; EN/TR altyazılar kontrollü izlerdi. Sayfa altyazı uçları bazı isteklerde HTTP 403 döndü. Canlı sağlayıcıdan yeni iz çekildiği veya çeviri üretildiği iddia edilmez. Normal sağlayıcı kabulü için aynı video sürümüne ait erişilebilir iki izi mevcut yükleme yolundan açıp görüntü ve bağımsız kaymaları karşılaştır. Yeni hizmet/model gerekmez.
- 80 satırda gerçek video konum komutu sonrası etkin 20. satır görünür kaldı. İleri konuma geçişte sağlayıcı yeniden tamponladı; o sahnenin yeni decode karesine ulaştığı ayrıca doğrulanmadı. Kesin sonraki adım: erişilebilir aynı kaynakta hazır kare ve ilerleyen saatle bu atlamayı kısa olarak tekrarla. Kişisel bölümün kaynak eşleştirmesi ve kayıtlı ses kopyası kabulü önceki devir sınırını korur.

## Podcast ve yorum akışları — kalan kabul

- Podcast aramasında 105 sonucun sonundaki pasaj açıldı ve dönüşte kart görünür kaldı. Geciken ikinci sayfa, değişen yayın filtresine uygulanmadı. [Devir](docs/devir/2026-11-06-1829.md).
- Gerçek yayıncı bölüm başlığına atlama doğrulandı. Podnews yayıncı akışı açılmış içerik için 2 MB sınırını aştı. Sonraki adım bu sınır altında kalan, oynatılan sesle birlikte zamanlı yayıncı izi veren bir RSS bölümünde iki satır geçişini karşılaştırmak. [Devir](docs/devir/2026-11-06-1846.md).
- Tekrar ve karıştırma birlikte iki ayrı Electron sürecinde korundu. Araştırma defterinde düzenlenen not ikinci süreçte doğru bölüme döndü. İzole testte oluşturulan altyazı dosyasına mevcut geliştirme izni verildi; ilk izin isteğinin nedenini belirlemek için temiz izole profilde istenen dosyayı tanımlayıp yalnız uygulamanın ürettiği varlıkların yetkilendirme hattını izle.
- Gerçek YouTube geçişi aynı medya ve oynatma durumuyla doğrulandı. Bu tur YouTube yeni altyazı izi sunmadı. Sonraki adım erişilebilir aynı video izini yükleyip oynarken art arda etkin satırları gözlemek. [Devir](docs/devir/2026-11-06-1846.md).
- Sohbet değişiminde geciken pasaj kartı ve izlenen süre sınırı kontrollü testte geçti. Canlı kabul için izole profile yetkili sağlayıcı yapılandırıldığında bir pasaj kartı aç, çözüm sürerken sohbeti değiştir ve konumun değişmediğini ölç. Ardından oynatma sürerken tam transkript seçili bir “bu ana kadar” isteğini sınayıp yanıtın soru sonrasını kullanmadığını doğrula.

- Uzun Browser transkripti: İzole LG oturumunda 1.256 kontrollü satırla Sahne atlaması, etkin satır, video içi altyazı ve yeni video karesi birlikte doğrulandı. [Devir](docs/devir/2026-11-06-1819.md).

- Dal: codex/podcast-review-acceptance-20261106. [Devir](docs/devir/2026-11-06-0702.md).
- Podcast: LG’de gerçek girişten aynı bölümde hız, ses, tekrar ve takip birlikte denenmeli. Kayıtlı sonuç ve zamansız görünümü yeniden aç. Kısa iş gerekiyorsa 3–4 dakika sınırında kaynak değiştirerek eski sonuç yalıtımını ölç.
- Çift dilli: iki video sekmesinde konum, iz ve bağımsız kaymaları karşılaştır. Önceki sekmenin sesi ve bekleyen çeviri için ayrı gözlem yap. Dar pencerede iz seçimini aç.
- YouTube: LG izole profilde iki gerçek video arasında geçişte önceki video durdu. İlk video 5,60 saniyede, Türkçe iz ve Çift dilli görünümle geri geldi. Kalan kabul için erişilebilir iki izi olan YouTube videosunda bağımsız kaymaları ölç. Asistan için yetkili sağlayıcıyla aynı videoda başlayan altyazı işini ikinci sekme veya sohbet açarak ayır. [Devir](docs/devir/2026-11-06-0713.md).
- Keşfet: LG’de aynı başlıklı farklı yıllara ait iki kimlikle kütüphane ve yalnız Keşfet kartlarından yorumlara git. Geri dönüşte filtre, kaydırma ve değişmeyen üyeliği ölç.
- Letterboxd: Sintel için otomatik yol HTTP 403. Mevcut izinli Browser okuma yolunda film eşleşmesi, sıralama, sayı ve spoiler filtresini canlı doğrula. Engel sürerse doğrulanmış örnek içe aktarımını kullan.
- Asistan: doğrulanmış yorum örneğiyle üç isteği yetkili canlı modelde çalıştır. Özgün alıntı, gizli spoiler, kabul edilmiş analiz ve sohbet değişimindeki geç yanıtı gözle.

## Genel arama ve sözlük — kalan kapsam

- Dal: codex/local-search-glossary-20261106. [Devir](docs/devir/2026-11-06-0657.md).
- Kapalı kitap/PDF metni için önce izinli kaynakları tanımla ve mevcut kitap arama altyapısına bağla. İzole LG turunda RSS revizyonu değişimi, podcast kaynak değişimi ve açık PDF dönüşünü birlikte sına.
- Yayın kapsamı için podcast bağından kalıcı yayın kimliğini geçir. Önceki podcast çıktısının yeniden denemesinde üretimde kullanılan sözlük sürümünü doğrula veya yeni sürümü açıkça seçtir. Önbellek ve zaman korumasını kontrollü veriyle sına.

## Sürümlü medya akışları — kalan kabul

- **Dal ve kanıt** `codex/versioned-media-workflows-20261106`, [devir](docs/devir/2026-11-06-0625.md). İzole hedef testleri ve gerçek ZIP çıkarma geçti.
- **Altyazı** Browser çeviri hızlı düzenleyicisi mevcut düzeltmeyle birlikte önceki metin ve zamanları saklar. Depo gidiş dönüşü test edildi. İzole Electron’da aynı çeviri satırını düzenle, uygulamayı yeniden aç ve önceki sürümü taslağa alıp kaydet. Dosyaya bağlı kaynak/yerel izler için kalıcı sürüm ayrı iş olarak açık. Sonraki adım dosya revizyonuna bağlı uygulama içi sürüm kaydını mevcut düzenleyiciye bağlamak ve çeviri tamamlama ile kaynak değiştirme yarışını sınamak. [Devir](docs/devir/2026-11-06-1846.md).
- **Browser** Sahne medya eşleşmesi bileşen testinde doğrulandı. LG izole profilde iki video açıp konum, iz, senkron ve Sahne dönüşünü ölç. Arka plan sesinin durduğunu ve geç gelen sonucu diğer sekmenin almadığını doğrula. Duraklatma betiğini engelleyen siteler için ses sahipliği ayrıca sınanmalı.
- **Paket** Önizleme ve çakışma kararı dosya düzeyinde. Kayıt bazlı birleştirme için katalog, akış, not ve izleme depolarının kimlikleri ile çapraz bağlarını birlikte doğrulayan bir plan gerekir. ZIP eklerinde ikinci içe aktarım için doğrulanmış varlık kimliği ve tekrar kullanımı ekle. İkinci yazımda hata enjekte ederek yedekten geri dönüşü izole profilde doğrula. Serbest metin ve eski paketlerdeki gizlilik kapsamını ayrıca sınırla.
- **Rota** Kontrollü asistan araç kartı ve koleksiyon onayı/geri alma testleri geçti. Yetkili canlı sağlayıcı ve izole katalogla 150 dakika + mola isteğini çalıştır. Karttan rota aç, bir yapımı değiştir ve eski onayın reddedildiğini, yeni onayın yalnız eklenenleri bildirdiğini gör.

## Oynatma kurtarma — native motor ve dosya seçimi kabulü

- **Sahne takibi ve klavye.** İzole LG oturumunda kontrollü Browser kesintisinden 9. saniyeye, aynı tek iz ve konuşan satırla dönüş tamamlandı. Geciktirilen ilk Podcast isteği ikinci bölümün oynatmasını ve hata durumunu değiştirmedi. 680×700 görünümde kurtarma odağı ve tek eylem doğrulandı. [Devir](docs/devir/2026-11-06-1748.md).

- **Dal ve kanıt** `codex/media-return-history-20261106`, [devir](docs/devir/2026-11-06-0643.md). Kontrollü web ve RSS ağ hataları, aynı kaynakta 9. saniyeye dönüş, kaynak geçişi, yerel hata yönlendirmeleri ve dar Sahne/RSS dönüşü LG’de doğrulandı.
- **mpv kabulü.** İzole LG oturumunda yerel HTTP Podcast kaynağını yeniden açarken bağlantı kesildi. Bağlantı kapalıyken yeniden deneme kullanılabilir kaldı. Bağlantı gelince 9. saniye, tek altyazı ve etkin satır geri geldi. Geciken açılış yanıtı ikinci bölümün 0:00 konumunu veya hata durumunu değiştirmedi. [Devir](docs/devir/2026-11-06-1801.md).
- **mpv aktarım ortası kabulü.** Gerçek mpv, 30 saniyelik HTTP yayınının soketi kesilince erken dosya sonu bildirdi. Düzeltmeden sonra kuyruk aynı bölümde kaldı, tek altyazıyla yaklaşık 12,7 saniyeden devam edildi. Gerçek bölüm sonu kuyruğu bir kez ilerletti. [Devir](docs/devir/2026-11-06-1805.md).
- **Kalan.** Taşınmış gerçek dosyayı seçme adımı kullanıcı kontrollü ayrı kabulde kalır.

## İstenen iki canlı kabul — 2026-11-05 13:58

- **Dal/kanıt:** codex/live-assistant-subtitles-20261105; [devir](docs/devir/2026-11-05-1358.md). Ürün HEAD 74ea1ebe704561b284e43df10032a41d4aafb0a7; ürün kodu değişmedi.
- **Asistan:** gerçek yapılandırılmış model test kataloğundan gerekçeli/karşı kanıtlı öneri üretti; modelin detay açma ve planned kartları mevcut inceleme/onay arayüzünden test betiğiyle uygulandı. Gerçek depoda planned ve değişmeyen null tepki okundu; kişisel zevk verisi kullanılmadı.
- **Browser kabulü tamamlandı:** [Gerçek sahne deviri](docs/devir/2026-11-05-1408.md). Resmî Blender tam Sintel videosunda İngilizce 26/Türkçe 29 satırdan eşleşen ilk iki replik, gerçek LG Browser video overlay'inde kontrol edildi. İki dil birlikte göründü; primary +2 sn ile İngilizce gecikti ve Türkçe sabit kaldı; secondary -2 sn ile Türkçe sonraki repliğe geçerken İngilizce ilk replikte kaldı. Yaklaşık 11 sn oynatma, gerçek decode kareleri ve üç görüntü, izin denemesi 0. İlk Türkçe aday 30 sn farklı sürümdü; eşleşen üçüncü aday seçildi. Ürün kodu değişmedi.
- **Sonraki adım:** bu dar kabul kapalıdır; tüm film/sağlayıcı/işletim koşulları için genel senkron garantisi değildir. P004 kalanları [site profili/fullscreen teslimiyle](docs/devir/2026-11-05-1417.md) kapandı.

## P030 — Canlı podcast alıntıları, yayıncı başlıkları, RSS ve Sahne klavyesi

- P029 canlı model kabulü tamamlandı. İzole LG profilinde sentetik kayıtlarla kaynaklı arama, iki ayrı açma kartı, salt okunur pasaj, 12 saniyeye seek ve eşleşmesiz sorgu doğrulandı.
- Yayıncının RSS üzerinden sunduğu Podcasting 2.0 JSON başlıkları mevcut oynatıcı ve Sahne’ye bağlandı. Zamanı belirsiz başlıklar salt okunur. RSS kaynak yenileme ve klavye odak akışları güncellendi.
- 79 hedefli test ve kontrollü LG turu geçti. Yeni Whisper işi açılmadı. Alternatif bölüm formatları, gerçek yayıncı ağ kabulü ve dar pencere bu kapsamda doğrulanmadı. [Devir](docs/devir/2026-11-06-0552.md).

## P029 — Doğrulanmış podcast sesine dönüş ve asistan kaynakları

- Ürün `51e53f2a669c3e020c1386dd89d2c1784302aa7d`, dal `codex/podcast-exact-return-assistant-20261106`. [Devir](docs/devir/2026-11-06-0531.md).
- Tamamlanan Whisper çıktısı işin sahipli indirmesi ve mutlak medya zamanıyla bağlanır. Doğrulanmış yerel kopya mevcut oynatıcıda açılır. Eski, silinmiş, değiştirilmiş veya saklanamamış kopyanın pasajı salt okunur kalır.
- Asistan mevcut aramada en çok altı alıntı döndürür. Açma kartı kaynak ve sohbet sahibine bağlıdır. “Bu ana kadar” sorularında arşiv eşleşmeleri kullanılmaz.
- 96 hedefli test ve transkript betiği geçti. LG izole Electron ile 12. saniyeye dönüş ve Sahne vurgusu görüldü. Kontrollü sağlayıcıyla gerçek asistan kartı uygulandı. Canlı model kabulü P030’da tamamlandı.

## P028 — Podcast arama deneyimi ve zevk dayanağı görünürlüğü tamamlandı

- Ürün `5ec000a897fb0b2061221298f1c25fdfade78143`, dal `codex/podcast-search-experience-20261106`. [Devir](docs/devir/2026-11-06-0515.md).
- Arama yayın, bölüm ve metne göre daralır. Bölüm başlığı altında alıntıları gruplar ve sonraki eşleşme varsa 100 kayıtlık sayfa sunar. Podcast'e dönüşte filtreler, yüklenen sonuçlar ve son açılan pasaj oturum içinde korunur.
- Podcast notları ve kuyruk yönetimi mevcut kompozisyonda belirgin. Kuyruk özeti geçerli ve sıradaki kaydı görünür tutar. Zevk dayanağı penceresinden kaynak düzenleyicisine veya yapım detayına geçilir.
- 34 hedefli kontrol ve transkript betiği geçti. LG'de izole Electron ve kontrollü RSS sesiyle filtre, 12 saniyeye dönüş, Podcast'e yeniden giriş ve kayıtlı zevk dayanağı penceresi doğrulandı. Yeni sağlayıcı veya model kabulü kapsam dışı. Bu kapsamda engellenen uygulama işi yok.

## P027 — Kaynaklı podcast araması ve zevk dayanağını düzeltme tamamlandı

- **Kod/dal:** `c46d32b4856e9324ad664371111c5f0f7e88a879`, `codex/transcript-search-taste-correction-20261106`; [devir](docs/devir/2026-11-06-0457.md). Başlangıç master `fd3525886fa3295c3a619bc92c206aae470fa186`.
- **A:** mevcut shelf/feed workspace özgün metni ve kayıtlı çeviri, gerçek alıntı/bölüm/yayın ve doğrulanmış zamanla aranır. Salt yerel sözcük/ifade eşleşmesi; anlamsal arama veya yeni depo/model yok. Sonuç tokenı metin/kaynak/zamana bağlıdır; açma öncesi ve seek öncesi yeniden doğrulanır. Mevcut oynatma sahibinde açılır; Sahne gerçek satırı ayrıca belirginleştirir. Zamansız veya mevcut RSS sesiyle ASR zaman bağı doğrulanmayan sonuç yalnız okunur. RSS programatik altyazı yüklemesi mevcut seçiciye açık seçim yapar; gecikmiş okuma yeni seçimi ezemez.
- **B:** model/hesaplanan çıkarım ve öneride “Bu çıkarım bana uymuyor” gerçek puan/yorum dayanaklarını açar; açmak veri yazmaz. Kütüphane puanı mevcut yapım detayıyla, tarihli günlük puanı ve yazılı yorum yalnız kendi alanında önizleme/onayla düzeltilir; açık öncelikler mevcut ayrı sürüm kapısında kalır. Eski yorum analizi bayat işaretlenir; profil/öneri/asistan bağlamı yenilenir. Gecikmiş model ve eski önizleme elle düzeltmeyi ezemez.
- **Kanıt:** 121 hedefli test/~2,8sn; mevcut podcast-transcript ve browser-subtitle-selection betikleri; JS/diff kontrolü. LG1440×900 izole gerçek Electron/main/preload/native mpv: arama→doğru RSS A→12sn seek→görünür/etkin kayıtlı satır; yorum önizlemesinin yazmaması ve onay sonrası yalnız yorum değişmesi/puan4 korunması. İzin denemesi0. Görseller yerel artifacts altında; commit dışı.
- **Sınır / kesin sonraki adım:** ilk100 yerel eşleşme; tam kaydedilmemiş/partial çeviri aranmaz, yeni üretim başlatılmaz. Spotify/RSS reklam-kurgu farkı eşit zaman sayılmaz; indirilmiş ASR ile mevcut RSS sesinin aynı byte/zaman bağı kanıtlanmadıkça salt okunur yol korunur. Daha geniş zamanlı geri dönüş gerekirse önce aynı kaynak binding/SHA ve gerçek oynatıcı sahibi kanıtlanmalı; ardından yalnız o bağla native seek kontrolü yapılmalı. Bu tur canlı podcast sağlayıcısı/model/Letterboxd/CUDA/start.bat/kişisel profil kabulü değildir. Kapsamda doğrulanmış yarım ürün düzeltmesi yok.

## P026 — Podcast dinleme kuyruğu ve Keşfet kararı tamamlandı

- **Ürün:** A d47e8a8e, B03be8282; dal codex/podcast-queue-discovery-decisions-20261105; [devir](docs/devir/2026-11-06-0432.md). Mevcut kuyruk ve oynatma sahipleri korundu; source-bound async guards, retry, kalıcılık/konum/scene, gerçek mpv EOF repeat/next ve mode-idempotence tamamlandı.
- **Keşfet:** gerçek öneri gerekçesi/detail üyeliği/personal eventler senkron; metadata/katalog/kişisel kanıt ayrılır, genre uyuşmazlığında kişisel aday üretilmez. Sinematik layout personal host/gerekçe/üyeliği korur; exact identity/retry ve mevcut preview/apply kapısı korunur.
- **Kanıt:** A61+parser3, B47hedefli kontrol; A gerçek native mpv kontrollü medya/reopen/EOF, B canlı Cinemeta ve tek planned onayı native LG'de geçti. İzin denemesi0. Görseller/ayrıntı devirde.
- **Sınır:** canlı Letterboxd/model/Spotify/DRM/CUDA/start.bat/kişisel profil ve tüm sağlayıcı kabulü yok. Bu kapsamda yarım uygulama işi yok; yeni somut arızada ilgili yolu aç. P018 eski dış kaynak/arşiv sınırlarını koru.

## Uygulama sırası

1. **P018 — Kaynak erişimi ve kalan canlı sınırlar:** yalnız erişim sağlandığında veya somut ihtiyaçta kısa kontrol; önceki başarılı testleri topluca tekrarlama.
2. **P003 — Kütüphane:** gerçek kullanım ihtiyacında; şu an genel doğrulama kampanyası yok.
3. **P001 — Performans:** ertelendi; benchmark/CPU/matris veya eski dalı otomatik merge etme.


Bu sıra bir tam denetim veya bütün eski raporları yeniden açma planı değildir. Her seferinde tek kapsam kapatılır; yeni somut arıza önceliği değiştirebilir.

## P025 — Asistan zevk dayanakları ve öneriden işlem tamamlandı

- **Kod/dal:** `c638d491f08d021aaf166a3bf00be68aa533e152`, `codex/assistant-taste-actions-20261105`; [devir](docs/devir/2026-11-05-1337.md).
- **Uygulama:** her öneri gerekçesinde gerçek puan kaynağı ve karşıt kanıt korunur. Kabul edilmiş yorum analizi alıntıları ayrı aktarılır; eski analiz tarihsel, varsayılan öncelikler açık tercih sayılmaz. Önerilen yapım diğer bağlamlardan mevcut incelenmiş eylemle açılır; gerçek sayfa sonucu doğrulanmadan başarı bildirilmez. İzleme listesi mevcut önizleme/uygula kapısını korur; ham durum/tepki değerleri EN/TR gösterilir.
- **Kanıt:** 43 hedefli kontrol/~1,14sn, JS sözdizimi/diff; LG1440×900 izole native gerçek katalog→öneri→detay açma, kişisel kayıt önizlemesinin yazmaması ve incelenmiş yürütücünün yalnız planlanan durumu kaydetmesi. Beğeni değişmedi; izin denemesi0. Yeni modül/test dosyası yok.
- **Sınır/sonraki adım:** native kayıtlar test profiline özel kontrollü puan/metadatadır; kişisel veriler kullanılmadı. Gerçek main/preload/renderer servisleri çalıştı; yeni canlı LLM yanıtı veya AI'nin öneri kartını seçmesi/insanın karttaki Uygula tıklaması sınanmadı. Ücretli API, Spotify/DRM/GPU, ASR, matris/CPU kampanyası yapılmadı. Bu dar kapsamda yarım ürün işi yok; somut kullanım hatasında ilgili akışa dön.

## P024 — Podcast günlük kullanım zinciri tamamlandı

- **Kod/dal:** `fac20e3aea47adb8853925c630e3760b22cc71f0`, `codex/podcast-daily-workflow-20261105`; [devir](docs/devir/2026-11-05-1310.md).
- **Düzeltme:** aktif RSS/shelf podcastte “bu bölümü yazıya dök” ve “eksik çeviriyi tamamla” mevcut doğru üretim/strict retry kuyruğuna bağlanır. Kapsam/source/sohbet ve bitiş-kayıt takibi korunur. Çift dilli görünüm podcast asistan bağlamını kaybetmez; “bu ana kadar özetle” tam-transkript UI seçiliyken de watched sınırıyla, soru anında dondurulur. Gelecekteki veya zamansız konuşma bu özete kanıt olmaz.
- **Kanıt:**38hedefli kontrol/~1,5sn; JS/diff. LG1440×900 izole native7akış: kayıtlı gerçek RSS metin+çevirisini35sn/1.5×/study olarak yeniden açma; görünüm değişiminde tek owner; zamansız notun gerçek kaydı; kontrollü web VTT'de arama/takibe dön/önceki-sonraki cümle/hız/döngü; full UI'ye rağmen watched soru paketi. Yeni model/API işi ve izin denemesi0.
- **Sınır/sonraki adım:** önceki12sn Whisper/çeviri çıktıları yeniden kullanıldı; gereksiz yeni canlı sağlayıcı çağrısı yapılmadı. Yeni doğal retry komutu doğru yüzeye kontrollü regresyonda bağlandı; bu tur yeniden canlı sağlayıcı retry'ı veya gerçek AI özet kalitesi denenmedi. Spotify/DRM/GPU kabulü iddia edilmez. Bu günlük kullanım kapsamında açık ürün düzeltmesi yok; somut yeni kullanım hatasında ilgili akışa dön.

## P023 — Agentlarla medya akış denetimi tamamlandı

- **Kod/dal:** `f9a3b2f2c0904618d422fe4067c8c0e492b0fe90`, `codex/media-deep-bug-tour-20261105`; [devir](docs/devir/2026-11-05-1237.md).
- **Düzeltmeler:** oynayan Spotify medya gözlemlendiyse çift dilli toolbar yeniden kaynak diyaloğu açmaz; shelf paused seek/hız hemen kaydedilir; yorum başlangıç reddi/remount iş kilidi ve gecikmiş save'in yeni analizi silmesi önlenir; timed Transkripti çevir hedef dili dondurulmuş kuyruktan kayda taşır; publisher metni değişince eski çeviri/kapsam/notice/retry taşınmaz, güncel aynı-kaynak çevirisi korunur; readonly SRT/VTT Sahne'de ham kod yerine metin gösterir, seek yasağı sürer.
- **Kanıt:**3agent bağımsız inceleme ve çapraz review; yeni repro'lar eski kodda düştü, fixlerle geçti. Son değişen davranış grubu99test/~1,9sn, JS/diff. LG1440×900 izole native: gerçek shelf30sn/1.75× paused konum-hız store'a yazıldı; kontrollü gözlenmiş Spotify URL'si aynı web sahibinde study; kontrollü yorum başlangıç reddi retry'ı açtı ve gecikmiş save yeni sonucu silmedi. Readonly SRT sunumu son native tekrarında temizdi. İzin denemesi0; Computer Use/model/ücretli çeviri/CPU kampanyası/Actions yok.
- **Sınırlar / sonraki adım:** Spotify hesabı/DRM gerçek yayını denenmedi; native Spotify koşulu kontrollü web sahibinde test edildi. Native yorumlar kontrollü cevap/reddir, canlı AI/Letterboxd başarı iddiası değildir. Publisher descriptor değişimi ve timed translation persistence gerçek validator/DOM regresyonlarıyla; yeni live Whisper/çeviri tekrarlanmadı.6mevcut ürün+8mevcut test dosyası, yeni modül/test dosyası yok. Bu kapsamda kalan doğrulanmış ürün hatası yok; yeni somut kullanıcı arızasında ilgili yolu aç, tüm uygulamayı hatasız ilan etme.

## P022 — Kısa medya düğme turu tamamlandı

- **Kod/dal:** `fdf88ceb526d4a50919bf14dc9b5033afe48b328`, `codex/media-button-fixes-20261105`; [devir](docs/devir/2026-11-05-1201.md).
- **Düzeltme:** İşlemler panelindeki Whisper düğmeleri seçili aralığı ve ortak başlangıç kilidini atlıyordu; aynı `startTask` yoluna bağlandı. Panel/oynatma komutlarının senkron ve asenkron hataları görünür bildirilir; reddedilmiş tıklama promise'i sessiz kalmaz. Keşfet menü testinin eksik gerçek MediaVisual bağımlılığı düzeltildi; bu ürün hatası değildir.
- **Kanıt:** kısa başlangıç grubunda67geçiş ve yalnız eksik test bağımlılığından3hata; etkilenen20test ve ilgili15entegrasyon/occlusion testi sonradan geçti. Native LG1440×900 üzerinde11kontrol geçti: Browser menü/arama/indirme/kayıtlılar/panel, aynı kontrollü web medyasında çift dil↔podcast, RSS kütüphanesi/arama/Sahne/işlemler, canlı Keşfet detay ve yorum alanı girişi. Konsol hatası0, izin denemesi0.
- **Sınır/sonraki adım:** yeni ASR/ücretli çeviri veya AI yorum analizi çalıştırılmadı. Browser medya/iz testi kontrollü yerel HTML5/WebVTT, RSS kayıtlı gerçek yayıncı, Keşfet listesi/detayı canlı Cinemeta; bunlar tüm YouTube/Spotify/sitelerin garantisi değildir. Native ana pencere PNG'si alt WebContentsView video yüzeyini içermez; boş dikdörtgen video arızası kanıtı sayılmaz. Bu kapsamda yarım ürün işi yok; yeni somut hata halinde yalnız o akışa dön.

## P021 — Podcast kapsamı, eksik çeviri ve kanıt erişimi tamamlandı

- **Kod/dal:** `64f273eebcf3d2ae55fffade263ca65c3288d2a5`, `codex/podcast-range-recovery-20261105`; [devir](docs/devir/2026-11-05-1140.md).
- **Uygulama:** ortak Sahne’de tam bölüm/seçili aralık ve gerçek süre özeti; mevcut Whisper kuyruğu ile kaynak zamanlarını koruyan işlem. Asistan karma saniye/dakika aralıklarını tanır. Doğrulanmış kısmi SRT çevirisinde başarılı satırlar korunup yalnız eksikler mevcut sağlayıcıyla tamamlanır. Kütüphaneden bölüme bağlı pasaj/sözcük/notlar açılır; sayfa yenilenmesi açık notları kapatmaz. Zevk kanıtında günlük/kütüphane/model ayrımı ve mevcut düzeltme girişleri görünür.
- **Kanıt:**108 hedefli JS kontrolü/~3,3sn,3 Python testi/~0,15sn, JS sözdizimi/diff. LG1440×900 ve1000×800; asistanın doğal komutuyla gerçek30–42sn CUDA Whisper + çeviri4+4cue. Sonuçtan kontrollü eksiltilen yalnız1satır canlı sağlayıcıyla tamamlandı; diğer3satır ve zamanları değişmedi. UI tekrarında yeni model işi yok, nottan mevcut bölüme dönüş geçti, izin penceresi denemesi0.
- **Sınır:** eski metadata'sız/forSpeech kısmi çeviriler güvenli tek-satır yeniden denemeye uygun sayılmaz; düğme gerekçeyle kapalıdır, sessiz tam-çeviri yok. Seçili aralık yalnız Whisper/Whisper+çeviri içindir. Görüntü ve kaynak zamanı kanıtlanmamış RSS sonuçları salt okunur kalır. Dolu zevk profili kanıtları DOM testleriyle; native gerçek boş profil ve düzeltme girişiyle doğrulandı. Spotify/DRM/yeni hesap veya bütün sağlayıcılar yeniden test edilmedi.
- **Sonraki adım:** bu kapsamda yarım ürün işi yok; yeni somut kullanım sorunu bildirilmedikçe geniş test/performans kampanyası açma. P020'nin eski aralık eksikliği bu teslimle kapanmıştır; geçmişteki test sınırı ihlali kaydı silinmedi.

## P020 — Podcast okuma, asistan ve kaynak bağlı notlar tamamlandı

- **Kod/dal:** `53d1c9c83c79810a20bdfeda20ba7936e727fc90`, `codex/podcast-reading-workflow-20261105`; [devir](docs/devir/2026-11-05-1040.md).
- **Uygulama:** zamansız tam metin mevcut çeviri sağlayıcısıyla ayrı, salt okunur çeviri olarak kaydedilir; kaynak/çeviri yeniden açılır. Asistan gerçek iş kimliğini ve kalıcı sonucu bekler; Türkçe “yazıya dök” komutu, durdurma ve geç sonuç sınırları korunur. Seçili cümle/sözcük ve not mevcut araştırma defterine, kaynak kimliğiyle kaydedilir; zamansız nota sahte zaman verilmez.
- **Kanıt:** son hedefli grup77test/~3sn; ilgili feed/shelf regresyonları, JS/diff. LG1440×900 ve1000×800, gerçek sağlayıcıyla196karakter metin çevirisi; son güvenli30–42sn CUDA small + çeviri4+4cue, asistanın bitişi beklemesi ve yeniden açmada yeni iş olmaması. İzin denemesi0. Son12sn aralığı test main IPC korumasıyla sabitlendi; ürünün podcast aralık desteği iddiası değildir.
- **Sınır:** ilk canlı testte UI aralığı tam-bölüm işlemi tarafından temizlendi,15dk bölüm işlendi ve çeviri kısmi kaldı; kullanıcının3–4dk test sınırı aşıldı. Hata gizlenmedi, uzun deneme tekrarlanmadı; son kontrol12sn ile sınırlandı. Spotify hesabı/DRM ve tüm sağlayıcılar yeniden doğrulanmadı. Ayrıntı devirde.
- **Devam:** bu kapsamda yarım ürün işi yok; yeni toplu test/performans kampanyası başlatma.

## P019 — Tam v2 entegrasyonu tamamlandı

- **Durum:** kullanıcının doğrudan uygulama talimatıyla tam `files (6).zip` v2 kompozisyonları mevcut sahipler üzerinden entegre edildi; ara ZIP ve örnek veriler alınmadı. Ortak aktif Podcast/Çift dilli görünüm ve asistanın mevcut davranışı korunur; bunları yeniden tasarlamak bu teslimin şartı değildir.
- **Dal / kod:** `codex/claude-v2-native-integration-20261105`, ürün `e174602e05bea8df96bc12ebb3a616e1461f5920`. [Devir](docs/devir/2026-11-05-0904.md).
- **Kanıt:** değişen davranışlara kısa Node/DOM regresyonları; LG ikinci monitörde izole Windows sayfaları, canlı Cinemeta detay/listesi, kayıtlı yayıncı RSS'i. Son yerleşim düzeltmeleri monitör kullanılmadan Electron offscreen render ve RSS → mevcut kuyruk → ortak çift dilli görünüm ile doğrulandı. İzin denemesi ve konsol hatası 0.
- **Görsel sınır:** ilk v2 turunun sonunda LG ayrılmıştı. [2026-11-05-0950 kalite turunda](docs/devir/2026-11-05-0950.md) podcast geniş/dar ve RSS ortak çift dilli görünüm yeniden ikinci LG üzerinde doğrulandı. Dolu yorum/analiz ve dolu ağın native görseli bu kısa turda alınmadı; DOM/kalıcılık testleri native estetik kanıtı sayılmaz.
- **Tam sonraki adım:** ürün için yeni toplu test veya yeniden tasarım işi yok. LG erişilebilir olduğunda somut bir görünüm sorunu bildirilirse yalnız ilgili sayfayı kısaca kontrol et. Model/GPU/Spotify canlı ASR bu tasarım tesliminde yeniden sınanmadı; önceki canlı başarı veya sınırlar değişmiş sayılmaz.

## Birleşik Podcast/Çift dilli görünüm — 08:20

- **Tamamlanan ürün:** `152389cdcc1725e0afd989a046e2e49157dee93e`, dal `codex/unified-browser-study-20261105`; [devir](docs/devir/2026-11-05-0820.md). Browser, ana sayfa, RSS/shelf ve yerel girişler tek browser temelli kompozisyonu kullanır; oynatma/işlem sahipleri korunur. Ayrı podcast deck'i kaldırıldı, ileri araç düğümleri korunur; 1.75 hız sonraki bölüme taşınır.
- **Kanıt:** 35 hedefli test + iki browser betiği; izole Windows RSS/yerel/kontrollü browser ve geniş/dar kontrol; son koşularda konsol hatası/izin denemesi 0. Gerçek model/Spotify/mpv bu tur yeniden sınanmadı.
- **Devam:** P019 tasarım geliştirmeleri aynı ortak bileşen üzerinde yapılacak; ayrı kaynak tasarımı yeniden kurulmayacak. Önceki paketin aktif ekran PNG'leri bu son birleşik düzenin birebir referansı sayılmaz. Zamansız metin çevirisi P020 ile tamamlandı; kalan klasik okuma sınırlarının tümü bu sunum işiyle kapanmış sayılmaz.

## P018 — Kalan podcast kaynakları ve arşiv erişimi

- **Son durum:** [güncel teslim](docs/devir/2026-11-05-1450.md). İki kesin resmî abonelik ve18bölüm metadata kaydı eklendi; kişisel kaynak sayısı55→57. İlk200dışındaki istenen eski bölüm mevcut yayına yalnız bir kez eklendi; genel200sınırı değiştirilmedi.
- **Doğrulama:** gerçek shelf servisi/parser, kopyada dry-run, aynı uygulama/profil single-instance lock altında yedekli canlı işlem, baseline/son hash ve dedup; ilgisiz kişisel alanlar ve eski bölümler korundu. Pencere/model/ASR yok. Küçük ses byte probe erişim/type kanıtıdır, tam oynatma değildir.
- **Kalan kabul:** üç kaynağın exact erişilebilir resmî kimliği/sesi; ayrıca eklenen bir yayının bütün arşivi. Bu yayın şimdilik yalnız3doğrulanmış bölümle eklendi. Başka programa ait200RSS reddedildi; iki kaynak grubunda resmî ses403. Bunlar kod hatası veya tamamlanmış arşiv değildir.
- **Özel kanıt ve sonraki adım:** artifacts/podcast-source-followup-2026-11-05/RESULT.md yalnız yerel, Git dışı. Oradaki exact kimlik/resmî bağlantı sağlanınca yalnız kalan kaynağı çöz; benzer programı ikame etme veya200+probe kampanyası başlatma. Eski bölüm işi tamamlandı, yeniden açma. Önceki temel ürün [deviri](docs/devir/2026-11-05-0717.md) tarihsel olarak korunur.

## D001 — Rapor indeksindeki 12 eksik bağlantı tamamlandı

- Mevcut takipli R835, R837–842, R845, R847, R849, R851–852 bağlantıları eklendi; kişisel/untracked rapor yayımlanmadı. Eski raporlar yeni açık bug sayılmaz. [Teslim](docs/devir/2026-11-05-1040.md). Ana kopyanın R516 kişisel indeks farkı güncellemede korunur.

## P004 — Browser paneli kısa canlı kabulü tamamlandı

- **Durum:** üç kısa kabul adımı kapandı. Son gerçek site turunda Video.js altyazı yalıtımı düzeltildi; önceki panel/menü özellikleri main'de.
- **Gerçek altyazı/sahne:** [EN/TR indirme, çift dil ve bağımsız kayma](docs/devir/2026-11-05-1408.md).
- **Yeniden açma:** [güncel devir](docs/devir/2026-11-05-1417.md). Aynı izole test profili iki ayrı Electron sürecinde açıldı; gerçek Blender origin'inde site ölçeği1.12/satır aralığı11 ve localStorage işareti geri geldi. Başka origin'de ölçek1, site ayarı taşınmadı. Otomatik site başına çerez kapsayıcısı iddiası yok.
- **Fullscreen/Shadow DOM:** gerçek uzak Sintel videosu kontrollü açık shadow içine alındı; gerçek sağlayıcı EN/TR katmanı normal/tam ekran/çıkış/kapalı/yeniden açık durumlarda doğrulandı. Sayfa CSS'i katmanı bozmadı, tek overlay kaldı; sayfa ana dünyası ayrıcalıklı API/izole controller globalini görmedi. LG görüntüleri ve gerçek decode kareleri, birkaç saniye oynatma; son iki süreçte dosya izin denemesi0. Fullscreen izni yalnız test profilinde mevcut site izin kaydıyla verildi.
- **Gerçek site kabulü ve düzeltme:** [PeerTube Sprite Fright](docs/devir/2026-11-05-1428.md) normal, değiştirilmemiş site oynatıcısında gerçek EN/ES çift dil ve fullscreen doğrulandı. hideSiteCaptions için eksik Video.js seçicisi düzeltildi; Alman site altyazısı uygulama katmanı açıkken gizlenip kapatınca geri geldi.23 hedefli kontrol, bağımsız review, son native izin denemesi0. Ürün abd41999d6ea01e7b313c526f69419af58a587e9; dal codex/browser-real-site-captions-20261105.
- **Panel/görünüm takip turu:** [2026-11-05-1450 teslimi](docs/devir/2026-11-05-1450.md) gerçek sayfada aynı video/WebContents/kaynakla panel, odak, podcast↔çift dil ve iki fullscreen yolunu doğruladı. Projection maliyeti ve remount odağı düzeltildi;23bağımsız hedefli kontrol,10+4native aynı-sahip checkpoint, izin denemesi0.
- **Sınır/sonraki adım:** önceki shadow kabulü kontrollü açık Shadow DOM düzenidir; bütün canlı siteler, kapalı shadow root, DRM, hesap/CUDA veya kişisel profil için genel kabul değildir. Bu dar P004 kapsamında açık iş yok; yeni somut arızada yalnız ilgili akışa dön. Uzun iş iptali ancak gerçek takılma/ihtiyaçta incelenir.
- **Önceki kontrollü kabul dalı:** codex/browser-profile-fullscreen-20261105; ürün başlangıç/bitiş81b83025610e38fff54aac855c907e08966bff77; yalnız belge PR'ı. Computer Use, dosya izin penceresi ve geniş kampanya yok.

## P003 — Film kütüphanesinin kullanım sınırları

- **Durum:** ihtiyaç halinde; aktif ürün düzeltmesi yok. Onaylı film tasarımı PR808 ile main'de, tekrar merge veya tasarım onayı beklemiyor.
- **Kanıt:** [PR808 teslimi](docs/devir/2026-11-04-0936.md), main geçmişinde PR808 merge'i `459bf2e0bbbf0bfb19566ed16080806bb6e76126`.
- **Doğrulanmamış:** büyük kişisel kütüphanenin tüm yönetim yolları ve canlı TMDB'nin bütün koşulları. Kişisel veriler toplu test malzemesi yapılmaz.
- **Dal/PR / sonraki adım:** yeni dal yok; kullanıcı gerçek kullanımda bir sorun bildirdiğinde yalnız o işlem kısa yeniden üretilir. Genel katalog testi ve tasarım yenilemesi başlatılmaz. Performans ayrı P001'dir.

## P001 — Sinematik hareket performansı

- **Durum:** ertelendi, bloklayıcı değil. Mevcut onaylı Home/Keşfet/film tasarımları main'de; eski performans denemesi otomatik alınmayacak.
- **Dal/PR:** `codex/cinema-performance-round5` / [draft PR805](https://github.com/dorukakindev/whisper-browser/pull/805), 2026-11-05 kontrolünde hâlâ açık ve birleşmemiş. Bu dalın teslimi `5aa8e5637786093f3864ca31ec88b49b856b5630`; güncel master'dan eski.
- **Kanıt:** [eski performans kaydı](https://github.com/dorukakindev/whisper-browser/blob/codex/cinema-performance-round5/docs/implementation/cinematic-performance-round5-2026-11-03/PERFORMANCE.md). O revizyonda 1440 detay/scroll maksimumları 69,5/55,5 ms, 1920 detay 20,8 ms idi; güncel main ölçümü değildir.
- **Sonraki adım:** yalnız görünür bir takılma bildirildiğinde güncel main'de kısa yeniden üretim ve hedefli düzeltme. Yeni CPU/frame hedefi, uzun benchmark veya boyut matrisi başlatılmaz. Eski hedefler karşılandı diye gösterilmez.

## Aktif podcast düzeltmesi — 07:54

- **Doğrulanmış ürün:** `c99bbe77b4b82345aaaa32be003a0619e99f95c1`, dal `codex/podcast-scene-actions-20261105`; görünür yazıya dök/çevir ve ses kontrolü, sesli çift dilli kompozisyon, native üst alan, RSS asistan yönlendirmesi. [Devir](docs/devir/2026-11-05-0754.md).
- **Kanıt:** 47 kısa test, izole Windows gerçek RSS oynatma sahibi ve geniş/dar görünüm; izin denemesi 0. Gerçek Whisper/çeviri üretimi bu turda yeniden çalıştırılmadı; bu tek başına yeni bug görevi değildir.
- **Kalan:** P019 uygulandı; aktif Podcast/Çift dilli görünüm mevcut ortak browser bileşenidir. Yeni maket beklemek bir uygulama şartı değildir. Zamansız yazı çevirisi P020 ile tamamlandı; diğer tarihsel sınırlar somut ihtiyaç olmadan yeniden açılmaz.

## Kısa kalite/performance turu — tamamlandı

- **Dal / kod:** `codex/media-quality-performance-20261105`, `0d3c9b9a964be756848701010147d7b54fefa5f9`. [Devir](docs/devir/2026-11-05-0950.md).
- **Düzeltmeler:** bölüm başına transkript IPC'si ve tam metin aktarımı kaldırıldı; RSS/legacy eş kayıtta canonical durum kaybolmaz. RSS grupları bir kez indekslenir. Arama değişmeyen kapak/abonelik DOM'unu korur; geç bölüm açılışı ayrılmış kütüphanede araç çalıştırmaz. RSS kapağı/yayıncısı/etiketi ve salt okunur zaman açıklaması doğru; boş altyazı kutusu gizli.
- **Kanıt:** 45 hedefli regresyon ve son etkilenen iki kontrol, sözdizimi/diff; izole LG1440×900 ve1000×800. Kütüphane208ms, bir arama2,5ms, açılışta bölüm başına workspace IPC0. Tek kontrollü800kayıt sayfa okuması29,13→12,66ms; genel uygulama/CPU/kararlılık benchmarkı değildir.
- **Kalan / sonraki adım:** bu değişikliklerde yarım iş yok. Eski PR805 otomatik alınmadı; sırf doğrulanmamış genel sınırlar için yeni test kampanyası başlatılmaz. Yeni somut sorun olursa ilgili sayfa/iş sahibi üzerinde kısa yeniden üretim yapılır.

## Main'de tamamlananlar — tekrar yapılmayacak

| Kapsam | Main teslimi / kanıt |
|---|---|
| D002: Güncel görsel öncelik | [Belge teslimi](docs/devir/2026-11-05-0724.md). Görünüm en önemli öncelik; genel sakinlik/minimalizm ve düşük hareket kısıtları kaldırıldı. Ürün kodu değişmedi. |
| P018 ürün: RSS zorunluluğu olmadan Spotify girişi ve gerçek kaynak kaydı | [Teslim](docs/devir/2026-11-05-0717.md), ürün `12aaf3de`. Program/bölüm linki, doğrudan mevcut browser, medya gözlendiğinde görünüm geçişi, güvenli büyük RSS/kütüphane sınırları. Kalan dış kaynaklar yukarıda. |
| P017: Gerçek podcast kütüphanesi ve yerel sinema Sahnesi | [Teslim](docs/devir/2026-11-05-0628.md), ürün `b71d6fae`. Abonelik/arama/kuyruk/çift dilli açılış, mevcut video üzerinden bölüm ve sözcük işlemleri; 26 kısa test ve izole Windows geniş/dar kontrolü. |
| P016: Sahne v2 podcast/çift dilli entegrasyonu ve uyumlu medya cilası | [Sahne teslimi](docs/devir/2026-11-05-0600.md), ürün `683b7bc6`. 13 kısa kontrol; Windows HTML5 yerel/web geçişleri, seek ve klasik dönüş. Main/yerel SHA son teslimde doğrulanır. |
| P005–P007: V3, native tasarım, katalog, podcast temeli, browser menüsü | PR809/810 ve [17:30 teslimi](docs/devir/2026-11-04-1730.md); native kabul verilmiş, eski onay/merge bekleme kayıtları geçersiz. |
| G1–G5: podcast planı, güncel denetim düzeltmeleri, uyumlu eski paketler, kısa bug turu | PR812–815 ve [sıralı son teslim](docs/devir/2026-11-04-1833.md). |
| P008–P009: canlı podcast örneği, asistan ve zevk profili | [Canlı kabul](docs/devir/2026-11-04-2302.md), [asistan/profil](docs/devir/2026-11-04-2341.md). |
| P010–P013: web çift dilli/podcast, yeniden açma, yan panel ve menüler | Yukarıdaki P004 kanıtları; main'de. |
| P014–P015: görünür girişler, Spotify linki → RSS → gerçek Whisper/çeviri | PR823/824, [doğrudan girişler](docs/devir/2026-11-05-0317.md), [son canlı zincir](docs/devir/2026-11-05-0323.md). NPR'de 12 saniye CUDA small + DeepInfra 4+4 cue; görünüm korunarak yeniden açma geçti. |

Spotify/RSS farklı ses sürümleri otomatik aynı zaman ekseni sayılmaz; eşitliği kanıtlanmayan yeniden açılışta kaydın salt okunur gösterilmesi bilinçli güvenlik sınırıdır. Tüm Spotify bölümlerine erişim/indirme garantisi yoktur.

Genel ses/model kalitesi, bütün siteler, uzun işlerin tüm hata koşulları, kişisel start.bat oturumu, fiziksel HDR/çok kanallı çıkış ve Windows UNC/reparse/safeStorage'ın bütün koşulları tam doğrulanmış değildir. Bunlar somut arıza olmadan yeni geliştirme görevi oluşturmaz. DRM aşma kapsam dışıdır.

Sahne için mpv canlı kabulü dosya erişim onayı gerektirdiğinden test korumasında durduruldu; pencere açılmadı ve tekrar denenmedi. Windows browser ana PNG yakalamasındaki `UnknownVizError` görsel doğrulama sınırıdır; görüntü alma atlanarak kalan gerçek WebContents/video/seek/dar görünüm/geri dönüş kontrolleri geçti. Yeni Whisper/çeviri/Spotify canlı zinciri bu UI turunda yeniden çalıştırılmadı; önceki kanıt geçerlilik sınırları korunur. Bu sınırlar yeni teyitli ürün bug'ı veya geniş test görevi değildir.

## Çalışma sınırları

Kısa hedefli kontrol; Computer Use ve dosya erişim penceresi yok. GitHub Actions yok; commit/PR/merge başlıklarında `[skip ci]`. Kişisel manifest/indeks/start.sh farkları ile korunan `src/media-source-envelope.js` ve `tests/media-source-envelope.test.js` dosyalarına dokunma. Her yeni işte güncel dal/HEAD ve ilgili son devir kontrol edilir.
