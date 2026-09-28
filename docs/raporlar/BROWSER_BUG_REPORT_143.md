# BROWSER_BUG_REPORT_143 — manga/OCR hattı sertleştirme (R167)

Tarih: 2026-09-27 · Dal: codex/r167-manga-ocr

## Gerçek bug (düzeltildi)

**SSRF — sondaki-nokta FQDN atlatması** (`isSafeMangaImageUrl`,
src/browser-manga.js). Kapı `host === 'localhost'` ve `endsWith('.local')`
tam-eşitlik/sonek karşılaştırması yapıyordu; `http://localhost./x.png` ve
`http://foo.local./x.png` (kök noktalı FQDN) kapıyı atlatıyordu —
çözümleyiciler `localhost.` ve `foo.local.` değerlerini yine yerel
adrese çözer. Kapı doğrudan main.js'teki görsel indirme hattını korur
(7359 kaynak, 7379 redirect, 7929 aday süzgeci).

Düzeltme: host normalleştirmede sondaki nokta(lar) atılıyor
(`/\.+$/`), ardından mevcut kapılar aynen uygulanıyor. Public
`example.com.` girdisi değişmeden kabul kalır.

## Kilitlenen sözleşmeler (regresyon)

- extractJsonPayload: düz/fenced/gömülü JSON, boş/yarım hata sınıfları,
  16-aday tavanı, tırnaklı `{` kaçışı.
- detectMangaImageMime: jpeg/png/gif89a/webp/avif/avis sihirli baytları,
  kısa/buffer-olmayan → ''.
- normalizeMangaOcrRegions: 160 bölge tavanı, 8px altı kutu düşüşü,
  kaynaksız satır düşüşü, translation/hidden sıfırlama.
- normalizeMangaRegions: ters köşe düzeltme, 1000 clamp, çevirisiz satır
  düşüşü (kasıtlı sözleşme — normalizeOcrRegions'ta önce source→translation
  eşlenir).
- mangaOcrCacheKey: girdi kararlılığı + sha256 biçimi.
- buildMangaPrompt: kontrol-karakteri temizliği + sözlük boyut tavanı.
- selectMangaCandidates: puan sıralaması + excluded düşüşü.

## Kalan sınır (belgeli, ertelenmedi — mimari)

URL-kapıları yalnız literal IP/host'a bakar; DNS-rebinding (public alanın
A kaydının loopback'e işaret etmesi) bu katmanda yakalanamaz — indirme
zamanı IP doğrulaması gerektirir. Mevcut tasarımın kapsamı dışında.
