# DeepSeek için 1.000 senaryoluk gece denetimi

Kaynak kod yerelde okunur; bu ZIP kaynak değil görev paketidir. 50 ürün sınırı ×20 ayrı risk mekanizmasıyla1.000 planlı senaryo içerir. Her satır uygulanabilirlik kontrolünden geçmelidir. Bu rakam çalıştırılmış test ya da doğrulanmış bug sayısı değildir.

Mevcut Claude Code / DeepSeek başlatıcısına verilecek prompt:

> D:\Whisper Local\docs\denetim\deepseek-night1000-2026-10-27\BASLA.md dosyasını oku ve uygula. On paketin tamamını sırayla yürüt, ana kodu ve mevcut testleri değiştirmeden derin testler yap. Kendi probe/fixture/raporlarını oluşturabilirsin. Gerekli Playwright/test araçlarını resmî kaynaktan ayrı test ortamına kur; ürün bağımlılıklarını ve kişisel profili bozma. Her25 senaryoda checkpoint, her100de ara teslim oluştur. Aynı hatayı tekrar sayma, uygulanmayanı veya çalışmayanı açıkça işaretle. Sonunda buglar, geliştirme önerileri, gerçek test kanıtları ve yeniden üretim komutlarıyla tek ZIP ver. Sadece plan yazıp durma; dosyadaki yetki ve güvenlik sınırlarını koru.

Tek sohbet sırayla çalışsın. Ayrı sohbetler için farklı 01–10 görev dosyası verilebilir; global kurallar her birinde gömülü. Aynı makinede ağır native/GPU testlerini paralelleştirme. Diğer oturumun kaynakları değiştirmesi halinde snapshot'a yaz; reset yapma.

Görev CSV'sindeki status başlangıçta NOT_RUN'dır. Sonuçlarda NOT_APPLICABLE da kullanılabilir. Önceki şemadaki finding alanları geçerlidir: id/severity/status/title/impact/preconditions/actual/expected/locations/repro/evidence/root_cause/duplicate_of/minimal_fix_direction/related_tests. Bu paketin hazırlanmasında ürün testleri koşulmadı; sadece belge/CSV/ZIP bütünlüğü doğrulandı.
