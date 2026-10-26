# Claude için dört bağımsız read-only denetim

Sabit kaynak: `96b204f12dbf300edcc65756a6207ce5eca9d703`. Ana ZIP yalnız kaynak ve paket doğrulama belgelerini içerir; dört görev dosyası bilerek ZIPin dışında tutuldu. Her yeni sohbete aynı ana ZIP + yalnız bir görev .md dosyası yükle. Görev metni gerekli global promptu içinde taşır; ayrı globalprompt yapıştırmak gerekmez.

Görevler:01ses/dublaj,02çeviri/Whisper,03kitap/PDF,04browser/asistan/tasarım. Ortak altyapıyı ihtiyaç kadar okuyabilirler ama atanmış görev dışını başlatmazlar. Keşif sırasında ortak kök çıkması mümkündür; bu raporlarda duplicate/cross_scope ile ayırt edilir.

Kopyalanacak mesaj: “Ekteki kaynak ZIPini aç ve yalnız ekteki TASK görevini uygula. Görev dosyasındaki global kurallar geçerli: ürün kodu/test/ayar değiştirme; patch/commit/push yapma. Ayrıntılı denetim/test yap, bulgu ve geliştirme önerilerini kanıtlarıyla bir rapor ZIPinde ver. Bu teslim Codex tarafından incelenecek.”

Kaynaklar Gitcommitten birebir alınır; kişisel çalışma ağacı değişiklikleri yoktur. MANIFEST.json her kaynak dosyasının boyut/SHA256 listesi; SNAPSHOT.json paketkimliği ve eksikler. Ek kontrol belgeleri kaynak dosyası değildir. İlk/son manifest doğrulaması zorunludur.

UI için terminal Electron/xvfb/CDP mümkündür;bulut localhost önizlemesi yasaktır. Ortam/bağımlılık engellerini başarı diye sunma. Testlerin çoğu terminalle koşabilir;GPU/model/Windows/DRM ortamı yoksa açık engel yaz.
