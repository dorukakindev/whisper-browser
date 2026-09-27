# BROWSER_BUG_REPORT_144 — yt-dlp güncelleyici güvenliği (R168)

Tarih: 2026-09-27 · Dal: codex/r168-ytdlp-gate

## Doğrulanan mevcut savunmalar (önceki turlardan)

- sha256 digest eşleşmesi, wheel regex, HTTPS-tek-seçici, Content-Length +
  gerçek-bayt sınırları, extract'ta traversal+symlink+boyut/dosya-sayısı
  kapıları, atomik `active.json` pointer, çapraz-süreç kilit (token/pid),
  sürüm budama, Windows `_process_alive` (OpenProcess STILL_ACTIVE).

## Bulgular (düzeltildi)

1. **Wheel dosya adı yol ayracı (yazma kaçışı):** seçici regex
   `yt_dlp-[^-]+-py3-none-any.whl` içinde `[^-]+` `/` ve `\` kabul
   ediyordu; `yt_dlp-../../../tmp/evil-py3-none-any.whl` kapıyı geçip
   `transaction/filename` birleştirmesinde staging kökünün dışına
   yazabilirdi. Artık dosya adı tek segment olmalı (`/`, `\` ve
   `Path.name` eşitliği).

2. **HTTPS artefakt/metaveri adreslerinde SSRF:** `_url_is_allowed`
   `https` şemasını her literal IP için kabul ediyordu — zehirlenmiş
   metaveri `https://169.254.169.254/...` veya `https://10.0.0.1/`
   gibi iç adreslere indirme yönlendirebilirdi. Artık literal IP'lerde
   `ipaddress.is_global` şart; alan adları değişmedi, `allow_http_localhost`
   test yolu korunur.

## Not
İkinci bulgu metaveri sunucusu ele geçirme gerektirir (pypi.org JSON'u
tek güven kaynağı); savunma derinliği olarak kapatıldı.

## Testler
- `test_wheel_filename_rejects_path_separators` + `test_https_url_rejects_private_and_link_local_ips` (yeni)
- `test_ytdlp_update.py` → 18/18 OK
