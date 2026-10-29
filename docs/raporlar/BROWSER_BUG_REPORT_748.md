# Rapor 748 — Caption timeout sonrasında gerçek kapanış sahipliği

## Doğrulanan hata

`runMediaCommand` timeout anında taskkill isteği gönderip hemen promise ve asistan iş kaydını sonlandırıyordu. OS kapatmayı doğrulamadığında process slotu canlı kalıyor, fakat iş kaydı terminal olduğu için kullanıcı aynı işi tekrar durduramıyordu. Hata metni de süreç kapanmış gibi konuşuyordu. R638'in explicit Stop/başarısız-stop-onayı düzeltmesi bu timeout yolunu kapsamıyordu; eski bulgu yeniden sayılmaz.

[Parent testi](evidence748/parent-timeout.txt) bu farkı kanıtlar: çocuk canlı ve stop başarısızken timeout isteği erkenden settle oluyordu. Son testte hem subs hem probe yolu aynı invariant ile sınanır.

## Uygulama

- `src/main.js`: probe/subs deadline, mevcut asistan job ledger üzerinden yalnız o çocuğun mevcut terminateProcessTreeAndWait yolunu kullanır. İş/IPC/slot gerçek close'a kadar tutulur. Native stop doğrulanamazsa mevcut ledger running+stopFailed+cancellable durumuna döner; aynı ID tekrar durdurulabilir. Yeni yardımcı iş aynı slotu çalamaz.
- Timeout niyeti korunur: sonradan gelen başarılı subs/probe sonucu kabul edilmez. Gerçek kapanışta code=timeout ve ledger failed/failureCode=timeout. Explicit Stop ise stopped/cancelled kalır; kapanmadan durdu denmez.
- Yeni timeout kapanış iletisi EN/TR'dir; mevcut explicit iptal yanıtı da geçerli arayüz dilini izler. Ham günlük veya kişisel yol ledger'a eklenmez.
- `tests/assistant-media-stop638.test.js`: iki yeni parametreli timeout regresyonu; başarısız ilk stop, tekrar aynı ID, slot korunumu, geç başarılı sonuç reddi. Eski üç kontrol korunur.
- `tests/electron-caption-stop.smoke.js`: ayrı profil, gerçek main/preload/renderer, yalnız testin başlattığı Python ana/torunları. Deadline timer callback'i manuel erkene alınır; taskkill, çocuk kapanışı ve torun yokluğu gerçektir. Dış ağ ve model kapalıdır. Yeniden üretim: Electron ile bu dosya ve `--python <kurulu venv python.exe>`.

## Kanıt

[Hedefli Node sonucu](evidence748/targeted-tests.txt):6PASS/0SKIP;5stop testi ve1caption scheduler testi. Bunlar6yeni bug değildir. Syntax/diff PASS.

İlk birleşik sandbox testinde process-lifecycle gerçek spawn EPERM verdi; runner dış satırları pass görünse de bu gerçek süreç başarısı sayılmadı. Sonra `node tests/process-lifecycle.test.js` normal Windows yetkide doğrudan çalıştırıldı: exit0,9kontrollü kontrol +1gerçek parent/grandchild kontrolü, toplam10. Eşik/test kapatılmadı. Yeni native test de normal yetkide çalıştırıldı.

[Gerçek native sonuç](evidence748/native-results.json), exit0:
- Caption deadline: gerçek kapanış139ms, close öncesi cancelling, ana ve torun kapalı, final failed/timeout.
- Explicit Stop:158ms, close öncesi cancelling, ana ve torun kapalı, final stopped; EN yanıt Cancelled.
- Probe deadline:142ms, close öncesi cancelling, ana ve torun kapalı, final failed/timeout.

Bu süreler timeout kararı sonrası kapanış süresidir. Gerçek5dakika/30saniye beklenmedi; yalnız aynı timer callback'i erkene alındı. İlk native iki-mod denemesi de geçti; son üç-mod denemesi yukarıdaki kesin kanıttır. OS'nin gerçekten kapatmayı reddettiği koşul native olarak yaratılmadı; bu dal unit-kontrollü başarısızlıkla kanıtlanır.

[EN koyu Jobs görünümü](evidence748/caption-stop-jobs-en-dark.png) Windows'ta açılıp incelendi. Timeout güvenli açıklaması ve stopped/failed ayrımı mevcut ortak temada görünür. Yeni CSS/tasarım yapılmadı; TR ve dar ekran bu pakette ayrıca görüntülenmedi. Mevcut11 before-quit listener uyarısı açık.

## Kaynak ve sınırlar

Mevcut process-lifecycle/assistant-jobs kodu yeniden kullanıldı. [Node resmi close sözleşmesi](https://nodejs.org/api/child_process.html#event-close) exit/sinyal gönderimi ile stdio kapanışı ayrımını destekler; yeni dış repo kodu/bağımlılık eklenmedi. Yeni IPC/ayar/kalıcı şema yok, start.bat ve kişisel profil değişmedi.

Gerçek YouTube ağının5dakika takılması, Whisper/model/GPU, tüm iptal aşamaları ve insan ses kalite kabulü bu paketle doğrulanmaz. Medya download/Invidious/YouTube ayrı wrapper timeout yollarına genellenmez. Tam npm test/CI beklenmedi.90aktif hedef devam, müzik kapsam dışı.
