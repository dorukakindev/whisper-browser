# Keşfet kartlarında doğrudan izlenme kaydı

Başlangıç `fa135079e1c878a643b36814361a7a97b6ab143a`; ürün `4a2a9fe549f61c6bc82413b557966bb1e2c8f9e1`.

Film/dizi kartında sağ tık veya Shift+F10/ContextMenu: **İzledim / Watched**, **İzleyeceğim / Want to watch**. İlk seçenek completed; ikincisi planned kaydını mevcut kişisel medya önizleme/token/apply hattıyla tam kind/IMDb kimliğine işler. Bu menüdeki açık seçim uygulama onayıdır; ek asistan onay kartı istemez. Kayıt yoksa mevcut doğrulanmış metadata akışı kişisel kütüphane kaydını oluşturur. Beğeni/not/ses/diğer bölüm durumlarına dokunulmaz; dizi seçeneği dizi düzeyi kayıttır, tek tek bölümler izlenmiş sayılmaz.

Menü kenarlarda taşmaz, Escape ve ok tuşlarını destekler; dışarı tıklama/kaydırma/yeniden boyutlandırma/Keşfet'ten ayrılma kapatır. Aynı yapımda çift yazım engellenir. Hata başarı diye gösterilmez; ağ eşitleme başarısızsa kişisel kaydın başarı durumu ayrı belirtilir.

Önce [görsel taslak](concept.png) ([HTML](concept.html)) render edildi. Sonra mevcut grafit/amber temayla uygulandı. [Gerçek Windows geniş](menu-1440.png), [480 CSS px](menu-480.png). Fixture katalog afişleri kontrol ağında bilerek yoktur; canlı katalog veya afiş testi iddiası değildir.

11/11 hedefli test: `node --test --test-isolation=none tests/discovery-card-watch-menu.test.js tests/personal-media-state.test.js`. Syntax/diff kontrolü geçti. İzole gerçek Electron'da 1440/480 sınır kontrolleri; planned ve completed değerleri diskteki katalogdan ayrı ayrı doğrulandı. İlk native kontrol testin eski store önbelleğini okuduğu için timeout verdi; disk kaydı planned idi. Kontrol diskteki kayda çevrildi ve geçti; ürün hatası veya geçmemiş kontrol başarı diye sunulmadı. Kullanıcının açık uygulaması/kişisel profili kullanılmadı. Canlı dış ağ, API, GPU, tam suite/start.bat ve Actions çalıştırılmadı. Yeni bağımlılık yok; EN/TR etiketler var.
