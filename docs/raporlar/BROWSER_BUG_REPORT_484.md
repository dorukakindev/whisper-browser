# Rapor484 — Ses üretimi başarısız bildirimi ve motor tanısının kaybolması

## Kanıt ve ayrım

Kullanıcının ekranındaki son üretim kaydı yerelde incelendi. 140,29 saniyede exitCode1 ile sonlanmış; progress/metrics yok, error alanında yalnız genel bildirim var. Kaydın tarihi 19 Ekim08:24–08:26 (TR); PR454 ana kopya güncellemesi12:19. Eski stderr/stdout saklanmadığından o çalışmanın kesin motor kök nedeni çıkarılamaz. GPU bellek yetmezliği veya120s timeout kesin neden diye sunulmadı.

Güncel master957bbfe9 ürün koduyla aynı kayıtlı referans kullanılarak gerçek RTX4070SUPER12GB üzerinde iki sınırlı CLI denemesi yapıldı. İlki genel tek cümle; ikincisi son başarısız işin aynı SRT girdisi, --limit11, quality15steps/concurrency8/timing-mode video. İkinci kaynak8 grup üretti. Her iki işlem exit0; ikinci deneme yaklaşık36s, generation17,08s, load13,89s, reference2,97s, attempts8/retries0. WAV48000Hz/2135364frame/44,49s; sync JSON mevcut. Kesilme0, taşma0;6 grup hızlandırılmış. Tam video yeniden üretilmedi. Kullanıcının ses/metin/girdi/ham günlükleri yalnız yerel ignore edilmiş tmp alanında; rapora içerik veya referans yolu alınmadı.

## Doğrulanan hata ve düzeltme

src/dub-service.js tamamlanma özeti motorun stdout/stderr çıktısını kalıcılaştırmıyor, close sinyalini almıyordu. Sessiz/native sonlanmada veya stdout ERROR çıktısında genel bildirim nedeni gizliyordu. Yerel başarısız job.json kanıtı ve hedefli süreç fixture'larıyla doğrulandı.

- Hata özetine her akışın son6000 karakteri diagnostics.stdoutTail/stderrTail eklenir; tüm çıktı/bellek sınırsız biriktirilmez.
- close(code,signal) sinyali özetlenir; ayrıntı yoksa genel mesaja exit/signal eklenir.
- Python alt süreci ve spawn GPU worker'ları için PYTHONUNBUFFERED/PYTHONFAULTHANDLER açılır; paket/model dosyaları değiştirilmez.
- Windows fatal exception, stdout ERROR/FATAL ve Python exception satırları hata önceliğiyle seçilir.

Test: node tests/dub-service.test.js geçti; native crash, stdout ERROR, silent signal ve6000karakter sınırı kapsanır. node --check src/dub-service.js / git diff --check geçti. Hata tanısının onarımı eski üretimin kök nedenini geriye dönük kanıtlamaz; güncel kısa GPU üretiminin başarı kanıtı ayrı tutulur. CI sonucu devirde takip edilir. Yeni bağımlılık yok.

Sonuç: HEAD240162df run39233066926 Windows job117995465137 başarılı (8m29s); tam paket, Electron bridge ve syntax geçti. Ayrıntı docs/devir/2026-10-19-1259.md. PR456 ana sürüme henüz birleştirilmedi.
