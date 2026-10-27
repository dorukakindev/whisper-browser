# Rapor 631 — Asistan: görünür işlem durumu ve hata sonrası toparlanma

2026-10-27. Başlangıç master `4958e50d78f35c691b561891375732c4abef370b`; bitiş ürün kodu `211f9acf3f270d9a827bb6ea533b2ede30b104bc`; dal codex/assistant-resilience631.

## Doğrulanan sorunlar ve değişiklikler

1. Renderer RPC süre aşımı pending kaydını siliyor ancak action-cancel göndermiyordu. Artık süre aşımı, signal abort ve pencere kapanışı aynı sonlandırma yolunda ilerler; timer/abort/destroyed listener temizlenir, geç sonuç reddedilir. Süresi dolmuş işin yeni yan etkiye devam etmemesi adapterlerin mevcut deadline/isCancelled kapılarıyla birlikte sağlanır; zaten başlamış medya işini kendiliğinden öldürme iddiası yoktur.
2. Genel oturum deadline'ı kullanıcı stop'u gibi cancelled=true dönüyordu; UI stopped sayıp Retry'ı gizliyordu. Timeout ayrı timedOut=true/cancelled=false başarısızlığıdır; kısmi metin korunur ve mevcut elle Retry görünür. Kullanıcı Durdur'u hâlâ cancelled olur, kendiliğinden tekrar istek atılmaz. DeepInfra Flex timeout süresi değiştirilmedi.
3. Kart uygulama işlemi renderer kapanınca kendi controller'ını abort etmiyordu. Uygulama sürecine destroyed listener eklendi; kapandıktan sonra kilit serbest kalır ve geç receipt kabul edilmez. Normal sonuçta listener kaldırılır.
4. Native test gerçek bir bağlam sorununu doğruladı: asistanın Ayarları aç eylemi AppSettingsUI.open içindeki setContext ile sohbeti ayarlara taşıyor, kendi devam eden eylemini kaynak değişti diye iptal ediyordu. Yalnız asistanın açtığı modal preserveAssistantContext:true kullanır; mevcut sohbet korunur ve gerçek Uygulandı sonucu gelir. Elle açılan ayarların varsayılan bağlam davranışı değişmez. Kaynak doğrulama kaldırılmadı.
5. Savunma güçlendirmesi: renderer receipt'inin owner'ı main tarafında sonuç gelirken de doğrulanır; kaynak değişmişse action-cancel ile reddedilir. Kaynak/sekme koruması bütün sonuçlarda korunur.
6. Kullanılabilirlik: boş bekleyiş yerine yanıt bekleniyor/uygulama sonucu bekleniyor/alan bilgisi okunuyor/durduruluyor durumları gösterilir. Main tool start/finish olayları mevcut event kanalını kullanır; tool argümanı, dosya yolu veya key durum metnine koyulmaz. Panel activity alanı 160 karakterle sınırlıdır, textContent ile çizilir, idle olunca temizlenir. Sahte yüzde veya tamamlandı iddiası yoktur.

## Kontroller ve sınırlar

- 10 hedefli Node dosyası: 46/46 geçti (agent-service, app-actions, resilience-ui, conversation, flows, overlay, provider, settings, IPC parity, preload ratchet).
- Yeni servis kontrolleri: renderer deadline -> bir cancel + geç receipt reddi; oturum deadline -> retryable; kapanış -> uygulama kilidi temiz; stale owner -> sonuç reddi. Mock timer sanal süreyi ilerletir, gerçek 12 dakika beklenmez.
- Yeni renderer kontrolleri: kısmi yanıt korunması, gerçek retry çağrısı, eski request progress'i yok sayma, TR/EN durum, kullanıcının durdurması.
- Native Windows tests/electron-assistant-agent.smoke.js exit0: gerçek main/IPC/renderer/native panel; kontrollü yerel HTTP/SSE; beş fixture isteği, gerçek onaylı ayar modalı, gerçek get_app_preferences adapteri, bekleme/temaya-dile canlı geçiş/sonuçta durum temizliği, kısmi yanıt stop. 720x680 pencerede panel480px ve send düğmesi viewport içinde.
- Native Windows tests/electron-app-settings.smoke.js exit0: elle açılan ayar davranışı, 0 dış sağlayıcı çağrısı, üç fixture isteği.
- 12 JS syntax ve git diff --check geçti. Tam npm test, uzun CI, gerçek DeepInfra/ücretli model, canlı site, GPU/ses ve start.bat akışı koşulmadı. Native kontrollü başarı gerçek model kalitesi kanıtı değildir. Launcher/kurulum/bağımlılık değişmedi.
- Conversation testinin eski fixture'ında assistantProviderSelection tanımı eksikti; gerçek source kullanımına uygun fixture model stub'ı eklendi. Ürün eşiği gevşetilmedi. İlk native koşular Ayarları aç işlemindeki gerçek iptali gösterdi, başarısızlık gizlenmedi; bağlam korununca geçti.
- Otomatik onay incelemesi sonuç owner kontrolünü yalnız read araçlarına daraltan öneriyi güvenlik gevşetmesi riskiyle reddetti. Bu öneri uygulanmadı. Bütün sonuçlarda doğrulama kaldı; ayar modalının bağlamı koruması güvenli alternatif olarak uygulandı ve native doğrulandı. Bu konuda açık kalan onay engeli yok.

## Yerel UI incelemesi (make-interfaces-feel-better, full)

Kapsam yalnız eklenen activity satırı ve mevcut native panelde busy/idle/cancel durumlarıdır; bütün uygulama tasarımı denetlendi iddiası yoktur. Vanilla JS ve mevcut CSS token paleti kullanıldı. Görüntüler `.uiprev/assistant-agent/1793074341324-22024/` altında, Git dışında.

| Kategori | İncelenen kanıt | Sonuç |
|---|---|---|
| Typography | TR koyu/EN açık activity metni, 480px panel | 12px/1.5, satır sarma; taşma yok |
| Surfaces | Mevcut raised/text/accent tokenları, görüntüler | Sade sol vurgu ve yerleşim |
| Animations | Yeni durum geçişi | Animasyon eklenmedi; anlık gerçek durum, reduced-motion yükü yok |
| Icons | Yeni bileşen | Yeni ikon yok; mevcut ikon seti yeniden denetlenmedi |
| Performance | start/finish event, idle temizliği, bounded snapshot | Token başına ayrı activity render yok; polling yok |

| Önem | Konum | Önce | Sonra | Neden |
|---|---|---|---|---|
| MEDIUM | src/renderer/assistant-overlay.js:70; assistant-overlay.css:90 | Uzun tool çalışmasında boş bekleme | Gerçek alan/yanıt/uygulama bekleme satırı | İşin sürüp sürmediği anlaşılır, yapay ilerleme gösterilmez |

## Kullanım ve teslim

Asistana normal soruyu/komutu ver; araç kullanırken panelde durum görünür. Timeout olursa kısmi yanıt ve Retry kalır; tekrar deneme kullanıcı tıklamasıdır. Ayar kartını Uygula ile açınca aynı sohbette tamamlanma bilgisi kalır. Kaynak gerçekten değişirse iptal/reddetme devam eder. Yeni bağımlılık/kalıcılık şeması/IPC kanalı yok; mevcut event/snapshot'a isteğe bağlı alan eklendi.

Kod/belge ayrı commit, normal push/PR ve sürekli yetkiyle master'a merge; ana kopya kişisel dosyalar korunarak FF güncellenir. Dış DeepSeek denetimi eski HEAD'i okuyorsa bu yeni ürün commit'i ile karışan koşuları ayrı revizyon olarak raporlamalıdır. Kişisel API/profil/dosya kullanılmadı, açık kişisel uygulama kapatılmadı.
