# Rapor 586 — Telaffuz sözlüğü ve videoya bağlı hazır dublaj

25 Ekim 2026. Dal `codex/dub-quality585`, başlangıç `84357cdd450b76c6b351dc7fca51367228bc8ddf`, ürün bitişi `92f4e927016645d2597bacc1df21b2fe23c008bd`. PR490, Rapor585'in gerçek GPU karşılaştırması ve kalite düzeltmelerini de içerir. Kullanıcı bu paketin ana sürüme alınmasını açıkça onayladı.

## Doğrulanan sorunlar ve uygulama

1. Kalite grubundan metin düzenleyicisine geçiş yalnız odağı taşıyordu; kapalı üst `details` elemanları açılmadığından cümle görünmüyordu. Eşleşen grup seçilince üst paneller açılır, metne odaklanılır ve görünür alana kaydırılır. Mevcut grup dinleme ve Rapor585'in kontrol nedeni/metin kartı korunur. Planı henüz yüklenmemiş bir kayıt düzenlenebilir planmış gibi sunulmaz.
2. `latestDub()` tüm videolar için son sesi döndürüyordu. Yeni işte kaynak kimliği kaydedilir; hazır kayıt aynı kaynak özetiyle aranır. YouTube watch/youtu.be/shorts/embed adresleri video kimliğinde birleşir; Windows dosya yolları sürücü/ayraç ve harf farkından etkilenmez. Başka videonun kaydı elenir. Kaynak URL veya dosya yolu yerine SHA256 özeti tutulur. Mevcut çıktı yetkilendirme, dosya ve senkron haritası kontrolleri korunur.
3. Video değişince önceki `output` ve ses önizlemesi temizlenmiyordu. Artık temizlenir; bekleyen kayıt yanıtı eski video bağlamındaysa yok sayılır. Eşleşen hazır çıktı yüklenirken kayıtlı başlangıç/bitiş aralığı geri gelir. Kayıt geri çağırmak sesi kendiliğinden bağlamaz.
4. Telaffuz düzeltmesi için ayrı ve kalıcı sözlük yoktu. Ses ve motor ayarlarında satır başına `Newton = Nyutın` girilip kaydedilebilir. En fazla 100 kayıt; yinelenen/boş/denetim karakterli/geçersiz giriş reddedilir. Harf duyarlı, sözcük sınırında, en uzun eşleşme öncelikli ve tek geçişli değiştirme yapılır; regex çalıştırılmaz ve değişiklik zincirlenmez. Özgün SRT/metin değişmez.

## Ses üretimi ve saklama sözleşmesi

`dub-settings.json` isteğe bağlı `pronunciations` listesi içerir; eski ayarlar boş listeyle uyumludur. Kayıtlı referans değişimi sözlüğü silmez. Yetkili `dub:pronunciations` IPC kanalı aktif üretim sırasında kaydı engeller. Üretim sözlüğün kopyasını sahipliği alınmış `.pronunciations.json` çıktı yan dosyasına yazar; Python'a Windows komut satırını büyüten JSON yerine yalnız dosya yolu verilir. İptal/hata temizliği mevcut sahiplik sözleşmesini izler.

VoxCPM2'ye verilen metinde ve ASR'nin beklediği okunuşta aynı sözlük uygulanır; sayısal doğrulama özgün metne bağlı kalır. Normal kaynak/kalite metni korunur. Eski önbellek sürümü değiştirilmedi. Yalnız metninde sözlük eşleşmesi bulunan grubun önbellek kimliği değişir; diğer grupların kimliği aynı kalır. Aşırı uzun cümlenin iç bölünmesinden önce okunuş uygulanır.

Kaynak kimliği olmayan eski üretimler güvenle videoya eşleştirilemez; otomatik geri çağrılmaz. İş kimliğiyle proje yükleme ve elle ses seçme devam eder. Bu tur ses paneli/dublaj ve aynı servis üzerinden kitap üretimi içindir; dış motorun eski bağımsız masaüstü arayüzü değiştirilmedi. Telaffuz metinsel bir kullanıcı düzeltmesidir, otomatik duygu veya doğallık garantisi değildir. Rapor585'teki akıcı gruplama varsayılanı ve model parametreleri korunur; dinleme tercihi beklenir.

## Dosyalar ve kanıt

- `src/dub-pronunciation.js`, `tools/voxcpm2/dub_pronunciation.py`: sınırlı doğrulama, konuşma dönüşümü ve gruba özgü cache kimliği.
- `src/dub-source-identity.js`: URL/yol kimliği ve özetleme.
- `src/dub-service.js`, `src/preload.js`: güvenli sözlük kaydı, üretim kopyası ve kaynak filtreli çıktı sorgusu.
- `tools/voxcpm2/altyazi_oku.py`: isteğe bağlı sözlük argümanı, ses/ASR ve etkilenen cache entegrasyonu.
- `src/renderer/browser-dub-ui.js`, `dub-generator-ui.js`, `index.html`, `media-experience.css`: kaynak bağlamı, geç yanıt koruması, aralık geri yükleme, görünür grup geçişi, EN/TR sözlük arayüzü.
- `tests/dub-pronunciation.test.js`, `dub-source-restore-ui.test.js`, `dub-service.test.js`, `dub-generator-ui.test.js`, `electron-dub-runtime.smoke.js`, `backend/test_dub_pronunciation.py`: ilgili davranışları doğrular.

Hedefli Node kontrolleri: sözlük/kimlik, servis, UI, geç yanıt/kaynak/aralık, CSP (5 alt test), preload kullanım ve sandbox geçti. Python sözlük, audition, sayılar ve deyim kontrolleri toplam **15 test**; sözdizimi ve diff kontrolleri geçti. Native Windows Electron ayrı profilinde exit0: `.uiprev/dub-runtime/1792950400401-3448`, koyu TR 1300×950 ve açık EN 900×800/%125 ekranları incelendi, yeni alanda taşma yok. Motor olayları kontrollü fixture'dır; bu görüntüler GPU veya gerçek ses kalitesi kanıtı değildir.

İlk test düzenleme betiğinin Windows varsayılan kodlaması iki testte Türkçe metni bozdu. Ürün dosyaları etkilenmedi; testlerin özgün UTF-8 içeriği Git'ten okunup yalnız amaçlanan değişiklikler açık UTF-8 ile uygulandı, ilgili testler geçti. İlk kimlik testi Windows yolunun URL yapıcısınca sürücü şeması sayıldığını yakaladı; yol normalleştirmesi URL ayrıştırmadan önceye alındı. Yanlış CSP dosya adıyla ilk komut çalışmadı; doğru `csp-policy.test.js` geçti. İlk birleşik Python komutunda `PYTHONPATH` eksikti; doğru backend yolu ile yeniden koşuldu. Bunlar başarılı koşulara dahil edilmedi.

Yeni bağımlılık/kurulum değişikliği yok; start.bat/install.bat, CUDA kurulumu ve kilit dosyası aynı. Bu tur yeni sözlükle gerçek GPU üretimi, ücretli sağlayıcı veya kullanıcının açık programında yeniden başlatma denenmedi; Rapor585'in gerçek GPU kanıtı ayrı tutulur. Tam suite/uzun CI beklenmez; bilinmeyen sonuç başarılı sayılmaz. Ana kopyanın üç kişisel belge değişikliği, untracked dosyaları ve açık uygulama korunarak güncelleme yapılacaktır.
