# BROWSER_BUG_REPORT_379 — Yeni-100 batch 6: kuyruk/kurtarma derinleştirme

Tarih: 2026-10-02 (UTC)
Dal: `devin/1790908520-queue-recovery-b6`
Başlangıç kodu: `1145d9b` · Bitiş kodu: `3896c30`

## Kapsam

Mevcut kuyruk kapsamı zaten geniş olduğu için (queue-persistence, state-corruption, ordering-invariants, writer-interleave, opts-roundtrip, lifecycle, atomic-write-kill + 4 Electron smoke) bu tur kalıcı-kayıt yazıcılarının **girdi güveni** ve **hata görünürlüğü** üzerine derinleşti:

- `src/queue-persistence.js` tam okuma (266 satır) + `src/main.js` kuyruk sürücüleri (`queueStatePath`→`persistQueue*`→`queue:save/saveSync` zinciri)
- `src/renderer/queue-lifecycle.js`, `src/pipeline-job.js`, `src/job-state-contract.js`, `src/job-resource-scheduler.js`, `src/hls-recovery.js`, `src/browser-capture-recovery.js` tam okuma
- Python ikizi `backend/pipeline_control.py::recover_output_transactions` ile JS `recoverOutputTransactions` semantik karşılaştırması
- Renderer tarafı: `persistQueueNow`/`scheduleQueuePersist`/`beforeunload saveQueueStateSync`/`restorePersistedQueue`/`queueSecretsFromCurrentUi` zinciri

## Düzeltilen kusurlar

### B-379-01 — `queue:saveSync` şekil kapısı eksik: bozuk payload kalıcı kuyruğu siliyor

`queue:save` handler'ı `!snapshot || typeof !== 'object' || Array.isArray` kapısına sahipti; `queue:saveSync` yoktu. `sendSync` ile gelen `null`/dizi/sayı gövdesi `mergeQueueSnapshotForSave` → `normalizeQueueSnapshot` içinde boş kuyruğa normalize oluyor ve `writeQueueState` diske `items: []` yazıyordu — `.bak` önceki sürümü tutsa da birincil kayıt siliniyordu. Canlı doğrulama: `mergeQueueSnapshotForSave(disk,{items:1 kayıt}, null, 'x'|42|[]|{items:'nope'})` → `items: 0`.

**Düzeltme:** `queue:saveSync`'e `queue:save` ile aynı şekil kapısı (`Geçersiz kuyruk durumu.`).

### B-379-02 — `validateQueueOptions` `items` dizisi şartı aramıyor

`{items:'nope'}`, `{items:null}`, `{queueRunning:true}` gibi nesne-gövdeli payload'lar `ok:true` dönüyordu; aynı boş-kuyruk silme yolu iki handler'da da açıktı.

**Düzeltme:** `validateQueueOptions` artık `Array.isArray(snapshot.items)` gerektiriyor — tek noktadan iki handler'ı da koruyor. Geçerli boş kuyruk (`items: []`) etkilenmiyor.

### B-379-03 — `persistQueueTerminal/Running` yazma hatası sessiz

`writeQueueState` `{ok:false,error}` döndürdüğünde (dolu disk, izin) ana süreç bellekteki durumla kalıcı kayıt sessizce ayrışıyor ve hiçbir iz kalmıyordu.

**Düzeltme:** iki fonksiyona isteğe bağlı `warn` geri çağrısı; beş çağrı noktası iş günlüğüne `error` seviyesinde yazar. `jobId` spawn `try` bloğu öncesine taşındı (callback'in TDZ çarpmasını önler).

## İncelenip kusur çıkmayanlar (kanıtlı)

- **Python↔JS kurtarma eşliği:** `os.replace(backup→final)` ilk bakışta kullanıcı dosyasını eziyor sanıldı; JS `replaceRecoveredFile` da `.recovery-old`'a taşıyıp siliyor — son durum özdeş, `os.replace` zaten atomik. Davranış-eşit, değişiklik geri alındı.
- **Silinen öğenin dirilmesi:** çalışan işi kuyruktan silmek `updateQueueSnapshotRunning` fallback-insert'ını tetikleyebilir; fakat iş gerçekten koştuğu için kaydının kalması sessiz kayıptan daha doğru — yarı-bilerek tasarım, not edildi.
- **Tek-örnek kilidi, cancel.flag yaşamı, sır-anahtar süzgeci (SECRET_OPTION_KEYS), queueTerminalGuards ömrü, running→terminal dirilmezliği, debounce+beforeunload zinciri** — hepsi yerinde.
- **settings:saveSync** — aynı sınıf kapı zaten var (parity referansı oldu).

## Test kanıtı

| Test | Sonuç |
|---|---|
| `node --check src/main.js` | temiz |
| `tests/adversarial-ipc.test.js` | 18 test — yeni `queue:saveSync bozuk snapshot diske boş kuyruk yazmaz` (9 gövde + pozitif kontrol) |
| `tests/queue-persistence.test.js` | 14 test geçti |
| `tests/queue-writer-interleave.test.js` | 10 kontrol |
| `tests/queue-state-corruption.test.js` | 25.015 kontrol |
| `tests/queue-ordering-invariants.test.js` | geçti |
| `tests/queue-opts-roundtrip.test.js` | 61.388 kontrol |
| `tests/queue-lifecycle.test.js` | 21 test |
| `tests/atomic-write-kill.test.js` | 201 kontrol |
| `tests/ipc-payload-fuzz.test.js` | geçti (213 kanal korpusu; `youtube:authCode` server bekleme önceden allowlist'li) |
| Electron smoke ×4 (`xvfb-run`) | queue-cancel-mid, queue-concurrency, queue-kill-resume, queue-reorder — **4/4 PASS** |

## Windows etkisi

`queue:saveSync` yalnız renderer kapanış/onunload yolunda kullanılır; kapı reddi yalnız bozuk gövdede. `warn` geri çağrısı `writeJobLog`'a yazar — platformdan bağımsız. Windows'ta ayrıca doğrulanmadı (Electron smoke'ları Ubuntu Xvfb).

## Çalıştırılmayanlar

Tam `npm test` paketi koşulmadı — değişen yollarla ilgili tüm kuyruk/IPC dosyaları + 4 Electron smoke koşuldu. GitHub Actions repoda kapalı; CI kanıtı yerel koşulara dayanır.
