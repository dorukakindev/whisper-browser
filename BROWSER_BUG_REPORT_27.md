# Browser Denetim Raporu 27 — Derin Tarama (Modül Kapanışı + Deneysel Doğrulama)

Tarih: 2026-09-15 · Dal: `master` · Başlangıç HEAD: `9afc877`
Kapsam: `src/` altındaki kalan ~30 browser modülünün tam okunması + 3 bulgunun canlı node deneyleriyle doğrulanması. Ürün kodu değiştirilmedi. Ağaçtaki kullanıcı değişikliklerine (capture/dash/integrity/main/preload/renderer + testler) dokunulmadı.

## Deneyler (bu tur gerçekten çalıştırıldı)

| Deney | Komut | Sonuç |
|---|---|---|
| B9 arşiv yetimi | `node -e` (archive.store ×3 revizyon, temp dir) | **3 revizyon → 4 yetim dosya** — doğrulandı |
| B8 recovery-flush | `fs.renameSync` patch → constructor throw | **Constructor patlıyor, örnek yok** — doğrulandı |
| B12 kapı zehirlenmesi | Gerçek `browser-tabs.js` modülü | **`m2/a2/op2` → false, `m1/a1/op1` → false** — doğrulandı |
| B14 kapanış flush yarışı | `PersistentTranslationCache`, `fs.promises.writeFile` 300 ms'ye patch'lendi | **Devam eden flush sürerken gelen 2 yeni çeviri diskte hiç görünmedi** — doğrulandı |
| `browserActiveCuesAt` referans-karşı fuzz | 4000 rastgele cue seti × 46 zaman noktası, brute-force karşılaştırma | **0 uyuşmazlık** — algoritma doğru |
| `browserActiveCuesAt` yerinde-mutasyon | Aynı dizi/uzunluk, `cue.end` yerinde büyütüldü | **Bayat önek nedeniyle cue kayboluyor** (izole testte) — ama üretim çağrı yolunda erişilemez, bkz. B15 |
| ReDoS taraması | `browser-subtitles.js`'in 14 dışa açık ayrıştırıcısı, 20-200k'lık kötü niyetli girdi | **En kötü 403 ms** (`cuesToSrt` 200k cue) — ReDoS yok |
| `browser-series-context` örtüşme araması | 3000 rastgele cue/çeviri seti, brute-force karşı | **0 uyuşmazlık** — doğru |

## Yeni doğrulanan bulgular

### B14 · P2 — Uygulama kapanışında çeviri önbelleği veri kaybı (deneyle doğrulandı) [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
`src/browser-translation-cache.js:102-140` (`PersistentTranslationCache.flush`) + `src/main.js:10902-10915` (`before-quit`).

Kapanış handler'ı `cache.flush()`'ı çağırıp bekliyor ve bittiğinde `app.quit()` yapıyor — niyet doğru. Ancak `flush()` şu satırla başlıyor:

```js
if (this.flushPromise) return this.flushPromise;   // satır 105
```

Eğer kapanış anında **zaten devam eden** bir flush varsa (örn. son çeviriden hemen önce planlanmış `scheduleFlush`), kapanış bu **eski** promise'i alır ve bekler. Bu sırada `set()` ile gelen yeni çeviriler `this.map`'e ekleniyor ama devam eden yazma bunları **görmüyor** (payload zaten `flush()` başında serileştirilmiş). `flush()` sonunda `flushedVersion !== this.version` kontrolü yeni bir flush planlıyor (satır 136) — ama bu ikinci flush yalnız `setTimeout` ile **kapanıştan sonra** çalışacak, `before-quit` onu beklemiyor.

**Deney sonucu:**
```
kapanis flush === devam eden flush? false
bellekte: cumle-1,cumle-2,cumle-3
DISKTE  : cumle-1
KAYIP   : cumle-2,cumle-3
```

**Etki:** Yavaş disk (HDD, antivirus taraması, ağ sürücüsü) + kapanıştan hemen önce yapılan çeviriler → o çeviriler diske hiç yazılmadan uygulama kapanıyor. Bir sonraki açılışta aynı metinler tekrar API'ye gönderilip tekrar ücretlendiriliyor. Aynı sınıf `browserMangaCacheInstance` için de geçerli.

**Öneri:** `flush()` içinde, dönen promise'in en güncel `version`'ı yansıttığından emin ol — ör. devam eden flush varsa onu bekleyip `version` değiştiyse **hemen** ikinci bir flush'ı zincirle (kapanışın da bekleyebileceği şekilde), `setTimeout`'a bırakma. Ya da kapanışta `while (flush sürüm güncel değilse) await flush()` döngüsü kullan.

**Regresyon testi:** Yavaş `fs.promises.writeFile` mock'u ile devam eden flush sırasında `set()` çağır; kapanışın beklediği promise'in son sürümü içerdiğini doğrula. Şu an içermiyor.

### B15 · Bilgi (erişilemez risk, düzeltme önerisi) — `browserActiveCuesAt` önek önbelleği yerinde-mutasyonda bayatlıyor [SONUÇ: REDDEDİLDİ (AKTİF ÜRÜN HATASI DEĞİL) · KISMEN SERTLEŞTİRİLDİ]
`src/browser-subtitles.js:1039-1066` — `_prefixCache` bir `WeakMap<cueDizisi, {length, prefix, tailCue, tailEnd}>`. Aynı dizi nesnesi + aynı `length` iken bir cue'nun `end`'i **yerinde** değiştirilirse (dizinin sonuncusu hariç), önbellek bunu fark etmiyor ve eski `prefix` maksimumlarıyla çalışıyor — uzun bir cue sessizce "aktif değil" sayılabiliyor.

İzole testte doğrulandı:
```
B1) t=5.5 once : kisa
B2) t=5.5 sonra: kisa      (beklenen: uzun,kisa — 'uzun' cue'nun end'i 2'den 100'e yerinde büyütüldü)
```

**Ancak üretim çağrı yolu incelendiğinde bu ERİŞİLEMEZ:** tek tüketici `main.js:9335`, `browserActiveCuesAt.toString()`'i `applyBrowserOverlay()` her çağrıldığında (`main.js:9343`) **tüm IIFE scriptini yeniden enjekte ederek** çalıştırıyor. Her enjeksiyon `findCues` için yeni bir fonksiyon nesnesi (`${finder}` yeniden eval) yaratıyor, dolayısıyla `_prefixCache` her cue güncellemesinde sıfırdan kuruluyor; `state.source` de her seferinde main process'ten JSON ile serileştirilip page context'inde yeni bir dizi olarak oluşuyor (Node ve page ayrı V8 realm'leri, referans paylaşılmıyor). Sayfa içi rAf render döngüsü aynı diziyi çerçeveler arası tekrar kullanıyor ama cue içeriğini hiçbir yerde yerinde değiştirmiyor.

**Sonuç:** Bug'ın kendisi gerçek ve fonksiyon izole kullanıldığında (ör. gelecekte canlı ASR'nin son cue'yu yerinde uzatan bir optimizasyon eklemesi durumunda) tetiklenir, ama bugünkü tek üretim çağrı yolunda zararsızdır. Rapora "aktif bug" değil "gizli kırılganlık" olarak ekleniyor.

**Öneri:** `_prefixCache` anahtarına `length` yanında son elemanın `end` değerini de (veya basit bir sürüm sayacı) dahil et; ileride array'i yerinde mutasyonla güncelleyecek bir çağıran gelirse sessizce yanlış sonuç vermesin.
**Regresyon testi:** yukarıdaki B1/B2 senaryosu — düzeltmeden sonra `t=5.5`'te `uzun,kisa` dönmeli.

### B12 · P3 — Olay kapısı reddedilen olayla zehirleniyor, iki bağlamı birden reddediyor [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
`src/browser-tabs.js:71-75` — `accept()` şu sırayla çalışıyor:

```js
if (mediaId) current.mediaId = mediaId;          // 71 — ÖNCE YAZ
if (acquisitionId) current.acquisitionId = acquisitionId; // 72
if (operationId && current.operationId && operationId !== current.operationId)
  return false;                                   // 74 — SONRA REDDET
```

Reddedilen olay `mediaId`/`acquisitionId`'i zaten ezmiş oluyor. Deney:

```
gate.open('t', 1, { mediaId: 'm1', acquisitionId: 'a1', operationId: 'op1' });
accept({ type:'cue', tabId:'t', generation:1, mediaId:'m2', acquisitionId:'a2', operationId:'op2' }); // true (ilk kurulum)
accept({ ..., mediaId:'m2', acquisitionId:'a2', operationId:'op-X' });                               // false — ama bağlamı ezer
accept({ ..., mediaId:'m2', acquisitionId:'a2', operationId:'op2' });                                // false — geçerli olay da reddedilir!
accept({ ..., mediaId:'m1', acquisitionId:'a1', operationId:'op1' });                                // false — eski bağlam da reddedilir!
```

Kapı kilitleniyor; yalnızca `establishesContext` taşıyan olaylar (`capture-status`, `navigation`) bağlamı sıfırlayıp kurtarıyor. Medya operasyon kimliği `op-N` her yakalama yeniden başlatmasında değişiyor — bayat bir `translation-result`/`diagnostics` olayı (başka bir operasyondan) tüm sonraki cue/durum akışını yutabilir → altyazılar görünürde kaybolur, tanılar sessiz kalır.

**Öneri:** bağlam yazımını tüm doğrulamalardan SONRAya taşı; `return false` yolları kapıyı değiştirmesin. Ya da reddedilen yazımı geri al.
**Regresyon testi:** reddedilen bir olayın sonrasında (a) yeni bağlam, (b) eski bağlam olaylarının kabul edildiğini doğrula — her ikisi de şu an `false` dönüyor.

### B13 · P4 — Alt-önizleme kalıcı takılıyor: çeviri görünümünde kaynak metin [SONUÇ: DOĞRULANDI · DÜZELTİLDİ]
`src/browser-page-translate.js` — `showOriginal(ref)` `ref.previewOriginal = true` yapıyor (1039-1048); `keyup` Alt → `restoreView(state.hoveredRef)` (1142-1149). Ama `hideTools()` `state.hoveredRef = null` yapıyor (1053-1057) ve `pointermove`/`pointerout`/`scroll` her an tetiklenebiliyor.

Senaryo: Alt basılı tut → imleç oynar/kaydırma → `hoveredRef` null'lanır → Alt bırakılır → `restoreView(null)` → `previewOriginal` sonsuza `true` kalır → blok çevrilmiş görünümde orijinal metin gösterir. `hideTools` ayrıca `ref.previewOriginal`'i temizlemiyor — yani takılan blok yeni hover'da bile eski halinden dönmeyebilir.

**Öneri:** `hideTools()` içinde aktif `previewOriginal` referansını da restore et; ya da `previewOriginal`'i `state`'te tut (ref yerine) ki keyup referanssız da kapatabilsin.
**Regresyon testi:** Alt-basılı iken `pointerout` tetikle → keyup → bloğun çeviri metnine döndüğünü doğrula. Şu an kaynak metin kalıyor.

## Yanlış pozitif düzeltmeleri (dürüstlük için)

- **B5 (rapor 25) geri çekildi:** `browser-asset-store.js` içerik-adresli — aynı `assetId` her zaman aynı içerik; eksik SRT `getTrack`'te kendini onarıyor. JSON+SRT çifti atomik olmasa da veri tutarsızlığı oluşmuyor.
- **`browser:extras` cancel-kapısı şüphesi geri çekildi:** `browser-feature-services.js:97` 'cancel' dalı `valid()` kontrolünden ÖNCE çalışıyor — bayat-kuşak iptali engellenmiyor.
- **`moveBefore` uyumu:** Electron 43 (Chromium ~142) — DOM `moveBefore` mevcut; overlay kodu sorunsuz.
- **`gate.open` her `tabs-changed`'de bağlamı sıfırlıyor şüphesi:** `browser:event` aynı kanaldan FIFO geldiği için bayat anlık görüntü yeni olayı geçemez — tutarlı.

## Doğrulanan gözlemler → geliştirme önerisi

| Konu | Dosya:satır | Not |
|---|---|---|
| OpenSubtitles her istekte login | `browser-subtitle-search.js:81-91` | `token` yerel değişken; username+password varsa her arama/indirme login POST'u yapar → çift istek + gecikme + rate-limit riski. Bellekte token önbelleği + 401'de invalidasyon önerilir. |
| Sekmeler arama sıralamasında şişirilmiş | `browser-library-tools.js:78` | `updatedAt: Date.now()` → 'all' kapsamında açık sekmeler hep en üstte, gerçek isabetleri limit dışına itiyor. Sekmelere gerçek `lastActivated`/`visitedAt` verilmeli. |
| `ceaUrlKey` sorguyu atıyor | `browser-cea-captions.js:84-91` | Aynı pathname'li segmentler (token'lı canlı playlist) yanlış matcher'a eşleşebilir → yanlış discontinuity. Şartlı — çoğu CDN sorunsuz. |
| Mini-player `loadFile` yakalanmıyor | `browser-mini-player.js:48` | Pencere yükleme sırasında kapanırsa unhandled rejection. `.catch(()=>{})` yeterli. |
| Atomik olmayan özellik yazıları | `browser-feature-services.js:131,267` | `encoding-apply`/`subtitle-download` doğrudan `writeFileSync`; yeni rastgele adlı dosyaya yazdığı için yalnızca yetim dosya riski — yıkıcı değil. |

## Sağlam çıkan modüller (tam okundu)

`browser-translation-cache.js` (şema+bak+corrupt arşivleme, sürüm-takipli flush), `browser-session-package.js` (checksum doğrulamalı taşınabilir paket, yerel dosya yollarını bilinçli ayıklıyor), `browser-series-context.js` (atomik commit + ikili arama), `browser-workflow-recorder.js` (adım whitelist + bağlam doğrulaması adım öncesi/sonrası), `browser-subtitle-search.js` (bounded stream, https-only indirme), `browser-sponsorblock.js` (tam doğrulama), `browser-tab-history.js`, `browser-subtitle-files.js` (path-traverse korumalı sahiplik), `syncBrowserTabs` (renderer.js:5037-5113 — kapı kuşakları max ile korunuyor).

## Açık bulguların güncel tablosu

| ID | Özet | Durum |
|---|---|---|
| B7 P2 | İzin modeli: 'ask' kaydı siliniyor → varsayılan allow (UI 'Sor' gösterirken sessiz izin) | Açık |
| **B14 P2** | Kapanışta devam eden flush yarışı → son çeviriler diske yazılmadan kayboluyor | **Yeni + deneyle doğrulandı** |
| B1 P3 | `retryFailed` ağ geri gelince `completeTrack` → kota genişlemesi | Açık |
| B8 P3 | Note-store recovery-flush korumasız → özellik ölümü | **Deneyle doğrulandı** |
| B9 P3 | Arşiv revizyon birikimi | **Deneyle doğrulandı** |
| **B12 P3** | Kapı zehirlenmesi | **Yeni + deneyle doğrulandı** |
| B2 P3 | bfcache'te preload gözlemcileri ölü; WeakSet'ler restore'da da sıfırlanmalı | Açık |
| B3 P4 | Split'te tam ekran bounds tutarsızlığı | Açık |
| B4 P4 | `load-retry`/`html-full-screen` olayları işleyicisiz | Doğrulandı |
| B6 P4 | Enter busy korumasını atlıyor | Doğrulandı |
| B10 P4 | `downloadActive` ölü bayrak | Açık |
| B11 P4 | Sayfa-içi exclude politika tutarsızlığı | Açık |
| **B13 P4** | Alt-önizleme takılması | **Yeni** |

## Eksik testler (öncelikli)

1. `browser-translation-cache.js` — kapanışta devam eden flush sırasında gelen `set()`'in kaybolmadığını doğrulayan test (B14, **P2 — en yüksek öncelik**).
2. `browser-tabs.js` — reddedilen olayın kapı bağlamını değiştirmediğini doğrulayan birim testi (B12).
3. `browser-page-translate.js` — hideTools + Alt-keyup yarışında `previewOriginal` temizliği (B13).
4. `browser-site-permissions.js` — 'ask' tercihinin karar motorunda gerçekten `ask` döndürdüğü (B7).
5. `browser-translation-archive.js` — N revizyon sonrası dosya sayısının sınırlı kaldığı (B9).
6. `browser-note-store.js` — flush hatasında constructor'un hayatta kaldığı (B8).
7. `browser-subtitles.js` — `browserActiveCuesAt`'in `_prefixCache` anahtarına son cue'nun `end`'ini de katması (B15, düşük öncelik — şu an erişilemez).

## Sonraki tur adayları

`src/renderer/renderer.js`'in kalan ~10k satırı (UI olmayan yardımcılar hariç büyük kısmı tarandı), `main.js` 4112-4453 dışındaki bakiye bölgeler ve `backend/` (şimdiye dek yalnızca dokunuldu).

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

- B12: media/acquisition/operation doğrulamaları bağlam yazımından önce tamamlanıyor. Reddedilen çapraz-bağlam olayından sonra özgün geçerli olayın kabul edildiği regresyonla doğrulandı.
- B13: araçlar pointerout/pointermove ile kapanırken hoveredRef null yapılmadan önce restoreView çağrılıyor; kaynak önizleme çeviri görünümüne kalıcı yapışmıyor.
- B14: flush sırasında sürüm değişirse yeni yazım planlanıyor; kapanış yolu planlı yazımdan sonra güncel flush'ı ayrıca bekliyor. Yavaş disk mock'unda geç gelen anahtarların diskte kaldığı test edildi.
- B15 ret gerekçesi: raporun kendi üretim-yolu incelemesi aynı dizi nesnesinin iç cue'sunu yerinde değiştiren erişilebilir bir çağıran bulunmadığını kanıtlıyor. Bu nedenle aktif ürün hatası değildir. Sona ekleme ve son cue bitiş değişikliği tailCue/tailEnd ile korunuyor; keyfi iç-eleman mutasyonu immutable cue sözleşmesinin dışındadır.
- Doğrulama: report-25-28-regressions, browser-tabs, browser-translation-cache, browser-subtitles ve browser-workflow-core testleri geçti.
