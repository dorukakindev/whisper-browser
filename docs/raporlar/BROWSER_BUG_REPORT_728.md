# Rapor 728 — Dinlenen ses sürümüne bağlı kitap onayı

## Doğrulanmış iki açık

1. Renderer eski kitaba dönmeyi artık engellese de servis yalnız grup anahtarını kabul ediyordu. Aynı anahtarla yeni ses üretilirse eski onay yeni, dinlenmemiş sesi hazır yapabiliyordu. Regresyon gerçek servis/capture yolunda önce `true !== false` verdi.
2. Kopyalanmış bölüm WAV'ının örnekleri dışarıdan değiştirildiğinde, `book-approve` yeni içeriğin hash'ini alıp dinlenmiş gibi onaylıyordu. M4B dışa aktarımı bunu sonra reddediyordu; kullanıcıya onay başarılı gösterilmesi yanlıştı. Aynı ikinci regresyon da önce `true !== false` verdi.

## Uygulama

- `src/media-workflows.js`: onay isteği zorunlu `outputId` ve `textHash` taşır. Servis güncel bölümle ikisini eşleştirir. WAV'ın gerçek hash'i mevcut içerik adresli dosya adındaki kimlikle eşleşmeden ready/manualApproval yazılmaz. M4B'deki aynı mevcut hash sözleşmesi tekrar kullanıldı; önceki sürümleri ve kişisel sesleri silmez.
- `src/renderer/media-workflows-ui.js`: onay kartının dinlenen çıktısı ve metin hash'i servis isteğine eklenir. R727 sahiplik koruması devam eder.
- `tests/book-review-revision728.test.js`: eski ses/yeni aynı grup anahtarı, dışarıdan değiştirilmiş PCM ve sürüm taşımayan isteğin reddi. Güncel geçerli sürümün onayı da doğrulanır.
- Üç mevcut kitap testi yeni zorunlu revizyon alanlarını taşır; negatif süre/grup ve dışa aktarma kapıları korunur. Test eşiği gevşetilmedi.
- `tests/electron-book-gpu.smoke.js`: açık `--run-real-gpu` ve referans/engine parametreleriyle çalışan, kendi profiline yazan kitap üretimi/tek grup onarımı kabulü hazırlandı. İki gerçek iş, cache sayıları, ilk grubun metin/zamanı ve M4B/review kapısını denetlemeyi amaçlar. **Üretim gövdesi bu turda çalışmadı ve doğrulandı sayılmaz.**

## Kanıt ve gerçek engel

12 hedefli Node testinin tamamı, JS syntax ve diff kontrolü geçti. Ayrı Windows profilinde mevcut sentetik PDF/WAV kabulü exit 0: gerçek fareyle doğru onay, diskte ses hash'i ve sonraki gruba odak, eksik doğrulamada M4B reddi. UI düzeni bu pakette değişmedi; R727 kart görünümü korunur.

GPU kabulü exit 3 `BLOCKED_ENV` döndürdü: başka iş çalışırken gözlenen boş bellek yaklaşık 7,7 GB idi. Test, çakışan yüklemeyi zorlamamak için 9500 MiB boşluk eşiği kullanır; bu eşik ürünün evrensel minimum GPU gereksinimi değildir. Başka süreç durdurulmadı, kişisel profil veya API kullanılmadı. Bu nedenle yeni TTS/cache/M4B kalite sonucu ve P069 gerçek yeniden üretim kabulü açık kalır. Sonraki adım GPU boşken aşağıdaki komutu çalıştırmak ve gerçek çıktıya göre kalan hataları gidermektir.

```powershell
node --test --test-isolation=none tests/book-review-revision728.test.js tests/book-reliability.test.js tests/book-quality-scope636.test.js tests/book-audit612.test.js tests/book-review-owner727.test.js
# Yalnız yetkili/sentetik bir referans kullan; başka GPU işini durdurmaz.
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-book-gpu.smoke.js --run-real-gpu --reference <sentetik.wav> --transcript <sentetik.txt> --engine <VoxCPM2-klasörü>
```

İlk yeni test hazırlığında varsayılan çok kısa WAV seçilmişti ve yanlış sebeple reddediliyordu; bir saniyelik geçerli fixture seçildikten sonra iki gerçek hata kırmızı olarak yeniden doğrulandı. Başlangıçta bu hazırlık sonucu ürün başarısı sayılmadı. Mevcut 11 before-quit listener uyarısı sürer.

## Sınırlar

Yeni bağımlılık/kurulum veya kalıcı proje şeması yok. Onay IPC isteğinin sürüm alanları zorunlu hale geldi; repo içindeki gerçek istemci ve ilgili test çağrıları birlikte güncellendi. Eski içerik kimliği olmayan bölüm dosyası güvenle onaylanamazsa açık hata verir; yeni üretim gerekir. Mevcut içerik hash'i/filename sözleşmesi yeniden kullanıldı; dış kaynak kod alınmadı. GPU/insan dinlemesi/canlı sağlayıcı/YouTube/DRM/BAT başlangıcı/tam paket/CI sonucu doğrulanmadı. CI kapatılmadı, beklenmedi. Müzik hedefleri kapsam dışı; 90 aktif hedef tamamlanmış sayılmadı.
