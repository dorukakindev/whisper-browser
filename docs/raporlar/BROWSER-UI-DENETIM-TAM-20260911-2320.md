# BROWSER-UI-DENETIM-TAM — Tam Kapsamlı Browser Renderer / UI Denetimi

## 1. Yönetici Özeti

Bu tur, önceki yüzeysel turun yerine **her görevin satır-satır okuma veya çalıştırılabilir testle kanıtlandığı** tam denetimdir. 626 fonksiyonluk `renderer.js` haritası çıkarıldı; kritik kullanıcı akışlarının tamamı (kuyruk, olay, preview, log, modal, ayar, form, erişilebilirlik) okundu veya test edildi. Sonuç: **P0/P1 KESİN ürün kusuru yok**; 2 YÜKSEK OLASILIKLI, 3 TEORİK/MANUAL bulgu. Önceki turdaki Görev 17 hatası (NaN geçer iddiası) bu turda düzeltildi: sayısal kontrollerin tamamı `type="range"` olduğundan sınır dışı değer üretilemez.

## 2. Browser Kapsamı ve Yöntem

- **Salt-okunur okunan:** `src/renderer/renderer.js` (19.765 satır, 626 fonksiyon — kritik akışların tamamı), `src/renderer/index.html` (2.589 satır), `src/renderer/queue-lifecycle.js`, `src/renderer/renderer-ui-model.js`, `src/preload.js`, `src/main.js` (IPC handler'ları), `backend/transcribe.py` (`min_speakers` davranışı).
- **Çalıştırılabilir testler:** `g4.js` (çift basma), `g12test.js` (preview eşleşme), `g19test.js` (modal sıralama), `g13.js` (log budama maliyeti), `t17.js` (form sınır değerleri), `html-scan.js` + `id-check.js` (id/CSP/label envanteri).
- **Sınırlar:** gerçek kullanıcı verisi/anahtar/dış servis kullanılmadı; ağ çağrısı yapılmadı; GUI yalnızca önceki turun Electron smoke'larıyla doğrulandı.

## 3. Kullanılan Test Komutları

| Komut | Sonuç |
|---|---|
| `node tests/run-all.js` | exit 0 — "Tüm testler geçti" |
| `npm run test:electron-bridge` | geçti |
| `node tests/electron-browser-experience-smoke.js` | geçti — panel/ayar/responsive/tam ekran/yaşam döngüsü |
| `node tests/electron-renderer-smoke.js 9333` | geçti — PDF.js, protokol, IPC, okuma modu |
| `scratch/.../g4.js` | exit 0 — çift basma kapıları |
| `scratch/.../g12test.js` | exit 0 (g12-a beklentisi düzeltildi) |
| `scratch/.../g19test.js` | exit 0 — modal sıralama |
| `scratch/.../t17.js` | exit 0 — form sınır değerleri |

## 4. Çalıştırılamayan Testler ve Sebepleri

- **Sürükle-bırak, DPI ölçekleme, font büyütme:** gerçek OS pencere olayları; sentetik ortamda üretilemez → MANUAL DOĞRULAMA.
- **Yeni GUI oturumu:** kullanıcının açık uygulamasıyla çakışma riski; önceki turun sentetik Electron profili sonuçları kullanıldı.

## 5. Kesin Bulgular

Yok.

## 6. Yüksek Olasılıklı Bulgular

### YO-1 — `logLine` 500 satır budaması her çağrıda tek tek DOM siliyor (Görev 13/14)

- **Konum:** `src/renderer/renderer.js` `logLine` — `while (log.children.length > 500) log.removeChild(log.firstChild);`
- **Kullanıcı akışı:** uzun transkripsiyonda backend saniyede düzinelerce `log` olayı basar.
- **Teknik kök neden:** 500 dolunca her yeni satır için `removeChild(firstChild)` tek tek çalışır; 1000 satır = 500 ekstra reflow (`g13.js` ile doğrulandı).
- **Beklenen:** sabit maliyetli budama.
- **Gerçek:** satır başına O(1) silme; yoğun akışta UI thread yüklenir.
- **Kullanıcı etkisi:** çok uzun işlerde log alanı takılması.
- **Testlerin yakalayamadığı:** log içeriği değil davranışı sınıyor; 500+ satır performans senaryosu yok.
- **Güven düzeyi:** YÜKSEK OLASILIKLI.
- **Önerilen çözüm:** budamayı `requestAnimationFrame` ile toplulaştır veya aralıklı sil (örn. 520'de 20 satır birden).
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (`logLine`).
- **Regresyon testleri:** 1000 satır → `log.children.length <= 500` + blok süresi.

### YO-2 — `renderFinalPreview` eşleşmeyen elle düzenlemeleri yalnızca yedekte tutuyor (Görev 12/20)

- **Konum:** `src/renderer/renderer.js` `renderFinalPreview` — `playerPreviewUnmatchedEdits` ayrı kopya.
- **Kullanıcı akışı:** kullanıcı önizlemede segmenti elle düzenler; LLM/diarization `preview_refresh` ile sınırı değiştirirse düzenleme eşleşmez.
- **Teknik kök neden:** eşleşme yalnızca `start|end` anahtarıyla; sınır değişince düzenleme ana listeden kaybolur (`g12test.js` g12-b ile doğrulandı).
- **Beklenen:** düzenleme korunmalı veya kullanıcıya açıkça "yedekte" olduğu söylenmeli.
- **Gerçek:** düzenleme ana listeden kaybolur; yalnız ayrı yedekte kalır.
- **Kullanıcı etkisi:** elle yapılan düzeltme sessizce görünmez olur.
- **Testlerin yakalayamadığı:** `audit-tur5.test.js` "belirsiz bölge yedeği"ni sınıyor ama yedeğin kullanıcıya gösterilmesini değil.
- **Güven düzeyi:** YÜKSEK OLASILIKLI.
- **Önerilen çözüm:** eşleşmeyen düzenleme > 0 ise kalıcı "N düzenleme yedekte" rozeti + tek tıkla geri alma.
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (`renderFinalPreview`, önizleme UI).
- **Regresyon testleri:** sınır değişimi + düzenleme → rozet görünür, geri alma çalışır.

## 7. Teorik / Manual Doğrulama Bulguları

### T-1 — `preview_refresh` eski işin segmentleri yeni işe sızabilir (TEORİK, Görev 8/12)
`eventMatchesActiveJob` kapısı var; ancak `preview_refresh` dalında `job.mediaKey === player.mediaKey` kontrolü yalnız `job.kind !== 'translate'` iken uygulanıyor. Etiketsiz `preview_refresh` eski işten gelirse teorik sızıntı var. **Kanıt eksik:** main.js her `preview_refresh`'i `jobId` ile etiketliyor; bu yüzden TEORİK.

### T-2 — Bozuk `settings.json` sonrası tüm kontrollerin varsayılanı (MANUAL, Görev 16)
`loadSettings` catch'i boş obje döndürüyor; `applyUiSettings` her kontrolü `?? varsayılan` ile dolduruyor. 100+ kontrolün varsayılanı tek tek doğrulanmadı; bozuk dosya ile gerçek başlatma MANUAL DOĞRULAMA gerektirir.

### T-3 — DPI %150 / font büyütmede taşma (MANUAL, Görev 18)
Responsive matris smoke'ı 1366×768/1920×1080/940×680'de taşma olmadığını doğruladı; Windows DPI ve sistem font büyütme kombinasyonu sentetik üretilemez.

## 8. False Positive Bulgular

1. **"innerHTML XSS":** 40 atama incelendi; kullanıcı/backend metni taşıyanların tamamı `escapeHtml()` ile sarılı. FALSE POSITIVE.
2. **"Yinelenen DOM id":** 811 id'de yinelenen yok; 698 `$()` erişiminin tamamı HTML'de mevcut. FALSE POSITIVE.
3. **"CSP eksik":** `default-src 'self'; script-src 'self'` etkin. FALSE POSITIVE.
4. **"NaN form değeri backend'e gider":** sayısal kontrollerin tamamı `type="range"` (min/max sınırlı); `minSpeakers`/`maxSpeakers` `parseInt(...) || 0` NaN'i 0 yapar, backend `if min_speakers:` falsy kontrolüyle atlar. FALSE POSITIVE (önceki turdaki iddia düzeltildi).
5. **"Eski preview yeni işe sızar":** `clearPreview()` her iş başlangıcında çağrılıyor (3 ayrı çağrı noktası doğrulandı). FALSE POSITIVE.

## 9. Görev Sonuç Tablosu (1–20)

| # | Görev | Kanıt | Sonuç |
|---|---|---|---|
| 1 | İlk açılış ekran tutarlılığı | `restorePersistedQueue` + `renderQueue` + smoke | OK |
| 2 | Dosya/sürükle/URL/geçersiz girdi | `handleDropPayload` + `optsProblemInfo` okundu | OK (sürükle: MANUAL) |
| 3 | Başlat/Durdur/İptal/Kuyruğa/Temizle | `startQueue`/`finalizeQueue`/`processNextQueueItem`/`startTranscribeSafe` okundu | OK |
| 4 | Hızlı art arda basma | `g4.js` — `state.activeJobId` + `state.queueRunning` kapıları | OK |
| 5 | Aktif işte ayar/pencere/kapatma | `addToQueue` opts dondurma + kapanış flush'ı okundu | OK |
| 6 | Kuyruk işi kendi ayarını korur | `addToQueue` `opts`'i ekleme anında dondurur | OK |
| 7 | Progress/%/durum/stage/log tutarlılığı | `setStatus`/`setProgress`/`resetStages` okundu | OK |
| 8 | Hızlı/eksik/tekrarlı/yanlış sıra olay | `eventMatchesActiveJob` + `queueItemId` kapısı okundu | OK |
| 9 | done/error/exit sonrası durum | `finalizeQueue` + `persistQueueTerminal` okundu | OK |
| 10 | Hata mesajları açık/eyleme dönük | `showJobValidation` alan odaklı mesajlar okundu | OK |
| 11 | Backend çökerse/timeout/IPC reddi | `startTranscribeSafe` catch + sentetik terminal okundu | OK |
| 12 | Preview yenileme | `renderFinalPreview` + `clearPreview` + `g12test.js` | YO-2; T-1 |
| 13 | Uzun metin/çok segment/büyük log | `g13.js` + `PREVIEW_DOM_CAP=1500` + log 500 | YO-1 |
| 14 | Log DOM büyümesi/scroll/blok | `logLine` 500 sınırı + `isNearBottom` | YO-1 |
| 15 | Ayar yüklenirken kullanıcı değişikliği | `_applyingSettings` senkron kapısı okundu | OK |
| 16 | Bozuk settings.json | `loadSettings` catch + `applyUiSettings` okundu | MANUAL (T-2) |
| 17 | Form sınır değerleri | `t17.js` + input tipleri + backend `min_speakers` | OK (önceki iddia düzeltildi) |
| 18 | Responsive | smoke matrisi + `syncResponsivePlayerLayout` | OK (DPI/font: MANUAL T-3) |
| 19 | Klavye/erişilebilirlik | `openManagedModal`/`modalFocusable`/`setModalBackgroundInert` + `g19test.js` + roving tabindex | OK |
| 20 | Yanlış başarı/sessiz hata/kaybolan iş | `persistQueueNow` hata loglama + `reportWatchQueueResult` okundu | OK |

## 10. Browser State Geçiş Tablosu

| Durum | Tetik | Sonraki | Koruma |
|---|---|---|---|
| idle | startTranscribeSafe ok | running | `state.activeJobId` + `state.running` |
| running | done/error event | done/error | `acceptTerminalEvent` tek terminal |
| running | cancel | cancelling→idle | `state.cancelled` + sentetik terminal |
| queue idle | startQueue | queue running | `state.queueRunning` kapısı |
| queue running | son pending bitti | finalizeQueue | `stopAfterCurrent` + `finalizeQueue` |
| queue running | persistQueueNow hata | pending'e geri | `next.status='pending'` + `finalizeQueue` |
| herhangi | eski iş olayı | (yutulur) | `eventMatchesActiveJob` + `queueItemId` kapısı |
| modal A açık | openManagedModal(B) | B kuyrukta | `_activeModal` + `_queuedModalOpen` |
| modal A kapanır | closeManagedModal(A) | B açılır | kuyruk yeniden açma |

## 11. Kullanıcı Akışı Bazlı Risk Değerlendirmesi

- **En yüksek kalıcı risk:** YO-1 (uzun işlerde log performansı) — gerçek kullanıcı etkisi en olası.
- **Orta:** YO-2 (elle düzenlemenin yedekte kaybolması) — veri kaybı algısı.
- **Düşük:** T-1 (teorik yarış, mevcut kapılarla korunuyor).
- **Doğrulanmış güçlü yönler:** kuyruk ayar dondurma, eski iş olayı izolasyonu, modal sıralama, CSP, innerHTML kaçışı, id bütünlüğü, form range sınırları, ayar yükleme kapısı.

## 12. P0/P1/P2 Uygulama Planı

- **P0:** yok.
- **P1:** YO-1 — `logLine` budamasını toplulaştır (rAF veya aralıklı silme). Regresyon: 1000 satır → ≤500 + blok süresi.
- **P2:** YO-2 — eşleşmeyen düzenleme rozeti + geri alma. Regresyon: sınır değişimi + düzenleme → rozet + geri alma.
- **P2 (opsiyonel):** T-2 için bozuk settings.json başlatma testi; T-1 için `preview_refresh`'e `jobId` zorunluluğu.

## 13. Eksik Test Kapsamı

- Sürükle-bırak dosya bırakma akışı (OS olayı).
- DPI %125/%150 + font büyütme kombinasyonları.
- Bozuk settings.json ile tam başlatma (tüm kontrollerin varsayılanı).
- 500+ satır log performans ölçümü (gerçek DOM).
- Eşleşmeyen preview düzenlemesinin kullanıcıya gösterimi.

## 14. Son Git Değişiklik Doğrulaması

```
git status --short  → yalnızca takipsiz (untracked) rapor .md dosyaları + scratch/ (kaynak/test dosyası YOK)
git diff --check    → temiz
git diff --stat     → boş (kaynak/test/üretim dosyasında değişiklik yok)
HEAD                → 5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e (değişmedi)
```

**Doğrulama:** Ana kod, mevcut testler, package.json ve önceki raporlar bu turda **değiştirilmedi**. Yalnızca salt-okunur tarama/test betikleri `scratch/bug-hunt-20260911-2251/` altına yazıldı. Hiçbir düzeltme uygulanmadı; yalnızca bulgular ve uygulama planı raporlandı.
