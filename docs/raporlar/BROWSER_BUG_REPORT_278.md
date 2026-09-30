# BROWSER_BUG_REPORT_278 — R323-6: NDJSON olay-akışı fuzz'ı

Tarih: 2026-09-30 · Dal: `devin/1790765454-r323-6-ndjson-utf8` · Kod commit: `787f78f`

## Kapsam

`src/ndjson-lines.js` (`createNdjsonLineBuffer`, `parseNdjsonLine`) ve tüm üretim
çağrı siteleri (main.js ~932/1142/1339 transcribe-ytdlp-subs işleri, ~8947 canlı
ASR, ~17655/17844/18464/19023/19676/19825 yardımcı süreç okuyucuları).

## Doğrulanmış bug — B-323-04 (orta): UTF-8 chunk-sınırı sessiz bozulması

**Semptom:** `probeCommand` (main.js ~17844) ve `media:probeTracks` ffprobe iz
taraması (~18464) `out += chunk` ile ham `Buffer`'ı stringe çeviriyordu. Node
akışına `setEncoding` verilmediği için her `data` chunk'ı ayrı ayrı
`Buffer→string` dönüşümü görüyor; bir UTF-8 çoklu-bayt dizisi chunk sınırında
bölündüğünde iki yarım byte iki ayrı U+FFFD (``) üretiyor.

- ffprobe yolu: `stream_tags=title` alanı ASCII dışı karakter taşıyabilir
  (`Türkçe altyazı`, ``). Bozuk çıktı hâlâ geçerli JSON — `JSON.parse` başarılı,
  dolayısıyla iz başlıkları kullanıcıya **sessizce bozuk** gösterilirdi.
- probeCommand yolu: ilk satırı döndürür (`--version` sorguları çoğunlukla
  ASCII — risk düşük ama sözleşme genel).
- Kırmızı kanıtı: eski modül `{"s":"ğ"}` Buffer'ını iki chunk'ta (`ğ` =
  `0xC4 0x9F` sınırda bölünmüş) `"{"s":""}"` üretti; yeni modül aynı
  girişten kayıpsız satır döndürüyor.

**Düzeltme (katmanlı):**
1. İki çağrı sitesine `setEncoding('utf8')` — akışın kendi dekoderi sınırları
   doğru birleştirir (diğer 9 çağrı sitesinde zaten vardı).
2. `createNdjsonLineBuffer` Buffer girişini `StringDecoder` ile birleştirir —
   gelecekteki bir çağrı sitesi `setEncoding`'i unutsa bile modül sözleşmesi
   kayıpsız kalır. `flush()` dekoderin artık byte'larını da `pending`'e döker.

## Fuzz sonuçları — temiz bölge (bug yok)

`tests/ndjson-stream-fuzz.test.js` (9 test) tümü PASS:

- **Chunk-bölme oracle'ı:** 300 tohum × rastgele ofset bölmeleri — emit edilen
  satır dizisi ham metnin `'\n'` split'ine birebir eşit (kayıp/çoğalma/sıra yok).
- **UTF-8 Buffer fuzz'ı:** 6 kesim stratejisi × Türkçe/CJK/emoji içerik —
  `StringDecoder` yoluyla kayıpsız.
- **Overflow durum makinesi:** `maxLineChars` aşımında `onOverflow` çağrılır,
  satır düşer, komşu satırlar sağlam; newline'sız dev satır parçalı gelince
  `dropping` modu sonraki `\n`'e kadar düşürür sonra toparlanır.
  Not: sözleşme `Math.max(1024, maxLineChars)` — 1KB alt sınır kilitlendi.
- **parseNdjsonLine:** temiz satır, `[download]` önek yapışması (R271 sözleşmesi),
  sonek kurtarma, `}{` içeren string alanları, `{}}`/`[…]`/`42`/`NaN`/çift-nesne
  gibi geçersiz şekiller → `null` (crash yok). İki JSON nesnesinin tek satırda
  kalması (`{"a":1}{"b":2}`) bilinçli sınır — emit() her olaya `\n` ekler.

## Windows etkisi

Düşük-orta: aynı kod yolu Windows'ta da çalışır; `setEncoding` davranışı
platformdan bağımsız. Windows'ta ek risk yok (spawn bayrakları değişmedi).

## Doğrulanamayan sınır

Gerçek ffprobe çıktısıyla uçtan-uca doğrulama Electron ortamında koşulmadı;
mekanizma modül düzeyinde kırmızı→yeşil kanıtlandı.
