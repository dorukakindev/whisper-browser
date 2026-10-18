# Rapor460 — Çakışan iptal istekleri ve arka plan SRT tutarlılığı

2026-10-18. Ses üretimi, iptal, çıktı temizliği ve arka plan ayırma yolları
incelendi. Aşağıdaki iki sorun gerçek servis işleyicileri üzerinde geçici
dosyalar ve kontrollü alt süreçlerle yeniden üretildi; model/YouTube çağrısı
yapılmadı. Rapor459'un bulguları bu tur düzeltilmiş sayılmaz.

## 1. Aynı işin çakışan iptal istekleri birbirinin durumunu bozuyor

**Doğrulandı ve düzeltildi.** `src/dub-service.js` içindeki `cancel()` her
istekte yeniden `terminate(proc)` çağırıyordu. Birinci sonlandırma sürerken
ikinci istek hata verirse ikinci catch `s.cancelled = false` yapıyordu.
Böylece daha önce kabul edilen iptal niyetini geri alıyor; geç gelen sıfır
çıkış kodu ve WAV dosyası `done` olarak yayımlanabiliyordu. Arayüzün durdurma
isteğiyle uygulama kapanışındaki iptal aynı servis yolunu kullanıyor.

Düzeltme: iş başına tek `cancelPromise`. Çakışan çağrılar aynı girişimin
sonucunu alır. Başarılı girişim çocuk sürecin `close` olayına kadar saklanır;
iş kilidi erken bırakılmaz. Sonlandırma başarısızsa yalnız o paylaşılan
girişim sıfırlanır; kullanıcı tekrar deneyebilir. Alt süreç referansı hâlâ
isteğin başında yakalanır, önceki Rapor454 düzeltmesi korunur.

Regresyon: ikinci sonlandırmayı hata verecek şekilde kuran fixture eski
kodda iki terminate çağrısı gördü ve başarısız oldu. Yeni kod bir çağrı
yapar; iki istek ve sonradan tekrarlanan istek başarılı sonucu paylaşır.
Geç gelen WAV temizlenir ve son olay `cancelled` olur. Ayrı testte ilk
sonlandırma `false` döner; kilit korunur, ikinci girişim çalışır.

## 2. Arka plan ayırma ile dublaj farklı SRT içeriklerini okuyabiliyor

**Doğrulandı ve düzeltildi.** Servis üretim başında kaynak SRT'yi
`Sesler/Girdi/<iş-id>/` altına kopyalıyor; TTS bu kopyayı kullanıyordu.
Ancak `prepareBackground` hâlâ asıl SRT yolunu alıyordu. Asıl dosya bu
arada düzenlenirse ayırmanın süre hesabı ile dublajın zaman çizelgesi farklı
altyazılara dayanabilir; asıl dosya silinirse gereksiz ayırma hatası oluşur.

Düzeltme: background hazırlığına da aynı `inputSrt` veriliyor. Kullanıcının
seçtiği açık zaman aralığı ve kaynak medya seçimi değişmedi. Snapshot adı
ve Türkçe dosya yolu korunuyor.

Regresyon: background hazırlığı başladığında asıl SRT değiştirildi.
Eski kod değiştirilmiş içeriği okurken yeni kod TTS ile aynı snapshot yolunu
ve özgün içeriği okur. GPU/model yüklemeden bu servis sözleşmesi doğrulandı.

## Testler ve sınırlar

16 Node dosyası geçti:

```text
report460-regressions (3 yeni regresyon; 2'si düzeltme öncesi başarısız)
dub-service
dub-background
report454-regressions
report453-regressions
voice-reference
voice-reference-process
voice-storage
browser-dub-audio
dub-generator-ui
player-dub-ui
dub-sync-map
voice-reference-ui
report450-regressions
ipc-parity
ci-determinism-ratchet
```

`tests/test_background_cache_regressions.py`: 10 Python testi geçti.
Değişen servis, main/preload/renderer syntax kontrolleri,
`backend/transcribe.py` py_compile ve `git diff --check` geçti.

Windows terminali kullanıldı. Yeni bağımlılık/şema/UI değişikliği yok.
install.bat/start.bat ve CUDA ortamı değişmedi. Gerçek GUI açılışı,
YouTube/GPU/model üretimi, tam npm test ve uzak CI çalıştırılmadı.
Kullanıcının açık uygulaması/işleri durdurulmadı.
