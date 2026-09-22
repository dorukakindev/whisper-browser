# BROWSER-KOMBINASYON-DENETIM — Birlikte Kullanılan Özellikler / Geri Dönüş / Eşdeğer İşlemler

## 1. En Önemli Doğrulanmış Sonuçlar

Bu tur, tek tek çalışan özelliklerin **birlikte kullanımında** yanlış dosya/ayar/çıktı/kayıp üretip üretmediğini denetledi. 20 görevin tamamı satır-satır okuma veya çalıştırılabilir testle kanıtlandı. Sonuç: **KESİN bulgu yok**; 1 YÜKSEK OLASILIKLI (önceki turdan YO-1, bu turda yeniden doğrulandı), 2 TEORİK/MANUAL. Özellik etkileşim haritasındaki kritik noktaların tamamı (kuyruk ayar dondurma, eşdeğer giriş yolları, preset koruması, modal sıralama, aynı-adlı dosya izolasyonu, çıktı klasörü izolasyonu) doğru çalışıyor.

## 2. Kaynak Sürümü, Başlangıç Durumu ve İzolasyon

- **HEAD:** `5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e` — dal `master`
- **Başlangıç hash'leri:** renderer.js `810982FAC4350908`, index.html `B97F83EE2DC85A22`, preload.js `E0376E377A72720C`, main.js `3F8BCC41F16D815E`, package.json `4D1EFBA4C6AA5B53`
- **Bitiş hash'leri:** başlangıçla birebir aynı (aşağıda doğrulandı)
- **İzolasyon:** tüm testler `scratch/bug-hunt-20260911-2251/` altında, saf fonksiyon simülasyonları; gerçek userData/anahtar/medya/ağ kullanılmadı; Electron açılmadı (önceki turun sentetik profili sonuçları kullanıldı).
- **npm test:** exit 0, "Tüm testler geçti"

## 3. Mevcut Özellikler ve Ortak State Haritası

| Özellik | Ortak state | Diğer özelliklerle paylaşım |
|---|---|---|
| Dosya seçme (dropZone/pickVideosBtn/drop) | `state.inputFile`, `state.queue` | Kuyruk, başlatma, preview |
| URL girişi | `state.source`, `opts.youtube` | Başlatma, oynatıcı |
| Kuyruk | `state.queue`, `state.queueRunning`, `state.currentQueueId` | Başlatma, ayar snapshot, çıktı klasörü |
| Preset | `_presetReference`, `PERSIST_*_CONTROLS` | Ayarlar, başlatma, kuyruk |
| Ayarlar | `_applyingSettings`, `saveAppSettings` | Tüm başlatma yolları |
| Preview | `state.previewSegs`, `playerPreviewUnmatchedEdits` | Düzenleme, arama, kopyalama |
| Çıktı klasörü | `state.outputDir` → `opts.outputDir` | Kuyruk snapshot, sonuç açma |
| Modal | `_activeModal`, `_queuedModalOpen`, `_dialogResolve` | Onay, dosya seçici, sonuç |

## 4. Eşdeğer İşlem Karşılaştırmaları

| İşlem | Yol A | Yol B | Sonuç |
|---|---|---|---|
| Dosya ekleme | dropZone click → `selectVideo` → `setInputFile` | drop → `handleDropPayload` → `setInputFile` | Aynı `setInputFile`'a çıkıyor; drop PDF/altyazı ayrımı yapar (kasıtlı) |
| Tek dosya başlatma | startBtn → `startTranscribeSafe` | kuyruğa ekle → `processNextQueueItem` → `startTranscribeSafe` | İkisi de aynı `optsProblemInfo` + `startTranscribeSafe`'ten geçer |
| Preset uygulama | `applyPreset` (kontroller + `_applyingSettings`) | elle aynı değerleri gir | `buildOptsFromUI` aynı payload'ı üretir; `_applyingSettings` geri kaydetmeyi engeller |

## 5. İkili/Üçlü Kombinasyon Test Sonuçları

| Kombinasyon | Test | Sonuç |
|---|---|---|
| Çıktı klasörü + kuyruk snapshot | `g8.js` | İş A kendi klasörünü korur, B yenisini alır, genel değişiklik kuyruğu etkilemez |
| Aynı adlı dosyalar + kuyruk | `g9.js` | `queueInputKey` tam yol kullanır, ayrılır; label basename (UI, kimlik değil) |
| Başarılı → başarısız iş | `g10.js` | Doğrulama hatasında `finishRun` çağrılmaz, eski sonuç kalır (doğru) |
| Başarısız → başarılı iş | `g11.js` | `activeJobId` temizlenir, yeni iş başlatılabilir, `forceTranslate` sızmaz |
| Modal + bağlam değişimi | `g15.js` | İkinci diyalog birinciyi `false` ile çözer, kendi cevabını alır |
| Preset + kuyruk + klasör | `g19k.js` K1 | Her iş kendi kombinasyonunu korur |
| Başarısız + panel + yeniden | `g19k.js` K2 | State tutarlı |
| Aynı ad + kuyruk + sonuç | `g19k.js` K3 | Kuyrukta ayrılır |

## 6. Kesin Bulgular

Yok.

## 7. Doğrulanmamış Maddeler ve Elenen Hipotezler

### YO-1 (önceki turdan, yeniden doğrulandı) — `selectVideo` gecikme yarışı
`dropZone`/`pickVideosBtn`/`pickSyncVideo`/`pickFoldersBtn` handler'ları `await window.api.selectVideo()` sonrası cevabı o anki UI durumuna bakmadan `setInputFile`/`addToQueue`'ya uyguluyor. Kullanıcı diyalog açıkken başka dosya sürüklerse eski cevap yeni seçimi ezer. **Bu turda yeniden doğrulandı:** `handleDropPayload` ayrı yol; iki yol arasında token/kilit yok. Çözüm önceki raporda (selectionToken).

### Elenen hipotezler
1. **"Kuyruk doğrulamayı atlar":** `addToQueue` da `optsProblemInfo` çağırıyor; startBtn ile aynı fonksiyon. ELENDİ.
2. **"Preset gizli kontrolü değiştirir":** `applyPreset` yalnız `PERSIST_*_CONTROLS`'teki görünür kontrolleri değiştirir; `_applyingSettings` geri kaydetmeyi engeller. ELENDİ.
3. **"Aynı adlı dosyalar karışır":** `queueInputKey` tam yol (slash normalize + lowercase) kullanır. ELENDİ.
4. **"Çıktı klasörü değişimi kuyruğu bozar":** `opts.outputDir` ekleme anında dondurulur. ELENDİ.
5. **"Modal cevabı yanlış bağlama gider":** `openAppDialog` ikinci çağrıda birinciyi `false` ile çözer; `_dialogResolve` tek. ELENDİ.

## 8. 20 Görev Sonuç Tablosu

| # | Görev | Kanıt | Sonuç |
|---|---|---|---|
| 1 | Özellik etkileşim haritası | Ortak state tablosu (yukarıda) | OK |
| 2 | Eşdeğer giriş yolları | dropZone/drop/pickVideosBtn → aynı `setInputFile` | OK |
| 3 | Tek iş vs tek öğeli kuyruk | İkisi de `optsProblemInfo` + `startTranscribeSafe` | OK |
| 4 | Preset vs elle eşdeğer | `applyPreset` + `currentPresetDiffs` | OK |
| 5 | Aç-kapat döngüsü | `buildOptsFromUI` her seferinde canlı okur; kapalı checkbox `false` gönderir | OK |
| 6 | Motor/mod değişimi | `engine` select + `optsProblemInfo` | OK |
| 7 | Girdi türü değişimi + araçlar | `state.source` + `activateTab` | OK |
| 8 | Çıktı klasörü + kuyruk | `g8.js` | OK |
| 9 | Aynı adlı dosyalar | `g9.js` | OK |
| 10 | Başarılı → başarısız | `g10.js` | OK |
| 11 | Başarısız → başarılı | `g11.js` | OK |
| 12 | Düzenleme + görüntüleme | `renderFinalPreview` + `applySegmentFilter` | OK |
| 13 | Seçim + toplu işlem | `renderQueue` + `clearQueue`/`removeFromQueue` | OK |
| 14 | İşlem sürerken panel/sekme | `saveActiveBrowserTabWorkspace`/`restoreActiveBrowserTabWorkspace` | OK |
| 15 | Modal + bağlam | `g15.js` | OK |
| 16 | Klavye vs mouse | roving tabindex + `handleRovingTabKey` | OK |
| 17 | Yeniden başlatma öncesi/sonrası | `loadSettings` + `applyUiSettings` + `restorePersistedQueue` | OK |
| 18 | Geri dönüş/iptal invariant'ları | `openAppDialog` iptal + `clearPreview` + `finishRun(false)` | OK |
| 19 | Üçlü kombinasyonlar | `g19k.js` K1/K2/K3 | OK |
| 20 | Küçültme + test boşluğu | Mevcut testler kombinasyonları değil tek yolları sınıyor | raporlandı |

## 9. Uygulama Planı

- **P0:** yok.
- **P1:** YO-1 — `selectVideo`/`pickVideosBtn`/`pickSyncVideo`/`pickFoldersBtn` için `selectionToken` ekle; cevap geldiğinde `state.inputFile` değiştiyse eski cevabı reddet. Kök neden: gecikmeli IPC cevabının o anki UI durumuna bakılmadan uygulanması. En küçük çözüm: çağrı öncesi token üret, cevapta token + `state.inputFile` kontrolü. Korunacak davranış: normal akışta cevap uygulanır. Regresyon: gecikmeli cevap + arada seçim → eski cevap reddedilir. Kabul: diyalog açıkken sürüklenen dosya ezilmez. Öncelik: P1. Geri alma: token kontrolünü kaldır.
- **P2 (opsiyonel):** kombinasyon testlerini kalıcı testlere çevir (g8/g9/g10/g11/g15/g19k senaryoları).

## 10. Son Bütünlük Kontrolü ve Kalan Sınırlar

```
git status --short  → yalnızca takipsiz (untracked) rapor .md dosyaları + scratch/ (kaynak/test dosyası YOK)
git diff --check    → temiz
git diff --stat     → boş (kaynak/test/üretim dosyasında değişiklik yok)
HEAD                → 5b000caa35b992a0edc9a3b55ccf1b3212c4ac7e (başlangıçla aynı)
Hash'ler            → başlangıçla birebir aynı (renderer.js 810982FAC4350908, index.html B97F83EE2DC85A22, preload.js E0376E377A72720C, main.js 3F8BCC41F16D815E, package.json 4D1EFBA4C6AA5B53)
```

**Doğrulama:** Ana kod, mevcut testler, package.json ve önceki raporlar bu turda **değiştirilmedi**. Yalnızca salt-okunur test betikleri `scratch/bug-hunt-20260911-2251/` altına yazıldı. Hiçbir düzeltme uygulanmadı; yalnızca bulgular ve uygulama planı raporlandı.

**Kalan sınırlar:** gerçek Electron DOM'u yerine state simülasyonu kullanıldı; sürükle-bırak + dosya diyaloğu aynı anda açık senaryosu (YO-1) gerçek OS diyaloğu gerektirdiğinden MANUAL doğrulama ister; DPI/font büyütme kombinasyonları sentetik üretilemez.
