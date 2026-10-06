# BROWSER_BUG_REPORT_403 — "Hatalı cümle" yeniden çeviri döngüsü + kurtarma süre bütçesi

Tarih: 2026-10-06 · Durum: DÜZELTİLDİ (Ubuntu testleri; Windows doğrulanmadı)

## Kullanıcı şikâyeti

Browser tarafındaki transkripsiyon/çeviride bazen "hatalı cümle" çıkıyor; sistem
onu bir saat boyunca düzeltemiyor, yeniden çevirmeye çalışırken de takılıyor.
Kullanıcı hata→tekrar çevir döngüsünden açıkça rahatsız.

## Kök nedenler

1. **Canlı web altyazısı çevirisinde kalite kapısı döngüsü**
   (`src/browser-translation-scheduler.js`). Sayı kapısı (`number_mismatch`)
   ayardaki "gevşek kabul"ü hiç okumuyordu, hep sıkıydı. Kapıya takılan cümle
   geçici hata sayılıp 3 ücretli istekle yeniden deneniyor, model aynı sayı
   yazımını döndürdüğü için sonunda "hatalı" kalıyordu. "Hatalıları yeniden
   dene" aynı 3 denemeyi baştan yapıyor, sonuç değişmiyordu → sonsuz döngü.
2. **Tek hatalı cümle bütün izin kaydını engelliyordu** (`src/main.js`).
   `persistCompletedBrowserTranslation` yalnız `failed === 0` iken çalışıyordu;
   300 cümleden 1'i takılınca 299 hazır cümle diske/arşive hiç yazılmıyordu.
3. **Ağ geri geldiğinde her şey yeniden ücretlendiriliyordu.**
   `browser:network:setOnline` kalite/kesin hataları da yeniden kuyruğa alıyordu.
4. **Whisper çeviri yolunda kurtarmanın süre sınırı yoktu**
   (`backend/transcribe.py`). Zaman aşımı 180 sn × 3 deneme × 2 kurtarma turu ×
   rota sayısı; birkaç takılan grup işi bir saate uzatabiliyordu.
5. **Yeniden çeviri niyet bayrakları sızıyordu** (`src/renderer/renderer.js`).
   "Aralığı/Tamamını yeniden çevir" bayrakları (`translateCueRange`,
   `forceRetranslate`, model/A-B) `makeTransBtn` erken çıkınca (iş çalışıyor /
   kaynak yok) temizlenmiyordu; sonraki sıradan "Çevir" sessizce yalnız eski
   aralığı veya A/B modelini çeviriyordu. `startRangeRetranslate` çalışan işin
   fark anlık görüntüsünü de eziyordu.

## Değişiklikler

- `browser-translation-scheduler.js`
  - `lenient` seçeneği: kapıya takılan çeviri ilk istekte yazılır, önbelleğe
    girmez, sonuçta `qualityIssues` taşır.
  - Sıkı modda kalite kapısı en fazla `maxQualityAttempts` (2) istek yakar.
  - Elle `retryFailed()` kalite hatalı cümleyi bir kez daha ister; kapı yine
    itiraz ederse uyarıyla kabul eder, istek de düşerse önceki adayı kullanır.
    Döngü her koşulda biter.
  - `retryFailed({ onlyTransient: true })`; hata kayıtlarında `kind`
    (`quality` / `definitive` / `transient`).
  - Başarı yolu `commitResult()` metoduna taşındı; `stateSnapshot().qualityAccepted`.
- `main.js`
  - `browserTranslationConfig().lenient = ui.translateLenient !== false`,
    canlı altyazı planlayıcısına geçiriliyor.
  - Kuyruk durulduğunda (pending/queued/retrying yok) hatalı cümle kalsa da
    hazır kısım `{ partial: true }` ile kaydedilir; kısmi iz `autoLoad:false`.
  - Ağ dönüşü (altyazı + sayfa planlayıcısı) yalnız geçici hataları dener.
- `transcribe.py`
  - `TRANSLATION_RECOVERY_BUDGET_SEC = 300`: ilk kurtarma turundan itibaren
    süre dolunca yeni kurtarma isteği açılmaz, kalanlar `recovery_timeout`
    ile işaretlenir, uyarı `warn_list`'e girer. Uçuştaki istek kesilmez.
  - Kurtarma (fallback) istekleri 3 yerine 2 deneme.
  - İki turda kanıtlanmış yankı, bütçe dolsa da istek açmadan kabul edilir.
- `subtitle-output-contract.js`: `recovery_timeout` → "kurtarma süresi doldu".
- `renderer.js`: `clearPendingRetranslateIntent()`; `makeTransBtn`'in tüm erken
  çıkışlarında çağrılır; `startRangeRetranslate` çalışan iş varken çıkar.

## Testler

- Yeni `tests/browser-translation-quality-loop.test.js` — 9/9.
- Yeni `backend/test_translation_recovery_budget.py` — 4/4; düzeltme geri
  alınınca 3/4 kırmızı (testin gerçekten yakaladığı doğrulandı).
- Tüm `tests/*.test.js` yeni ve temel ağaçta karşılaştırıldı: yeni kırmızı yok
  (14 kırmızı dosya temelde de kırmızı; ortam/perf/ratchet kaynaklı).
- Tüm `backend/test_*.py`: yeni kırmızı yok; `test_transcribe.py`'daki tek
  kırmızı (`test_installed_faster_whisper_supports_hotwords`) temelde de var
  (faster-whisper kurulu değil).

## Sınırlar

- Windows'ta gerçek arayüz, canlı sağlayıcı ve uzun video ile doğrulanmadı.
- Bütçe 300 sn sabit; ayar arayüzü eklenmedi (`args.translate_recovery_budget`
  ile koddan değiştirilebilir, alt sınır 30 sn).
- Sayfa/manga planlayıcıları gevşek moda bağlanmadı; yalnız ağ dönüşü kısıtı
  onlara da uygulandı.
