# Rapor 624 — Asistan P07: kütüphane, keşfet, koleksiyon, yorum ve normal ayarlar

Başlangıç `fbc678ff4521822eecf292ccda7b9a1fdd8b37f4`; bitiş ürün `9f0c8b09b1fcc691f50de1051a122e0b0e9bcb65`.
Dal `codex/assistant-library624`; repo https://github.com/dorukakindev/whisper-browser.

## Teslim

18 araç eklendi (ortak katalog 54; hepsi aynı anda modele sunulmaz). Kütüphane araçları yalnız library bağlamında; keşfet/zevk profilinin kaynak türleri artık doğru library sınıfındadır. Global gezinme ve normal ayarlar ayrı, oynatma yalnız görünür medya bağlamındadır.

- Katalog arama: query/kind/status/genre filtreleri, 8 sınırlı sonuç ve toplam; dosya yolları/oturumlar/afiş payload'ları modele gitmez.
- Keşfet arama: mevcut Cinemeta servisi; 10 sonuç, gerçek `discovery:kind:tt…` kimlikleri. Yapım ayrıntısı ve mevcut ayrıntı ekranı açma, keşfetten izleneceklere ekleme (video indirmez), mevcut servisle Türkçe konu çevirisi.
- Zevk profili: kaydedilmiş puan/tercih ve sınırlı yorum kanıtı; varsayılan ağırlıklar açık kişisel tercih diye sunulmaz. Tüm eser izlenmiş/okunmuş sayılmaz.
- Koleksiyon planı/oku/uygula: 1–20 gerçek `catalog:ID` ile adlandırılmış ekleme/üyelikten çıkarma planı. Plan yalnız bellekte, 10 dakika, göndericiye bağlı ve tek kullanımlık; uygulamadan üyelik değişmez. Katalog kayıtları veya mevcut üyelik değişmişse yeni plan gerekir. Bütün değişiklikler mevcut `upsertMany` ile tek atomik katalog commit'ine gider. Dosya taşınmaz/silinmez. Üyelikler kütüphanenin film/dizi filtre listesinde görünür; kaldırma `member:false` planıyla yapılır.
- Letterboxd: mevcut otomatik bulucu veya görünür browser yorum okuyucusu ile küçük örnek. Yapım eşleşmesi ve çağrı sırasında kimlik değişimi kontrol edilir; mevcut yorum taslağı ezilmez. Modele en fazla beş yorum/1200'er karakter gider. Tam yüklenen örnek mevcut panelde incelenir. Modelin analiz JSON'u gerçek yorum ID/tam alıntıyla doğrulanıp yalnız önizleme olur. Hatalı alıntı reddedilir; kaydetme mevcut manuel quote-verify/save akışındadır. Kişisel uygunluk koşullu; örnek genel izleyici kanaati değildir.
- Gezinme: mevcut ana sayfa/keşfet/filmler/diziler/zevk/web/son oynatılanlar/müzik/kitap/radyo sayfaları. Açık browser/player mevcut park etme akışında korunur.
- Normal ayar şeması yalnız üç alan: tema (`system/dark/light`), arayüz dili (`en/tr`), sponsor atlama (`off/ask/auto`). Mevcut kontroller ve saveAppSettings kullanılır; anahtar/endpoint/tüm settings okunmaz veya modele sunulmaz. Oturumdaki son assistant değişikliği ancak değerler hâlâ aynıysa geri alınır; kullanıcı düzenlemesi ezilmez. Diğer ayarlar mevcut open_settings ekranından elle yapılır, A–Z tüm ayarlar tool'lanmış iddiası yoktur.
- Görünür browser/yerel oynatıcı play/pause/seek/speed kontrolü; park edilmiş medya reddedilir. Oynatma komutu altyazı zamanlarını değiştirmez.

Değiştirici araçlar model isteğiyle doğrudan çalışmaz; kullanıcıya kart gelir. Yapım kartı gerçek başlığı gösterir; uygulamadan önce kimlik tekrar doğrulanır. Koleksiyon kartı ekleme/çıkarma, ad ve yapımları listeler; tam plan tekrar okunur. AI konu çevirisi ancak kart uygulanınca mevcut sağlayıcıya gidebilir.

## Doğrulanmış onarım

Açık ayarlar penceresinde `open('metadata')` çağrısı önceki AI bölümüne yalnız focus verip dönüyordu. İstenen geçerli bölüm değişince mevcut draw/restore/mask akışıyla sekme artık değiştirilir. Native Windows'ta AI→metadata çağrısı ve aria-current doğrulandı; anahtar kutuları paylaşılmadı.

## Dosyalar ve kalıcılık

- `src/assistant-capabilities.js`: 18 tipli eylem, bağlam görünürlüğü, normal alan whitelist/rate sınırları, insan tarafından okunabilir kartlar.
- `src/assistant-agent-service.js`: yapım/koleksiyon kart kanıtı ve apply öncesi yeniden doğrulama; yorum/konu için bounded 120 saniye RPC.
- `src/assistant-collections.js`: yeni yetkili IPC; expiring/sender-bound plan; gerçek katalog snapshot ve atomik toplu üyelik.
- `src/main.js`, `src/preload.js`: aynı yetkili main-frame sınırıyla koleksiyon köprüsü.
- `src/media-catalog-store.js`: optional `collections` string dizisi (en fazla 40 ad, 80 karakter); eski kayıt varsayılanı []; import merge üyelikleri birleştirir, metadata editleri korur. Store version artırılmadı; mevcut normalize/atomic commit kullanılır.
- `src/renderer/assistant-app-actions.js`, `assistant-library-actions.js`, `index.html`: CSP-self typed adaptör, bounded güvenli veri; mevcut servis/renderer yolları, native seçim/ayar kaydı ve exact current-media guard.
- `src/renderer/media-home.js`: katalog koleksiyon filtresi, kullanıcı adları UI çevirisi dışında; ortak navigate.
- `src/renderer/media-discovery-ui.js`: mevcut details fonksiyonuna named adaptör.
- `src/renderer/media-tools-ui.js`: taslağı koruyan matched örnek ve gerçek alıntı analizi önizlemesi; mevcut panel/save.
- `src/renderer/app-settings-ui.js`: açık pencerede bölüm değiştirme onarımı.
- `tests/assistant-collections.test.js`: plan/apply/expiry/kimlik/foreign/replay, atomik olma, üyelik kaldırma ve dosya kaynağı koruma.
- `tests/assistant-library-actions.test.js`: bounded/path-free sonuçlar, yanlış ID/mixed discovery plan reddi, normal ayar/undo ve park edilmiş oynatma reddi.
- `tests/assistant-agent-service.test.js`: kart başlığı/gerçek kimlik, sonra değişen yapımın apply edilmemesi.
- `tests/assistant-capabilities.test.js`: bağlamdaki güncel araç sayısı.
- `tests/electron-assistant-library.smoke.js`: gerçek Windows/katalog/koleksiyon/ayar/UI; keşfet ve yorum ağ kaynağı test sınırında kontrollüdür.

## Kontroller ve sınırlar

PASS: assistant-collections **3**, assistant-library-actions **3**, assistant-agent-service **9**, assistant-capabilities **4**; ayrıca media-catalog-store, media-catalog-service, media-discovery-service, media-tools, media-home-model, ipc-parity, preload-usage-ratchet, coverage-map. Değişen JS ve yeni modüller/testlerde node --check, git diff --check geçti.

Native `electron tests/electron-assistant-library.smoke.js`, gerçek Start-Process exit **0**: iki katalog yapımı plan öncesi [] / apply sonrası koleksiyonda; koleksiyon filtresi görünür. Tema kaydı/undo gerçek ayar hattında; varsayılan taste açık tercih sanılmıyor. Kontrollü matched yorum taslağı mevcut panelde, yanlış alıntı reddedildi; doğru alıntı yalnız analiz önizlemesi açtı. Açık AI ayarından metadata'ya geçiş doğrulandı. TR koyu 1440×1000 ve EN açık 800×760 görüntüleri incelendi; son kanıt `.uiprev/assistant-library/1793055153483-9524/`. Ham görüntü/profil/log Git dışında; kişisel uygulama kapatılmadı.

Gerçek Cinemeta/Letterboxd ağı, ücretli AI, gerçek sağlayıcı konu çevirisi kalitesi, yeni araçtan gerçek fiziksel oynatma veya bütün siteler doğrulanmadı. Windows native testte kaynak cevapları sentetik; gerçek kullanıcı zevk profili/anahtar kullanılmadı. Otomatik analiz kaydı yapılmadı. Uzun CI/tam npm test beklenmedi; CI açık. `install.bat/start.bat` ve GPU bağımlılıkları değişmedi, normal start.bat yeniden açılışı bu tur denenmedi. Yeni paket bağımlılığı yok.

## Devam

P07 tanımlı bağlar teslim. P08: birden fazla adımdan oluşan, kaynak değişimi/iptal/yarım sonuçları koruyan zincirler ve toplu kabul. P01–P07 tekrarlanmaz. A–Z sınırsız IPC/ayar erişimi, dış servis erişim garantisi veya kişisel zevk kesinliği vaat edilmez.
