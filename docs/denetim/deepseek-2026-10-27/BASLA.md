# Başlangıç — altı görevin koordinatörü

Kaynak D:\Whisper Local. GLOBAL-KURALLAR.md'yi oku, bu denetimde ürüne/mevcut testlere dokunma. Kaynak ZIP gerekmiyor, mevcut yerel dosyaları kullan. Tek bir plan yazıp bırakma: görevleri gerçekten çalıştır.

Başlangıç revizyonu, kaynak SHA-256'ları ve kişisel çalışma ağacı durumunu kaydet. Benzersiz ana çıktı klasörü docs/raporlar/DEEPSEEK-AUDIT-<UTC-run-id>/ oluştur. Her görev için task01…task06 alt klasörünü kullan; başka oturumların çıktılarını değiştirme.

01-ASISTAN-ARAC-KOMUT-BAGLAM.md ile başla, sonra 02,03,04,05,06 sırayla. Ortak kurallar her dosyada gömülü. Her görev sonunda rapor/checkpoint kaydet ve kullanıcıdan yeniden devam cevabı beklemeden sonraki göreve geç. Araç/bağlam limiti yaklaşırsa kesin sonraki komut/dosya/eksik kanıtı CHECKPOINT.md'ye yaz; yapılmayanı bitmiş sayma. Tek bağımlılık engeli bütün işi bırakma nedeni değildir.

Toplam 72 üst başlık vardır; her birine gerçek kanıtlı statü veya somut engel ver. Her başlık bug bulmak zorunda değil. Sayısal bug hedefi yok. Aynı köke tek finding id ve duplicate_of kullan. Araçlar izin vermiyorsa screenshots/Electron/GPU/gerçek site için dürüst NOT_RUN/BLOCKED_ENV ver; fixture başarısını onlara eşitleme.

Altı görev sonunda:
1. Ana AUDIT-REPORT.md oluştur. Gerçek kökleri önem ve kullanıcı etkisine göre sırala; şüpheler, çürütülenler, engeller ve geliştirme fikirleri ayrı olsun. Kaynak değiştirmeden onarım yönü öner; patch üretme.
2. Birleşik FINDINGS.json ve TASK-MATRIX.csv, RUN-LOG.jsonl, REPRODUCE.md, SNAPSHOT.json oluştur. Alt görev kanıtlarına göreli link ver. Bütün başlıkların durumunu ve gerçekten koşulan senaryo sayısını hesapla; mükerrer test/bugları şişirme.
3. Kendi çıktı dosyalarının boyut/SHA-256 listesini MANIFEST.json'a yaz. ZIP kendisini veya kişisel verileri içermesin; node_modules/venv/model/medya ekleme.
4. Ürün, mevcut testler, ayar/lock dosyalarını kendin değiştirmediğini başlangıç/bitiş hash/diff ile doğrula. Başkasının editini geri alma. .uiprev/tmp test artifactleri ile rapor/probe dosyalarını ayrı belirt.
5. Yalnız bu koşunun çıktılarından DEEPSEEK-AUDIT-<id>.zip üret. Kullanıcıya ana ZIPin tam yolu, doğrulanan benzersiz kökler, riskler, eksikler ve kaynak değişmezliği kanıtını ver. Codex'e mesaj gönderme.
