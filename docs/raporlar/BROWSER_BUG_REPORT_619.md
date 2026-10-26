# Rapor 619 — P02: kaynak bağlı asistan araçları ve sağlayıcı döngüsü

Başlangıç master `109ea2903a4c983e923da4a43e11aab7f563ec3b`; ürün commit'i `72712e23f375d8f0d2039866f2f9874423ee9723`. Dal `codex/assistant-capabilities619`. P01 yeniden yazılmadı. Bu paket genel araç altyapısıdır; P03–P08 tamamlanmış sayılmaz.

## Gerçekte çalışan kapsam

Ortak `assistant-capabilities.js` şeması 13 aracı tanımlar. Kaynak manifestine göre yalnız ilgili küme sunulur. YouTube'da henüz altyazı bulunmasa da Whisper aracı kullanılabilir. Ana süreçte Node fetch ile sınırlandırılmış model/araç döngüsü vardır; renderer AppActions yalnız mevcut uygulama işlevlerini çağırır.

| Araç | Uygulama yolu / sonuç |
|---|---|
| app_help | Kayıtlı araçlar ve mevcut uygulama özelliklerinin dürüst sınırları |
| get_source_context | İzinli kaynak metni ve modele açık manifest |
| get_job_status | Renderer durum anlık görüntüsü; yetkili uzun iş kaydı değildir |
| list_subtitle_tracks | Yakalanmış kaynak/çeviri izleri; dosya yolu yok |
| search_subtitles / get_current_subtitle | İzinli havuzdaki gerçek U kimlikleri; sınırlı anahtar sözcük araması |
| seek_to_time | Gerçek altyazı zamanına mevcut browserCommand veya oynatıcıyla git |
| preview_translation_change | Mevcut copyText ile öneriyi kopyala; dosya değiştirmez |
| start_whisper | Mevcut startBrowserYoutubeWhisper; yalnız Whisper veya çeviri, çift uçlu aralık ve ses için çeviri parametresi |
| translate_captions | Mevcut useBrowserTrack; gerçek kaynak iz kimliği gerekir |
| translate_page | Mevcut handleBrowserPageTranslationAction; gerçek iş ilerlemesi mevcut sayfa araç çubuğunda |
| open_voice_preparation | Mevcut MediaExperience.openVoice; ses üretimini başlatmaz |
| open_settings | Mevcut AppSettingsUI.open; yalnız kayıtlı bölüm, anahtar okuma/değiştirme yok |

Değişiklik yapan araçlar bir işlem kartı oluşturur; kullanıcı kartı uygulayınca mevcut işlev çağrılır. Önerildi/kabul edildi/tamamlandı ayrıdır. P01'in açık kullanıcı video komutları mevcut doğrudan yolunu korur. Kaynak metnindeki sözler komut değildir. Modelin bunu kusursuz yorumladığı iddia edilmez; yürütme sınırı program tarafından uygulanır.

## Envanter ve mimari kararı

[Kaynak envanteri](../assistant/P02_SOURCE_INVENTORY.json), `node tools/assistant-inventory.js` çıktısıdır: 274 literal main.handle, 17 main.on, 275 preload.invoke çağrı yeri, 14 send, 4 sendSync, 20 on ve 893 HTML kontrol kaydı. Bunlar benzersiz kullanıcı özelliği sayısı değildir; dinamik action alt alanları ve runtime görünürlüğü ayrıca incelenmelidir. Her kayıtta kaynak ve satır bulunur; hiçbir değer/anahtar toplanmaz. IPC parity tüm kayıtlar arasında eksik/çift handler bulmadı. Bu envanter 274 kanalı modele açmaz: yalnız yukarıdaki 13 araç yetkilidir.

`buildOptsFromUI` DOM seçeneklerini, kuyruk `item.opts` dondurmasını ve `transcribe:start` sayı/dosya/başlatma kilidi doğrulamasını korur. Genel IPC yönlendiricisi eklenmedi. Dublaj, kitap, kütüphane, altyazı ve ayar ekranları zaten vardır; geniş asistan kontrolü sonraki paketlerdedir.

SDK/main/utilityProcess kararı: bu paket mevcut main fetch desenini izleyen sıfır bağımlılıklı CJS servisidir. Gerçek Electron çalıştırmasında yerel HTTP/SSE, iptal ve preload geçişi doğrulandı; yeni ESM/native ABI/paketleme bağımlılığı oluşmadı. Bu, installer üretimi veya utilityProcess'in bütün koşullarda daha kötü olduğu kanıtı değildir. Ayrı süreç ölçümü yapılmadı; bu sınırlı ağ/şema işinin başka süreç gerektirdiğine dair kanıt yok. AI SDK/MCP eklenmedi. Python legacy NDJSON yolu yapılandırılmış çeviri incelemesi ve açık expectedScope kitap yardımcıları için korunur; P06'da taşınabilir.

## Korunan sınırlar ve doğrulanan hata yolları

- Gizli ayarlar main kasasından alınır; model/manifest/araçlara anahtar, yerel dosya yolu, serbest shell veya serbest IPC verilemez. HTTPS/literal localhost endpoint sınırı ve yönlendirme reddi korunur.
- Kartlar main'de sender/kaynak/thread/tab-generation/aralık ile saklanır; renderer yürütmeden önce tekrar doğrular. Tek kullanımlı, 10 dakika ömürlüdür. Yeniden açılmış uygulamadaki eski kart uygulanmaz; yeniden istek gerekir.
- Main browser sekmesini bağımsız doğrular. Diğer kaynakların renderer manifesti yalnız güvenilir ana pencere tarafından gelir; tam yetkili kitap/kütüphane kaynak deposu P06/P07 kapsamındadır.
- Agent isteği 120 saniye, renderer eylemi 30 saniye ile sınırlıdır. Süre dolunca yeni Whisper hazırlık adımı başlamaz; kaynak kontrolüne deadline da aktarılır. Geç RPC cevabı uygulanmaz. Başlatılmış medya işinin iptali P03'te ayrı iş sahipliğiyle geliştirilecektir.
- En çok dört model turu, sekiz araç/tur, sekiz öneri/istek, 100 bekleyen öneri; cevap/SSE/argüman/bağlam bütçeleri sınırlıdır. JSON kesilerek bozulmaz. UI metadata ve gerçek U kanıtları kalıcı konuşmada tutulur.
- tools/stream formatı reddedilirse yalnız ilk turda, yanıt başlamadan sınırlı geri dönüş yapılır. Auth/429 için kör yeniden deneme yok. Kısmi cevap sonrası tekrar yok; alınmış metin korunur. Araçsız sağlayıcıya sessiz sahte başarı verilmez.
- Uygulama kapanış temizliği `will-quit` üzerinde tutulur; yeni before-quit dinleyicisi ekleyerek mevcut uyarı sınırı aşılmaz. Başarılı kart sonucu hata alanında kırmızı gösterilmez. İngilizce iptal mesajı kendi dilinde verilir.

## Hedefli kabul kanıtı

Geçti: `node tests/assistant-capabilities.test.js` (3), `assistant-provider` (4), `assistant-agent-service` (2), `assistant-app-actions` (2); ayrıca mevcut assistant-threads, assistant-overlay, assistant-conversation, assistant-video-command, ipc-parity, coverage-map. Değişen JS girişlerinde node --check ve git diff --check geçti. Beklenti/eşik silinmedi veya gevşetilmedi.

Gerçek Windows Electron exit0:
- `electron-assistant-agent.smoke.js`: gerçek main/renderer/native overlay + yerel HTTP/SSE sağlayıcı; yardım çağrısı, uygulanmadan açılmayan ayar kartı, gerçek ayar açılışı, receipt/tek kullanımlı kart, kısmi cevap/iptal, 3 HTTP istek ve yeniden deneme yok. Koyu 1440×1000 ve açık 720×680; native baloncuk 480×616, yatay taşma yok. Son kanıt `.uiprev/assistant-agent/1793049038819-29564`; önceki ekranlar da `.uiprev/assistant-agent/1793048855010-25300` altında gerçekten görüntülendi.
- `electron-assistant-stream.smoke.js`: eski NDJSON fallback testi; test açıkça yeni agent'ı geçici kapatır. Yeni default gerçek HTTP testiyle ayrıca doğrulanır.
- `electron-book-assistant.smoke.js`: mevcut expectedScope kitap/pasaj bağlamı.
- `electron-media-discovery.smoke.js`: güncel agent send sınırındaki fixture ile kaynak/öneri/citation akışı. İlk koşuda native overlay sonrası input odağı yanlış WebContents'teydi; hedef pencereye focus verildi, gerçek hover/klavye assertion'ı korunarak yeniden geçti. 940/680 genişliklerde yatay taşma yok.
- `electron-assistant-video.smoke.js`: P01 üç video komutu ve kompakt UI regresyonu.
- `electron-browser-trusted-bridge.smoke.js`: gerçek güvenilir köprü, iframe/shadow/EME yaşam döngüsü.

Kanıtlar izole test profilidir, kişisel profil ve ekranlar Git'e alınmadı. Tam npm test çalıştırılmadı. Başlangıçtaki `browser-translation-quality-loop.test.js` iki bilinen kırmızı testi P04'e kayıtlı; burada scheduler değiştirilmedi ve yeşil denmedi. CI açık kalır, teslim bekletilmez. Gerçek ücretli model, gerçek YouTube/GPU/DRM, ses kalitesi, install.bat ve normal start.bat açılışı bu pakette doğrulanmadı. start.bat/dependency/venv değiştirilmedi. Native backend-free Electron kabulü CUDA açılış kanıtı değildir.

## Sonraki paket

P03: sohbeti medya iş kilidinden tamamen ayır, main yetkili job kimliği/snapshot/ilerleme/iptal ve işlem geçmişini bağla. Şu an yeni agent state.running'i ele geçirmez; fakat mevcut aiChatSend giriş kapısı medya işi sürerken sohbeti hâlâ engeller. Bu paket bunu bitmiş saymaz.
