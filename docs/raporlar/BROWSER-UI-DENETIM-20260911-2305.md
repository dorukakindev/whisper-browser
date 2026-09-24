# BROWSER-UI-DENETIM — Browser Renderer / UI Durum Makinesi Denetimi

## 1. Yönetici Özeti

Renderer/UI katmanı (kuyruk durum makinesi, olay işleme, preview, log, modal, ayar kalıcılığı) bu denetimde **P0/P1 seviyesinde KESİN ürün kusuru üretemedi**. Katman, önceki 355 kapalı bulgudan sonra beklenenden daha sertleştirilmiş durumda; incelenen her riskli noktada (eski iş olayı sızması, çift terminal, kuyruk ayar dondurma, log budama, innerHTML kaçışı, CSP, yinelenen id) koruma mevcut. Rapor 2 YÜKSEK OLASILIKLI ve 4 TEORİK/MANUAL bulgu içeriyor; hiçbirinde üretim koduna dokunulmadı.

## 2. Browser Kapsamı ve Yöntem

- **Salt-okunur:** `src/renderer/renderer.js` (19.765 satır), `src/renderer/index.html` (2.589 satır), `src/renderer/queue-lifecycle.js`, `src/renderer/renderer-ui-model.js`, `src/preload.js`, `src/main.js` (IPC handler'ları), `tests/` (kapsam analizi).
- **Yöntem:** 40 `innerHTML` ataması tek tek incelendi; 698 `$('id')` erişimi HTML id envanteriyle çapraz kontrol edildi; kuyruk/olay/preview/log/modal yolları satır satır okundu; mevcut test dosyalarının neyi koruduğu çıkarıldı.
- **Sınırlar:** gerçek kullanıcı verisi/anahtar/dış servis kullanılmadı; ağ çağrısı yapılmadı; GUI yalnızca önceki turun Electron smoke'larıyla doğrulandı (bu turda yeni GUI oturumu açılmadı).

## 3. Kullanılan Test Komutları

| Komut | Sonuç |
|---|---|
| `node tests/run-all.js` | exit 0 — "Tüm testler geçti" (aynı gün) |
| `npm run test:electron-bridge` | geçti (aynı gün) |
| `node tests/electron-browser-experience-smoke.js` | geçti — panel/ayar/responsive matris/tam ekran/yaşam döngüsü (aynı gün) |
| `node tests/electron-renderer-smoke.js 9333` | geçti — PDF.js, protokol, IPC, okuma modu (aynı gün) |
| `scratch/bug-hunt-20260911-2251/html-scan.js` | id/CSP/label envanteri (salt-okunur tarama) |
| `scratch/bug-hunt-20260911-2251/id-check.js` | 698 `$()` erişimi ↔ HTML id çapraz kontrolü |

## 4. Çalıştırılamayan Testler ve Sebepleri

- **Yeni GUI oturumu açılmadı:** bu tur salt-okunur kaynak denetimi olarak tasarlandı; önceki turun canlı Electron smoke sonuçları (hepsi geçti) GUI doğrulaması olarak kullanıldı. Yeni bir GUI oturumu, kullanıcının açık uygulamasıyla çakışma riski doğururdu — güvenli alternatif: önceki turun sentetik Electron profili sonuçları.
- **Sürükle-bırak, DPI ölçekleme, font büyütme:** gerçek OS pencere olayları gerektirir; sentetik ortamda üretilemez. MANUAL DOĞRULAMA olarak işaretlendi.

## 5. Kesin Bulgular

Yok — bu turda KESİN sınıfına giren ürün kusuru bulunamadı.

## 6. Yüksek Olasılıklı Bulgular

### YO-1 — `logLine` 500 satır budaması her çağrıda DOM'dan tek tek siliyor; yoğun log'da O(n) maliyet (Görev 13/14)

- **Konum:** `src/renderer/renderer.js` `logLine` — `while (log.children.length > 500) log.removeChild(log.firstChild);`
- **Kullanıcı akışı:** uzun transkripsiyonda backend saniyede düzinelerce `log` olayı basar; her satır bir `logLine` çağrısı.
- **Teknik kök neden:** 500 satır dolunca her yeni satır için `removeChild(firstChild)` tek tek çalışır; arka arkaya 100 satır gelirse 100 ayrı DOM silme + reflow. `DocumentFragment` ile toplu ekleme veya sanal liste yok.
- **Beklenen:** log alanı sabit maliyetle budanmalı.
- **Gerçek:** satır başına O(1) silme; yoğun akışta UI thread'i gereksiz yüklenir (ölçülmedi — MANUAL DOĞRULAMA ile ölçüm önerilir).
- **Kullanıcı etkisi:** çok uzun işlerde log alanı takılması; scroll konumu kayması (isNearBottom koruması var ama budama sırasında kayma olabilir).
- **Testlerin yakalayamadığı:** mevcut testler log içeriğini değil davranışını sınıyor; 500+ satır performans senaryosu yok.
- **Güven düzeyi:** YÜKSEK OLASILIKLI (kod yolu kesin; kullanıcı etkisi ölçüm gerektirir).
- **Önerilen çözüm:** budamayı `requestAnimationFrame` ile toplulaştır; ya da satırları 500'ün üstüne çıkmadan aralıklı sil (örn. 520'de 20 satır birden).
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (`logLine`).
- **Regresyon testleri:** 1000 satır bas → `log.children.length <= 500` ve ana thread blok süresi ölçümü.

### YO-2 — `renderFinalPreview` eşleşmeyen kullanıcı düzenlemelerini yalnızca "kopyalanabilir yedek"te tutuyor; sessiz veri kaybı riski (Görev 12/20)

- **Konum:** `src/renderer/renderer.js` `renderFinalPreview` — `playerPreviewUnmatchedEdits = [...]` ayrı kopya; zaman aralığı eşleşmeyen `previewEdited` segmentler ana listeye geri konmuyor.
- **Kullanıcı akışı:** kullanıcı önizlemede bir segmenti elle düzenler; LLM/diarization `preview_refresh` ile segment sınırlarını değiştirirse düzenleme eşleşmez.
- **Teknik kök neden:** eşleşme yalnızca `start|end` anahtarıyla; sınır değişince düzenleme `playerPreviewUnmatchedEdits`'e düşer, ana listede görünmez.
- **Beklenen:** kullanıcı düzenlemesi ya korunmalı ya kullanıcıya açıkça "yedekte" olduğu söylenmeli.
- **Gerçek:** düzenleme ana listeden kaybolur; yalnız ayrı yedekte kalır (kullanıcı bunu fark etmeyebilir).
- **Kullanıcı etkisi:** elle yapılan düzeltme sessizce görünmez olur.
- **Testlerin yakalayamadığı:** `audit-tur5.test.js` "belirsiz bölge yedeği"ni sınıyor ama yedeğin kullanıcıya gösterilmesini değil.
- **Güven düzeyi:** YÜKSEK OLASILIKLI (davranış koddan kesin; etkinin "kayıp" mı "bilinçli yedek" mi olduğu ürün kararı).
- **Önerilen çözüm:** eşleşmeyen düzenleme sayısı > 0 ise önizleme üstünde kalıcı "N düzenleme yedekte" rozeti + tek tıkla geri alma.
- **Etkilenecek dosyalar:** `src/renderer/renderer.js` (`renderFinalPreview`, önizleme UI).
- **Regresyon testleri:** sınırı değişen segment + kullanıcı düzenlemesi → rozet görünür, geri alma çalışır.

## 7. Teorik / Manual Doğrulama Bulguları

### T-1 — `preview_refresh` eski işin segmentleri yeni işin önizlemesine sızabilir (TEORİK, Görev 8/12)
`window.api.onEvent` handler'ı `eventMatchesActiveJob` ile filtreliyor; ancak `preview_refresh` dalında `job.mediaKey === player.mediaKey` kontrolü yalnız `job.kind !== 'translate'` iken uygulanıyor. Eski bir işten gecikmeli `preview_refresh` gelirse ve `jobId` etiketi yoksa (etiketsiz genel olay) eski segmentler `job.liveSource`'a eklenebilir. **Kanıt eksik:** etiketsiz `preview_refresh`'in üretimde eski işten gelip gelmediği main.js akışından doğrulanmadı — main.js her `preview_refresh`'i `jobId` ile etiketliyor görünüyor; bu yüzden TEORİK.

### T-2 — Hızlı art arda "Başlat" çift iş başlatma (TEORİK, Görev 4)
`startTranscribeSafe` `state.activeJobId` kapısıyla korunuyor; ancak ilk `await` öncesi `state.activeJobId = jobId` atanmadan önce ikinci tıklama gelirse teorik pencere var. **Kanıt eksik:** `state.running` ve `startBtn.hidden` UI kapıları bu pencereyi kapatıyor görünüyor; gerçek çift başlatma üretilemedi. TEORİK.

### T-3 — Bozuk `settings.json` sonrası kontrollerin varsayılanı (MANUAL, Görev 16)
`loadSettings` catch'i bozuk dosyada boş obje döndürüyor; renderer `applySettings` her kontrolü `?? varsayılan` ile dolduruyor. **Kanıt eksik:** tüm 100+ kontrolün varsayılanı tek tek doğrulanmadı; bozuk dosya ile gerçek başlatma MANUAL DOĞRULAMA gerektirir.

### T-4 — DPI ölçekleme / font büyütmede taşma (MANUAL, Görev 18)
Responsive matris smoke'ı 1366×768/1920×1080/940×680'de taşma olmadığını doğruladı; ancak Windows %150 DPI veya sistem font büyütme kombinasyonu sentetik ortamda üretilemez. MANUAL DOĞRULAMA.

## 8. False Positive Bulgular

1. **"innerHTML XSS riski":** 40 atama incelendi; kullanıcı/backend metni taşıyanların tamamı `escapeHtml()` ile sarılı (logLine, renderQueue, preview, failure/terminology panelleri). Statik HTML/SVG içerenler sabit. FALSE POSITIVE.
2. **"Yinelenen DOM id":** 811 id içinde yinelenen yok; 698 `$()` erişiminin tamamı HTML'de mevcut. FALSE POSITIVE.
3. **"CSP eksik":** `default-src 'self'; script-src 'self'; object-src 'none'` etkin; `unsafe-inline` yalnız `style-src`'te (tasarım tercihi). FALSE POSITIVE.
4. **"Listener çift bağlanma":** `renderQueue` her çağrıda `list.innerHTML=''` ile eski düğümleri sildiğinden listener'lar yeniden bağlanmıyor; modal/drag handler'ları `AbortController`/tek-seferlik desenle korunuyor. FALSE POSITIVE.

## 9. Görev Sonuç Tablosu (1–20)

| # | Görev | Sonuç |
|---|---|---|
| 1 | İlk açılış ekran tutarlılığı | OK — `restorePersistedQueue` + `renderQueue` + smoke geçti |
| 2 | Dosya/sürükle/URL/geçersiz girdi | OK — `optsProblemInfo` tüm yollarda; sürükle-bırak MANUAL |
| 3 | Başlat/Durdur/İptal/Kuyruğa/Temizle geçişleri | OK — `startQueue`/`finalizeQueue`/`processNextQueueItem` kapıları |
| 4 | Hızlı art arda basma | TEORİK (T-2) — `state.activeJobId` + `state.running` kapıları |
| 5 | Aktif işte ayar/pencere/kapatma | OK — ayar dondurma (addToQueue), kapanış flush'ı |
| 6 | Kuyruk işi kendi ayarını korur | OK — `addToQueue` `opts`'i ekleme anında dondurur |
| 7 | Progress/%/durum/stage/log tutarlılığı | OK — `setStatus`/`setProgress`/`resetStages` tek noktadan |
| 8 | Hızlı/eksik/tekrarlı/yanlış sıra backend olayı | OK — `eventMatchesActiveJob` + `acceptTerminalEvent` kapıları |
| 9 | done/error/exit sonrası durum | OK — `finalizeQueue` + `persistQueueTerminal` |
| 10 | Hata mesajları açık/eyleme dönük | OK — `showJobValidation` alan odaklı mesajlar |
| 11 | Backend çökerse/timeout/IPC reddi | OK — `startTranscribeSafe` catch + sentetik terminal |
| 12 | Preview yenileme | YO-2 (yedek görünürlüğü); T-1 (eski iş sızması — teorik) |
| 13 | Uzun metin/çok segment/büyük log | YO-1 (log budama maliyeti) |
| 14 | Log DOM büyümesi/scroll/blok | YO-1; 500 satır sınırı var, scroll koruması var |
| 15 | Ayar yüklenirken kullanıcı değişikliği | OK — `_applyingSettings` kapısı (Rapor 5 O-4'te korundu) |
| 16 | Bozuk settings.json | MANUAL (T-3) |
| 17 | Form sınır değerleri | OK — sayısal kontrollerin tamamı `type="range"` (min/max sınırlı) olduğundan NaN/negatif/büyük değer **üretilemez**; tek `type="text"` sayısal alan `minSpeakers`/`maxSpeakers` ve `parseInt(...) || 0` NaN’i 0 yapar, backend `if min_speakers:` falsy kontrolüyle güvenle atlar. `t17.js` ile 8 senaryo doğrulandı. |
| 18 | Responsive | OK (smoke matrisi) + MANUAL (T-4 DPI/font) |
| 19 | Klavye/erişilebilirlik | OK — roving tabindex, aria-label (192), label[for] (2 — sınırlı, bkz. not) |
| 20 | Yanlış başarı/sessiz hata/kaybolan iş | OK — `persistQueueNow` hatası loglanıyor; `reportWatchQueueResult` |

**Not (Görev 19):** 530 form öğesine karşı yalnız 2 `label[for]` var; çoğu kontrol `aria-label` (192) veya sarmalayan `<label>` ile ilişkilendirilmiş. Bu bir kusur değil ancak ekran okuyucu kapsamı MANUAL doğrulama ister.

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

## 11. Kullanıcı Akışı Bazlı Risk Değerlendirmesi

- **En yüksek kalıcı risk:** YO-1 (uzun işlerde log performansı) — gerçek kullanıcı etkisi en olası.
- **Orta:** YO-2 (elle düzenlemenin yedekte kaybolması) — veri kaybı algısı.
- **Düşük:** T-1/T-2 (teorik yarışlar, mevcut kapılarla korunuyor).
- **Doğrulanmış güçlü yönler:** kuyruk ayar dondurma, eski iş olayı izolasyonu, CSP, innerHTML kaçışı, id bütünlüğü.

## 12. P0/P1/P2 Uygulama Planı

- **P0:** yok.
- **P1:** YO-1 — `logLine` budamasını toplulaştır (rAF veya aralıklı silme). Regresyon: 1000 satır → ≤500 + blok süresi.
- **P2:** YO-2 — eşleşmeyen düzenleme rozeti + geri alma. Regresyon: sınır değişimi + düzenleme → rozet + geri alma.
- **P2 (opsiyonel):** T-3 için bozuk settings.json başlatma testi; T-1 için `preview_refresh`'e `jobId` zorunluluğu.

## 13. Eksik Test Kapsamı

- Sürükle-bırak dosya bırakma akışı (OS olayı, sentetik üretilemez).
- DPI %125/%150 + font büyütme kombinasyonları.
- Bozuk settings.json ile tam başlatma (tüm kontrollerin varsayılanı).
- 500+ satır log performans ölçümü.
- Eşleşmeyen preview düzenlemesinin kullanıcıya gösterimi.

## 14. Son Git Değişiklik Doğrulaması

```
git status --short  → yalnızca takipsiz (untracked) rapor .md dosyaları + scratch/ (kaynak/test dosyası YOK)
git diff --check    → temiz
git diff --stat     → boş (kaynak/test/üretim dosyasında değişiklik yok)
HEAD                → 5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e (değişmedi)
```

**Doğrulama:** Ana kod, mevcut testler, package.json ve önceki raporlar bu turda **değiştirilmedi**. Yalnızca salt-okunur tarama betikleri `scratch/bug-hunt-20260911-2251/` altına yazıldı. Hiçbir düzeltme uygulanmadı; yalnızca bulgular ve uygulama planı raporlandı.
