# Rapor 622 — Asistan P05: dublaj ve referans ses eylemleri

Başlangıç `3e73a65e5c429b2f738a619f9d324e4c59c8dbb6`; bitiş ürün `46d1f6a9322ca72bc3e6a2ee29be36ffd8515d7a`.
Dal `codex/assistant-voice622`; repo https://github.com/dorukakindev/whisper-browser.

## Teslim

Mevcut motoru değiştirmeden 10 araç eklendi (toplam 29): ses durumunu ve kayıtlı referansları oku; referans seç; yerel dosya seçicisini aç; video/yerel kaynaktan 3–30 saniyelik referans hazırla; dublaj seçeneklerini ayarla; üretimi başlat; gerçek grubu aç/dinle/yeniden üret; tam çıktıyı doğru videoya bağla; özgün sese dön.

Değiştirici araçlar model çağrısında çalışmaz: uygulanabilir kart üretir. Referans/grup/çıktı kimlikleri kart oluşturulmadan mevcut UI durumuyla doğrulanır. Kaynak/sekme/sohbet/deadline denetimleri korunur. Model dosya yolu veremez; yerel seçim native seçiciden yapılır. Referans listesinde yalnız ID/ad bulunur; yollar, dökümler ve gizli ayarlar modele gönderilmez. Hazırlanan referans otomatik etkinleştirilmez: dinleme/döküm kontrolü sonrası ayrı seçilir.

Kalite, paralellik, gruplama, doğrulama, zamanlama, anlatım, müzik/ortam, deneysel özgün anlatım aktarımı ve zaman aralığı mevcut kontrollerden değiştirilir. Üretim kabulü tamamlanma/kalite başarısı diye sunulmaz. Asistan sesin duygusunu dinlemiş veya kalitesini işitsel değerlendirmiş gibi davranmaz.

## Doğrulanmış onarımlar ve gerekçe

- Referans değişimi sonrası config yenilemesi ilgisiz seçili profil/zamanlama ayarlarını tekrar varsayılana döndürebiliyordu. `preserveOptions` ile referans yenilemesi seçimleri korur; hedefli gerçek UI modülü testi fast profilinin kaldığını doğrular.
- `dub:latest` nesne sorgusunda ID atılıyordu. Artık `{source,id}` ikisini birlikte eşleştirir. Doğru kaynak/ID, yanlış kaynak/doğru ID ve doğru kaynak/yanlış ID test edildi. Asistanın “sesi kullan” işlemi renderer projesine güvenmek yerine main kayıt kanıtını alır; örnek veya geçersiz sync çıktısını reddeder.
- Mevcut anonim plan/dinle/seç/hazırla düğme callback'leri ortak await edilebilir fonksiyonlara ayrıldı. Asistan DOM'a sahte tıklama yapmaz; aynı fonksiyonları ve mevcut startDub kabulünü kullanır. Geç picker/referans sonuçları eski bağlamda otomatik uygulanmaz.
- Uzun hazırlık/picker/start/grup RPC süresi 120 saniyeyle sınırlı; timeout/cancel guard kaldırılmadı. Yeni ses motoru, model veya bağımlılık yok.

## Dosyalar

- `src/assistant-capabilities.js`: tipli şemalar, bağlamsal görünürlük, EN/TR anlaşılır kartlar; kırpma modu için konuşma kesilebilir açıklaması.
- `src/assistant-context-manifest.js`: güvenli hasMedia/voiceStudio bayrakları.
- `src/assistant-agent-service.js`: gerçek referans/grup/çıktı ön kanıtı ve sınırlı RPC süreleri.
- `src/dub-service.js`: kaynak+ID birlikte son çıktı doğrulaması.
- `src/renderer/assistant-app-actions.js`, `assistant-voice-actions.js`, `index.html`: mevcut eylem kayıt defterine CSP self adaptörü.
- `src/renderer/dub-generator-ui.js`: durum/seçenek/start/grup/use arayüzü; seçili ayarların korunması.
- `src/renderer/voice-reference-ui.js`: await edilebilir native seçim/hazırlama/kullanma; geç kaynak denetimi.
- `tests/assistant-voice-actions.test.js`: gerçek DOM modülleriyle seçenek/start/ref/grup/kaynak kanıtı; kontrollü ses oynatma ve motor sınırı.
- `tests/electron-assistant-voice.smoke.js`: gerçek Windows penceresi, yalıtılmış profil ve fixture ses deposu; açık/koyu tema ve 800px dialog sınırları.
- `tests/assistant-agent-service.test.js`: gerçek/uydurma referans/grup/output ID kart testleri.
- `tests/assistant-app-actions.test.js`, `assistant-capabilities.test.js`, `dub-service.test.js`: kayıt defteri ve kaynak+ID sözleşmeleri güncel.

## Kontroller

Doğrudan Node ile PASS: assistant-voice-actions (3), assistant-agent-service (7), assistant-app-actions, assistant-capabilities, dub-service, dub-generator-ui, voice-reference-ui, ipc-parity, preload-usage-ratchet, coverage-map, assistant-provider. Değişen bütün JS dosyaları `node --check`; `git diff --check` geçti. Başlangıç testinde kapanıştan sonra JSDOM async refresh saptandı; cleanup öncesi bekleyen refresh tamamlandı ve temiz tekrar geçti.

Native Windows: `electron tests/electron-assistant-voice.smoke.js`, Start-Process gerçek çıkış kodu **0**. 1440×1000 TR koyu ve 800×760 EN açık görünüm yakalandı ve görsel incelendi; dialog sınırları 17–783, native yerel seçim kontrolü etkin. Son koşu `.uiprev/assistant-voice/1793053582991-14052/`; ham ekranlar/profil/loglar Git'e dahil değil. Ses config/referans/latest IPC'leri test fixture'ıyla yalıtılır; kişisel depoya yazılmaz. İlk görüntü denemesinde ortak ses config'i okunabildiği görüldü; harness düzeltilerek sentetik referansla yeniden doğrulandı, ilk ham görüntü yayımlanmadı.

Gerçek GPU/model/YouTube, ücretli sağlayıcı, fiziksel ses donanımı veya duygusal kalite denemesi yapılmadı. Ses işlemleri API sınırında kontrollü; bu sonuç üretim akıcılığı/kalitesi kanıtı değildir. Tam npm test ve uzun CI beklenmedi; CI açık kalır. `start.bat`/install/GPU bağımlılıkları değişmedi; Windows normal başlangıç betiği bu tur yeniden çalıştırılmadı. Yeni şema/kurulum yok. Kişisel uygulama kapatılmadı.

## Devam

P05 bağları tamam. P06: PDF/kitap açık sayfa-bölüm-pasaj kimliği ve aralığıyla mevcut okuma/ses üretimini bağlamak. Çok adımlı otomatik devam P08 kapsamındadır; bugün değiştirici kartların her biri kullanıcı uygulaması bekler.
