# Rapor 639 — Kitap sesinin güncel iş sahibine bağlanması

Başlangıç `eec3c46e8422c21fe11a84231ad73d668e04ffde`. Tek doğrulanmış kök hata; iki tamamlanma sırası aynı hatanın kabul koşullarıdır.

## Kanıt ve düzeltme

`book-prepare` aynı metindeki bölüm için iki farklı iş hazırlayabilir. `capture` yalnız metin hash'ine bakıyordu: eski sonuç önce gelirse yeni `activeJob` kaydını kapatıyor, sonra gelirse yeni `lastOutputId` ve ses seçimini eziyordu. Gerçek servis üzerinde kontrollü WAV ile ilk regresyon, yeni iş sahipliği kaybolduğu için kırmızıydı. İlk test kurulumunda eksik PDF başlığı yüzünden alınan `Invalid project` ürün bulgusu değildir; fixture düzeltilerek gerçek sahiplik hatası yeniden üretildi.

`capture` artık dosya kopyalamadan önce `c.activeJob.id === output.id` şartını arar. Eski iş güncel sesi, kaliteyi veya etkin iş kaydını değiştiremez. Yeniden açılıştaki kurtarma yolu mevcut activeJob kimliğiyle çalışmaya devam eder.

## Kontroller

- `node --test --test-isolation=none tests/book-capture-owner639.test.js tests/book-quality-scope636.test.js tests/book-voice-takes.test.js tests/book-reliability.test.js tests/book-production-plan.test.js tests/book-audit612.test.js`: 10 geçti, 1 planner kontrolü sandbox Python çalıştıramadığı için atlandı.
- Proje Python'u ile sandbox dışında `book-production-plan`, `book-bookmarks`, `book-export`: 9/9; gerçek Windows ffmpeg iptali, farklı örnekleme hızları ve M4B metadata kontrolleri dahil. İlk sandbox denemesinde üç ffmpeg kontrolü ortam erişimi nedeniyle kırmızıydı; aynı testler izinli çalıştırmada geçti.
- `node --check src/media-workflows.js`, `git diff --check`: geçti.

UI değiştirilmedi; yeni görsel doğrulama gerekmiyor. Kontroller gerçek model, GPU, YouTube veya işitsel kalite kanıtı değildir. `start.bat` değişmedi ve bu pakette yeniden çalıştırılmadı. Yeni bağımlılık ve kalıcı şema yok. CI beklenmez. 1000 hedefin kalanları açık tutulur.
