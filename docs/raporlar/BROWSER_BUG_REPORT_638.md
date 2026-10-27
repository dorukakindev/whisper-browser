# Rapor 638 — Durdurma onayı, yeniden deneme ve geç sonuç sahipliği

## Doğrulanan iptal sınırları

- `runMediaCommand` içindeki asistan iptali native durdurma sonucunu almadan `{ok:true}` dönüyordu. Başarısız kill sonrası iş defteri cancelling durumunda kilitleniyor, tekrar Durdur açılamıyordu. Artık mevcut `terminateProcessTreeAndWait` kapısı kullanılır; false, defterde stopFailed ve yeniden denenebilir running durumuna döner. Kullanıcının iptal niyeti korunur; geç gelen başarılı altyazı sonucu yeni çeviri adımı başlatmaz.
- Süreç sinyali kabul edip close üretmediğinde `_terminating` kilidi süresiz kalabiliyordu. Bounded close beklemesi false olursa yalnız hâlâ canlı çocuğun tekrar sinyal gönderme kilidi çözülür. Sahiplik bırakılmaz, yeni sürece sinyal gönderilmez.
- `createIdempotentCancel` başarısız/exception sonucu da sonsuza dek paylaşıyordu. Aynı anda gelen iki çağrı tek deneme paylaşmaya devam eder; yalnız başarısız deneme tekrar açılır. Başarılı deneme idempotent kalır.
- Normal Whisper/çeviri iptal IPC'si ve asistan çağrısı artık aynı onaylı sonucu bekler. Başarısız durdurmada `running:true` döner; renderer işi boşta göstermez, Cancel görünür ve Start gizli kalır, geç çıktı uygulanmaz. Eski iptal cevabı yeni activeJobId/player.job'a uygulanmaz. Sıfır canlı iş ve deferred başlangıç iptali mevcut temizlik davranışını korur.

Bunlar aynı iptal ailesindeki bağlı arızalardır; test veya alt adım sayısı kadar bağımsız bug ilan edilmez. `transcribe:cancel` mevcut response'una başarısız canlı durumu için running eklenmiştir; yeni IPC, ayar şeması veya bağımlılık yok.

## Kanıt ve sınırlar

- Yeni `assistant-media-stop638` ve `transcribe-stop638` testleri önce kırmızı: cancelling≠running, tekrar sinyal yok, late result ok:true, başarısız cancel yeniden denenemiyor, yanlış IPC ok:true, renderer finishRun ve yeni işin cancelled yapılması. Aynı beklentiler düzeltmeden sonra geçti; eşik düşürülmedi.
- Hedefli Node: iki yeni dosya + assistant-jobs + assistant-caption-jobs,14/14.
- Mevcut `process-lifecycle.test.js`:10 geçti; gerçek host platformunda parent/grandchild sonlandırması dahil. `pipeline-cancel.test.js`:10 geçti; çift cancel, terminal latch,100 kontrollü cancel döngüsü ve ownership. Bu100 döngü100ürün görevi veya100bug sayılmaz.
- Native Windows `electron-stop-retry638`: ayrı profil, gerçek renderer→preload→IPC; kontrollü başarısız close response ve ikinci no-job response. İlk tıklamada live state/Cancel/Start ve late-output suppression, ikinci tıklamada normal temizlik; exit0. Son kanıt `.uiprev/stop-retry638/1793085694557-16432/stop-not-confirmed-en.png`; önceki aynı görünüm `.uiprev/stop-retry638/1793085512617-24496` elle incelendi. Normal küçük durum rozeti ve tam günlük açıklaması taşmıyor.
- Syntax/diff başarılı. Gerçek GPU/Whisper/model/YouTube veya kişisel medya kullanılmadı; native test gerçek işletim sistemi kill hatası yaratmaz, o durum kontrollü response olarak verilir. Asıl süreç helper testleri Windows hostunda ayrıdır. start.bat ve install değişmedi; normal launcher/CUDA ve CI sonucu beklenmedi.

Aktif1000planda yalnız bu kapsamın kabul maddeleri güncellendi. Yeni çalışma devam eder; tamamı bitti denmez.
