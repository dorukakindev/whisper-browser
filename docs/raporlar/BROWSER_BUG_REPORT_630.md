# Rapor 630 — Yerel DeepSeek / Claude Code denetim görev paketi

2026-10-27. Başlangıç master `15d9f38aed4ae5f969bdecf0773adf7aa25acf50`. Bu iş yalnız belgedir; ürün kodu değişmedi. Son ürün düzeltme kimliği önceki `e2a568e926864824930e1c104d0d6c594024e6ab` olarak kalır. Yeni bug/test başarısı iddia edilmez.

Kullanıcı doğrudan yerel dosyaları okuyabilen DeepSeek/Claude Code için test görevleri istedi. `DeepSeek-Baslat.cmd` yalnız bir PowerShell sarmalayıcısı olarak okundu; başlatıcı veya yanındaki ayar/anahtarlar değiştirilmedi/okunmadı. Gerçek model konfigürasyonu bu işte doğrulanmadı.

Teslim: [Görevler](../denetim/deepseek-2026-10-27/README.md), [başlangıç](../denetim/deepseek-2026-10-27/BASLA.md). Altı alan: asistan, çeviri/Whisper/dublaj, kitap/PDF, keşfet/katalog/Letterboxd, Browser/reklam/tasarım, IPC/süreç/dosya. Her biri 12 sınama sorusu: toplam72. Bu sayı bug ya da yürütülmüş test sayısı değildir.

Global sözleşme her görevde gömülü: ilgili çağrıları gruplama, gerçek exit/stderr/timeout kaydı, mevcut harness kullanımı, yeni minimal repro, kanıtlı statüler, kaynak snapshot/hash, duplicate kök ayrımı, Windows izole profil, UI screenshot ve sınırlı hedefli test yaklaşımı. Ürün/mevcut test değişikliği, commit/push/merge, kişisel profil/anahtar/medya ve ücretli canlı servis kullanımı bu dış denetime kapalıdır. Rapor629 düzeltmeleri yeniden üretilmeden yeni bug sayılmaz.

Rapor, JSON findings, CSV matris, JSONL komut logu, reproduce, snapshot ve checkpoint zorunludur. Tek sohbet BASLA ile sırayla tüm görevleri yürütebilir; ayrı sohbetlerde yalnız birer dosya atanabilir. Çakışan native/GPU işleri paralel yapılmaz. Çıktı benzersiz klasörde ve yalnız kendi dosyalarını taşıyan ZIPte verilir.

Belge doğrulaması: altı görevde 12'şer başlık; global sözleşmenin tam gömülmesi, göreli linkler, JSON, UTF-8/bozuk karakter, SHA-256 manifest ve ZIP CRC/11dosya geçti. Yerel ZIP `D:\Whisper Local\artifacts\deepseek-audit-2026-10-27\DeepSeek-6-Derin-Test-Gorevi.zip`: 45.528 byte. Kaynak ZIP'i değil görev paketidir; kod diskte okunur. Ürün testleri/native UI/API/GPU/launcher bu belge işi için koşulmadı. İlk paket oluşturma scriptindeki tek tırnak hatası dosya yazmadan kaldı; dosya tabanlı builder ile düzeltildi. ZIP root artifacts altında, Git teslimi belgeleri içerir.
