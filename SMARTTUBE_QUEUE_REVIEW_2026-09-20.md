# Code Review — SmartTube süreklilik (1a+1b)

- **Kapsam:** `fc42b40` (ilerleme çubuğu + "İzlemeye devam et" rayı + resume) ve `2b67ea3` (kullanıcı kontrollü oynatma sırası). Diff: `6db0be8..2b67ea3`, `src/renderer/renderer.js` +218, `styles.css` +29, `ui-locale.js` +4, test +216.
- **Hedef şartname:** FEATURE_RECOMMENDATION_REVIEW_2026-09-20.md öncelik-1 kabul kapısı.
- **Not:** Linear ticket yok; push edilmiş master commit'leri review birimi olarak alındı.

## Özet

**Karar: Request Changes (1 Major + 3 Minor)** — özellik iskeleti ve testler sağlam; kuyruk/Next düğmesi durum senkronunda işlevsel bir boşluk var.

## Gereksinim kontrolü (kabul kapısı)

| Koşul | Durum |
|---|---|
| Video-ID mapping (`youtube:<id>` kanonik anahtar) | ✅ kart/probe/queue aynı anahtarı üretir |
| Çift kart yok | ✅ `railIds` feed dedupe'a dahil |
| Yeniden başlatmada devam | ✅ localStorage + `pendingLibrarySeek` |
| Sıra öngörülebilir sürer/temizlenir | ⚠️ dequeue yalnız başarılı açılışta (doğru); ama F1/F5 altında |
| Kart/bağlam klavye davranışı | ✅ Enter/Space + stopPropagation + preventDefault |
| ended/manuel-next yarışı | ✅ `openIntent`/`pendingAutoOpen` son-yazan-kazanır |
| Başarısız-probe geri dönüşü | ✅ dequeue akış açılışına bağlı |

## Bulgular

### F1 — Major · Bug · `renderer.js:22971-22991` (`stQueueToggle`) + `renderer.js:16460`
**Next düğmesi kuyruk değişimlerinde bayat durumda kalır.**
- `stQueueToggle` hiçbir yerde `updatePlaylistButtons()` çağırmaz → YouTube videosu oynarken kullanıcı SmartTube'a dönüp sıraya eklerse, oynatıcıya döndüğünde "Sonraki" hâlâ `disabled` (tıklanamaz — manuel sonraki ölü). Ancak `ended` gelince `stQueueAutoNext` devreye girer; yani tutarsız yarı-çalışma.
- `setMediaKey` içinde `updatePlaylistButtons()` (16460) `player.mediaKey = nextKey`'den (16462) **önce** çalışır → yeni YouTube açılışı `ytQueued`'i eski `file:` anahtarıyla değerlendirir, Next yanlışlıkla kapalı kalabilir (dequeue yolunda düzeliyor ama kafa-dışı açılışta kalmaz).
- **Öneri:** `stQueueToggle` sonunda `updatePlaylistButtons()` çağır (fonksiyon bildirimi hoist edilir — güvenli) ve `setMediaKey`'de atama sonrası da bir çağrı ekle.

### F2 — Minor · Bug/UX · `renderer.js:23033-23043` (`stQueuePlayNext`)
**Sıradan otomatik-geçiş `pendingLibrarySeek`'i beslemez** → yarım kalmış bir kayıt sıranın başındaysa, `ended` sonrası baştan başlar; kart tıklaması resume yapar, oto-next yapmaz. Tutarsız davranış.
- **Öneri:** `stQueuePlayNext` içinde `watchItemByKey(key)` → `!completed && position>0` ise `player.pendingLibrarySeek = { key, generation: null, seconds }`.

### F3 — Minor · Design · `renderer.js:23017-23026` (`stQueueDequeueIfPlaying`)
**Yalnızca sıra başı eşleşirse düşürülür** → kullanıcı sıranın ortasındaki videoyu karttan elle açarsa kayıt kuyrukta kalır ve auto-next ile **yeniden oynatılır** (tekrar). FIFO "oynatılan tüketilir" semantiği için açıklık.
- **Öneri (karar gerekli):** başarılı açılışta eşleşen kaydı herhangi bir konumdan kaldır, ya da mevcut davranışı kabul edip raporda "kafa-dışı oynatma kuyruğu korur" olarak belgele.

### F4 — Nitpick · UX · `renderer.js:22985-22988`
50 kapasitesinde `stQueue.push` sonrası `shift()` en eski kaydı **sessizce düşürür** — kullanıcıya hiçbir sinyal yok. `logLine` veya kart düğmesinde kısa durum metni düşünülebilir.

### F5 — Nitpick · Kozmetik · `renderer.js:22771-22786`
Ana sayfa rayları render anında dondurulur; kuyruk başka yerden değişirse (dequeue) ray eski kartı göstermeye devam eder (düğme '+' görünür ama kart listede kalır). Bölüm yeniden yüklenince düzelir.

## Güvenlik kontrolü — temiz

- `thumb`/`videoThumbnails` iki yolda da `http(s)` şema beyaz listesine indirgeniyor (`loadStQueue` regex + `absThumb`).
- Kart metinleri `textContent` ile basılıyor — HTML enjeksiyonu yok.
- `videoId` URL'e `encodeURIComponent` ile gidiyor; localStorage parse `try/catch` + tip doğrulamalı.
- Yeni IPC/ana-süreç yüzeyi yok; secret/log sızıntısı yok.

## Standartlar kontrolü — temiz (bir düzeltmeyle)

- `--accent-contrast` token'ı (ilk sürümdeki sabit `#1b1408` design-system testinde yakalanıp düzeltildi) ✓
- Türkçe kod yorumları, iki dilli UI etiketleri (`ui-locale.js`) ✓
- Yeni bağımlılık yok ✓ · kaynak-sözleşmesi testleri yerine davranış testi kalıbı (vm sandbox + fake DOM/storage) ✓
- `updatePlaylistButtons`'ın 300-karakter pencere testi bilinçli korunmuş (tek satır) — kabul edilebilir; uzun vadede davranış testine taşınabilir.

## Pozitif gözlemler

- Dequeue'un akış açılışına bağlanması ("başarısız probe sırayı korur") kabul koşulunun en riskli maddesini temiz çözer.
- Kart tıklaması ile kuyruk oynatması aynı `queuePlayerProbeFromCard`/`pendingAutoOpen` mekanizmasını paylaşıyor — ikinci bir yarış penceresi açılmamış.
- Testler gerçek fonksiyonları vm bağlamında çalıştırıyor (kalıcılık, şema temizliği, dequeue kimliği) — regex-iddiası değil.

## Öneriler

1. **Merge öncesi:** F1 (Next düğmesi senkronu) düzeltilmeli — iki satırlık değişiklik.
2. **Önerilir:** F2 (oto-next resume) + F3 kararı.
3. **İsteğe bağlı:** F4/F5.

Test durumu review anında: report67 72/72, player-ui 145/145, design-system ✓, npm test tek hata = belgeli fts5 ortam sınırı.
