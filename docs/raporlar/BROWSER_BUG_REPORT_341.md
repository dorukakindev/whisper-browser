# BROWSER_BUG_REPORT_341 — Kuyruk-50 madde 29: iptalin süreç ağacına yayılması

Tarih: 2026-10-01 · Başlangıç: `b7a49cc`

## Denetim bulgusu (doğrulanmış kusur)

POSIX'ta `terminateProcessTree` yalnız doğrudan çocuğu `SIGKILL` ile öldürüyordu;
python'un spawn ettiği torunlar (ffmpeg, yt-dlp birleştirme) iptalde **yetim
süreç** kalıyordu. Windows'ta `taskkill /T /F` ağacı zaten kapsıyordu.

İkinci kusur: waveform üst sınırı `p.kill()` ham çağrı kullanıyordu (ağaç
törenini atlıyordu).

## Düzeltme

- `spawn` sarmalayıcısı POSIX'te `detached: true` verir → çocuk süreç grubu
  lideri olur; Windows yolu değişmedi (taskkill /T).
- `terminateProcessTree` POSIX'te önce `kill(-pid, SIGKILL)` (tüm grup =
  torunlar dahil) dener; grup lideri değilse ESRCH → tek-süreç kill'e düşer.
  `killFn` enjekte edilebilir (test).
- Waveform >12MB taşması artık `terminateProcessTree` kullanır.

## Mevcut koruma (doğrulandı, değişmedi)

Transkripsiyon: `createProcessTerminalLatch` tek terminal kabul eder, iptal
sonrası geçen 'done/error' yok sayılır + günlüklenir; `cancelFilePath` bayrağı;
`recoverInterruptedOutputs` yarım çıktıyı geri alır. Burn-in: `settled` mandalı,
`job.cancelled` → 'Gömme iptal edildi', temp temizliği; exit-0 sonrası iptal
tamamlanmış dosyayı bilinçli korur. İndirmeler: cancel → 'cancelled' terminal.
CEA: `job.cancelled` her aşamada geçer.

## Kanıt — `tests/process-lifecycle.test.js` → 10/10 PASS

Yeni: grup-kill önceliği, ESRCH yedeği, pid-siz atlama, **canlı doğrulama**
(detached bash→sleep torunu iptalde yetim kalmıyor). Windows tarafı taskkill
kapsamıyla korunur; gerçek Windows doğrulaması sınırlı (Ubuntu CI).
