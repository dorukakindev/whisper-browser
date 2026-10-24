# Rapor539 — Luna'nın yeni push'larından üç bağımsız medya uyarlaması

24 Ekim 2026, yeni kaynak incelemesi ve uygulama. Başlangıç HEAD `7fa1781cd9a2155bcbc3def398f4a489760b6ce7`; bitiş ürün `4b5312de3ae4c3aff8b9068ed5394e299d3898ce`. Bu tur yapay bug sayısı üretmez; üç somut özellik ekler. Önceki asistan işi [Rapor538](BROWSER_BUG_REPORT_538.md) ve [2256 devir notunda](../devir/2026-10-24-2256.md) tamamlanıp push edilmişti.

## Güncel Luna kaynağı

Resmî GitHub API üzerinden releases, branches ve önceki `3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6` ile main karşılaştırıldı. Yayımlanmış en son prerelease hâlâ **v1.6.7**, tarih `2026-10-22T23:01:09Z`. Yeni main kaynak **189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4**, changelog kimliği **1.8.3CC**. Bu bir yeni yayımlanmış beta paketi gibi sunulmaz.

Yeni commit'ler: `93a014a119449dfcdc41288132eddbc10ee8a0d4` (24 Ekim18:48:16Z), `69dfa9739deacff43907ea19b7d42652ee570289` (18:57:38Z), `189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4` (19:07:50Z). [Kesin kaynak karşılaştırması](https://github.com/Nothingman333/Luna-Player/compare/3c4ae8f55ae792e9abe43fb9c3cf67c506b61bd6...189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4).

API compare çıktısı300dosya sınırına ulaştı; tüm deponun eksiksiz denetimi yapıldığı iddia edilmez. Değişim listesi/changelog ile ilgili asistan intent/request/budget, SimilarTitles, watchCountry, WebNotebook/tab group, text entities ve profil kaynakları seçilerek incelendi. 14 ilgili dosya geçici inceleme dizinine indirildi; büyük tasteCore/tasteEngine dosyalarının tamamının davranışı doğrulanmadı. Beklenen iki dosya yolu bulunamadı ve okunmuş sayılmadı. Upstream kaynaklar çalıştırılmadı. GPLv3 kaynaklar doğrudan ürün koduna kopyalanmadı; aşağıdaki akışlar mevcut Electron/main IPC ve kendi mağazalarımız üzerinde bağımsız yazıldı.

## Alınan ve geliştirilenler

1. **Ülkeye göre Nerede izlenir?** TMDB eşleşmesi olan film/dizi ayrıntısında abonelik, ücretsiz, reklamlı, kiralama ve satın alma bilgileri gruplanır. İzleme ülkesi bilgi/arayüz dilinden bağımsızdır; varsayılan TR, ayarlarda ve yapım sayfasında seçilir. Bu ülkede veri yoksa başka ülkenin platformları gösterilmez. Veri yokluğu filmin kesin izlenemediği anlamına getirilmez. Eski ülkeye ait geç yanıt, yeni seçim üstüne uygulanmaz. Kaynak JustWatch/TMDB açıkça belirtilir; TMDB'nin izleme sayfasına bağlantı vardır, API'den doğrudan video oynatma bağlantısı alındığı iddia edilmez. Ülke bilgisi `tmdb.watchRegion` isteğe bağlı yeni ayarıdır; eski ayarlar TR ile açılır, kısmi güncelleme seçimi korur.
2. **Benzer yapımlar.** Mevcut yapım kimliğinin TMDB recommendations sonucu kullanılır; ilk5kart, daha fazla göster/paginasyon, yeniden dene ve ayrı önizleme. Kendisi, yinelenen kimlikler ve geçersiz kayıtlar elenir. Sonuçlar kişisel zevk tahmini gibi etiketlenmez. Kullanıcı Kütüphaneye ekle ve aç dediğinde gerçek TMDB ayrıntısıyla kaydedilir; yalnız o yapımın eksik afiş/bilgileri tamamlanır. Film zaten varsa mevcut puan/favori/kaynak korunarak o kayıt açılır. Eşzamanlı eklemelerde kimlik yeniden kontrol edilip kopya kayıt önlenir. Video indirme veya oynatma bu düğmeye bağlanmaz.
3. **Zevk profilinde yorum arama.** Yapım adı, yıl ve yorum metni yerelde aranır; Türkçe/aksan eşleşmesi, sonuç sayısı, boş sonuç ve daha fazla göster vardır. Her tuşta bütün profil tekrar çizilmez; açık tercih/not taslakları korunur. Arama dış API'ye yorum göndermez; mevcut kanıtlı AI profil analizi ayrı kalır.

TMDB ek istekleri20sn/4MB sınırını paylaşır. Kimlik/dil/credential-hash anahtarlı10dk ve100kayıt sınırlı bellekiçi önbellek vardır. İzleme yanıtında yalnız istenen ülke renderer'a döner. Gizli anahtarlar yeni alana/renderer paneline/loga kopyalanmaz. Tür ve eşleşmiş sayısal kimlikler main'de doğrulanır. Yeni yerel model, bağımlılık veya kurulum gerekmez.

## Doğrulama

- `node --test --experimental-test-isolation=none tests/catalog-related.test.js tests/catalog-metadata-sync.test.js`: 11geçti. Bunların6'sı yeni ülke/kimlik/paginasyon/cache, kopyasız ekleme, ayar, güvenli DOM ve taslak koruyan yorum arama kontrolleridir;5'i mevcut otomatik eşleştirme/regresyondur.
- `node tests/settings-security.test.js`:23geçti. Sandbox koşusunda3alt-süreç testi EPERM/null exit ile çalışamadı; normal yetkili koşuda aynı test dosyası tamamen geçti. Test/eşik gevşetilmedi.
- Gerçek Windows `electron tests/electron-metadata-settings.smoke.js`: kontrollü main/preload/TMDB/Story/ülke/benzer önizleme/arama, koyu-açık ve dar pencere geçti.7fixtureisteği,0gerçekTMDBisteği. Önceki Story çevirisi, puan/favori ve eşleştirme kontrolleri korunur. Son tam kanıt `.uiprev/metadata-settings/1792872601629-5776/` içinde; native önizleme ve Türkçe `istanbul` araması okunarak incelendi.
- Ayrı gerçek TMDB denemesi `.uiprev/tmdb-related-live-1792872484649/results.json`: The Matrix / movie603; bilgi dili en-US, izleme ülkesi TR. Abonelikte Amazon Prime Video, TV+, HBO Max; kiralama/satın almada Apple TV Store ve beş gerçek öneri geldi. Aynı sağlayıcının kiralama ve satın alma başlıklarında bulunması iki ayrı erişim türüdür. Native koyu/açık ve940px film sayfası incelendi; bu tarihli katalog bilgisi gerçek abonelik hesabıyla oynatmanın doğrulanması değildir. İlk önizleme PNG'si compositor beklenmeden çekilmişti; bunu önizleme kanıtı saymadık, kontrollü Windows koşusunda iki frame beklenerek yeni PNG çekildi.
- Değişen JS syntax ve diff kontrolleri geçti. Son loader/ölçü iyileştirmesinden sonra6yeni hedefli test yeniden geçti.

Özel API kayıtları, gerçek profil kopyaları ve ham PNG/JSON kanıtları `.uiprev`/`tmp` altında Git dışında kaldı. Asıl kullanıcı profili/medya dosyaları değişmedi. Tam npmtest/CI, normal start.bat yeniden açılışı, GPU/CUDA/DRM, TTS kalite ve gerçek provider hesabında film başlatma bu tur doğrulanmadı. CI beklenmez. SQLite/Foliate/Syncplay/stdioMCP/özel geliştirici kilidi gibi kalan Luna değişiklikleri topluca alınmadı; bu üç ek bunların yapılmış olduğu anlamına gelmez.

## Birincil kaynaklar

- [Luna SimilarTitles](https://github.com/Nothingman333/Luna-Player/blob/189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4/app/src/SimilarTitles.tsx), [watchCountry](https://github.com/Nothingman333/Luna-Player/blob/189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4/app/src/watchCountry.ts), [changelog](https://github.com/Nothingman333/Luna-Player/blob/189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4/CHANGELOG.md).
- [TMDB movie watch providers ve zorunlu JustWatch attribution](https://developer.themoviedb.org/reference/movie-watch-providers), [TV watch providers](https://developer.themoviedb.org/reference/tv-series-watch-providers), [movie recommendations](https://developer.themoviedb.org/reference/movie-recommendations).
