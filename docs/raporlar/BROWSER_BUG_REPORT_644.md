# Rapor 644 — Kitap açılışı ve asenkron render sahipliği

Başlangıç `40af3abddab2920799ec9ab4b31e1e1d95a0310b`; ürün `8deda00bb553c3c940aaa9ba6e5b83faa9fb5ba2`. İlişkili açılış/render hataları, test sayısı kadar yeni bug değildir.

## Kırmızı kanıtlar

Tam renderer modülü JSDOM'da gerçek dialog/editör ve kontrollü IPC ile çalıştırıldı:

1. `openProject()` referans/config beklerken resolve oluyordu; düzenleyici ve asistan bağlamı henüz yokken açılış tamam sayılıyordu.
2. İki kitap isteğinde eski `book-open` cevabı geç gelirse yeni kitabın üzerine yazıyordu (`one !== two`).
3. Kullanıcı proje seçerken aynı body temizleniyordu; önceki `books()` await sonrasında aynı body'ye devam ederek iki textarea çiziyordu (`2 !== 1`).

Bu üç repro eski kodda doğrudan kırmızıydı. Ayrıca kapanış sırasında asistanın open işleminde completed döndürmemesi denetlendi. O testin erken fixture'ında `book-save` yanıtında project alanı eksikti; gerçek sözleşme tamamlandı, fixture hatası ürün bugı diye sayılmadı.

## Düzeltme

- `clearBody` sürümü ile `books` exact dialog/project/chapter/render sürümünü yakalar; book-list, dubConfig ve references dönüşlerinde geç render elenir. Eski gövde güncel ekrana yazamaz.
- Açılış kendi `renderReady` promise'ini döndürür. Public `openProject` son istek kazanır kuralını uygular; kaynak/ekran değişmişse reddeder, gerçekten tamamlanmış editörü bekler. Config/render hatası kendi dialogundan iletilir, yeni dialogun hatası kullanılmaz.
- Native close olayı queued olduğu için önceki dialog kaynakları yeni project atanmadan senkron ve idempotent temizlenir. Geç close yeni asistan bağını/okuyucuyu kapatamaz.
- Asistanın bölüm açma/seçim adaptörleri aborted render sonucunu completed saymaz. Dinle/yeniden üretme eylemlerinin tüm yarışları bu pakette ayrıca doğrulanmış sayılmadı.

## Kontroller

-7yeni davranış kontrolü: hazır editör, son istek, duplicate DOM, kapanış, queued close, gerçek render hatası, asistan yanlış başarı. Hepsi geçti.
- İlgili reader navigation/PDF lifecycle/regenerate/passage/command ile21/21. Son iki satırlık hata-sahipliği netleştirmesinden sonra yeni7/7 tekrar geçti; syntax/diff temiz.
- Native Windows mevcut asistan→PDF kaynağı→kitap üretimi→partial kalite→review pagination akışı exit0; `.uiprev/book-quality636/1793091686419-12244`. Kontrol gerçek main/preload/UI kullanır, WAV/quality sentetiktir. Layout değişmedi; yeni tasarım iddiası yok.

Yeni bağımlılık veya kalıcı şema yok. Kişisel profil/app kapatılmadı. Gerçek GPU/model/YouTube/normal start.bat açılışı ve büyük çok-bölüm kaynak ölçümü yapılmadı. CI beklenmez. İlgili1000plan araç maddeleri yalnız open yolu sınandığı için kısmi tutulur.
