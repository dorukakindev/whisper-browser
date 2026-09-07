# Electronegativity güvenlik taraması — 7 Eylül 2026

## Kapsam ve yöntem

Kaynak dizini, geçici olarak çalıştırılan `@doyensec/electronegativity` 1.10.3 ile
Electron 43.2.0 hedefi belirtilerek tarandı:

`npx @doyensec/electronegativity -i src -e 43.2.0 -f sarif -o docs/electronegativity-2026-09-07.sarif`

Tarayıcı bağımlılıklara eklenmedi. İnceleme yalnız statik taramaya bırakılmadı; her sonuç
kaynak bağlamı, erişilebilir olay yolu ve mevcut testlerle tek tek değerlendirildi. Ham,
makinece okunabilir çıktı `docs/electronegativity-2026-09-07.sarif` dosyasındadır.

## Sonuç

Tarama 5 kural altında 7 konum bildirdi: 1 `warning`, 6 `note`. İnceleme sonunda
doğrulanmış sömürülebilir açık bulunmadı. Yedi sonucun tamamı, aracın güvenlik açısından
gözden geçirilmesini istediği fakat mevcut uygulama bağlamında koruma altında olan kullanım
olarak sınıflandırıldı. Bu hüküm “uygulama bütünüyle güvenlidir” anlamına gelmez; yalnızca
bu taramanın ürettiği yedi sonuca ilişkindir.

| # | Kural ve konum | Kaynak bağlamı | Sınıflandırma |
|---:|---|---|---|
| 1 | `CSP_GLOBAL_CHECK`, `renderer/index.html:5` | `script-src 'self'`; `base-uri`, `object-src` ve `form-action` kapalı. Araç, stil üretimi için gereken `style-src 'unsafe-inline'` nedeniyle genel uyarı veriyor; bu izin betik çalıştırmaya açılmıyor. `img-src https:` geniştir ancak kod yürütme yetkisi vermez. | İncelendi; somut yürütülebilir açık gösterilmedi. |
| 2 | `AUXCLICK_JS_CHECK`, `main.js:6863` | Bulgudaki konum `BrowserWindow` kurucusudur. Ana pencerenin tüm yeni-pencere istekleri `setWindowOpenHandler` ile uygulama içinde reddedilir; yalnız `http(s)` hedefi sistem tarayıcısına gönderilir. Ana pencerenin `will-navigate` olayı da daima engellenir. | Heuristik eşleşme / yanlış pozitif. |
| 3 | `PRELOAD_JS_CHECK`, `main.js:6886` | Preload bilinçli IPC köprüsüdür. Ana pencere `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `webviewTag: false` ile açılır. Ayrıcalıklı IPC işleyicileri gönderenin tam olarak ana pencerenin ana frame'i olduğunu doğrular. | Gerekli ve katmanlı korumalı kullanım. |
| 4 | `OPEN_EXTERNAL_JS_CHECK`, `main.js:6962` | Ana pencerenin yeni-pencere yolu yalnız `http:` ve `https:` şemalarını dış tarayıcıya yollar; Electron içinde yeni pencereyi her durumda reddeder. Ana renderer uzaktan yüklenmez ve CSP betikleri yalnız kendi kaynağıyla sınırlar. | Korumalı kullanım; keyfi protokol yolu yok. |
| 5 | `CERTIFICATE_ERROR_EVENT_JS_CHECK`, `main.js:6974` | Dinleyici TLS doğrulamasını gevşetmiyor: `event.preventDefault()` sonrasında açıkça `callback(false)` çağırarak bağlantıyı reddediyor ve Türkçe hata yüzeyi üretiyor. | Davranışsal yanlış pozitif; fail-closed. |
| 6 | `OPEN_EXTERNAL_JS_CHECK`, `main.js:8787` | IPC yalnız yetkili ana-frame göndericisinden kabul edilir; değer string olmalı ve `http(s)` ile başlamalıdır. | Korumalı kullanım; keyfi protokol ve uzak-frame çağrısı reddediliyor. |
| 7 | `OPEN_EXTERNAL_JS_CHECK`, `renderer/renderer.js:9849` | Çağrı yalnız dört sabit sözlük URL şablonundan oluşturulur. Kullanıcının seçtiği kelime `encodeURIComponent` ile yalnız yol/sorgu verisine dönüştürülür; host veya şema seçemez. İstek ayrıca 6 numaralı IPC sınırından geçer. | Sabit izin listeli ve kodlanmış kullanım. |

## Eşlik eden dinamik kanıt

Gerçek Electron deneyim testi, gömülü web sayfasında kamera ve mikrofon isteyen
`getUserMedia({audio:true, video:true})` çağrısını yapar. Test hem iznin verilmediğini,
hem `navigator.permissions` sonucunun `granted` olmadığını, hem de reddin Türkçe uygulama
sinyaline ulaştığını doğrular. Kaynak politikası yalnız `fullscreen` ve
`clipboard-sanitized-write` izinlerini kabul eder; kamera, mikrofon, bildirim ve konum
güvenli varsayılan olarak reddedilir.

## Sınırlar

- Electronegativity 1.10.3'ün kural veritabanı Electron 43.2.x'e özgü tüm yeni davranışları
  tanıyor kabul edilmemelidir; `-e 43.2.0` hedefi verilmiş olsa da araç sürümü sınırlayıcıdır.
- Statik tarama DOM-XSS, bağımlılık zafiyeti, işletim sistemi entegrasyonu veya gerçek dış-site
  davranışlarının tamamını kanıtlamaz.
- `style-src 'unsafe-inline'` ve geniş `img-src https:` gelecekte daraltılabilecek savunma
  derinliği alanlarıdır; bu taramada bunlardan erişilebilir bir kod yürütme zinciri çıkmadı.
- Sonuç bu yedi uyarının kaynak bağlamındaki sınıflandırmasıdır; bağımsız penetrasyon testi
  yerine geçmez.
