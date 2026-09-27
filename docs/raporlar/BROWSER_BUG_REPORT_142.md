# BROWSER_BUG_REPORT_142 — .wbp paket güvenliği turu (R166)

Tarih: 2026-09-27 · Dal: codex/r166-wbp-bounds

## Kapsam

`workspace-package.js`, `workspace-video-package.js`,
`backend/workspace_video_package.py`, `browser-session-package.js` ve
`catalog-extensions.js` geri-yükleme akışı uçtan uca yeniden okundu.

## Doğrulanan mevcut savunmalar (önceki turlardan)

- `allowed()`: whitelist kök/dizin + uzantı, `..`/boş segment/`\\`/`:` reddi
- `restorePackage`: `resolve` + `startsWith(root+sep)` zip-slip kapısı,
  hedef zinciri symlink kontrolü, `wx`+rename atomik yazım, uygulanan
  dosyaların geri alınması, `before-restore-*.wbp` kurtarma paketi
- `validate`: 20000 dosya / 24MB base64 / 10k katalog kaydı kapıları;
  mapping hedefleri `allowed()` süzgecinden geçer
- gzip: giriş ≤256MB, `gunzipSync maxOutputLength` çıkış ≤256MB
- Video paketi: Python tarafı asla arşiv-içi yol çıkarmaz — hedefler
  JS'de `basename` ile hesaplanır; 100 GB toplam tavan; eksik girdiler
  'missing' raporlanır; çıkarım sonrası manifest ile arşiv stat eşleşmesi
  (TOCTOU); link `islink` reddi
- Oturum paketi: kind/version kapısı, sha256 checksum, sanitize*

## Bulgu + düzeltme

- **Kurcalanmış zip metaverisi / yarım hedef dosyası:** Python çıkarımı
  `copyfileobj` ile sınırsız yazıyordu; güncel CPython çıktıyı beyan
  edilen `file_size`'a kırpıp Bad CRC-32 yükseltiyor olsa da hata yolunda
  kırpılmış hedef dosya diskte kalıyordu (JS tarafı klasör/manifest
  temizliğine bel bağlıyordu). Artık `_copy_bounded` gerçek bayt sayısını
  beyanla sınırlar ve `_extract_entry` başarısız çıkarımda hedefi siler.
  Her iki çıkarım yolu da (manifest read + video extract) aynı yardımcıyı
  kullanır.

## Testler

- `tests/workspace-video-bounds.test.js` (yeni, 13 kontrol): normal
  roundtrip, sahte `file_size` beyanı (video + manifest) reddi + yarım
  dosya temizliği, `_copy_bounded`/`copyfileobj` ve zip-slip ratchet'leri.
- `browser-report86-regressions.test.js` → 44/44.
- `python3 -m py_compile backend/workspace_video_package.py` temiz.

## Windows etkisi

Yok — Python tarafı platformdan bağımsız; `os.remove` Windows'ta açık
dosyada başarısız olabilir ama hedef `with` bloğundan çıkmış olur.
