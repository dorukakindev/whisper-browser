# Rapor556 — Sıcak ses motorunda başlatma hatası ve eski iş sahipliği

2026-10-25 07:04 Europe/Istanbul; repo https://github.com/dorukakindev/whisper-browser; codex/book-reliability549/PR487. Başlangıç71329eb0ff96b9593166ffa106540bb7a87a9c29; ürün bitiş **36183c627a5a568865df467c0489fc118d98e534**.

## Kanıtlanan hatalar

`src/dub-engine-worker.js` child spawn ENOENT, await start() sonrası uygulama run dinleyicileri kurulmadan EventEmitter error/close yayabiliyordu. Gerçek eksik çalıştırıcıyla ayrıNode sürecinde önce `UNCAUGHT spawn ... ENOENT`, düzeltme sonrası `LISTENERS / RUN_ERROR ENOENT / CLOSE1` gözlendi. Bu hata sonparça takılmasının bütün nedenlerini açıklamaz; gerçek başlatma yolundaki istisnadır.

Başlatma error ve native close iş olayları setImmediate ile abonenin bağlanmasından sonraya alınır; child/host sahipliği korunur. Eski host stderr/error/stdin error yeni işe aktarılmaz. Eski run.kill aynı sıcak host yeni işte kullanılsa bile onu öldüremez. Completion callback içinde hemen yeni iş başladığında eski idle timer o aktif işi durdurmaz. Senkron stdin.write hatası yakalanıp iş hata/terminate/close akışına gider; unhandled istisna yaratmaz. İptal başarısızsa worker sahipliği korunur; sahte tamamlanma yok.

`tests/dub-engine-worker.test.js`: gerçek ENOENT altNode süreci; tekrar kullanım, crash/restart, geç emekli süreç olayları, eski run.kill, completion içinden yeni iş/idle, senkron pipe hatası.4hedefdosyalık koşuda9PASS/0FAIL (`tmp/final556.log`): worker, dubservice yetki/tek-iş/iptal, generator ve browseraudio. Syntax/diff geçti. UI/şema/dependency/kurulum değişmedi. GerçekPython model/GPU üretimi, kişiselstart.bat,11:55 uyanışı, liveYouTube ve uzakCI denenmedi. Son61/61 gibi şikâyetin hepsi çözüldü denmez; sonraki aşama Pythonadaptör/verification kapanışının süre kayıtlarından incelenmesi.
