# BROWSER_BUG_REPORT_360 — Kuyruk-50 Madde 48: Windows süreç ve dosya sınırları

Tarih: 2026-10-01 · Dal: `devin/1790893409-kuyruk-48` · Başlangıç kod: `439fdad` · Bitiş kod: `c55cc6f`

## Kapsam ve yöntem

Madde 48: *"Windows süreç ve dosya sınırları (Türkçe karakter, uzun yol, açık dosya kilidi, iptalda süreç sonlandırma; cmd/PowerShell/başlatıcı karşılaştırma)."* Beş eksen denetlendi; bir gerçek kusur düzeltildi, diğerleri kanıtlı temiz.

## B-48-01 — Paket exe'si `longPathAware` bildirmiyordu (düzeltildi)

Electron'un gömülü varsayılan uygulama manifesti `longPathAware` içermez; `LongPathsEnabled` registry değeri tek başına yetmez — ikisi de gerekli (Microsoft dokümanı). `tools/package-windows.js` manifest'e hiç dokunmuyordu → `D:\Whisper Local\...\derin-klasör\video.srt` gibi >260 karakterlik yollar paket uygulamada Win32 MAX_PATH'e takılırdı.

**Düzeltme:** yeni `tools/windows-manifest.js` — `mergeLongPathAware(xml)` idempotent XML birleştirme (asm.v3 `<application>` → mevcut `<windowsSettings>` içine `<ws2:longPathAware>true</ws2:longPathAware>`; windowsSettings yoksa blok; asm.v3 yoksa `</assembly>` öncesi komple blok) + `patchExeManifest(exe)` (resedit ile RT_MANIFEST type-24 kaynağı oku→birleştir→yaz). `package-windows.js` packager sonrası exe'yi yamalıyor; yama başarısızsa paketleme açık hata verir. Yeni devDependency `resedit@3.1.0` (2026-08-25 yayını, ≥7 gün; pure-JS PE kaynak düzenleyici — mt.exe/SDK gerektirmez).

## Matris sonucu

| Eksen | Durum | Kanıt |
|---|---|---|
| Türkçe karakter yollar | TEMİZ | `unicode-paths.test.js` 2429 kontrol PASS (UTF-8 uçtan-uca + Windows ayrılmış kökleri R107). |
| Uzun yol (>260) | **DÜZELTİLDİ** | B-48-01 — manifest yaması + 9-bölüm test. |
| Açık dosya kilidi | TEMİZ (not) | Atomik yazıcılar `.tmp → rename`: hedef kilitliyse EPERM çağırana ulaşır, kullanıcı kapatıp yeniden dener — sessiz kayıp yok, `.bak`/birincil korunur. Retry eklenmedi: durum zaten gürültülü ve güvenli. |
| İptalde süreç sonlandırma | TEMİZ | `terminateProcessTree` — win32'de `taskkill /pid /T /F` (torunlar dahil), POSIX'te detached grup-liderine `kill(-pid)`; ownership latch `_terminating`, 5 sn fallback, `process-lifecycle.test.js` 10/10 PASS (canlı torun-kill dahil). |
| cmd/PowerShell/başlatıcı | TEMİZ | Repo'da `.ps1` yok; `shell:true`/`cmd.exe` kullanan spawn yok — tüm alt süreçler argv-dizisiyle başlar (kabuk tırnak farkı üretemez). Başlatıcılar: `start.bat` (cmd) → npm → electron; `install-*.bat` → node orchestrator; tek kabuk yüzeyi cmd'dir. |

## Test kanıtı

- `tests/windows-manifest-longpath.test.js` (yeni, 9 bölüm): tipik Electron manifesti merge (ws2 içeri + dpiAwareness korunur), idempotentlik, windowsSettings'siz asm.v3, asm.v3'süz manifest, bozuk girdi, sahte-resedit uçtan-uca, RT_MANIFEST-yok hatası, paketleme bağlama ratchet'i, gerçek `resedit/cjs` yüklemesi — **PASS**.
- `node tests/unicode-paths.test.js` — 2429 kontrol **PASS**; `node tests/process-lifecycle.test.js` — 10/10 **PASS**; `node --check tools/windows-manifest.js tools/package-windows.js` — temiz.

## Windows'ta doğrulanamayan sınırlar

- resedit ile gerçek PE yaması uçtan uca denenmedi — `package:win` Windows'ta koşar; manifest içeriğini `tools/smoke-windows-package.js` sonrası doğrulamak el listesinde (PowerShell `[System.Reflection]` ya da mt.exe ile RT_MANIFEST okunup longPathAware aranabilir).
- `taskkill /T /F` gerçek Windows davranışı (torun ffmpeg/yt-dlp) canlı denenmedi; POSIX karşılığı canlı testle kilitli.
- Açık-dosya kilitli hedefe `renameSync`'in gerçek EPERM davranışı Windows'ta denenmedi.
