# BROWSER_BUG_REPORT_208 — Kuyruk kill-resume uçtan-uca doğrulaması

**Tarih:** 2026-09-29 · **Kapsam:** `tests/electron-queue-kill-resume.smoke.js` (yeni), `src/queue-persistence.js`, `src/main.js`, `src/renderer/renderer.js`
**Sonuç:** Gerçek bug yok — kurtarma sözleşmesi uçtan uca doğrulandı; davranış elle-devam ettirme (tasarım gereği).

## Senaryo

`electron-queue-kill-resume.smoke.js` tek dosyada sürücü + iki faz koşar:

1. **crash fazı:** Gerçek Electron uygulaması açılır, 2 adet flite üretimi wav klibi kuyruğa eklenir (tiny/CPU/faster, `HF_HUB_OFFLINE=1`), `startQueueBtn` basılır. `queue-state.json`'da ilk öğe `running` + `queueRunning:true` görülünce süreç `process.kill(pid, 'SIGKILL')` ile ölür — `process.exit`'ten farklı olarak Electron'un `exit` handler'ları dahil hiçbir JS koşmaz; kalıntı gerçek çökmeyle birebirdir.
2. **verify fazı:** Aynı `userData` ile uygulama yeniden açılır ve şunlar denetlenir: `N yarım kuyruk işi kurtarıldı` uyarısı log'da görünür; yarım iş `pending` + `recovered:true` olarak durur; kuyruk kendiliğinden başlamaz; `startQueueBtn` basılınca iki iş de `done` olur, 2 `.srt` yazılır ve disk durumu temiz kapanır (`queueRunning:false`).

## Sözleşme netliği (kod okuması)

- Çökmeden kalan `running` öğeler `normalizeQueueSnapshot` içinde `pending` + `recovered` yapılır ve `loadQueueState` bu onarımı hemen diske yazar (`src/main.js`).
- `normalizeQueueSnapshot` `queueRunning`'i yalnız canlı süreçteki aktif işten türetir (`activePresent`) — yani tam çökme sonrası `restored.queueRunning` her zaman `false` döner ve `renderer.js`'teki `if (state.queueRunning) setTimeout(processNextQueueItem)` dalı çökme yolunda fiilen çalışmaz. Bu tutarlıdır: UI metni kullanıcıdan "Kuyruğu başlat"ı istiyor; çöken GPU/ağ işini izinsiz yeniden başlatmak güvenli değildir. Davranış bug değil, belgelenmiş sözleşmedir.
- Medya yetki grant'ları bellekte tutulur; yeniden açılışta `authorizeMediaFile` dosya başına "izin verilsin mi" diyaloğu açar — doğru güvenlik davranışı; smoke `dialog.showMessageBox`'u otomatik İzin Ver'e sabitler.

## Koşulanlar

- `xvfb-run -a npx electron tests/electron-queue-kill-resume.smoke.js --disable-gpu` → PASS (crash → recovered → elle resume → done)
- `node --check tests/electron-queue-kill-resume.smoke.js` → temiz

## Koşulmayanlar / sınırlar

- Windows'ta `process.kill(pid,'SIGKILL')` TerminateProcess'e çevrilir; sürücü assert'i her iki çıkış biçimini de kabul eder ama gerçek Windows koşusu yapılmadı.
- `--all` setine dahildir (`run-electron-smokes.js` glob'u `electron-*.smoke.js`); CI'da Xvfb yoksa ortam SKIP'lerine düşer (venv/HF/flite ön koşulları).
- Crash fazı yalnız ilk iş 'running' iken öldürülür; ardışık çökme (resume sırasında ikinci çökme) kapsam dışı.
