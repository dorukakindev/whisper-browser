# BROWSER_BUG_REPORT_340 — Kuyruk-50 madde 28: kaynaklara göre kuyruk planlama

Tarih: 2026-10-01 · Başlangıç: `cb5b24f`

## Uygulanan — `src/job-resource-scheduler.js`

- Sınıf bazlı limitler: gpu=1, cpu=2, network=4, disk=4 eşzamanlılık.
- Starvation-free kısa yuva: limit>1 iken uzun işler (long) en fazla
  `limit-1` yuva tüketir; kısa işler her zaman bir yuva bulur — büyük işler
  küçükleri süresiz bekletemez.
- Öncelik + FIFO yaşlanma: `setPriority` kuyruk sırasını değiştirir;
  `release`/`cancel` aynı iade yolundan geçer, çift iade no-op.
- `onDispatch` hook'u: yuva açılan işin id'si çağırana bildirilir.

## Bağlama

- **CEA tam yakalama** (`startBrowserHlsCeaFullCapture`): ≥30 segment 'long'
  network işi. Bütçe doluysa iş 'retry-wait'te bekler; bir indirme veya başka
  network tüketicisi release ettiğinde scheduler onDispatch ile çalıştırır.
  Terminal durumda (`isTerminalJobState`) yuva otomatik iade edilir — iptal,
  hata ve bitiş aynı yoldan geçer.
- **İndirmeler** (`browser-downloads.js`, `scheduler` seçeneği): her yeni
  indirme `network`+`disk` bütçesinden yuva ister; doluysa mevcut 'limit'
  mesajıyla reddedilir (mevcut UX korunur). Bitiş/iptal release tetikler.
  Böylece uzun CEA yakalaması sırasında indirme kapasitesi daralır — gerçek
  hakemleme kuruldu.

## Kanıt — `tests/job-resource-scheduler.test.js` → 14/14 PASS

Limit koruması, uzun-iş ayrık yuvası, kısa-yuva garantisi, çok-sınıflı iade,
öncelik+FIFO sıralaması, setPriority, iptal/release eşdeğerliği, onDispatch
hook'u, normalize kapıları.
