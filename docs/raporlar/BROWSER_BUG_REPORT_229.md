# BROWSER_BUG_REPORT_229 — Canlı ASR hattı derin turu (R279)

Tarih: 2026-09-30 · Dal: `fix/r279-live-asr` · Kapsam: `src/renderer/live-asr-worklet.js`, `src/main.js` canlı-ASR bloğu (start/stop/sweep/IPC/displayMedia), `src/renderer/renderer.js` yakalama kancaları, `src/browser-live-audio.js`, `backend/live_asr.py`.

## Bulgular

### BUG — düzeltildi: `getDisplayMedia` alt karelere de açıktı

`installSystemAudioCaptureHandler` (`src/main.js`) `requestFrame === mainFrame || requestFrame.top === mainFrame` kabul ediyordu — ana pencerenin çerçeve ağacındaki **herhangi bir iframe**, bir kullanıcı jestiyle `getDisplayMedia({audio:true, video:true})` çağırıp ekran görüntüsü + sistem loopback sesi elde edebilirdi. Uygulama yalnız üst renderer dokümanından (`renderer.js` `startBrowserLiveAsr`) bu isteği yapıyor; hiçbir meşru alt-kare isteği yok.

**Düzeltme:** kabul koşulu `requestFrame === mainFrame`'e daraltıldı. Ratchet: `tests/electron-security.test.js` — handler bloğunda `requestFrame.top` kabulü yasak, üst-doküman eşitliği + `userGesture` + `audioRequested` koşulları zorunlu. Kırmızı kanıtı: aynı test `master`'da FAIL (`requestFrame.top` kabulü tespit edildi), dalda PASS.

### Sadece raporlanan (davranışsal sınır, bug değil)

1. **Python yaşam-bekçisi yok:** `live_asr.py` tek chunk'ta `model.transcribe` takılırsa süreç sonsuz bekler; ana süreç 8-parça kuyruk sınırına ulaşınca yeni parçalar "kuyruk dolu" uyarısıyla reddedilir ama iş `active` görünür. Kullanıcı Durdur diyene kadar sürer; `stopBrowserLiveAsr`'ın 15 sn `terminateProcessTree` eskalasyonu yalnız durdurmada çalışır. İyileştirme adayı (watchdog), bilinçli ertelendi — kötücül senaryo değil, donma senaryosu.
2. **Seek drift-flush kozmetiği:** seek'te ≤8 sn'lik eski-eksen sesi eski zaman damgalarıyla yazıldıktan sonra boşaltılır; overlay'de kısa bir geçmiş-parça görünebilir. Sözleşme gereği veri kaybı yerine doğru davranış; testle kilitlendi.
3. **CPU geri-dönüşü yeniden-besleme çoğaltma ihtimali:** düşen CUDA süreci bir segmenti stdout'a basıp `chunk_done` basamadan ölürse, kuyruktan yeniden beslenen chunk aynı konuşmayı iki kez yazdırabilir. `chunk_done`'sız çıkış yalnız çökme anında olur; seyrek ve kozmetik.

## Doğrulanan temiz yüzeyler

- **Worklet buffer sözleşmesi:** 8 sn üst sınırı aşılmaz (yazma→kontrol sırası); 4 sn + 0.2 sn sessizlikte erken flush; `flush` mesajı kısmi buffer'ı boşaltıp `flushed` bildirir ve saati sıfırlar (senkronsuz çekim üretmez); drift >0.75 sn'de eski eksenli parça boşaltılıp sum/weight sıfırlanır; rate [0.0625, 16] kelepçeli; NaN/bozuk sync reddedilir; ±1 ötesi genlik int16'ya kelepçelenir; çok-kanal ortalama + kanal sayısı değişimi güvenli; boş/kanalsız kare çökertmez.
- **IPC `browser:liveAsr:chunk`:** sessionId+tabId sahiplik kapısı, format beyanı, ≤8 dosya, base64 ≤384000 char/≤288000 byte/çift, offset≥0, rate∈[0.0625,16] — tümü önceki turlarda kurulmuş, doğrulandı.
- **`pcm16Wav`:** Buffer/çift-bayt/≤16000·2·9/sampleRate=16000 doğrulamalı 44-bayt WAV sarması.
- **`live_asr.py`:** stdin NDJSON kuyruğu stop'ta boşaltılır; `parse_chunk_offset`/`parse_chunk_rate` hataları `chunk_done`+error ile döner (ölmüyor); `stopped` garantili; EOF'da kuyruk boşaltılıp çıkılır.
- **`stopBrowserLiveAsr`:** 'stop' → 15 sn `terminateProcessTree` eskalasyonu (R196); `modelProcesses` kümesi kapanışa kadar izlenir.
- **CPU geri dönüşü:** `canFallBackToCpu` kapısı (yalnız stopping¬ ∧ ready¬ ∧ cuda ∧ tek sefer) + `pendingChunks` yeniden besleme — mevcut testle kilitli, doğrulandı.
- **`sweepBrowserLiveAsrTemp`:** yalnız başlangıçta çalışır; aktif iş sırasında çağrılmaz.

## Testler

| Dosya | Sonuç |
| --- | --- |
| `tests/live-asr-worklet.test.js` (13 senaryoya genişletildi) | PASS |
| `tests/electron-security.test.js` (+4 displayMedia ratchet'i) | 1302 kontrol PASS (master'da FAIL — kırmızı kanıt) |
| `tests/live-asr-fallback.test.js` | 6 kontrol PASS |
| `node --check src/main.js` | OK |

## Doğrulanamayan sınırlar

- Gerçek `desktopCapturer` akışı ve Windows `start.bat` ortamında loopback ses yolu — yalnız sözleşme/statik katmanda kilitlendi; Windows CI beklenir.
- `installSystemAudioCaptureHandler`'ın davranışsal (gerçek iframe reddi) E2E'si — iframe'siz ana pencerede üretim yolu tek olduğundan statik ratchet yeterli görüldü.
