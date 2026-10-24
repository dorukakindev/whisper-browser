# BROWSER_BUG_REPORT_534 — Sağlayıcı/model ayarlarını geliştirme

2026-10-24. Repo https://github.com/dorukakindev/whisper-browser, PR #482, dal `codex/luna-media-home532`. Başlangıç HEAD `54e7547007cd22b7881f285391563bf4bba57bc9`, bitiş ürün `0808c4a015cae18f973c5d091f685b5937004cd2`. Kullanıcı önceki Ayarlar penceresini geliştirmeyi ve faydalı GitHub kaynaklarını kullanmayı istedi. Ana kullanıcı checkout'u/master değiştirilmedi.

## Eklenen işlevler

1. Sağlayıcıdan **Modelleri getir**: yalnız tıklanınca seçili API kökünün `/models` adresine tek GET. Dönen kimlikler filtrelenir; kullanıcı seçmeden mevcut model değişmez. Elle model girişi ve sağlayıcı başına kayıtlı model listesi korunur. Modelin listede bulunması sohbet/görsel/araç kabiliyeti doğrulaması değildir.
2. Sağlayıcı özeti: etkin sağlayıcı, model ve hostname. Anahtar metni özet/kayıt/telemetriye çıkarılmaz. “Yapılandırılmış · ayrıca test et” ile bağlantı testi ayrı tutulur; miras alan manga “Ortak ayar · burada test edilmedi” der.
3. Ayar bölümlerinde arama: yalnız statik bölüm başlıkları/anahtar sözcükler; parola veya kullanıcı input'ları aranmaz. Enter eşleşen ilk bölümü açar; eşleşme yoksa açık mesaj.
4. Seçili sağlayıcı anahtarını iki aşamalı onayla kaldırma. Onay açıldıktan sonra sağlayıcı/url/key değişirse kaldırma uygulanmaz. Aynı mevcut input/change ve güvenli kasa kalıbı; diğer sağlayıcının kaydı korunur.
5. Tam istek URL'si (`/chat/completions` veya `/models`) yapıştırılırsa açık **Base URL kullan** önerisi; kullanıcı tıklamadan değiştirilmez. userinfo/query/fragment içeren URL için güvenli kök uyarısı. Gerçek gönderimde model listesi bunları reddeder.
6. Kayıt ve düzenleme durumu: eski “kaydedildi” metni düzenlemede temizlenir. Explicit save devam ederken yeniden düzenleme veya bölüm değişimi olursa eski completion yeni ayara kayıt onayı yazmaz.
7. Dar/açık/koyu düzende mevcut Luna medya token/fontları korunur. Gerçek alanlar aynı ID/listener'la taşınır; kopya anahtar formu yok. Checkbox genişliği cleanup görünümünde düzeltildi. Açık anahtar sekme/kapatma sırasında yeniden maskelenir.

## Teyit edilen kusurlar

- **Eski bağlantı testinin yanlış yeşili:** `testSelectedTranslationProvider` await sonrası güncel provider/model/key kontrolü yapmıyordu. Test çalışırken model/anahtar/endpoint değişince eski başarılı sonuç “Bağlantı ve model çalışıyor” diyebiliyordu. `resetTranslationProviderProbe` ve test başlangıcı jenerasyon artırır; eski response/catch UI'a yazamaz. Gerçek Windows kontrollü HTTP'de bekleyen POST başlat → modeli değiştir → eski OK cevabını bırak: durum **idle** kaldı.
- **Kayıt sürerken yeni düzenlemeye yanlış onay:** önceki Ayarlar save callback'i yalnız modal açık mı kontrol ediyordu. Bekleyen save sırasında yeni model yazılırsa eski başarı onu da kaydedilmiş gibi gösterebilirdi. View/edit jenerasyonu eklendi; kontrollü geciktirilmiş save + yeni input + eski true sonucunda yeni editin “Ayarlar değişti” durumu korundu. Bu test kayıt deposunun tüm uygulama çapındaki eşzamanlılık garantisi değildir; bu pencerenin yanlış durum mesajını doğrular.
- Yeni model listesinde, sağlayıcı değiştirip aynı sağlayıcıya geri dönme durumunda eski sonuç hiçbir şekilde kabul edilmez: istek/view jenerasyonu. Bunu yeni özellik sözleşmesi olarak tasarlayıp gerçek IPC/HTTP ile doğruladık; eski ürünün yeni bug sayısını şişirmek için ayrı eski bug sayılmadı.

## Model listesi sınırı ve güvenlik

- Mevcut yetkili `translation:probe` IPC'sinde `mode=models`, preload'da dar `listTranslationProviderModels`. Ana renderer/main frame yetkisi aynen korunur. GET gövdesi yok, redirect `error`, 15 saniye timeout, 512 KiB yanıt sınırı, en çok 2000 ham kayıt/1000 benzersiz model; uzun liste limited olarak etiketlenir. Model ID en çok300 karakter, denetim karakteri/anahtar yankısı elenir. HTTP yalnız mevcut loopback uyumluluğunda; bu yerel AI kurulması değildir.
- Sağlayıcı hata gövdesi/anahtar geri dönmez; yalnız tanımlı hata kodu. Yetkisiz frame yeni bir yetki kazanmaz. `/models` sunmayan servis manuel model girişiyle kullanılabilir. Liste geçici bellekte; yeni kalıcı şema yok. Çok sayfalı model API'sinde otomatik pagination yok.
- Dışarıya model listesi isteği kullanıcı düğmeye basmadan başlamaz. Ayar değiştirme otomatik ücretli chat/probe çağırmaz. Bu tur önceki gerçek OpenAI anahtarı kullanılmadı.

## GitHub araştırması — doğrudan kod okundu

- AnythingLLM (MIT), ağaç kimliği `a5bb8b9c7b1262635ea58fc17d4899619cbf58e9`:
  - [GenericOpenAiOptions](https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/a5bb8b9c7b1262635ea58fc17d4899619cbf58e9/frontend/src/components/LLMSelection/GenericOpenAiOptions/index.jsx): base path/key'e bağlı model listesi ve boş listede serbest model input'u. Bizde manuel fallback korunur; ağ isteği otomatik effect yerine açık kullanıcı eylemidir, eski sonuç jenerasyonla reddedilir.
  - [OpenAiOptions](https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/a5bb8b9c7b1262635ea58fc17d4899619cbf58e9/frontend/src/components/LLMSelection/OpenAiOptions/index.jsx): yükleme durumu ve model seçimi incelendi. Organizasyon gruplaması/model yetenekleri bize uydurulmadı; yalnız gerçek ID kullanılır.
- LibreChat (MIT), ağaç kimliği `a378657583567310c841d652b0f6b00c83e2bd6b`: [Reveal.tsx](https://raw.githubusercontent.com/danny-avila/LibreChat/a378657583567310c841d652b0f6b00c83e2bd6b/client/src/components/Nav/SettingsTabs/ApiKeys/Reveal.tsx) masked secret akışı/explicit action referansı. Bu ekran kendi servis anahtarını yaratmayı gösterir; bizim provider anahtarı oluşturma özelliğimiz varmış gibi aktarılmadı.

İki reponun ilgili üç dosyası ve metadata lisansı resmi GitHub API/raw'dan okundu; tüm projelerin denetimi değil. React bileşeni/kaynak satırı/dependency kopyalanmadı; etkileşim yaklaşımları bizim Electron/IPC yapısında bağımsız yazıldı. Yeni üçüncü taraf bağımlılığı yok. İlk web search üçüncü taraf indeksler döndürdüğünde teknik kararlar onlara dayandırılmadı; resmi dizin ve raw kod okundu. Ham cache-miss URL'leri kanıt sayılmadı.

## Doğrulama

- `node --test tests/provider-model-list.test.js`: 3 geçti (tek bounded GET/kimlik tekilleştirme/anahtar yankısı reddi; güvensiz URL ve çok büyük yanıt/error gövdesi; manuel fallback ve liste limiti).
- `node tests/translation-provider-probe.test.js`: 6 geçti.
- `node --test tests/provider-model-ui.test.js`: 7 iç kontrol geçti.
- `node --test tests/package-integrity.test.js`: 9 geçti. Preload sandbox ve usage ratchet: 286 export, 7 dormant, kullanılmayan0.
- Gerçek Windows `electron-app-settings.smoke.js`: native parent + gerçek IPC + loopback fixture sunucusu. 3 kontrollü HTTP istek, **0 dış sağlayıcı çağrısı**. Model çek/filtrele/seç, yanlış request URL'sini onaylı düzeltme, eski GET'i provider değiştirip geri dönmede reddetme, geç POST OK'yi model değişince reddetme, eski save true mesajını yeni editte reddetme, onaysız key silmeme, seçili custom key'i silerken OpenAI fixture key'ini koruma, aynı input/tek ID/restore/mask/focus, sekmeler ve dil/tema değişimi geçti.
- Son kanıt/görseller `.uiprev/app-settings/1792862733390-11308/` (Git dışında); 1440×1000 TR koyu ve **gerçek720×680 EN açık** görseller incelendi. Değişen JS node --check ve git diff --check geçti.
- Ücretli gerçek API `/models`, normal start.bat, CUDA, kullanıcı profili/gerçek key, canlı Browser native video kompozisyonu ve tam npm test yeniden koşulmadı. CI açık, sonucu beklenmez. Önceki canlı mini sonuçları bu yeni model listesi için kanıt sayılmaz. Açık uygulama hot reload edilmedi; bu dalın güncel sürümü yeniden açılmalıdır.
