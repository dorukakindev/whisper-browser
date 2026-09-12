# BROWSER-EVENT-DENETIM — Bozuk/Gecikmiş/Tekrarlı/Kaybolmuş/Yanlış Sıralı Event Denetimi

## 1. Yönetici Özeti

Bu tur, renderer'ın "bozuk, gecikmiş, tekrarlı, kaybolmuş veya yanlış sıralı browser event'leri" altındaki güvenilirliğini denetledi. 496 DOM listener (47 tip), 309 IPC çağrısı (165 benzersiz API) envanteri çıkarıldı; event işleme zinciri (`onEvent` → `playerJobEvent` → `finishRun`/`handleProgressiveTerminal`) satır satır okundu; 20 zorlu senaryo çalıştırılabilir testle doğrulandı. Sonuç: **1 YÜKSEK OLASILIKLI bulgu** (IPC gecikme yarışı), 2 TEORİK, 1 MANUAL. P0/P1 KESİN bulgu yok — event kimlik kapıları (`eventMatchesActiveJob`, `queueItemId`, `shouldAcceptRunEvent`, `acceptTerminalEvent`) katmanlı ve doğru çalışıyor.

## 2. Renderer Event/State Envanteri

- **DOM event'leri:** 496 `addEventListener` çağrısı, 47 benzersiz tip (click, keydown, input, change, drop, dragover, pointer*, timeupdate, seeking, seeked, play, pause, error, ended, visibilitychange, unhandledrejection, beforeunload, online/offline, resize, scroll, wheel, compositionend, toggle, contextmenu, dblclick, auxclick, dragstart/dragend, loadedmetadata, progress, waiting, stalled, loadstart, playing, canplay, focus, blur, mousedown/mouseup/mousemove/mouseleave, touchmove).
- **IPC çağrıları:** 309 `window.api.*` çağrısı, 165 benzersiz API (tam liste çalışma kaydında).
- **Kritik state sahipleri:** `state.activeJobId` (tekil iş), `state.currentQueueId` (kuyruk), `state.queueRunning`, `state.awaitingExit`, `state.cancelled`, `state.aiJob`, `state.forceTranslate`, `player.job` (oynatıcı işi), `player.mediaKey`, `player.browserActiveTabId`.
- **DOM yazma noktaları:** 40 `innerHTML` (tamamı kontrollü/`escapeHtml`'li), `logLine`, `renderQueue`, `renderFinalPreview`, `setStatus`, `setProgress`, `renderCueList`, `renderBrowserTracks`.

## 3. IPC ve Preload Sözleşmesi

- `src/preload.js` `contextBridge` ile `window.api.*` yetenekleri açıyor; `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer yalnızca preload üzerinden yetenek kullanıyor; doğrudan Node erişimi yok.
- `window.api.onEvent` tek kanal; main.js her event'i `jobId`/`queueItemId` ile etiketliyor.
- `window.api.onBrowserEvent` ayrı kanal (tarayıcı sekmeleri); `browserEventMatches` ile kuşak/kimlik denetimi.

## 4. Test İzolasyonu ve Ortam

- **Sentetik veri:** tüm testler `scratch/bug-hunt-20260911-2251/` altında; gerçek kullanıcı verisi/anahtar/medya/ağ kullanılmadı.
- **Mock:** renderer state makinesi saf fonksiyonlarla simüle edildi (`shouldAcceptRunEvent`, `eventMatchesActiveJob`, `finishRun`, `removeFromQueue`, `addToQueue`, `openManagedModal`, `logLine` budama, `scheduleLiveCueRender` debounce).
- **Sınırlama:** gerçek Electron DOM'u yerine state simülasyonu; gerçek reflow/performans ölçümü yapılmadı (g13/g18'de maliyet analizi gösterildi).

## 5. Test Günlüğü

| Test ID | Amaç | Sonuç |
|---|---|---|
| g4-a/b | tekrarli done | `awaitingExit`'te reddedilir, `finishRun` ikinci kez çağrılmaz |
| g4-c/d | tekrarli segment | `eventMatchesActiveJob` geçer; canlı cue birleştirme dedupe yapar |
| g5-a | status olmadan progress | kabul edilir (tasarım) |
| g5-b/c | done/error olmadan exit | `finishRun(false)` → "Hazir", sahte tamamlanma yok |
| g6-a/b | error→done, done→error | `awaitingExit`'te reddedilir |
| g6-c | cancel→progress | kabul (iş sürüyor) |
| g6-d | new job→old preview | `eventMatchesActiveJob` reddeder |
| g7-a/c/d/e | eksik type, NaN/negatif progress, bilinmeyen alan | güvenle işlenir |
| g11-a/b/c | cancel race | yeni iş başlatılamaz, geç event `jobId` ile filtrelenir, `cancelled` korunur |
| g12-a/b/c/d | queue mutation | running silinemez, pending silinebilir, clearQueue runningi korur |
| g13-a/b | ayar snapshot | kuyruk öğesi eski ayarları korur, backend snapshot alır |
| g18-a/b/c/d | event storm | log 500'de kalır (9500 removeChild), preview 1500'de kalır, debounce çalışır |
| g19-a/b/c/d | modal sıralama | ikinci modal kuyruğa alınır, ezilmez |

## 6. Kesin Bulgular

Yok.

## 7. Yüksek Olasılıklı ve Çalışma Zamanı Doğrulanmamış Maddeler

### YO-1 — `selectVideo` cevabı gecikmeli geldiğinde kullanıcının arada seçtiği dosya eziliyor (Görev 9)

- **Konum:** `src/renderer/renderer.js` — `dropZone.addEventListener('click', async () => { const files = await window.api.selectVideo(); ... setInputFile(files[0]); })` ve `pickVideosBtn` aynı desen.
- **Kullanıcı/event akışı:** kullanıcı "Dosya seç"e tıklar → sistem dosya diyaloğu açılır (uzun sürebilir) → kullanıcı arada başka bir dosyayı sürükler veya başka yoldan seçer → diyalogdan dönen eski cevap `setInputFile` ile **yeni seçimi ezer**.
- **State ve IPC zinciri:** `window.api.selectVideo()` → `state.inputFile = files[0]` (cevap geldiğinde, o anki UI durumuna bakılmadan).
- **Yeniden üretim:** (1) "Dosya seç"e tıkla, diyaloğu açık bırak; (2) başka bir dosyayı drop zone'a sürükle; (3) diyalogdan bir dosya seç → sürüklenen dosya kaybolur, diyalogdaki yazılır.
- **Beklenen:** cevap geldiğinde kullanıcı arada seçim yaptıysa eski cevap uygulanmamalı (veya kullanıcıya sorulmalı).
- **Gerçek:** eski cevap her zaman uygulanır; `state.inputFile` ezilir.
- **Kullanıcı etkisi:** yanlış dosya transkribe edilir; kullanıcı fark etmeyebilir.
- **Veri bütünlüğü etkisi:** yanlış girdi dosyası.
- **Güvenlik etkisi:** yok.
- **Test açığı:** mevcut testler `selectVideo` mock'unu anında çözüyor; gecikme + arada seçim senaryosu yok.
- **Güven düzeyi:** YÜKSEK OLASILIKLI (kod yolu kesin; kullanıcı etkisi gerçek diyalog zamanlamasına bağlı).
- **Önerilen çözüm:** `selectVideo` çağrısı öncesi bir `selectionToken` üret; cevap geldiğinde `state.inputFile` değiştiyse (veya token eskidiyse) cevabı uygulama. Aynı desen `pickSyncVideo`, `pickFoldersBtn` için de geçerli.
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (dosya seçici handler'ları).
- **Kabul kriteri:** diyalog açıkken sürüklenen dosya, diyalog cevabıyla ezilmez.
- **Regresyon testleri:** gecikmeli `selectVideo` + arada `setInputFile` → eski cevap reddedilir.

### YO-2 — `logLine` 500 satır budaması her çağrıda tek tek DOM siliyor (Görev 13/14/18)

- **Konum:** `src/renderer/renderer.js` `logLine` — `while (log.children.length > 500) log.removeChild(log.firstChild);`
- **Kanıt:** `g18.js` — 10.000 satır storm'da 9.500 `removeChild` çağrısı; gerçek DOM'da her biri reflow.
- **Kullanıcı etkisi:** çok uzun işlerde log alanı takılması, ana thread yükü.
- **Güven düzeyi:** YÜKSEK OLASILIKLI.
- **Önerilen çözüm:** budamayı `requestAnimationFrame` ile toplulaştır veya aralıklı sil (örn. 520'de 20 satır birden).
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (`logLine`).
- **Regresyon testleri:** 10.000 satır → `log.children.length <= 500` + blok süresi ölçümü.

## 8. Manual Doğrulama Gerektiren Maddeler

### M-1 — `preview_refresh` eski işin segmentleri yeni işe sızabilir (TEORİK, Görev 8/12)
`eventMatchesActiveJob` kapısı var; ancak `preview_refresh` dalında `job.mediaKey === player.mediaKey` kontrolü yalnız `job.kind !== 'translate'` iken uygulanıyor. Etiketsiz `preview_refresh` eski işten gelirse teorik sızıntı. **Kanıt eksik:** main.js her `preview_refresh`'i `jobId` ile etiketliyor; TEORİK.

### M-2 — Renderer reload sırasında eski event'lerin kabulü (MANUAL, Görev 15)
Reload sonrası `state.activeJobId` sıfırlanır; main.js eski işten event göndermeye devam ederse yeni renderer `jobId` eşleşmediği için reddeder (`eventMatchesActiveJob`). Ancak **etiketsiz** genel log satırları yeni renderer'a yazılır — bu tasarım gereği (genel uyarılar). Orphan process riski main.js'te `terminateProcessTree` ile kapatılıyor. MANUAL DOĞRULAMA: gerçek reload + devam eden iş senaryosu.

## 9. False Positive'ler

1. **"Tekrarlı done çift toast üretir":** `awaitingExit` kapısı ikinci `done`'u redder; `finishRun` bir kez çağrılır. FALSE POSITIVE (g4-a/b).
2. **"done olmadan exit sahte tamamlanma üretir":** `finishRun(false)` → "Hazir", `activeOutputJob` temizlenir. FALSE POSITIVE (g5-b).
3. **"error olmadan exit sonsuz bekleme":** `finishRun(false)` → "Hazir", `running=false`. FALSE POSITIVE (g5-c).
4. **"null event renderer'ı çökertir":** `unhandledrejection` listener'ı loglar; main.js null göndermez. FALSE POSITIVE (g7-b).
5. **"NaN progress backend'e gider":** `Number.isFinite` kontrolü 0'a düşürür; `setProgress` sınırlar. FALSE POSITIVE (g7-c).
6. **"Yeni iş eski preview'i gösterir":** `clearPreview()` her iş başlangıcında çağrılır; `eventMatchesActiveJob` eski `preview_refresh`'i redder. FALSE POSITIVE (g6-d + önceki tur).

## 10. 20 Görev Sonuç Tablosu

| # | Görev | Kanıt | Sonuç |
|---|---|---|---|
| 1 | Event envanteri | 496 listener, 47 tip, 165 API | OK |
| 2 | Event/state sahiplik | `state.activeJobId`/`currentQueueId`/`awaitingExit` tek sahipli | OK |
| 3 | Geç gelen event | `eventMatchesActiveJob` + `queueItemId` kapısı | OK |
| 4 | Tekrarlı event | `awaitingExit` + `acceptTerminalEvent` + canlı cue dedupe | OK |
| 5 | Kayıp event | `finishRun(false)` → "Hazir", sahte tamamlanma yok | OK |
| 6 | Yanlış sıra | `awaitingExit` error↔done reddeder | OK |
| 7 | Payload bozulması | `Number.isFinite` + `unhandledrejection` | OK |
| 8 | Job/belge kimliği | her event `jobId`/`queueItemId` etiketli | OK |
| 9 | IPC gecikmesi | `selectVideo` yarışı | **YO-1** |
| 10 | Promise reddi/callback exception | `startTranscribeSafe` catch + `unhandledrejection` | OK |
| 11 | Cancel race | `activeJobId` dolu + `cancelled` korunur | OK |
| 12 | Queue mutation | running silinemez, clearQueue korur | OK |
| 13 | Ayar snapshot | `addToQueue` opts dondurur | OK |
| 14 | Preview/çıktı kimliği | `clearPreview` + `eventMatchesActiveJob` | OK |
| 15 | Renderer reload/crash | `eventMatchesActiveJob` + `terminateProcessTree` | MANUAL (M-2) |
| 16 | Pencere kapanışı | `beforeunload` flush + `terminateProcessTree` | OK |
| 17 | DOM güncelleme sırası | `renderQueue` innerHTML temizliği + `setModalBackgroundInert` | OK |
| 18 | Event storm | `g18.js` — log 500, preview 1500, debounce | YO-2 |
| 19 | Adversarial girdi | 40 innerHTML `escapeHtml`'li, CSP etkin | OK |
| 20 | Mevcut test kapsamı | mock'lar idealize; gecikme/tekrar/kayıp senaryoları eksik | raporlandı |

## 11. Event Sırası ve Race Matrisi

| Senaryo | Beklenen | Gerçek | Koruma |
|---|---|---|---|
| done → done (tekrar) | reddet | reddedilir | `awaitingExit` |
| error → done | reddet | reddedilir | `awaitingExit` |
| done → error | reddet | reddedilir | `awaitingExit` |
| exit → done | reddet | reddedilir | `activeJobId=null` + `awaitingExit` |
| cancel → progress | kabul | kabul | iş sürüyor |
| new job → old preview | reddet | reddedilir | `eventMatchesActiveJob` |
| new job → old done | reddet | reddedilir | `eventMatchesActiveJob` |
| done olmadan exit | Hazir | Hazir | `finishRun(false)` |
| error olmadan exit | Hazir | Hazir | `finishRun(false)` |
| selectVideo gecikme + arada seçim | eski cevap reddedilmeli | **eziyor** | **YO-1** |

## 12. Job/Document Identity Sonuçları

- Her backend event'i `jobId` ile etiketli; `eventMatchesActiveJob` aktif işle eşleşmeyeni redder.
- Kuyruk event'leri `queueItemId` ile etiketli; `state.currentQueueId` ile eşleşmeyen reddedilir.
- Etiketsiz olaylar (genel log/uyarı) geçer — tasarım gereği; transkripsiyon dışı bildirimler düşmez.
- `preview_refresh` dahil tüm iş event'leri `jobId` taşır (main.js akışı doğrulandı).

## 13. DOM ve Güvenlik Sonuçları

- 40 `innerHTML` ataması: kullanıcı/backend metni taşıyanların tamamı `escapeHtml()` ile sarılı; statik HTML/SVG sabit.
- CSP: `default-src 'self'; script-src 'self'; object-src 'none'` etkin.
- 811 id'de yinelenen yok; 698 `$()` erişiminin tamamı HTML'de mevcut.
- Adversarial girdi (HTML, attribute, URL scheme, control character, Unicode) `escapeHtml` + `textContent` ile güvenli.

## 14. Performans Sonuçları

- **Log:** 500 satır sınırı var; ancak budama her satır için 1 `removeChild` → 10.000 satır = 9.500 reflow (YO-2).
- **Preview:** `PREVIEW_DOM_CAP=1500`; veri (`state.previewSegs`) tam kalır, DOM sınırlı.
- **Canlı cue render:** 140ms debounce (`scheduleLiveCueRender`); 100 çağrı 1 render'a düşer.
- **Progress:** her event'te `setProgress` + `textContent` güncelleme; throttle yok ama maliyet düşük.

## 15. P0/P1/P2 Uygulama Planı

- **P0:** yok.
- **P1:** YO-1 — `selectVideo`/`pickVideosBtn`/`pickSyncVideo`/`pickFoldersBtn` için `selectionToken` ekle; cevap geldiğinde `state.inputFile` değiştiyse eski cevabı reddet. Kök neden: gecikmeli IPC cevabının o anki UI durumuna bakılmadan uygulanması. En küçük çözüm: çağrı öncesi token üret, cevapta token + `state.inputFile` kontrolü. Korunacak davranış: normal akışta cevap uygulanır. Yan etki: kullanıcı diyalogdan döndüğünde "seçim uygulanmadı" bildirimi gerekebilir. Geriye dönük uyumluluk: yok. Regresyon: gecikmeli cevap + arada seçim → eski cevap reddedilir. Kabul: diyalog açıkken sürüklenen dosya ezilmez. Öncelik: P1. Geri alma: token kontrolünü kaldır.
- **P2:** YO-2 — `logLine` budamasını toplulaştır (rAF veya aralıklı silme). Kök neden: satır başına O(1) silme. En küçük çözüm: 520'de 20 satır birden sil veya rAF ile toplulaştır. Korunacak davranış: 500 satır sınırı + scroll koruması. Regresyon: 10.000 satır → ≤500 + blok süresi. Öncelik: P2. Geri alma: eski while döngüsüne dön.
- **P2 (opsiyonel):** M-1 için `preview_refresh`'e `jobId` zorunluluğu; M-2 için reload + devam eden iş testi.

## 16. Eksik Browser Testleri

- `selectVideo` gecikme + arada seçim yarışı (YO-1).
- 10.000 satır log storm'da gerçek DOM blok süresi.
- Renderer reload + devam eden iş + eski event akışı.
- `preview_refresh` etiketsiz/yanlış `jobId` ile.
- Sürükle-bırak + dosya diyaloğu aynı anda açık.

## 17. Son Git ve Dosya Değişikliği Doğrulaması

```
git status --short  → yalnızca takipsiz (untracked) rapor .md dosyaları + scratch/ (kaynak/test dosyası YOK)
git diff --check    → temiz
git diff --stat     → boş (kaynak/test/üretim dosyasında değişiklik yok)
HEAD                → 5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e (başlangıçla aynı)
```

**Doğrulama:** Ana kod, mevcut testler, package.json ve önceki raporlar bu turda **değiştirilmedi**. Yalnızca salt-okunur test betikleri `scratch/bug-hunt-20260911-2251/` altına yazıldı. Hiçbir düzeltme uygulanmadı; yalnızca bulgular ve uygulama planı raporlandı. Başlangıç ve bitiş Git durumu birebir aynı.
