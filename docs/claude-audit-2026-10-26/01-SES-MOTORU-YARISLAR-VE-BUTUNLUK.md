# Görev01 — Ses motorunu adversarial olay sıralarıyla sınama

Bu görev için ZIP içindeki 00-START-HERE.md kuralları ve KNOWN-STATE.md geçerlidir. Önce snapshot bütünlüğünü doğrula. Ürün baseline'ı değiştirme; bağımsız probe ve uygulanmamış çözüm tasarımı üret. Sadece bu görev alanını derinleştir; diğer üç görevin işlerini yeni bulgu sayısına katma.

## Sonuç hedefi

Dublajın “60/61'de kaldı”, “referansı değiştirmeden çalışmadı”, “tamamlandı ama ses yok”, “iptal ettim ama eski iş yeni sese dokundu” sınıfındaki gerçek kusurlarını arıyoruz. Bir worker logu veya NaN fixture'ı üretmekle yetinme; servis→worker→cache→kalite→oynatma zincirinde sahiplik ve kullanıcı sonucu göster.

Önce src/dub-service.js, dub-engine-worker.js, process-lifecycle.js, voice-reference.js, dub-background.js, dub-playback-assets.js; tools/voxcpm2/{dub_worker,dub_runtime,dub_lifecycle,dub_recovery,dub_resume,dub_quality,altyazi_oku}.py; renderer/{browser-dub-audio,dub-sync-map,dub-workspace-model}.js çağrı haritasını çıkar. Mevcut testlerde kapsanan yolu tekrar bug sayma.

## A — Sahiplik modeli ve kontrollü zamanlama

| ID | Zor görev | Kabul/kanıt |
| --- | --- | --- |
| E01 | Servis/host/run/model/referans/çıktı sahiplerini ayrı durum makineleri olarak çıkar. | Hangi kimlik hangi olayda değişir ve hangi yan etkiyi yetkilendirir; kaynak satırlarıyla tablo. |
| E02 | Aynı anda start A/start B/release/idle-expire olaylarını dene. | Tek aktif run, tek host; kabul edilmeyen iş hiçbir argv göndermesin. Güncel starting rezervasyonunu tekrar keşif sayma. |
| E03 | spawn error, stdin error, stderr data, stdout partial, close olaylarının anlamlı sıralarını üret. | Her kabul edilmiş iş tam bir terminal sonuca ulaşsın; hata olmayan close başarıya dönüşmesin. |
| E04 | terminate true/false/reject ile close'un önce/sonra/hiç gelmemesini ayır. | true'nun sözleşmesini önce oku; false'da canlı süreç sahipliği bırakılmasın, ikinci iş yanlış başlamasın. |
| E05 | İş bitiş callback'i içinde yeni start ve eşzamanlı idle timer tetikle. | Eski timer/kill yeni host'u kapatmasın; tekrar üretilebilir deterministik scheduler. |
| E06 | Referans/model/CUDA/PYTHONPATH değişimi ile warm reuse'u sınırla. | Değişmesi gereken kimlik değişsin; yalnız metin değişince gereksiz cold start olmasın. |

## B — Protokol, kuyruk ve son parça

- E07: UTF-8 Türkçe yolun pipe byte sınırını birer byte böl. JSON/NDJSON UTF-8 karakteri yarım gelince kaybolmasın. Ham stdout ile uygulamanın parse ettiği olayı karşılaştır.
- E08: Worker DONE satırının id/code türü, yinelenmesi, eski id, sonraki işin id'si, boş ve yarım satırlarını dene. Sonraki işin sesi/ilerlemesi önceki işe yazılmasın.
- E09: Mesaj sınırının MAX−1/MAX/MAX+1 noktalarını ve newline olmadan EOF'u dene. Bellek sınırı decode sonrası değil okuma anında uygulanıyor mu? Bu kapı artık var; yalnız yeni karşı örnek bildir.
- E10: 61 grupta sonuncuyu askıda bırak; aynı anda cancel/stop/retry ve geç başarı üret. Tamamlanan60grubun doğrulanmış sesi korunmalı; farklı referansta reuse olmamalı. Model-free fixture ile gerçek servis yolunu izle.
- E11: Referans hazırlığı başarılı, model hazır, inference başladı, doğrulama başladı ve mux başladı noktalarında ayrı fault injection yap. “Başarısız” mesajı hangi aşamanın ne kadar sürdüğünü açıklıyor mu? Bitmeyen alt süreç/timer var mı?
- E12: Motor reset veya verifier close başarısızlığını, yeniden başlatılan motorun ilk isteğiyle birleştir. Eski latents/prompt/verifier sonucu yeni işe sızmasın.

## C — Cache ve ses dosyası matrisi

- E13: WAV mono/stereo, kısa/uzun, float/PCM, bozuk RIFF/data boyutu, truncated son frame, NaN/Inf ve başı/ortası/sonu bozuk blokları kullan. valid_audio'nun yeni blok taraması mevcut; header testinin ötesinde tüm gerçek yeniden kullanım yolunu göster.
- E14: Tam sessizlik, çok düşük gerçek sinyal, sadece kısa impuls, DC offset, clipping ve uzun baş/son sessizliği ayrı tut. Teknik dosya geçerliliği, “konuşma var” ve işitsel kaliteyi birbirine karıştırma. Geçerli düşük sesin yanlış silinmesini de ara.
- E15: Metadata JSON yok/yarım/stale/başka text hash'i ile iyi WAV'ı eşleştir. “Ses dosyası var” neden üretim tamamlandı sayılır veya sayılmaz? Quality review/stale kaynak ve retry kimliği korunmalı.
- E16: Tek grup yeniden üretiminde hata/timeout/OOM geldiğinde eski iyi ses ile yeni metin etiketinin eşleşmesini izle. Eski sesi yeni cümle diye oynatmak da veri kaybıdır.
- E17: Yarım WAV, final WAV, recovery WAV ve failed timeline sessizlik placeholder'ını ayır. Placeholder oynatılabilir olabilir ama başarılı speech cache'i değildir; güncel kuralı gevşetme.
- E18: Sesin ortasında/sonunda disk yazma hatası ve aynı adla eşzamanlı export dene. Güvenli eski dosya, ownership ve yeni çıktı bildirimi tutarlı mı? Kullanıcı verisinde deneme yapma.

## D — Playback ve ölçüm

- E19: play() promise'ini askıda tutup remove/attach/seek/başka sekme/loadedmetadata/error sıralarını değiştir. Eski promise yeni sesin pause/mute/rate durumunu değiştirmesin.
- E20: Video yavaşlatma haritasında monotonluk, boşluk süreleri, iki uç ve integral korunumu için bağımsız sayısal oracle kur. Aynı formülü kopyalamak oracle değildir; sayısal entegrasyonla kontrol et.
- E21: Orijinal sesi başlangıçta muted/unmuted ve farklı playbackRate ile aç; dublaj aralığına gir/çık, reklam/spinner/stale telemetry simüle et. Geri yükleme yalnız aynı media generation'a uygulanmalı.
- E22: Müzik/ambiyans katmanında gecikmiş readyState, kısa layer, farklı süre ve play rejection dene. Dublaj sesinin kendisi durmamalı; çöken layer yanlış sessizliğe neden olmamalı.
- E23: 1/20/200/1000grup için cache tarama, model-free plan ve kuyruk maliyetini ölç. I/O/bellek/CPU ayrı; cache doğrulama güçlendi diye bütün sesleri RAM'e alma önerme.
- E24: Bulduğun en önemli3kök için olay çizelgesi ve minimal bağımsız repro oluştur; mümkünse deterministik20tekrar uygula. Rastgele uyku ekleyip “düzeldi” deme. Hiç yeni kök yoksa kapatılan adayları da kaynak/kanıtla göster.

## Özel teslim

Ortak dosyalara ek olarak STATE-MACHINES.md, EVENT-TRACES.jsonl, AUDIO-FIXTURE-MANIFEST.json ve varsa BENCHMARK.csv ver. Her trace olay sırası ve beklenen sahiplik kimliklerini içersin. Gerçek GPU yoksa model iç davranışını PASS sayma; model-free lifecycle kanıtını açık sınırla. En önemli kullanıcı etkisini açıklayan bir sayfalık öncelik özeti ekle.
