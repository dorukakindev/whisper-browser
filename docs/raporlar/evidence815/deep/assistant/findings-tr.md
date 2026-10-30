# R815 asistan/kütüphane denetimi — 12 doğrulanmış hata, 1 kanıt boşluğu

Ürün HEAD'i: master `6b3df86e35db8bc3271440f06c779cfb0acb2c22`; ürün kodu `00a01f92f109f11183b02bc55dd1dfed25ed3e9f` sonrasında değişmedi. Windows/Node24 üzerinde değiştirilmemiş üretim JavaScript'i JSDOM veya kontrollü IPC hizmetinde çalıştırıldı. Yeniden üretme: `node .tmp/deep815-assistant/probe.cjs`. Exit0, hatalı davranışların assertion'larla yeniden üretildiğini belirtir. Yalnız sentetik girdiler kullanıldı; ürün, mevcut testler, kişisel profil ve Git değiştirilmedi. Ücretli canlı çağrı, native görsel kabul, GPU ve start.bat açılışı denenmedi.

## A01 — P2 — Kişisel puan 10'luk ve 5'lik ölçeklerde farklı yorumlanıyor

Kaynak: `src/renderer/media-title.js:70–71`, `src/media-taste.js:14–16`, `src/media-discovery-service.js:25–27`; kalıcılık `src/media-catalog-store.js:23–31`.

Adımlar: Gerçek yapım panelinde açıkça 0–10 etiketli kişisel puana 4 girip kaydet; aynı yapımla eşleşen içe aktarılmış izleme günlüğünün zevk profilini ve Sana özel öneri tohumunu incele. Beklenen: 4/10, 2/5 olarak değerlendirilerek düşük puan niteliğini korumalı. Gözlenen: Kayıtlı 4 değeri 4/5 kabul ediliyor ve 3,5 eşiğini aşan olumlu öneri tohumu oluyor. 8/10 kaydedildiğinde effective() 5 üzerini reddedip eski günlük puanı 1/5'e sessizce dönüyor. Etki: Kullanıcının açık puanı zevk ve öneri sonuçlarında anlam değiştiriyor veya kayboluyor. Bunlar tek ölçek sözleşmesi hatasıdır. Prob gerçek başlık kaydetme callback'ini ve itemOf/profile/recommendationSeeds kodunu çalıştırdı; bozuk girdi kullanılmadı.

## A02 — P2 — Kapatılan Keşfet ayrıntısı, geç gelen ekleme yanıtıyla kütüphaneyi açıyor

Kaynak: `src/renderer/media-discovery-ui.js:65–72`.

Adımlar: İzleneceklere ekle'ye bas; IPC beklerken ayrıntıyı kapatıp başka yere geç; ekleme yanıtını tamamlat. Beklenen: Başlatılmış kayıt tamamlanabilir fakat kapatılmış ayrıntı yeniden gezinme başlatmamalı. Gözlenen: Eski dialog kaldırıldıktan sonra koşulsuz MediaTitleUI.open('catalogA') çağrılıyor. Etki: Kullanıcının sonraki ekranı ve bağlamı kesiliyor. Gerçek ayrıntı düğmesi callback'i sınandı. A04/A13'ten bağımsız Keşfet bileşenidir; ortak bir sahiplik koruma helper'ı yoktur.

## A03 — P2 — Keşfet Tercihlerindeki yapım türü filtresi çalışmıyor

Kaynak: `src/renderer/media-discovery-ui.js:120,148`; `src/media-discovery-service.js:98` feedback-list.

Adımlar: Bir film ve bir dizi tercihi kaydet; Tercihler → Filmler seç. Beklenen: Yalnız film tercihleri gösterilmeli. Gözlenen: Üretim handler'ı kind:'film' isteğine rağmen hem dizi hem film döndürüyor; UI ek tür filtresi uygulamıyor. Etki: Özellikle büyük tercih listelerinde seçilen filtreyle uyuşmayan sonuçlar gösteriliyor. Geçerli kayıtlar ve gerçek IPC handler'ı kullanıldı; ağ gerekmedi.

## A04 — P2 — Bu akşam bölümünün geç oynatma yanıtı yeni açılan başka pencereyi kapatıyor

Kaynak: `src/renderer/media-tools-ui.js:13,37–44`.

Adımlar: Bu akşam → Aç ve oynat; oynatma IPC'si beklerken pencereyi kapat; Dinleme'yi aç; eski yanıtı döndür. Beklenen: Kapatılmış Bu akşam isteği yeni pencereyi kapatmamalı veya eski kaynağı oynatmamalı. Gözlenen: close() küresel güncel modalı hedefleyip Dinleme'yi kapatıyor; ardından openMediaCatalogPlayback eski dosyayı açıyor. Tam üretim modülü sınandı. Başlangıç listesindeki epoch koruması oynatma yanıtına uygulanmıyor.

## A05 — P1 — Sohbet silme onayı başka sohbete yönleniyor

Kaynak: `src/renderer/assistant-overlay.js:22,45,84–90,179`; `src/renderer/global-assistant.js:111`; `src/renderer/assistant-workspace.js:75–82,95`.

Adımlar: A sohbetinde Sohbeti sil onayını aç; onaylamadan mevcut B sohbetine geç; Devam et'e bas. Beklenen: Onay geçersizleşmeli veya A kimliğine bağlı kalmalı. Gözlenen: Onay alanı açık kalıyor; onay paketi güncel sourceToken='source|thread:B' ile delete-thread gönderiyor; workspace komutu current() olan B'yi siliyor. Aynı kök neden Temizle'yi de etkiliyor; ayrı sayılmadı. Etki: İlgisiz sohbetin kalıcı kaybı. Gerçek overlay HTML+JS tekrarı gönderilen paketi doğruladı; güncel sohbeti silen kod yolu ayrıca incelendi. İş çalışmadığından sohbet seçimi etkin; aynı kaynağın sohbetleri arasında öneriler değişmediği için öneri yenilemesi bu onayı temizlemiyor.

## A06 — P2 — Ana süreç doğrulama eki uygulamanın JSON yorum analizi akışını bozuyor

Kaynak: `src/assistant-agent-service.js:159` son doğrulama regex'i/eki; `src/renderer/media-taste-ui.js:63–76`.

Adımlar: Zevk profili → Örneği incele ve AI ile analiz et → Gönder. Geçerli sağlayıcı JSON'unun özeti 'A completed story with moving characters.' içerir. Beklenen: Yapılandırılmış JSON, inceleme ve alıntı doğrulaması için ayrıştırılabilir kalmalı. Gözlenen: Ana süreç özette /completed/ eşleştiğinden JSON sonuna düz metin ekliyor; gerçek tüketicide JSON.parse başarısız oluyor, yanıtın geçerli JSON olmadığı mesajı gösteriliyor ve kaydetme sunulmuyor. Prob gerçek agentRun'ı kontrollü geçerli sağlayıcı yanıtıyla çalıştırdı; ardından gerçek zevk profili reviewSample/gönderme/assistant-answer tüketicisindeki reddi doğruladı. Bu yalnız kullanıcının rastgele JSON istemesi değildir: Uygulamanın yerleşik akışı JSON'u açıkça istiyor ve ayrıştırıcıya bağlı. Araç veya işlem istenmedi, uygulanmadı.

## A07 — P2 — Sabitlenen notlar ilgisiz normal web sayfaları arasında karışıyor

Kaynak: `src/renderer/global-assistant.js:26`; `src/renderer/assistant-overlay.js:34–38,141`.

Adımlar: Medya içermeyen A makalesinde metin sabitle; aynı boş mediaKey'e sahip ilgisiz B makalesine geç; Sabitlenen'i aç. Beklenen: Sohbetlerde olduğu gibi sayfaya özel notlar ayrılmalı. Gözlenen: pinScope pageKey'i kullanmıyor; [browser,mediaKey] iki sayfada da '["browser",""]' oluyor. Overlay filter/isPinned/unpin aynı anahtarı kullandığından A'nın arşiv notları B'de görünüyor ve aynı metinli sabitlemeler çakışıyor. Prob iki normal sayfada üretimdeki ifadenin aynısını çalıştırdı. R542 sohbet anahtarını ve geç sonuçların sayfa kimliğini düzeltmişti; açık kalan pinScope yolu ayrı bulgudur. Eski sohbet hatasının tekrar keşfi sayılmadı.

## A08 — P2 — Onaylanan altyazı işlemi yeni izin aynı konumsal U kimliğine kayıyor

Kaynak: `src/renderer/assistant-workspace.js:99–107`; `src/renderer/assistant-app-actions.js:18–21,74–95`; `src/assistant-context-manifest.js:12` same(); `src/renderer/renderer.js:22376–22402` loadSubtitle.

Adımlar: Eski izin U0 satırından 10. saniyeye gitme/düzenleyici kartı iste; aynı videoda başka altyazı dosyası yükle ve yeni U0'ın zamanı 120 olsun; eski kartı uygula. Beklenen: Bayat kart reddedilmeli veya özgün kesin satıra bağlı kalmalı. Gözlenen: same/kaynak kapsamı iz ve satır kimliğini içermediğinden sahip hâlâ güncel kabul ediliyor; execute source_id'yi yeni toolContext içinde çözüp 120'ye gidiyor. Tam AppActions+Capabilities modülü sınandı. loadSubtitle satırları/yolu değiştirirken generation artırmıyor; generation video açılışında artırılıyor. Aynı kök neden open_subtitle_editor'ı da yanlış satıra götürebilir; ayrı sayılmadı. Geçerli altyazı değişimi kullanıldı.

## A09 — İNCELEME / P2 adayı — Zevk profili kaynak bağlamı varsayılan ile kayıtlı tercihi ayırmıyor

Kaynak: `src/renderer/media-taste-ui.js:14`; `src/media-taste.js:41–46`.

Adımlar: Tercih kaydedilmemiş taze zevk profilini aç; asistanın kaynak/tercih açıklamasını incele. Beklenen: Kaynak yükünde tercihlerin yapılandırılmadığı veya varsayılan olduğu belirtilmeli. Gözlenen: Profil preferencesConfigured:false taşıyor fakat setContext alıntısı bu bayrak olmadan bütün ağırlıkları 3 olan preferences nesnesini gönderiyor. Tam profil renderer'ı ve bağlam hedefi doğrulandı. JSON'da bunların kullanıcı tarafından yazıldığına dair birebir iddia yoktur; kanıtın kaynağı ayrımı kaybolmaktadır. Somut tüketici etkisi gösterilmeden güçlü hata sayısına katılmamalı, kanıt boşluğu olarak tutulmalı. Canlı model halüsinasyonu/kalitesi sınanmadı. R540 decisionEvidence/önizleme yolunu düzeltmişti; güncel zevk profili setContext yolu farklıdır.

## A10 — P2 — Zevk tercihlerini kaydetme yanıtı daha yeni taslağı siliyor

Kaynak: `src/renderer/media-taste-ui.js:30–34`.

Adımlar: A notunu yazıp Tercihleri kaydet'e bas; kayıt beklerken etkin kalan alana yeni B notunu yaz; A kaydının yanıtını döndür. Beklenen: B taslağı korunmalı veya bekleyen işlem sırasında düzenleme kapatılmalı. Gözlenen: data.preferences=A atamasından sonra draw() formu değiştiriyor; not A'ya dönüyor ve B kayboluyor. Gerçek modül ve geciktirilmiş geçerli IPC yanıtı sınandı. Etki: Kullanıcının yeni tercih metni ve aralık değişiklikleri atılabiliyor. Sağlayıcı veya kaynak değişimi gerekmiyor.

## A11 — P2 — Keşfet tercih hatası etkin ayrıntı penceresinin dışında gösteriliyor

Kaynak: `src/renderer/media-discovery-ui.js:7–9,15–18,58–63`.

Adımlar: Ayrıntıyı aç; tercih dosyasının yazılamadığı koşulda İlgilenmiyorum'a bas. Beklenen: Hata etkin ayrıntı durum alanında görünmeli ve yeniden deneme anlaşılır olmalı. Gözlenen: Ortak btn hata yakalayıcısı state.root içindeki arka plan .md-status alanına yazıyor; ayrıntının durumu boş kalıyor. Tam modülde ok:false yanıtıyla, etkin dialog'un hata içermediği ve arka planın içerdiği doğrulandı. Etki: Kullanıcı işlem sessizce sonuçsuz kalmış gibi görüyor; arka plan modal açıkken örtülü/inert ve erişilemiyor. A12'nin bağımlılık kapısından farklı hata yönlendirme nedenidir.

## A12 — P2 — Yerel kayıtlı Keşfet tercihi çevrimdışıyken geri alınamıyor

Kaynak: `src/renderer/media-discovery-ui.js:30–40,58–63,108`; `src/media-discovery-service.js:98–109`.

Adımlar: Çevrimdışıyken Tercihler'i aç; yerel feedback-list başarılıdır; gizlenmiş kaydın tercihini geri almak için karta bas. Beklenen: Yerel tercihi geri alma katalog ağına bağlı olmamalı. Gözlenen: Geri alma düğmeleri ancak uzak ayrıntı isteği başarılı olduktan sonra oluşturuluyor; ağ hatasında yalnız Kapat kalıyor. Yerel feedback güncelleme hizmeti ağ gerektirmediğinden bu, yerel geri alınabilir veriye gereksiz ağ bağımlılığıdır. Gerçek liste/kart/ayrıntı UI'ı sınandı; hata sonrası geri alma düğmesi yok. Etki: Kullanıcı gizlenmiş/izlenmiş tercihlerini uzak servis dönene kadar geri alamıyor.

## A13 — P2 — Önceki kitabın geciken açılışı son kitap seçiminin üzerine geliyor

Kaynak: `src/renderer/media-shelf-ui.js:255–265,315,326,402`.

Adımlar: A kitabının book-open IPC'si beklerken B'yi seç; B önce, A sonra dönsün. Beklenen: Son seçim B etkin kalmalı veya eski istek iptal edilmeli. Gözlenen: A yanıtı B'nin üzerinde ikinci modal oluşturuyor; prob pencere sırasını [Newly chosen book,Older delayed book] olarak ölçtü. Tam üretim shelf+queue modülleri ve geçerli TXT fixture'ı kullanıldı; gerçek dosya/profil yok. Etki: Yanlış kitap/kaynak etkinleşiyor ve asistan bağlamı onu izliyor. Okuyucunun mevcut seslendirme korumaları ilk openBook await'ini kapsamıyor.

## Kapsam ve tekrar kontrolü

AGENTS/YENI-BILGISAYAR/güncel devir/R815 okundu; önceki rapor atıfları ve Night1000 kayıtları karşılaştırıldı. Asistan, ayarlar, kütüphane ve okuma aileleri incelendi; tarihsel PASS kayıtları güncel başarı sayılmadı ve 1000 test yeniden koşuldu denmedi. İlgili önceki kayıtlar: R531 sohbetler, R540 yapılandırılmış tercih kanıtı, R542 normal sayfa sohbet kimliği, R798/R800 işlem günlüğü/alıntılar. Yukarıda somut kalan yol gösterilmedikçe eski düzeltme geriledi iddiası yoktur. R815-B01/B02/B03 PDF bulguları tekrarlanmadı. A11/A12 ve A02/A04/A13 farklı bileşen ve korumaları gerektirir. Native axe, genel görsel öneriler ve spekülatif kaynak okuma adayları sayıya alınmadı.
