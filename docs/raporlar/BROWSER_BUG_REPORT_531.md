# BROWSER_BUG_REPORT_531 — Harici API asistanı: akış, kalıcı sohbet ve kaynak araçları

Tarih: 2026-10-24. Çalışma: `D:\Whisper Local\tmp\audit470`, dal `codex/luna-media-home532`, PR #482. Başlangıç HEAD `c7c2ebcf56751cc13000dacef5c4bcb374c75b4d`; bitiş ürün commit'i `9d73123cb9400df2b6b231dd9fabc7ec14ebbc30`.

Kullanıcı önceki GitHub araştırmasındaki asistan geliştirmelerini onayladı; harici sağlayıcı kullanılması ve yerel LLM kurulmaması açık koşuldu. Mevcut Whisper, altyazı çevirisi ve VoxCPM üretimi değiştirilmedi. Bu çalışma yeni özelliklerin uygulanmasıdır; aşağıdaki entegrasyon kusurları bağımsız bir eski ürün denetimindeki yeni bug sayısı gibi sunulmaz.

## Uygulananlar

- Gerçek OpenAI uyumlu API akışı: `chat_delta` NDJSON → aynı core job → Browser yan paneli ve native baloncuk. Otomatik yeniden deneme yalnız henüz cevap gelmediyse; kısmi cevap sonrası rota değiştirilmez. Açık 400/404/422 araç/stream reddinde sınırlı uyumluluk geri dönüşü. İptal, bağlantı kopması ve token sınırı alınan metni korur; kesilen cevap tamamlandı sayılmaz.
- Kaynak başına kalıcı sohbet seçimi, yeni sohbet, ad değiştirme, onaylı silme ve mesajdan dallandırma. Aynı depo Browser yan panelini de besler. Tamamlanmamış turlar sonraki model geçmişine tam cevap gibi eklenmez. Yeniden açılışta yarım kayıt stopped görünür.
- Kaynak kartları gerçek altyazı kimliği, zaman, alıntı ve varsa çeviriyi gösterir. İlgili sahneye gidilebilir. Kaynak/sekme/jenerasyon/sohbet değişiminden kalan düğmeler reddedilir.
- Harici model için dar araçlar: `search_subtitles`, `get_current_subtitle`, `seek_to_time`, `preview_translation_change`, `open_voice_preparation`. Arama yerel anahtar sözcük eşleştirmesidir; harici model farklı/çevrilmiş sorgularla arayabilir. Yerel inference veya embedding modeli kurulmadı. İlk iki araç yalnız seçili altyazı havuzunu okur; son üçü kullanıcıya öneri kartı çıkarır. Dosya düzenleme, shell/JS, otomatik ses üretimi yok. Çeviri önerisi onaylanınca panoya kopyalanır.
- Remend **1.4.0** sabitlendi; bağımsız tarayıcı paketi akışta yarım Markdown işaretlerini görünüm için kapatır. Kaydedilen özgün metin değişmez. HTML çalıştırılmaz, harici CDN/React yok. assistant-ui MIT `withParentsFirst` yardımcı yaklaşımı uyarlanmıştır; kesin kaynak ve lisanslar `third_party/` içindedir.
- Sohbet dosyası çalışma alanı yedeğine dahil; önizlemede sohbet sayısı ve metinlerin dahil olduğu açık. Bozuk sohbet paketi mevcut dosyalara dokunmadan reddedilir.

## Uygulama sırasında teyit edilip giderilen kusurlar

1. İlk soruda yeni thread oluşunca sourceToken değişimi alındı makbuzunu düşürüyordu; aynı kaynağın ilk thread geçişi için makbuz aktarımı eklendi. Regresyon: `assistant-conversation` ve native smoke.
2. Yeni kontroller dar Windows panelinde mesaj alanını 80 px altına indiriyordu; küçük yükseklikte araçlar daha sıkı ve öneriler yatay kaydırılabilir yapıldı. Smoke başlangıçta kırmızı, düzeltme sonrası gerçek ölçüm/görseller geçti.
3. Araç altyazılarındaki S kimlikleri mevcut sayfa paragrafı S kimlikleriyle çakışabilirdi. Araç kanıtları U namespace'ine taşındı; core link doğrulaması ve native kartlar ayrı gerçek kayda bağlı. U bağlantısının transkript düğmesi olduğu gerçek panelde doğrulandı.
4. Dallandırma aynı mesaj ID'lerini yeni thread'e taşırken Browser DOM'u ebeveyndeki gizli düğümü mevcut sanabiliyordu. DOM eşlemesi thread+scope+messageId oldu; geçmiş içeren dalın iki görünür önceki mesajı olduğu doğrulandı.
5. Direkt ana iptal düğmesi akış öncesindeki eski davranışla cevap metnini siliyordu. Her iki iptal yolu alınan metni koruyup aynı kalıcı kaydı stopped yapıyor; geç chat olayı üstüne yazamıyor.
6. Sağlayıcının `finish_reason=length/content_filter` terminali normal başarı sayılamaz. Kısmi metin, terminalle aynı chunk'taki son parça dahil korunur; başarısız/kısmi durum ve yeniden deneme imkanı kalır.

## Kanıtlar

- `backend/venv/Scripts/python.exe tests/test_assistant_stream.py`: **8 geçti**. Sahte istemciyle araç döngüsü, kaynak reddi, iptal, kısmi kopma, tools+stream reddi, token sınırı; ayrıca gerçek OpenAI SDK + yerel kontrollü HTTP/SSE sunucusu, Türkçe UTF-8. Bu HTTP sunucusu bir AI modeli değildir.
- `backend/venv/Scripts/python.exe backend/test_chat_reliability.py`: **5 geçti**. Eski transient retry, kimlik hatası gizliliği, boş cevap, iptal ve atıf kuralları korunuyor. Eski mock sağlayıcılar yeni stream sözleşmesini taklit edecek biçimde güncellendi; başarı eşikleri gevşetilmedi.
- `backend/test_transcribe.py` içindeki **6 `test_chat_*` fonksiyonu** hedefli çağrıldı, geçti; tüm büyük Python dosyası yeniden koşturulmadı.
- Node: assistant-conversation, assistant-overlay, assistant-threads (3), media-tools, workspace-restore-regressions, workspace-privacy, browser-ai-context, package-integrity geçti. `player-ui`: **153/153**. U namespace nedeniyle kesin regex sözleşmesi güncellendi; davranış karşılığı native smoke ile de doğrulandı.
- `preload-sandbox`, `preload-usage-ratchet`: geçti; 285 export, 7 bilinçli dormant, kullanılmayan yok. Üretim lisans denetimi: 52 paket, ret yok.
- `electron-assistant-conversation.smoke.js`: gerçek Windows native panel/eski kaynak ve taslak akışları geçti.
- `electron-assistant-stream.smoke.js`: gerçek Windows parent+native view+IPC+disk kaydı, kontrollü NDJSON. Akış görünümü, ilk gönderim makbuzu, dört sohbet/dal, Browser ortak geçmişi, kaynak/işlem kartları, iptalde kısmi kayıt ve geç yanıt reddi; 1440×1000 TR koyu, 720×680 EN açık ölçümleri geçti.
- Son görseller ve sentetik sonuçlar `.uiprev/assistant-stream/1792859259393-17836/` içinde, Git'e alınmadı. Görseller incelendi. Native sağlayıcı kabul/ret önceki smoke'u `.uiprev/assistant-conversation/1792858598336-27748/`.
- Değişen JS için `node --check`, iki ürün Python dosyası için `py_compile`, `git diff --check`: geçti. İlk sandbox `spawn EPERM` engelleri yetkili aynı hedefli komutlarla aşıldı; engelli ilk koşu başarı sayılmadı.

## Sınırlar

- Gerçek ücretli sağlayıcı/gerçek model kalitesi, bütün sağlayıcıların araç desteği, canlı YouTube hesabı, CUDA ve normal `start.bat` akışı bu tur doğrulanmadı. Gerçek Electron testi backend NDJSON'sunu kontrollü üretir; SDK/SSE testi gerçek SDK ile kontrollü sunucu kullanır. Tam `npm test` çalışmadı, CI beklenmez/kapatılmaz.
- Arama havuzu en çok yaklaşık 3.100 satır, çok uzun kaynakta deterministik örneklenir; yalnız seçili yakın/izlenen/tüm kapsam. Vektör arama veya eksiksiz anlamsal tarama iddiası yok. Harici modelin araç desteği yoksa mevcut bağlam ve eski kanıt seçimi ile normal sohbet sürer. En çok üç araç turu + final cevap turu; her tur en çok 8 araç çağrısı.
- Depo: `userData/assistant-conversations.json`, v1, 200 sohbet toplam/20 kaynak başına/200 mesaj sohbet başına/32 MB. Boyut veya revision çatışması görünür hata verir; bozuk dosya ezilmez. Çalışma paketi mevcut dosya başına 16 MB sınırını korur; çok büyük sohbet arşivi için yedek hata verir. Çalışma yedeği özel sohbet metinlerini de içerir. Kaynak kimliği yerel medya yoluna bağlıysa başka bilgisayarda farklı yola taşınan medyayla otomatik yeniden eşleme bu tur yapılmadı.
- Akış parçaları yaklaşık saniyede bir, terminalde hemen kayda kuyruğa alınır. Ani süreç/enerji kaybında son henüz yazılmamış parça garanti edilemez. Kapanışa kadarki her token'ın fsync edildiği iddia edilmez.
- npm audit üretim denetimi mevcut Electron/undici için 2 high paket kaydı gösterdi; Remend için kayıt yok. DRM'li Electron'u ve ağ bağımlılıklarını bu görevde topluca yükseltmedim. Lisans kontrolünün geçmesi zafiyet denetiminin temiz olduğu anlamına gelmez.
- Ana kullanıcı kopyası/master'a merge edilmedi; önceki PR482 çalışmaları aynı dalda korunuyor.
