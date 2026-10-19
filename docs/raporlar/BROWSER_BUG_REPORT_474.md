# BROWSER_BUG_REPORT_474 — Geniş tarama, 10 doğrulanmış düzeltme

Başlangıç: `6e21d416452e37eb228f5e2ce4657288e28c8c6a`.
Kod: `d307822741d0eab9de4466ec7db7d27b915b3f0c`.
Kapsam: altyazı dışa aktarma/senkron, kütüphane dosya kimliği ve eşleme,
OpenSubtitles/Stremio sağlayıcı listeleri ve indirme formatı.

## Bulgular ve kanıt

| No | Kök neden / önceki sonuç | Düzeltme ve doğrulama |
|---|---|---|
| 474-01 | UTF-8 kontrolü metinde U+FFFD bulunmasını bozuk bayt sanıyordu; geçerli EF BF BD metni de kaydedilemiyordu. | Fatal UTF-8 decoder ile baytı doğrula; BOM'u koru. Geçerli U+FFFD kabul, 0xFF reddedilir. |
| 474-02 | transformCuesForExport, geçersiz cue sayacı olmasına rağmen null/NaN cue'da sayı dönüşümünden önce throw ediyordu. | Geçersiz zamanları önce ele; kalan cue'lar yazılır, atlanan sayısı bildirilir. Null+NaN+geçerli fixture'da 2 atlama sayısı, 1 çıktı. |
| 474-03 | normalizePoint(null) veya sourceTime:null Number(null)=0 ile gerçek 0:00 eşleşmesi sayılıyordu. | Eksik/null/boş/bool zamanları reddet; geçerli sayı ve sayısal dizgi davranışı korunur. |
| 474-04 | mergeWatchItems en yeni source kaydını yaydıktan sonra yalnız key'i hedefe çeviriyordu; seçilen hedef anahtar kaynak dosyanın yoluyla eşleşiyordu. | localPath/sourceRef/url/type/service/contentId hedef kayıtta kalır; hedefte olmayan kimlik alanı kaynaktan taşınmaz. |
| 474-05 | Mükerrer dosya stem'i yalnız ASCII tutuyordu; Çağ ve Şaş ikisi de a oluyordu; Japonca adlar tamamen kayboluyordu. | NFC ve Unicode harf/sayı/im koruması. Ayrı Türkçe adlar birleşmez, aynı Japonca adlar eşleşir. |
| 474-06 | Sağlayıcının files listesindeki null ID Number(null)=0 ile ilk geçerli kayıt seçilip sonraki gerçek ID gizleniyordu. | Dosya nesnesi ve pozitif safe-integer ID doğrulanır; null/boş/0 kayıtlarından sonra ID=7 ve onun adı korunur. |
| 474-07 | İndirme geçerlilik kapısı ASS kabul ettiği halde format yalnız WEBVTT veya SRT dönüyordu. | ASS/SSA başlıkları ve Dialogue içeriği ass olarak bildirilir. Hem resmi API hem Stremio indirme fixture'ı geçti. |
| 474-08 | Stremio listesinde tek null satır item.releaseName erişimini çökerterek geçerli sonuçları da kaybettiriyordu; API-boş fallback bunu sessizce [] yapıyordu. | Sağlayıcı satırlarında null/skaler/dizi elenir; sağlam satır korunur. OpenSubtitles satırları da nesneyle sınırlandı. |
| 474-09 | pob alias'ı yalnız pt'ye çevrilip Brezilya bölgesi kaybediliyordu; pt-PT aramasında Brezilya altyazısı da geliyordu. | pob için br varyantını koru; genel pt eşleşmesi korunur, pt-PT pob kabul etmez. |
| 474-10 | Kök yolundaki son slash silinirken / boş dizeye dönüşüyordu; toplu relink ve eksik-kaynak taraması hiç kayıt döndürmüyordu. | / kökünü koru, yol birleştirmesinde tek ayırıcı kullan. POSIX kökü, Windows D:/→E:/ ve UNC paylaşım kökü fixture'ları geçti. |

## Kontroller

`node tests/report474-regressions.test.js`: düzeltmeden önce 10 FAIL,
düzeltmeden sonra 10 PASS (yaklaşık 30 ms, sadece kontrollü veriler).
Gerçek sağlayıcıya istek gönderilmedi; Response fixture'ları kullanıldı.

Mevcut hedefli dosyalar: browser-subtitle-search, subtitle-export-validation,
browser-subtitle-sync, library-maintenance-21-25 (17), media-relink-matcher
(9) geçti. ci-determinism-ratchet geçti; baseline genişletilmedi. Değişen
4 JS için node --check, git diff --check ve doküman indeksi kontrol edilir.

## Sınırlar

Windows Node üzerinde çalışıldı. Gerçek Windows dosya seçicisi/start.bat,
GUI piksel/DPI, YouTube, GPU, model ve ses donanımı denenmedi. POSIX ve UNC
yol örnekleri saf planlayıcı fixture'larıdır; gerçek paylaşım taranmadı.
Kullanıcının talebiyle tam npm test/uzun CI bekleme yapılmadı. 10 bulgu
bu PR'ın mevcut kodunda kanıtlandı; bütün uygulamanın hatasız olduğu iddiası
yok. Yeni paket, kurulum, ayar şeması, UI metni veya görsel değişiklik yok.
