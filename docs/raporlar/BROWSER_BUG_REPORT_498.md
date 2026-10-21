# BROWSER_BUG_REPORT_498 — Kurtarma, iptal ve çeviri bütünlüğünde 20 hata

2026-10-21; dal codex/broad-bugs498.
Başlangıç HEAD: 703c04dd23c9d6df819e8aed5f6a48c53c3c0b9a.
Bitiş ürün commit: 2fb4609f71b135c5d696cc791e61e9c5325fed29.
Tüm bulgular kontrollü yeniden üretimle doğrulandı. Test sayısı hata sayısının
kanıtı yerine kullanılmadı: her satır ayrı davranış ve kök neden gösterir.

| No | Önceki davranış ve etki | Onarım |
|---|---|---|
| 498-01 | Çıktı sınırına takılan probe, iptalden sonra gelen stdout'u toplamayı ve tekrar sonlandırmayı sürdürüyordu. Sonlanmayan çocuk bellek ve işlem baskısı üretiyordu. | Settled probe geç çıktıyı yok sayar. |
| 498-02 | Medya aracının satır sonu olmayan stderr'i onStderrLine tamponunda sınırsız büyüyordu. | Tampon 1 MiB sınırında açık hata ve süreç iptali üretir. |
| 498-03 | Türkçe stderr UTF-8 karakteri iki chunk'a bölününce bağımsız toString çağrıları bozuyordu. | Akış UTF-8 decoder kullanır; satır kancası tam karakter alır. |
| 498-04 | Medya işini iptal etmek yalnız doğrudan çocuğu öldürüyor, ffmpeg gibi torunları açık bırakabiliyordu. | Ortak süreç ağacı iptali; POSIX'te ayrı grup, Windows'ta taskkill ağacı. |
| 498-05 | Yeni sürüm kasa dosyası ile okunabilir eski yedek birlikteyken kayıt eski yedeğe düşüp yeni sürümün üstüne yazabiliyordu. | Gelecek kasa sürümü açıkça korunur, yedek yazma yetkisi oluşturmaz. |
| 498-06 | Bozuk ana kasadan yedeğe dönüldükten sonra kaydetme yalnız bozuk birincilin rawEntries'ini kullanıyor, yedekteki bilinmeyen şifreli alanı siliyordu. | Kaydetme kurtarılmış zarfın ham şifreli alanlarını korur. |
| 498-07 | entries:[] nesne sanılıp boş geçerli kasa kabul ediliyor, sağlam yedekteki anahtar görünmüyordu. | Dizi biçimi reddedilir; sağlam yedek kurtarılır. |
| 498-08 | Gelecek sürüm katalog dosyası eski yedekten açılıp bir sonraki değişiklikte eski şemayla eziliyordu. | Commit öncesi birincil ve yedekte gelecek sürüm koruması. |
| 498-09 | Silinen katalog kaydı eski .bak içinde kalıyor; ana dosya bozulunca geri geliyordu. | Silme yazımında yedek doğrulanmış yeni içeriğe aynalanır. |
| 498-10 | Aynı item.id taşıyan iki katalog kaydı geçerli sayılıyor; düzenleme/silme yanlış veya birden çok eseri etkiliyordu. | Zarf kimlikleri tekil olmalı; bozuk birincilden sağlam yedeğe dönülür. |
| 498-11 | İçe aktarımda aynı bölüm kimliği farklı sezon/numara taşısa da OR eşlemesiyle eski bölüme yutuluyordu. | Kimlik/konum çatışması raporlanır, mevcut dizi değiştirilmez. |
| 498-12 | Katalog source-url yolu temiz URL'ye özgün hash'i geri ekleyerek route token'ını diske taşıyordu; kaynak normalizasyonu da ham değer ve watchKey'i saklıyordu. | Kaynak değerleri ve browser watchKey temizlenir; güvenli video route'u korunur. |
| 498-13 | Bölümün sezon/numarası değiştirilirken eski video kaynağı yalnız id eşleşmesiyle yeni bölüme taşınıyordu. | Kaynak yalnız id ve sezon/numara aynıysa korunur; taşınan bölüm yeniden bağlanır. |
| 498-14 | Kapatılan sekmeyi geri açma grubu, okuyucu tercihlerini, uyumluluk/uyanık tutma ve manga konumunu düşürüyordu. | Var olan izinli normalleştiricilerle bu tercihler geri-açma kaydında korunur. |
| 498-15 | Kimliksiz çıktıda start:null, Number(null)=0 yüzünden video başındaki satırı çevrilmiş sayabiliyordu. | Açık bozuk zaman geçerli zaman veya indeks fallback sayılmaz. |
| 498-16 | Aynı cueId için eski sourceCueHash, yeni kaynak metnin çevirisiymiş gibi tamamlandı sayılıyordu. | İki tarafta bilinen kaynak revizyonu uyuşmalı; çoklu kapsama sözleşmesi korunur. |
| 498-17 | Aynı kimlik ve zamanda iki farklı kaynak satırı, tek coveredCueIds bildirimiyle 2/2 tamam sayılıyordu. | Belirsiz çoklu zaman/kimlik eşleşmesi tamamlanma kanıtı sayılmaz. |
| 498-18 | Referans dosya seçicisi açıkken üretim başlarsa sonradan dönen seçim aktif üretim sırasında ayarları değiştiriyordu. | Asenkron seçiciden sonra job/textUI/busy yeniden denetlenir. |
| 498-19 | Son dublaj geri yüklenirken bozuk kalite grupları doğrulanmadan hazır kabul ediliyordu; yeni üretim yolu doğrularken latest yolu atlıyordu. | Geri yüklemede aynı grup doğrulaması; bozuk rapor qualityUnavailable ve dinleme gereksinimi olur. |
| 498-20 | Tek okunamayan/kaybolan iş günlüğünün stat hatası tüm latest listesini düşürüyor, önceki başarılı ses gizleniyordu. | Her aday bağımsız stat kontrolünden geçer; diğer kayıtlar korunur. |

## Kanıt

- tests/report498-regressions.test.js: 20 yeni regresyon, önceki kod kopyasında 20/20 başarısız; yeni kodda 20/20 geçti. Ek olumlu örnekler birleşmiş çeviri kapsamını ve güvenli video route'unu korur.
- İzole kanıt: tmp/report498/before, before.txt, after.txt (ignore edilir; gerçek anahtar, kullanıcı medya/not/profil verisi yok).
- 21 ilgili Node dosyası geçti: report498-regressions, secret-store-recovery, media-catalog-store, media-catalog-service, browser-translation-integrity, dub-service, process-lifecycle, process-io, report492-regressions, history, browser-session-package, browser-subtitle-session, settings-security, report496-regressions, report497-regressions, report471-regressions, report472-regressions, browser-feature-services, report51-kademe-fixes, ui-locale, ui-locale-dedupe.
- process-lifecycle gerçek Windows ana süreç/torun iptalini doğruladı. Settings-security içindeki gerçek çökme senaryoları ve mediaTools.run gerçek stderr satır akışı geçti.
- İlk sandbox spawn EPERM sonuçları ürün hatası sayılmadı. İlgili aynı testler yetkili Windows çalıştırmasında geçti. report471/472 VM fixture'larının yeni yerel bağımlılığı gerçek modül konumundan çözmesi sağlandı; beklentiler değiştirilmedi.
- Değişen JS + main/preload/renderer sözdizimi, git diff --check ve Windows Electron trusted-bridge smoke --disable-gpu geçti.

## Uyumluluk ve sınırlar

Yeni bağımlılık, kurulum veya kalıcı JSON/SQLite şema sürüm değişikliği yok.
Yeni katalog hata metinlerinin EN/TR karşılıkları eklendi. UI yerleşimi değişmedi.
Çevrimdışı mock/fixture, canlı sağlayıcı veya gerçek model kalitesi kanıtı değildir.
Gerçek start.bat açılışı, GPU/CUDA/model, YouTube/DRM, kişisel hesap ve Ubuntu
çalıştırması bu tur yapılmadı. POSIX grup kuralı kodda mevcut, gerçek süreç
iptali bu Windows makinede doğrulandı.

Gelecek sürüm dosyaları yazmayı engeller; kullanıcı dosyası otomatik silinmez.
Zamanı/kimliği belirsiz çeviri eksik görünebilir; sahte tamamlandı üretilmez.
Silinen eski katalog kayıtları bu düzeltmeyle geri getirilemez; yeni silmelerde
yedek tekrar dirilişi engellenir. Kayıt kurtarma sağlam yedeğin varlığına bağlıdır.

Tam npm test koşulmadı. CI kapatılmadı, sonuç beklenmedi; başarısı iddia edilmiyor.
Origin/master 957bbfe91edee709accb24624e9e945e7a7a2969; önceki teslimler korunarak
yeni dal açıldı. Ana checkout güncellenmedi; master merge yapılmadı.
