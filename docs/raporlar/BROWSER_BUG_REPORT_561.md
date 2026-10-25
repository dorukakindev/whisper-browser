# 561 — Metin değişince eski kalite grubunu zorla üretme

Doğrulanan yol: kitap kalite satırı `generate(false,[g.key])` çağırıyor, bölüm düzenlenip kaydedildikten sonra da eski `key` yeni SRT'ye uygulanıyordu. Yeni metin yeniden parçalara ayrıldığında aynı sıra anahtarı başka konuşmayı hedefleyebilir. Ayrıca açık kalite listesinden gelen çıktı kimliği denetlenmiyordu.

`book-prepare` artık bir grup denemesi için kalite satırının anahtarını ve renderer'a verilmiş çıktı dosyası adını doğrular. Çıktı/grup değişmişse yeni iş kaydı oluşturmadan reddeder. Sesin metin hash'i güncel metinle aynıysa yalnız seçilen anahtarı zorlar. Metin değişmişse eski sıra numarası kullanılmaz: güncel SRT ve ses önbellek kimlikleri hangi parçaların üretileceğini belirler. UI bunu EN/TR açıklama ve aşama mesajıyla bildirir.

Bu, değişiklikten bağımsız her durumda yalnız tek grup üretme garantisi değildir. Yeniden gruplama/seed/bağlam kimliği değiştiğinde birden fazla parça üretilebilir; amaç eski numarayla ilgisiz grubu zorlamamak ve uyumlu sesi önbellekten kullanmaktır. Gerçek GPU cache-hit oranı ölçülmedi.

Kanıt: gerçek servis testinde aynı metin/seçilen grup; değiştirilmiş metin/boş forceGroups ve güncel SRT; bayat çıktı/bilinmeyen grup reddi ve iş kaydının korunması. UI gerçek generate fonksiyonu bütün bölüm, aynı grup ve düzenlenmiş grup yanıtını kapsar. Dört hedef dosyada10 sonuç geçti; syntax/diff temiz.

Native Windows `electron-book-reliability.smoke.js`: editöre giriş eklenip gerçek kalite düğmesine basıldı, renderer/preload/main üzerinden motor sınırına gelen istekte `forceGroups: []` doğrulandı. Model çalıştırılmadan kontrollü hata cevabı verildi; kaynak ve editör taslağı testte geri alınıp PDF/Review/M4B akışı tamamlandı, exit0. Kanıt `.uiprev/book-reliability549-1792902675902`; açıklamanın görüntüsü önceki1792902523189/review-before.png içinde incelendi. İlk ek native deneme, fixture'ın dışarıdan kaynak metnini geri alıp açık editör taslağını geri almaması nedeniyle `Current audio required` ile düştü; test verisi düzeltildi, ürün kapısı gevşetilmedi. Önceden görülen bütün sporadik Review sorunları çözüldü denmez.
