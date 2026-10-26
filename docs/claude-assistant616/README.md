# Claude'a verilecek tek araştırma paketi

Önce `TASK-ASSISTANT-RESEARCH.md` dosyasını uygula. Paket tek kapsamlı görevdir; aynı ZIP'i farklı sohbetlere tam görevle verirsen aynı işi tekrar ederler. Araştırma ve uygulama şartnamesi isteniyor; ürün kodu değiştirmek yasak.

`source/` güncel Git kaynak snapshot'ıdır. `SOURCE-MAP.md` başlangıç haritası; `SNAPSHOT.json` HEAD ve dosya sayısını; `MANIFEST.json` kaynak dosyalarının SHA256 değerlerini içerir. Bağımlılıklar/model/venv/kişisel veri yok. Doküman geçmişi hacim için seçildi; eksikler EXCLUSIONS.json'da. İnternet araştırmasını Claude yapacak; bu paket, önerilen dış repoların araştırılmış/doğrulanmış olduğu iddiası değildir.

Sohbete yapıştır:

> ZIP'i aç. TASK-ASSISTANT-RESEARCH.md içindeki bütün bölümleri uygula. Bu bir salt-okunur kaynak denetimi ve derin internet/GitHub araştırmasıdır; ürünü değiştirme. Mevcut asistanın bütün programa hâkim araç sistemi olması için kod kanıtlı, dosya/fonksiyon/şema ve kabul testleri düzeyinde uygulama dökümü hazırla. Sonuçları görevdeki dosyalarla tek teslim ZIP'i olarak ver. README ile yetinme; gerçek kod ve güncel birincil kaynakları incele. İnternet veya çalışma ortamı engellerini açık kaydet, erişemediğini okumuş/başarmış gösterme.
