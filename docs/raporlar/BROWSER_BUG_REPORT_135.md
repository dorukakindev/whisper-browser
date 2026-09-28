# BROWSER_BUG_REPORT_135 — i18n kapanış turu (R136)

Tarih: 2026-09-27 · Dal: `codex/r136-i18n-1790499282` · Temel: `b847410` (R135 sonrası master)

## Özet

EN arayüzde Türkçe kalan dizgi envanteri tamamlandı. İki tarama yapıldı:

1. **Renderer sink'leri** — `src/renderer/*.js` içinde `.textContent`, `.innerHTML`, `.title`, `setAttribute(title/aria-label/placeholder)`, `.placeholder`, `setStatus()`, `notify()`, `announce()`, `uiText()` çağrılarına verilen sabit Türkçe literal'leri: **76 gerçek eksik** bulundu (2'si kasıtlı istisna — aşağıda).
2. **Main → renderer IPC metinleri** — `src/main.js`'te `{ error|message|stage|label: '…' }` alanlarıyla UI'a akan sabit Türkçe literal'leri: **274 eksik** bulundu.

Toplam **348 yeni TR→EN sözlük girişi** eklendi (`src/renderer/ui-locale.js`), ayrıca birleştirilmiş metinler için 3 kalıp (`Bir çalışma alanına en fazla N…`, `Toplam sekme sınırı N…`, `Ayar dosyası okunamadı: …`).

## Ratchet — geri dönüş yok

`tests/i18n-coverage.test.js`'e `sinkMissing()` eklendi: aynı 9 renderer sink kalıbı + main.js `error|message|stage|label` kalıbı her test koşusunda taranır ve **hiçbir kapsanan metin EN'siz kalamaz** (test kırmızı düşer). HTML içeren literal'ler metin düğümlerine ayrıştırılır; birleştirme önekleri (`'…: ' + err.message`) kalıp tablosu üzerinden doğrulanır.

## Kasıtlı istisnalar (ALLOW)

- `İndirilenler\Whisper\GİRDİ` / `İndirilenler\Whisper\ÇIKTI` — Windows'taki gerçek klasör adları, çevrilmemeli.
- `Türkçe`, `Açık` (tema/aynı kalıplar) — mevcut ALLOW listesi.

## Kapsam dışı (belgeli)

- `setBrowserSignal` signal metinleri — zaten `i18n-signal-baseline.txt` = 0.
- `${}` içeren şablon literal'ler — sözlüğe giremez; `patterns` tablosuna aittir (mevcut 27 kalıp genişletildi).
- Python backend log/satır metinleri — AGENTS kuralı gereği eski günlük metinleri Türkçe kalabilir.

## Testler

- `node tests/ui-locale.test.js` → 14/14
- `node tests/i18n-coverage.test.js` → index.html tam; sink eksikleri 0; sinyal 0/0
- `node tests/ui-locale-dynamic.test.js` → 19 örnek + OSD + 27 kalıp
- `node --check src/renderer/ui-locale.js` → temiz

## Windows etkisi

Yok — yalnız sözlük/test verisi; render kodu değişmedi. EN görünümünde daha az Türkçe artık görünecek.

## Doğrulanmadı

EN arayüzde yeni metinlerin gerçek Electron'da görünümü el ile göz atma önerilir (metinler DOM'a yazıldığında MutationObserver çevirir; davranış mevcut testlerle kilitli).
