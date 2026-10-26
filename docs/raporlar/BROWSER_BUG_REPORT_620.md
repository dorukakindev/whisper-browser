# Rapor 620 — P03: bağımsız sohbet ve kimlikli iş takibi

Başlangıç master `d377181458b3c8fc62eaef85eacdbbeb03b0cc77`; bitiş ürün commit'i `958eaf1ac72e959ee2a928a2702a9c1dd40c4cc2`; dal `codex/assistant-jobs620`. P02'deki model döngüsü korunarak medya işi sırasında normal sohbet açıldı. Kullanıcının onayladığı sekiz paket planındaki P03 teslimidir.

## Çalışan davranış

- Whisper/çeviri veya ses işi sürerken normal asistan sorusu gönderilebilir. Yeni agent `state.running`, `player.job` ve medya sürecini sahiplenmez. Mevcut kaynak/alıntı kapsamı korunur. Web araştırmasının medya busy engeli de kaldırıldı; onun kendi sağlayıcı/iptal yolu korunur.
- Main'deki `assistant-jobs.js` gerçek transkripsiyon/yalnız çeviri/legacy sohbet süreç olaylarını ve dub-service ses/referans oturumlarını takip eder. UUID kimliği, evre, yüzde, running/cancelling/completed/failed/stopped, zamanlar ve kısmi çıktı varlığı ayrı tutulur. Renderer snapshot/olay aboneliği kullanır; geç ilk snapshot daha yeni olayı ezmez.
- Asistan baloncuğunda mevcut temaya uyan katlanabilir **İşler** bölümü vardır. Son altı kayıt görünür; ana süreç bu oturumdaki en fazla 50 son kaydı saklar. Tamamlanan kaydı geç exit değiştirmez. Dosya yolları, kaynak metni, ham hata/anahtar ve çalıştırma seçenekleri bu listede yoktur.
- `get_job_status` artık renderer tahmini yerine main kaydı döndürür. Yeni `cancel_job` aracı yalnız main'in verdiği gerçek, durdurulabilir kimlik için kart oluşturur. Kayıtlı araç sayısı 14 oldu. Kartın mevcut kaynak/thread koruması P02'deki gibi devam eder.
- İş listesindeki açık Durdur düğmesi de aynı main yetkisini kullanır. Closure tam süreç/oturumu kontrol eder; eski kimlik yeni işi durduramaz. İstek anında kabul edilir ve kayıt Durduruluyor olur; arka plandaki iptal bitmeden Durduruldu yazılmaz. İptal reddedilirse kayıt çalışıyor durumuna döner, görünür uyarı ve tekrar deneme imkânı oluşur. Uzayan motor hazırlığı sohbeti kilitlemez.
- Sohbetin kendi iptali yalnız o HTTP isteğine gider. Kısmi yanıt korunur. Gerçek sağlayıcı hatasından sonra kaynak hâlâ aynıysa Yeniden dene düğmesi yeni bir sohbet isteği başlatır; kendiliğinden tekrar gönderim yapılmaz. Medya üretimini otomatik yeniden çalıştırma eklenmedi.

## Doğrulanan kökler ve paket sırasında yakalanan regresyonlar

1. `aiChatSend` iki ayrı noktada medya busy/queue/awaitingExit yüzünden normal sohbeti reddediyordu. Normal agent yolu için ayrıldı; mevcut Python scoped review yolu eşzamanlı yeni GPU süreci başlatacak şekilde açılmadı.
2. Native baloncuk `blocked` ve `busy` durumları medya/sohbeti aynı sayıyordu. Soru girişinin ve iptal sahibinin durumları ayrıldı.
3. P02 `get_job_status` renderer anlık görüntüsüydü; yetkili süreç kaydı değildi. Main'deki gerçek olaylardan snapshot ve tek kimliğe bağlı iptal eklendi.
4. İlk regresyon koşusu, video işinin Durdur düğmesinin busy ayrımından dolayı gizlendiğini yakaladı. Durdur görünürlüğü artık canCancel'a, gönderme durumu sohbet busy'sine bağlıdır. Eski native video kabulü yeniden geçti.
5. Referans hazırlığı `reference_ready` ile bitiyor; bunu normal done saymamak yetim running kaydı bırakıyordu. Kendi terminali ve evre olayı bağlandı; hedefli kontrol eklendi.
6. UI kapanışı/abonelik hatası gerçek medya üretimini bozamaz. Sonuçlanmamış iptal bekleyişinin main araç çağrısını kilitlemesi önlendi. Yüksek frekanslı log/aynı yüzde olayları iş listesine gereksiz tekrar basmaz.

## Kanıt

Geçen hedefli kontroller:
- `assistant-jobs.test.js`: 7 davranış; eski ID/yeni süreç, done+exit önceliği, iptal hatası ve yeniden deneme, kısmi çıktı, 50 kayıt sınırı, gizli veri yokluğu, IPC sender, stale snapshot, kapalı UI ve uzayan iptal.
- `assistant-agent-service.test.js`: 3; main job aracı renderer status RPC'si kullanmaz, eski durdur kartı yeni işi etkilemez. `assistant-capabilities`, `assistant-provider`, `assistant-app-actions`, `assistant-overlay`, `assistant-conversation`, `assistant-video-command`, `assistant-threads` geçti.
- `dub-service`, `dub-service-warm-start`, `dub-reference-pairing` geçti; gerçek servis fixture'ında observer start/cancel callback/terminal erişimi ayrıca doğrulandı.
- `queue-lifecycle`: 21; değişen event adaptörü hem main ledger'a hem eski jobId'li renderer olayına gider. Önceki sabit tek satırlık regex yeni adaptöre göre iki sözleşmeyi doğrulayacak şekilde güncellendi, assertion silinmedi.
- `process-lifecycle`: 10, gerçek Windows parent/grandchild iptali dahil. İlk sandbox koşusu spawn EPERM verdi; yetkili süreç çalıştırmada geçti. `assistant-web-research`, `ipc-parity` (276 handle/17 on), `coverage-map`, değişen JS syntax ve diff kontrolü geçti.

Gerçek Windows Electron exit0:
- `electron-assistant-jobs.smoke.js`: gerçek main/renderer/native overlay + kontrollü main ledger işi + gerçek yerel HTTP/SSE. Medya işi %42'deyken sohbet ve ayar kartı; sohbet iptali medya iptaline dönüşmez. HTTP503 otomatik tekrarlanmaz; kullanıcı retry yapar. Eski iş ID'si yeni voice işini durdurmaz. Beş HTTP istek, bir tam iş iptali. Son kanıt `.uiprev/assistant-jobs/1793050081125-26796`; iki tema ve kompakt boyut görüntülendi. 480×616 native baloncukta yatay taşma yok.
- `electron-assistant-video.smoke.js`: önceki üç doğrudan video komutu, aralık, gerçek kontrole bağlı iptal, ilerleme/sonuç ve iki tema geçti. `.uiprev/assistant-video/1793049899618-16924`.
- `electron-book-assistant.smoke.js`: scoped kitap/pasaj uyumluluğu geçti.
- `electron-browser-trusted-bridge.smoke.js`: gerçek IPC/browser güvenilir köprü geçti.

Test ortamı sorunları gizlenmedi: video screenshot bir koşuda UnknownVizError verdi; görünür/odaklı pencere ve occluded/background renderer bayrakları ile, aynı assertion ve süre sınırında geçti. Yeni jobs native testinin bir tekrarında ilk kart zaman aşımı oldu; aynı görünürlük bayrakları ve hata tanılarıyla son koşu geçti. İlk kart gecikmesinin kesin kökü kanıtlanmadı; gerçek sağlayıcı kalitesi veya bütün Windows koşulları için kararlılık iddiası yok.

## Sınırlar ve sonraki paket

İş geçmişi yalnız bu uygulama oturumunundur; kalıcı geçmiş/süreç kurtarma sistemi yapılmadı. Diskte mevcut iş günlükleri değişmedi. Başlatma reddi henüz bir kabul edilmiş süreç kaydı oluşturmaz; hata mevcut kontrolünde görünür. Browser sayfa/captured-track çevirisi, burn-in, kitap workspace alt işleri ve canlı ASR henüz bu ledger'a bağlanmadı; mevcut kendi ilerleme/iptal ekranları çalışır, bu listede yok diye boşta sayılmaz. Aracın açıklaması sınırı bildirir. Bu bağlar P04–P07'de ilgili alanla tamamlanır. Mevcut doğrudan uzun task'ın sohbetini değiştirmek sahipliği koparacaksa o thread-switch koruması korunur; aynı sohbette normal soru artık gönderilebilir. Explicit expectedScope kitap yardımcılarının eski Python yolu medya işiyle aynı anda açılmaz; P06 işi.

Tam npm test/uzun CI beklenmedi. P04'e kaydedilmiş iki başlangıç scheduler kalite testi kırmızısı burada düzeltilmedi; scheduler değişmedi. Gerçek GPU/Whisper/VoxCPM2/model/YouTube/DRM testi yapılmadı. Native testte medya durumu ve motor olayları kontrollüdür. start.bat/install.bat/dependency/Python venv değişmedi; gerçek normal GPU açılışı yerine geçmez. Yeni kalıcı ayar veya veri migrasyonu yok. Ham kişisel profil/log/görüntü Git'e alınmadı.

Sonraki iş P04: YouTube probe/altyazı seçimi/indirme, track aralığı ve hedef dil, ses için çeviri; browser çeviri/sayfa işleri için bu job sözleşmesi; iki kayıtlı scheduler kırmızısının gerçek kökü. Yeni main agent/ledger tekrar yazılmayacak.
