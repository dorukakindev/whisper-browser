# BROWSER_BUG_REPORT_263 — R314: günlük dosyası rotasyon/büyüme sınırı

Tarih: 2026-09-30 · Dal: `devin/1790751556-log-rotation` · Kod commit: `98fc9fd`

## Kapsam

`userData/logs` altındaki iş günlüklerinin ve uygulamadaki diğer günlük-benzeri
dosya yazıcılarının büyüme/rotasyon denetimi.

## Sağlam bulunan yüzeyler

- `pruneOldLogs` — dosya adı damgasıyla kronolojik sıralayıp en yeni 100
  `.log` dosyasını tutar (her `startJobLog`'ta çalışır; dizin taraması main
  thread'i yormaz).
- Altyazı düzenleme günlüğü (`*.jsonl`) — dosya başına 4MB, toplam 64MB,
  1000 dosya sınırı; sınırda yazımı reddedip kullanıcıya mesaj döner.
- `browser-translation-cache` journal — `journalMaxBytes` 1MB /
  `journalMaxFlushes` 40 / 10 dk yaş; aşımda sıkıştırma (compaction) yapar.
- `sweepStaleChatFiles` / orphan-transaction süpürmesi — açılışta
  sahiplenmemiş geçici dosyaları temizler.
- `LOG_SKIP` — yüksek frekanslı olaylar (progress/segment/llm_progress/…)
  dosyaya hiç yazılmaz.

## Bulunan ve düzeltilen boşluk

**Tek günlük dosyası bayt sınırı yoktu.** Dosya sayısı 100 ile sınırlıydı
ama her dosya iş içinde sınırsız büyüyordu: uzun bir iş veya gürültülü bir
hata/kayıt döngüsü tek `.log` dosyasını keyfî boyuta şişirirdi
(100 dosya × sınırsız bayt = sınırsız toplam). Düzeltme: `LOG_MAX_BYTES =
4MB` — `jobLog.bytes` sayacı her satırda güncellenir, sınır aşıldığında tek
bir `GÜNLÜK SINIRI` işaret satırı yazılıp `truncated` bayrağıyla sonraki
olaylar düşürülür (düşürme ucuzdur: satır dahi biçimlenmez).

## Testler

- Yeni `tests/log-rotation.test.js` (3 senaryo): sabit+alan ratchet'i;
  4MB aşımında yazım durur + tam bir kesim işareti + `truncated=true` +
  kesim sonrası sıfır yazım; sınır içinde normal yazım + `LOG_SKIP` elemesi.
- Kırmızı kanıtı: aynı testler `origin/master` src/main.js'te 3/3 FAIL.
- `renderer-log-trim`, `disk-full` yeşil; `node --check` temiz.

## Windows etkisi

- Değişiklik platform bağımsız (yalnız JS sayacı + tek satır).
- Windows'ta uzun işlerde `.log` dosyaları artık 4MB tavanlı — `logs:openFolder`
  ile açılan klasörün boyutu ~100×4MB ile sınırlı.
- Doğrulanmadı: gerçek Windows makinede dosya davranışı (kod temelli).

## Sınırlar

- Kesim sonrası kayıplar dosya içinde işaretle belirtilir; yeni dosyaya
  dönmek için yeni iş gerekir (mevcut davranışla uyumlu).
