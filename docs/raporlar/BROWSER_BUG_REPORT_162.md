# BROWSER_BUG_REPORT_162 — R182: backend yan araçları + ara-yüz ikinci geçiş

Tarih: 2026-09-28 · Dal: `codex/r182-backend-tools-1790546000` · Temel: master `803337a`

Kapsam: önceki turlarda az okunan `backend/` yan araçlarının ikinci derin
geçişi + `src/` hiç-raporlanmamış dosya süpürmesi + yeni desen taramaları.

## Doğrulanmış bulgu

### B1 — bozuk araç yanıtı ham SyntaxError olarak sızıyordu [Düşük — düzeltildi]
`src/browser-dialogue.js` iki `JSON.parse(run(...))` çağrısını sarmalıyordu;
Python yan sürecinden bozuk satır geldiğinde kullanıcıya "Unexpected token"
yerine İngilizce parser hatası gidiyordu. Kod tabanının kalıbı
(`browser-media-tools.js` → `Medya aracından geçersiz yanıt alındı.`) şimdi
aynı biçimde uygulanıyor: `Konuşma aracından geçersiz yanıt alındı.`

### Kapsam boşluğu — browser-dialogue testleri [Yeni]
`git ls-files` × `docs/raporlar` + `tests/` çaprazı: test kapsamasız son src
modülleri `browser-dialogue.js` (main), `browser-analysis-tools.js` ve
`browser-dialogue.js` (renderer). Yeni `tests/browser-dialogue.test.js`
(`Module._load` kancasıyla `node:fs` + `browser-media-tools` stub — builtin'ler
`require.cache`'i atlar, bu yüzden _load hook'u gerekli):

- 6 doğrulama kapısı spawn öncesi reddediyor (start<0, end≤start, >60sn,
  allowlist dışı model, büyük/3 harfli dil, NaN)
- eksik `separator-venv` → `install-browser-extras.bat` mesajı
- tam akış: ffmpeg `-nostdin -ss X -i -t (end-start)` argümanları doğru
- ayrılmış çıktı geçici klasör dışına taşarsa `Konuşma çıktısı geçersiz.`
- her hata kolunda `fs.rmSync(folder)` temizliği çalışıyor
- bozuk JSON → Türkçe mesaj

## Derin okunan temiz yüzeyler (13 modül)

- `separate_dialogue.py` — stdin JSON IPC, `redirect_stdout(sys.stderr)` ile
  stdout'u tek JSON satırına koruyor; ana çağıran zaten sınır doğruluyor.
- `translation_memory.py` — WAL + şema/kolon kapısı + bağlam-parmak-izi
  çapalı fuzzy kapı (sayı/negation/modal/zamir/özel-ad/noktalama hepsi
  ayrı imza) + yumuşak satır sınırı budaması. `quick_ratio` üst-sınır
  optimizasyonu doğru.
- `browser_media_tools.py` + `src/browser-media-tools.js` — satır-FIFO
  kalıcı işçi (stale-worker `retire` korumalı), 24MB istek/5MB yanıt tavanı,
  OCR kare boyut+çözünürlük+krop sınırları, semantic 10k cue / 500 char sınırı,
  `child.unref` + stdio `.unref?.()` çıkış düzeltmesi belgelenmiş.
- `catalog_scan.py` — symlink + reparse-point filtresi, 5000 satır tavanı,
  `onerror` uyarı toplama.
- `pipeline_control.py` — transaction journal: stage→prepared→committed,
  rollback + başlangıç kurtarma (Windows PID-alive OpenProcess ile doğru),
  `_entry_paths_are_local` containment, kilitli hedefte defer+uyarı.
- `model_benchmark.py` — nvidia-smi 3s timeout, VRAM süreç→GPU-delta fallback,
  ffmpeg 180s sınırı, A/B diff eşleşmesi toleranslı.
- `export_anki.py` — 32MB giriş/32MB dosya/256MB toplam bütçe, içerik-hash
  medya adlandırma, html.escape, `.apkg` zorunluluğu, atomik write.
- `browser_video_analysis.py` — 120 kare/60sn/0.5-5s aralık kapıları,
  intro adayları `suggestOnly` (kullanıcıya öneri; otomatik atla YOK).
- `ndjson_utils.py`, `io_errors.py`, `nmdb_catalog_import.py` (salt-okur
  URI + query_only + tablo kapısı), `subtitle_sdh.py` (iç-içe parantez
  stack parser + modifier sözlüğü + belirsiz eşleşmede kaynak koruma).
- `src/renderer/browser-analysis-tools.js`, `src/renderer/browser-dialogue.js`
  — sekans+bağlam-imzası staleness koruması, iptal yayılımı doğru.

## Desen süpürmeleri

- `Math.random` kimlik üretimi (13 site) — hepsi çarpışma-toleranslı UI/DOM id'si
  (Date.now() + rastgele); güvenlik/atomiklik kritik ID değil → temiz.
- Argümansız `.sort()` (11 site) — hepsi string veya sıfır-dolgulu anahtar;
  `catalog-extensions` zaman-damgası adları 13 haneli sabit genişlikte →
  lexicographic doğru. Sayısal `.sort()` bulunamadı.
- `.github/workflows/ci.yml` + `install.sh`/`start.sh` — set -euo pipefail,
  cuDNN LD_LIBRARY_PATH glob guard'lı, `exec npm start`, osmatru matrix
  (ubuntu+windows), ffmpeg per-OS, bridge smoke'lar, py_compile cap.

## Testler

- `tests/browser-dialogue.test.js` (yeni): 8 senaryo ✓
- `tests/browser-video-analysis.test.js` ✓, `tests/browser-stream-fixtures.test.js` ✓
- `node --check` src/browser-dialogue.js + yeni test ✓

## Windows etkisi

Minimal: konuşma-ayırma hata mesajı Türkçe; işlem akışı değişmedi.
Doğrulanmamış: Windows'ta gerçek `install-browser-extras.bat` ortamıyla
deneysel konuşma ayırma (önceki el kontrolü önerisi sürüyor).
