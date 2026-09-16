# BROWSER BUG REPORT 35 — altyazı çevirisi kota fan-out ve aynı dil koruması

Tarih: 2026-09-16
Repo: `dorukakindev/whisper-browser`
Dal: `master`
Başlangıç kodu: `90685ec1cab50d6b38ae1d89d2a6d3b1c63ff469`

## Kapsam ve yöntem

Kullanıcının 15 Eylül 2026 tarihli uygulama günlüğü, güncel kaynak kodu ve kontrollü sentetik testler birlikte incelendi. Gerçek API anahtarı okunmadı; canlı sağlayıcı çağrısı yapılmadı. Günlükteki sağlayıcı yanıtları yalnız hata sınıfı ve işlem akışı için kullanıldı.

## Sonuç özeti

Üç ürün hatası doğrulandı ve düzeltildi:

| Kimlik | Önem | Durum | Bulgu |
|---|---:|---|---|
| BUG-35-01 | P1 | Düzeltildi | Kaynak dili Türkçe, hedef dili Türkçe olan iş gereksiz yere çeviri API'sine gönderiliyordu. |
| BUG-35-02 | P1 | Düzeltildi | Kalıcı `402 insufficient_quota`/kimlik doğrulama hatasında bütün parçalar eşzamanlı gönderiliyor, aynı kesin hata için çok sayıda istek tüketiliyordu. |
| BUG-35-03 | P1 | Düzeltildi | Aşamalı YouTube işinin ilk aralığında kalıcı çeviri hatası oluşsa bile ikinci aralık yeniden transkripsiyon ve çeviri işine başlıyordu. |

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

### BUG-35-01 — kaynak ve hedef dil aynıyken gereksiz çeviri

**Kanıt:** Günlük 20:31:21'de indirilen ses dili `tr`; 20:31:48'de 238 blok yine `Turkce` hedefiyle CodeCraftAPI'ye gönderiliyor. Bu bir model kalite sorunu değil, çağrı öncesi dil eşitliği denetiminin bulunmamasıydı.

**Kök neden:** `backend/transcribe.py` çeviri aşaması `info.language` ile `translate_to` değerlerini karşılaştırmadan `llm_translate` çağırıyordu.

**Düzeltme:**

- `same_translation_language` ISO ana dil etiketlerini (`tr`, `TR`, `tr-TR`) güvenli biçimde karşılaştırıyor.
- Kaynak ve hedef aynıysa API çağrısı yapılmıyor; kaynak SRT korunuyor.
- `done.translation` içinde `skipped: same_language` ve `stopProgressive: true` taşınıyor.
- Arayüz bunun hata değil bilinçli atlama olduğunu açıkça gösteriyor.

**Doğrulama:** `test_same_translation_language_compares_primary_iso_tags` geçti.

### BUG-35-02 — kalıcı sağlayıcı hatasında paralel istek fan-out'u

**Kanıt:** 20:31:50–20:31:51 arasında 238 blok için 12 parça aynı `402 insufficient_quota` hatasını aldı. İkinci aşamada 20:32:31–20:32:33 arasında 340 blok için 17 parça daha aynı kesin hataya gönderildi.

**Kök neden:** `llm_translate` tüm parçaları baştan `ThreadPoolExecutor` kuyruğuna veriyordu. İlk cevap kalıcı kota veya kimlik hatası olsa bile kuyruğa verilmiş istekler durdurulamıyordu.

**Düzeltme:**

- İlk eksik parça senkron sağlayıcı sağlık probu olarak çalışıyor.
- Prob başarılıysa kalan parçalar önceki gibi paralel çevriliyor.
- Prob `quota` veya `authentication` ile biterse kalan parçalar API'ye gönderilmeden aynı yapılandırılmış hata ile işaretleniyor.
- Kaynak altyazı hiçbir durumda silinmiyor; çeviri dosyası yalnız gerçek çevrilmiş içerik varsa üretiliyor.

**Doğrulama:** 45 blok/3 parçalık sentetik kota testinde yalnız **1 API çağrısı** yapıldı; 45 bloğun tamamı `quota` sınıfıyla raporlandı. Backend sonucu: `180 geçti, 0 başarısız`.

### BUG-35-03 — aşamalı işin kalıcı hatadan sonra devam etmesi

**Kanıt:** İlk 0–600 saniyelik aralık 20:31:48'de kesin kota hatasıyla bittiği halde ikinci 600 saniye sonrası aralık 20:32:30'da yeniden `Ceviri BASLIYOR` durumuna geçti.

**Kök neden:** Backend `done` olayı çeviri sonucunun kalıcı/geçici sınıfını renderer'a taşımıyordu. Renderer süreç kodu 0 olduğu için sıradaki aralığı normal biçimde başlatıyordu.

**Düzeltme:**

- Backend `done.translation` özeti artık toplam/tamamlanan/başarısız/hata/atlama ve `stopProgressive` alanlarını taşıyor.
- Renderer kalıcı kota/kimlik hatasında kaynak çıktıyı tamamlayıp sonraki aralığı başlatmıyor.
- Son durum mesajı artık başarı mesajıyla hata bilgisini ezmiyor: kaynak altyazının yüklendiğini ve çevirinin neden durduğunu birlikte gösteriyor.

**Doğrulama:** İki aralıklı VM testinde kota terminalinden sonra yalnız `finish` çalıştı; `next` çağrılmadı ve `rangeIndex` 0 kaldı. Electron güvenilir köprü smoke testi geçti.

## Reddedilen veya ürün hatası olmayan yorumlar

### “API anahtarı hiç çalışmıyor” — reddedildi

20:00:23 ve 20:03:48 satırlarında anahtarın o iş için eksik olduğu doğru. Ancak aynı günlükte 20:14:53–20:15:36 arasında CodeCraftAPI + `gemini-3.7-flash` ile **106/106** blok başarılı çevrilmiş ve Türkçe SRT yazılmış. Sağlayıcı/anahtar seçimi genel olarak bozuk değil.

### “Son işte model çeviri yapmadı” — dış sağlayıcı kotası doğrulandı

20:31:50'de sağlayıcının açık yanıtı `402`, `insufficient_funds`, `insufficient_quota`: hesap bakiyesi yetersiz. Kod bu bakiyeyi düzeltemez. Yapılan ürün düzeltmesi aynı kesin hata için gereksiz ek istekleri ve ikinci aşamayı durdurmaktır.

### Dark Sun 13/154 satır — bu turda yeni kök neden doğrulanmadı

20:28:41–20:28:57 arasında 13/154 blok eksik/tutarsız sağlayıcı yanıtı nedeniyle kaynak olarak kalmış; uygulama bunu gizlemeyip `.tr.partial.srt` yazmış, 141 güvenli bloğu korumuş ve tam çeviri diye sunmamış. Bu davranış mevcut veri kaybı korumasıyla uyumludur. Gerçek yanıt gövdeleri bulunmadan 13 satırın tek bir parser/model kök nedenine ait olduğu kesinleştirilemez; bu nedenle bu raporda rastgele eşik gevşetilmedi.

## Test ve doğrulama dökümü

- `node --check src/renderer/renderer.js` — geçti.
- `node tests/browser-youtube-whisper.test.js` — geçti.
- `backend/venv/Scripts/python.exe -m py_compile backend/transcribe.py` — geçti.
- `backend/venv/Scripts/python.exe backend/test_transcribe.py` — **180/180 geçti**.
- `npm test` — çıkış 0, son satır `Tüm testler geçti`.
- `npm run test:electron-bridge` — çıkış 0.
- `git diff --check` — geçti; yalnız Windows LF→CRLF çalışma ağacı uyarıları var.

## Sınırlar

- Canlı CodeCraftAPI çağrısı yapılmadı; kota ve kimlik davranışı kontrollü sahte istemciyle doğrulandı.
- Dış sağlayıcı bakiyesi ürün koduyla doldurulamaz. Kullanıcı çeviri istiyorsa CodeCraftAPI hesabında kullanılabilir bakiye/plan bulunmalı veya ayarlardan başka, anahtarı kayıtlı bir sağlayıcı seçilmelidir.
- Aynı dil atlaması yalnız güvenilir, belirli kaynak dil kodunda çalışır; `auto`, `unknown`, `und` değerlerinde çeviri güvenli tarafta kalıp atlanmaz.
