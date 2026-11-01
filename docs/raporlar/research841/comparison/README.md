# R841 ek kaynak karşılaştırması — Chatbox, Open WebUI, NextChat

Bu bölüm 73 karta ek yeni özellik sayımı değildir. Üç ek repo, 30 indirilen kaynak/lisans/paket dosyasıyla ana önerileri sınar. [Tam HEAD kayıtları](repositories.json), [dosya/hash/permalink manifesti](source-review.json). Hosted build'ler GitHub HEAD ile eşit kabul edilmez. Chatbox örnek web ekranları görüldü; Open WebUI çalıştırılmadı; NextChat resmî demo QUIC bağlantı hatası verdi. Hiçbir model/API çağrısı veya kullanıcı ayarı kaydı yapılmadı.

## Chatbox: kullanılabilir yetenek ile yükleniyor/hata durumunu ayır

`useModelToolCapabilities` seçili provider, modelId, configuredModel kaydı ve capability registry sürümünü query key'e bağlar; registry hydration'ı bekler. Bu bütün global/session ayarlarının key'e girdiği anlamına gelmez. Araç yeteneği yüklenirken veya sorgu hatasında bunu doğrudan “desteklemiyor” diye göstermemek önemli. Bizim A841-11 için alınabilecek UX ayrıntısı: **Bilinmiyor / kontrol ediliyor / destekleniyor / desteklenmiyor / kontrol edilemedi** ayrı durumlar; buna göre eylem girişini açıklamak. Bu hook sağlayıcının gerçek yetenek probunun tümünü kanıtlamaz. [Sabit kod](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/src/renderer/components/InputBox/useModelToolCapabilities.ts).

`MessageMinimapRail` anchor/message ID, pencereleme, older/newer yükleme, loading/error/retry ve klavye odak sürekliliği içerir. `MessageNavigation` ise ayrı dört yön düğmesidir; minimap algoritması onun içinde sanılmadı. Bizde uzun video sohbetindeki “ilk soru / önceki soru / sonraki soru / son cevap” gezinmesine uyarlanabilir. Küçük önizlemelerde spoiler/kapsam politikası da korunmalıdır. Bu genel uzun sohbet kullanılabilirliği fikri ayrı yeni kart sayılmadı. [Sabit minimap kodu](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/src/renderer/components/chat/MessageMinimapRail.tsx).

## Chatbox: kalıcı dosya ile immutable sürüm aynı şey değil

`persistSandboxArtifact` geçici çalışma dosyasını userData artifact köküne taşır; session path sınırlarını kontrol eder, kaynak yoldan türeyen kimlikle aynı adlı farklı dosyaları ayırır; aynı kaynak yeniden kaydedilince kopyayı günceller. Bu **sürüm geçmişi değildir**. Bizim A841-09/20/22 için alınacak parça transient/durable ayrımı ve session ownership; immutable revision modeli ayrıca gerekir. `_displayName` model kontrollü diye gerçek disk adına bağlanmıyor. Windows shell path normalizasyonu ve realpath sınırı özel inceleme ister. [Sabit persistence kodu](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/src/main/sandbox/persist-artifact.ts).

`Artifact.tsx` session+message key'ine bağlar, eski asenkron yüklemeyi abort eder, current key/mounted kontrolü yapar. Yalnız HTML renderable dil kabulü ve history markdown derleme vardır. Bizde artifact olayı sohbet değişince eski hedefe düşmemeli; HTML önizleme eklenecekse mevcut CSP daraltılmış sandbox ile ayrıca tasarlanır. Demo yalnız artifact kaynak metni olarak görüldü; HTML oyun preview'sı çalıştırılmadı. [Sabit renderer kodu](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/src/renderer/components/Artifact.tsx).

## Konuşma ayarı: Chatbox ve NextChat aynı sorunu farklı çözüyor

NextChat `Mask` context, modelConfig ve syncGlobalConfig alanlarını açık saklar; `createEmptyMask` başlangıç global ayarını alır. Bu, bizim A841-01/02/14 için global varsayılan ile konuşmaya ait snapshot ayrımına somut örnektir. `app/components/mask.tsx` preset editörüdür; bizim vanilla renderer'a bütün React/Next store'u eklemek gerekmez. [Mask modeli](https://github.com/ChatGPTNextWeb/NextChat/blob/1d3dc331512929a4b1d3e82354e72acce33b5c7a/app/store/mask.ts).

Chatbox'ın pinned `SessionSettings.tsx` kodu **henüz kaydedilmemiş taslağı** düzenler; saved conversation side panel'e yönlenir, kapanışta güncel draft döner ve Done düğmesi vardır. Gerçek hosted ekran ise Save/Cancel gösterdi. Dolayısıyla ekrandaki cancel davranışından bu HEAD'in backend semantiği çıkarılmaz. İki kaynağın ortak dersi, taslak/persisted konuşma ve global ayar ayrımını kullanıcıya tutarlı anlatmaktır. [Pinned modal](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/src/renderer/modals/SessionSettings.tsx).

## Open WebUI: desteklenen özellik ile başlangıçta açık özellik ayrı

`Capabilities.svelte` vision/file_upload/web_search/code_interpreter/memory gibi yetenekleri; servis feature gate'lerini; modelde kullanılabilir olanların yeni konuşmada başlangıçta açık seçimini ayrı tutar. Bu UI gerçek modelin desteklemediği özelliği yalnız toggle ile kazandıramaz; açıklaması da provider desteğini şart koşar. Bizim A841-11 model seçicisinde aynı ayrım yararlı: kullanılabilir, tercih edilen varsayılan ve bu tur seçili olan aynı alan değildir. [Sabit kod](https://github.com/open-webui/open-webui/blob/f7ac7ee10962ddec0017f5c29b6740d9b9c5faca/src/lib/components/workspace/Models/Capabilities.svelte).

## İkinci aşama sesli asistan prototipi için gerçek referans

Open WebUI `CallOverlay.svelte` ses seviyesi/kayıt, isteğe bağlı voiceInterruption, `stopAllAudio`, abort, speechSynthesis.cancel, medya stream ve event listener cleanup yolları içerir. Kullanıcı konuşmaya başlayınca playback/yanıtı kesme ve pencere kapanırken mikrofonu bırakma gerçek kod mekanizmalarıdır. **Kaliteli Türkçe sesli asistanın hazır kanıtı değildir.** Gürültü tespiti/RMS ve iki saniyelik sessizlik eşiği evrensel VAD standardı sayılmamalı.

Ürün sentezi: ileride “bu sahneyi açıkla” için bas-konuş, yalnız açık kullanıcı hareketiyle kısa kayıt; video duck/pause politikasını görünür seçme; asistan konuşurken kesebilme; kapanınca mikrofonu kesin bırakma. Önce mevcut medya sesini yanlışlıkla kullanıcı konuşması saymayan hedefli Windows mikrofon/loopback/echo kabulü gerekir. Bu tur bir entegrasyon ya da 74'üncü kart değildir; önceki voice/vision önerileriyle ilişkili daha somut kaynak yönüdür. Avatar/kamera/screen-share bütünü ilk kapsam yapılmaz. [Sabit çağrı overlay kodu](https://github.com/open-webui/open-webui/blob/f7ac7ee10962ddec0017f5c29b6740d9b9c5faca/src/lib/components/chat/MessageInput/CallOverlay.svelte).

## Aynen almam: NextChat artifact paylaşım backend'i

`app/api/artifacts/route.ts` içeriği MD5 anahtarıyla Cloudflare KV'ye yazar/okur, isteğe bağlı TTL uygular. Bu **yerel kalıcı artifact deposu değildir**; dış servis/credential/erişim/retention sözleşmesi gerektirir. Bizim film/altyazı raporunu varsayılan dışarı yayımlamak yerine A841-20/22 yerel store'u uygun. İleride açık paylaşım istenirse ayrı, görünür özellik olur; MD5 yetkilendirme sırrı veya bütünlük garantisi sayılmaz. [Sabit route](https://github.com/ChatGPTNextWeb/NextChat/blob/1d3dc331512929a4b1d3e82354e72acce33b5c7a/app/api/artifacts/route.ts).

## Lisans ve olgunluk

Chatbox kök GPL-3.0, NextChat MIT. Open WebUI güncel kök özel lisansı marka koruma şartı ve sınırlı istisnalar içerir; eski malzeme için LICENSE_HISTORY ayrı koşullara gönderir. Bu yüzden genel MIT/BSD etiketi kullanılmadı. Koşullarıyla kod alımı veya bağımsız davranış uygulaması mümkündür; bütün uygulamanın/sunucunun taşınması önerilmiyor. [Chatbox lisansı](https://github.com/chatboxai/chatbox/blob/d17455c5ca8fd3ff44385c6d4d2118599e4c970f/LICENSE), [Open WebUI lisansı](https://github.com/open-webui/open-webui/blob/f7ac7ee10962ddec0017f5c29b6740d9b9c5faca/LICENSE), [NextChat lisansı](https://github.com/ChatGPTNextWeb/NextChat/blob/1d3dc331512929a4b1d3e82354e72acce33b5c7a/LICENSE).
