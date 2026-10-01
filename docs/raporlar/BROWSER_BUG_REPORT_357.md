# BROWSER_BUG_REPORT_357 — Kuyruk-50 madde 45: parser dayanıklılığı

Tarih: 2026-10-01 · Dal: `devin/1790892945-parser-depth` · Başlangıç HEAD: `d2c28f6`

## Madde metni

> Parser dayanıklılığı: Altyazı, manifest, proje paketi ve metadata okuyucularına boyut, derinlik ve bozuk Unicode fuzz'ı uygula. Kontrolsüz bellek/CPU kullanımını ve yakalanmamış hataları düzelt.

## Mevcut uygulama (doğrulanan)

- Altyazı parser'ları (SRT/VTT/ASS): R323-1'in 100k-cue mega roundtrip fuzz'ı ve timecode kenar kilitleri zaten kapsar — yeniden fuzz'a gerek yok.
- `workspace-package.js`: 256MB dosya sınırı + `gunzipSync` `maxOutputLength`; dosya-adı/traversal/mapping kontrolleri mevcut.
- Python tarafı (`workspace_video_package.py`): sınırlı kopya + sahte file_size reddi + toplam sınır — zip-bomb koruması tam.
- `queue-persistence.js`/`settings-security.js`: derinlik kapılı sanitize zaten var (MAX_JSON_DEPTH=12).

## Bulunan kusurlar

1. **Derinlik çökmesi (yakalanmamış hata):** `workspace-package.js`'teki iki özyinelemeli `visit` (export'taki yol-yeniden-yazımı ve `rewrite`) 40k+ seviye iç içe JSON'da `RangeError: Maximum call stack size exceeded` fırlatıyordu. `restorePackage`/`remapRendererValues` yolunda bu ham RangeError süreç seviyesine sızıyordu; export'ta ise `catch {}` içeriği sessizce ham (mutlak yollu) bırakıyordu — gizlilik sızıntısı riski.
2. **Boyutsuz okuma (kontrolsüz bellek):** `media-catalog-store.js` `parseEnvelope` dosyayı boyut kapısı olmadan `JSON.parse`'a veriyordu; MAX_ITEMS 10000 kapısı yalnız parse sonrası çalışıyor — çok-GB'lık dosya belleği şişirirdi.

## Düzeltme

- `MAX_PACKAGE_JSON_DEPTH = 32` + `WP_DEPTH` kodlu `packageDepthError`: her iki `visit` derinlik kapılı; tavan meşru verinin (~10 seviye) çok üstünde, yığın sınırının çok altında.
- Export tarafındaki `catch` artık `WP_DEPTH`'i yeniden fırlatır — derin JSON'lu kök dosya, mutlak yollarıyla sessizce pakete yazılmaz, temiz hatayla durur.
- `remapRendererValues`/`restorePackage`: derin girdi artık `'Paket içeriği çok derin'` temiz hatasına düşer (RangeError yok); `JSON.stringify` yalnız sınırlanmış ağaçlara ulaşır.
- `parseEnvelope`: `bytes.length > 64e6` → koruma hatası (utf8 karakter sayısı gerçek boyutun en fazla 1/4'üdür → ~256MB bayt tavanı).

## Kanıt

- `tests/package-parser-resilience.test.js` (yeni, 7 senaryo): derin remap → WP_DEPTH; meşru 20 seviye → geçer; derin kök dosya export → WP_DEPTH; bozuk gzip → temiz hata; 65MB katalog → koruma hatası; bozuk-Unicode katalog → koruma hatası; normal katalog → geçer.
- `media-catalog-store`, `media-catalog-service`, `workspace-privacy`, `workspace-restore-regressions`, `package-integrity`, `catalog-roadmap`, `browser-session-package`, `nmdb-catalog-import`, `windows-package-ignore` — hepsi yeşil.

## Windows etkisi / doğrulanmayanlar

- Saf Node tarafı; platform farkı yok. Python zip tarafı zaten sınırlıydı (değişmedi).
