# BROWSER BUG REPORT 246 — Omnibox/geçmiş unicode-RTL katlama

**Tarih:** 2026-09-30 · **Kapsam:** Plan-3 madde 2 — omnibox geçmiş sorgusu unicode/RTL kenarları
**Sonuç:** 2 gerçek kusur düzeltildi + 42 kontrollük kilit.

## Bulunan kusurlar
1. **Vurgu/aksan asimetrisi:** `foldSearchText` yalnız I/İ/ı katlıyordu — "cafe" sorgusu "café" başlığını, "isik" sorgusu "Işık" başlığını, "lodz" sorgusu "Łódź"yi bulamıyordu. ASCII klavyeli Türkçe kullanıcısı Türkçe başlıklı sayfayı yazarak bulamıyordu.
2. **Ayrışık/birleşik uyumsuzluğu:** IME/kopyala-yapıştırla gelen ayrışık (NFD) yazım birleşik (NFC) kayıtlarla eşleşmiyordu; görünmez karakterler (bidi denetimi, ZWJ, ZWSP, NUL) sorguyu sessizce bozuyordu.

## Düzeltme
`foldSearchText` (browser-omnibox.js + browser-address-model.js, birebir aynı):
- I/İ/ı→i (mevcut) korundu.
- ASCII dışı harf `ch.normalize('NFD')[0]` ile temel harfe iner (é→e, ş→s, ü→u, أ→ا) — ayrışık ve birleşik yazım aynı katlamaya düşer.
- NFD'de ayrışmayan Latin vuru harfleri açık haritayla (`ł→l, ø→o, đ→d, æ→a, œ→o…`, tek karakter çıkışı).
- `\p{M}` (birleştirme işaretleri), `\p{Cf}` (bidi/ZWJ biçim karakterleri), `\p{Cc}` (NUL vb.) düşer.
- Uzunluk birleşik NFC metinde korunur (vurgu konumu sözleşmesi bozulmaz; audit testindeki 3 örnek kilitli).

## Kilit
`tests/omnibox-unicode.test.js` — iki modül katlama-parite + çift yönlü vurgu eşleşmesi + görünmez karakter + Arapça hareke + buildAddressResults uçtan uca geçmiş sorgusu + inlineCompletion + uzunluk kilitleri (42 kontrol).

## Bilinen sınır
`ß`/`ﬁ` gibi genişleyen karakterler tek-harf katlamasına giremez — uzunluk sözleşmesi korunduğu için belge sınırı olarak bırakıldı.

## Windows etkisi
Yok — saf JS eşleştirme.


## Devin Review eki (aynı PR)
- **Katlama sözleşmesi sertleştirildi:** karakter silme yerine `\uFFFF` işaretçisi — metin tarafında uzunluk artık HER girdide korunur; `appendHighlighted` ofsetleri ayrışık/görünmez karakterli altyazıda da doğru. Sorgu tarafı `foldSearchQuery` işaretçileri siler (görünmez karakterli sorgu yine eşleşir).
- **Korece yanlış katlama düzeltildi:** heceler ilk ünsüzüne inmiyordu (yalnız 'taban harf + birleştirme işaretleri' ayrışması temel harfe iner; jamo/sunum biçimleri korunur).
- **#242 review bug'ları:** `ERR_NETWORK_CHANGED` genel `err_network` kuralına takılıp "ağ erişilemez" diyordu — kural `err_network_io_suspended|err_network_access_denied`'e daraltıldı. `ERR_UNSAFE_REDIRECT` "yönlendirme döngüsü" gösteriyordu — yeni `unsafe-redirect` messageKey + EN şablonu.
