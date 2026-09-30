# BROWSER_BUG_REPORT_255 — R306: Hata diyaloğu retry durum temizliği

20'lik kuyruk maddesi 9. Tarayıcı sayfa-hatası yüzeyinin yeniden-deneme
durumlarının yaşam döngüsü denetlendi; 2 gerçek bug bulundu ve düzeltildi.

## Bug 1 — Ağ yeniden-deneme bütçesi yeni adrese sızıyor

- **Kök neden:** `tab.loadRetryAttempt` yalnız `did-stop-loading` + temiz
  `loadError` koşulunda sıfırlanıyor; `did-start-navigation` yalnız
  zamanlayıcıyı temizliyordu. `render-process-gone` da sayacı sıfırlamıyordu.
- **Etki:** Bir adres 3 hakkı tükettikten sonra (ör. ağ kopukken `net-105`),
  kullanıcının açtığı yeni adresin ilk hatası
  `navigationRetryPolicy({attempt:3})` → `retry-limit` terminal kararı →
  hata diyaloğu anında görünür, o adres hiç yeniden denenmez. Çökme
  sonrası yeni görünüm aynı borçla başlardı.
- **Düzeltme:** `did-start-navigation` sayacı sıfırlar; zamanlayıcının
  tetiklediği `wc.reload()` aynı olaydan geçtiği için
  `tab.loadRetryPendingNav` bayrağıyla muaf tutulur (koruma olmazsa her
  denemede bütçe sıfırlanıp sonsuz döngü olur). Bayrak `did-fail-load` ve
  `did-stop-loading`'de de düşürülür (sınır); `render-process-gone`
  sayaç+bayrağı sıfırlar.

## Bug 2 — Manga "Başarısızları yeniden dene (N)" sayısı bayat

- **Kök neden:** `manga-state` idle olayları (gezinme başlangıcı, çökme
  temizliği, `browser:manga:clear`) `retryable` alanı taşımıyor; renderer
  `tab.browserMangaRetryable`'ı yalnız `event.retryable !== undefined`ken
  güncelliyor.
- **Etki:** İş temizlendikten sonra bile düğme önceki koşunun N'sini
  gösterir ve etkin kalır; tıklama "Yeniden denenebilir manga sayfası
  yok." döndürür.
- **Düzeltme:** Üç idle emisyonuna `retryable: 0` eklendi.

## Denetlenen komşu yüzeyler (temiz)
- `browserErrorRetry` hata URL'sine yeniden gezinir; `data.loading` hata
  durumunu ve yüzeyi temizler.
- `load-retry` renderer olayı yalnız durum çubuğu sinyali üretir; sayaç
  gösterimi main'den gelir.
- Sertifika hatası (`certificate`) zinciri ayrı ve kararlı; erken dönüş
  politikası korundu.

## Kapsam dışı / sınır
- vm simülasyonu `wc.reload()`'un `did-start-navigation` yaydığını varsayar
  (repo B83-23 ile aynı varsayımı taşıyor); bayrağın üç noktada düşürülmesi
  alternatif sıralarda da davranışı sınırlı tutar. Gerçek Electron'da
  uçtan-uca tekrar doğrulanmadı.
