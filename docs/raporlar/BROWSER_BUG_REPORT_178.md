# BROWSER_BUG_REPORT_178 — R219: Devin Review toplu triage (PR #139–147)

Tarih: 2026-09-28 · Dal: `codex/r219-review-triage` · Kapsam: 7 merge'li PR'ın
21 inceleme bulgusunun tamamı.

## Düzeltilen doğrulanmış ürün bug'ı

### F-178-1 — "Sırada dur" sonrası kuyruk başlat düğmesi kilitli kalıyordu

**Kök neden:** `processNextQueueItem` içindeki durdurma dalı
(`renderer.js:695`) `next.status='pending'` + `renderQueue()` +
`finalizeQueue()` çağırır. `renderQueue → syncJobsCenter` düğme durumunu
`queueRunning===true` iken hesaplar → `startQueueBtn.disabled=true`;
`finalizeQueue` bayrakları düşürür ama düğmeleri **yeniden
senkronlamazdı** → düğme kalıcı kilitli, kuyruk yeniden başlatılamazdı.

**Düzeltme:** `finalizeQueue` sonuna `syncJobsCenter()` eklendi.

**Kanıt:** `tests/queue-lifecycle.test.js` R219-01 — gerçek
`processNextQueueItem` + `finalizeQueue` + `syncJobsCenter` gövdeleri vm
sandbox'ında sürüldü: persist beklemesinde `stopAfterCurrent` yükselir →
öğe bekleyene döner → `disabled===false` → yeniden başlatma spawn'a
ulaşır. Düzeltmesiz kaynak üzerinde test **kırmızı** doğrulandı
(`başlat düğmesi kilitli kaldı`), düzeltmeyle yeşil.

## Test/sağlamlaştırma düzeltmeleri (inceleme bulguları)

| # | Bulgu | Çözüm |
|---|-------|-------|
| #139-1 | Ratchet `api.ad` dizgi/yorum içinde de sayıyordu; `api['ad']` kaçıyordu | Tek-geçişli sözcük tarayıcı (yorum+dizgi soyma), köşeli erişim ayrı katmanda; 234 export, 0 kullanılmayan |
| #139-2 | Golden fixture testi metni doğrulamıyordu | `test_recorded_golden_fixtures_parse_lossless` SRT/VTT için boşluk-normalize metin + `dual.srt` satır-içerik kiliti; ASS tek-yönlü kaçış belgeli atlanır |
| #142-1 | `npm run test:electron` argümansız yalnız listeler | ARCHITECTURE/CONTRIBUTING komutları `--all`/`--smoke` ile düzeltildi |
| #142-2 | Zaman-kaydırma smoke'unda IPC ölçülmüyordu | `window.api.shiftSubs` sayaçla sarıldı: mutlu yol 1, onay reddi 2, geçersiz/altyazısız girdide **0 yeni çağrı**, negatif kaydırma 3 |
| #142-3 | Kısmi-alt-sıfır kelepçesi kapsanmıyordu | 3. cue eklendi: −3.6s'de `00:00:00,000 --> 00:00:00,900`'e kenetlenir (silinmez); ayrıca eski `.bak` `backupOnce`'ı atlattığı için fixture temizliği |
| #143-1 | "İş geçişleri iki tarafta da doğrulanır" iddiası yanlış | Gerçek paylaşım yazıldı: renderer job-id yardımcıları + main terminal latch; kuyruk geçişleri renderer'da |
| #144-1 | Arşiv soak JSON'u re-eval'a uygun değil | `evaluationBudgets` (DEFAULT_RESOURCE_SOAK_BUDGETS anlığı) + `_reEvalNote` (budanmış diziler uyarısı) eklendi |
| #144-2 | R215 notunda hash/döküm/Windows komutu eksik | `36de86b` + dosya dökümü + Windows soak komutu |
| #145-1 | UNC testi her platformda reddi varsayıyordu | Platform-bölünmüş sözleşme: POSIX göreli-yol reddi doğrulanır; Windows UNC kabulü (NAS) kapı-reddi-olmama olarak kilitlenir; `\\.\` de kilitlendi |
| #145-2 | stdin >1MB kesik JSON hatası veriyordu | `read(1MB+1)` + açık "1MB sınırını aşıyor" reddi; test hem mesajı hem sınır-altı geçişi kilitler |
| #146-1..3 | (PR #147'de çözüldü) | HF önbellek ön koşulu, flite SKIP, fırtına join — üst turda |
| #147-1 | `HF_HOME` çözüm sırasında yoktu | `HF_HUB_CACHE > HUGGINGFACE_HUB_CACHE > HF_HOME/hub > ~/.cache` zinciri |
| #147-2 | Dizin varlığı boş-önbellek false-pozitifi | `repositoryHasUsableSnapshot` (model-manager hasModelFiles sözleşmesi) |
| #147-3 | Üretim hatası SKIP'e düşüyordu | flite filtre ön-kontrolü → yoksa SKIP; varken hata → FAIL |
| #140-2 | CHANGELOG girdisi eksikti | Unreleased/Fixed: düğme kilitlenmesi + R217 bayat-bayrak + stdin sınırı |
| #140-3 | R211 notunda merge hash'i eksikti | `2b43998` yazıldı |

## Doğrulama

- `node tests/queue-lifecycle.test.js` → 21/21 (R219-01 düzeltmesiz kırmızı kanıtı)
- `node tests/unicode-paths.test.js` → 2429 kontrol
- `node tests/preload-usage-ratchet.test.js` → 234 export, 0 kullanılmayan
- `backend/venv/bin/python backend/test_browser_video_analysis_ocr.py` → 7/7
- `backend/venv/bin/python backend/test_writer_roundtrip.py` → 8/8
- `electron tests/electron-subtitle-shift.smoke.js` → ok (5 senaryo + IPC sayacı + kısmi kelepçe)
- `electron tests/electron-queue-concurrency.smoke.js` → ok (gerçek backend, 0 hata)
- `node --check` renderer.js / smoke'lar → temiz

## Windows etkisi

Ürün kodu değişimi tek satır (`syncJobsCenter()` çağrısı — platformdan
bağımsız mantık). UNC testi platform-bölünmüş: Windows kolda kapı
reddinin gelmediğini doğrular, realpath ağa dokunabilir — paylaşım
erişimsizse fs hatası gelir ama kapı reddi gelmez; bu sözleşme doğru.
Yeni Electron smoke koşuları Windows'ta aynen çalışır.

## Doğrulanmamış sınırlar

- `startQueueBtn.disabled` davranışı vm-sandbox'ta sahte DOM'la kanıtlandı;
  gerçek Electron'da düğmenin görünür durumu el ile doğrulanmadı
  (mantık aynı `syncJobsCenter` hesabı).
- HF_HOME'lu ortam bu kutuda taklit edilmedi — çözüm zinciri kod
  incelemesiyle doğrulandı.
