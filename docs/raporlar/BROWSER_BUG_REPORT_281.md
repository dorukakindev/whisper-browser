# BROWSER BUG REPORT 281 — R324-2 subprocess spawn→kill→respawn churn

**Tarih:** 2026-09-30 · **Dal:** `devin/<ts>-r324-2-churn-fuzz` · **Tür:** derin okuma + churn fuzz (temiz)

## Kapsam

R324-2: `src/process-lifecycle.js` `terminateProcessTree` — uygulamanın tüm
alt-süreç öldürme yollarının tek sahiplenme noktası (transcribe, manga,
yakalama, burn-in, yt-dlp, auth akışları). Windows'ta `taskkill /T /F`,
diğer platformlarda `SIGKILL` fallback'i; sahiplenme `_terminating` bayrağı.

## Denetlenen yüzey

- İptal ile üst-süre-sınırının çakışması: `_terminating` ilk çağrıya
  sahiplenme verir, ikinci çağrı `false` döner (yeni zincir başlamaz).
- taskkill asenkron hata + exit: `fallbackUsed` tek SIGKILL'i garantiler.
- 5 sn zaman aşımı → fallback + `killer.kill()`.
- `proc.once('close', cleanup)` → timer temizlenir; kapanan sürece sinyal
  gönderilmez.

## Bulgular

**Gerçek bug yok.** Churn fuzz'ı tüm invariant'ları doğruladı; mevcut
`process-lifecycle.test.js` kapsamı zaten statik senaryoları kilitliyordu —
bu tur rastgele olay-sırası ve gerçek respawn döngüsünü ekledi.

Fuzz hazırlığında iki test-altyapı kusuru düzeltildi (üretim kodu etkilenmedi):
- `close` olayı Promise'de `(code, signal)` çifti vermez; çift beklenmesi
  TypeError üretiyordu.
- `pid=0` tohumu gerçek `pid<=0` fallback yoluna düşüyordu (test üretimi
  değişti: `pid = seed + 1`).
- Olmayan taskkill'e olay gönderilemez; killer op'ları `calls.length > 0`
  koşuluna bağlandı (model-gerçek uyumu).

## Eklenen ratchet

`tests/process-churn-fuzz.test.js` (3 test):

- 1500 tohumlu olay-sırası churn: rastgele {terminate, killer.error,
  killer.exit(0/1/-1), proc.close(exitCode), proc.close(signalCode),
  timeout} dizileri → invariant'lar: `≤1 taskkill spawn`, `≤1 SIGKILL`,
  timeout sonrası tekrar SIGKILL yok (`fallbackUsed`).
- 300 tohumlu sahiplenme kilidi: ikinci çağrı `false`, tek zincir.
- Gerçek süreç churn'ü: 60 tur `spawn(node) → terminate → close(SIGKILL)
  → pid ölü` (linux fallback yolu; win32'de atlanır).

## Doğrulama

- `node tests/process-churn-fuzz.test.js` → 3/3 PASS.

## Windows etkisi

Yok — test-only. Windows CI'da win32-churn testi `return` ile atlanır
(taskkill yolu sahte-killer fuzz'ında zaten kapsanıyor).

## Doğrulanmayan sınırlar

Gerçek `taskkill.exe` davranışı Windows'ta birebir gözlenmedi; sahte-killer
modeli üretim kodunun beklediği sözleşmeyi (error/exit/close) kapsıyor.
