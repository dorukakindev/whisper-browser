# BROWSER_BUG_REPORT_99 — T2: Tam video yakalama ve eksiksizlik kanıtı

Tarih: 2026-09-22 (Europe/Istanbul). Dal `devin/t2-capture-completeness`, taban `origin/master@4453ae0`. Görev: 30 dk'lık, varyant değiştiren ve büyüyen playlist'li bir fixture'da tüm segment/byte-range/altyazı izlerinin hesabını tutmak; eksik/403/GAP/304/yenilenen URL durumunda "complete" yanlış pozitifi üretilememeli; tam/kısmi/iptal/kurtarma sonuçları dosya içeriğiyle UI mesajı tutarlı olmalı; çıktı SRT'si bağımsız orakla karşılaştırılmalı.

## Test altyapısı

- `tests/browser-capture-completeness.test.js` — üretim `parseHlsSegments` + defter fonksiyonları (`mergeCeaCaptureSegments`, `runOrderedCeaCapture`, `summarizeCeaCaptureCompleteness`) üzerinde 30 dk'lık simülasyon: açık liste → büyüyen pencere → araya DISCONTINUITY → imzalı URL yenileme (sig=a→b→c) → EXT-X-GAP → EXT-X-BYTERANGE (3 parça tek bundle URL) → 403 → iptal → kurtarma.
- `tests/electron-capture-completeness.smoke.js` — gerçek Electron + izole profil + gerçek HTTPS fixture (`gauntlet.test`, self-signed; ana-süreç fetch'i resolver kuralıyla 127.0.0.1'e eşlenir). Video statik 20 sn mp4 (sonlu `duration`); playlist değişken sunucu durumuyla büyür/kapanır. Çıktı SRT'si ürün parser'ı yerine dosyada gömülü bağımsız mini-orakla okunur.

## Bulgular

### F-99-1 — Playlist yenilemesinde araya eklenen EXT-X-DISCONTINUITY tam-yakalama defterini bozuyor — FAIL→DÜZELTİLDİ

- **Kod yolu:** `ceaCaptureSegmentIdentity()` — `src/browser-cea-full-capture.js`. Kimlik `${disc}:${seq}` idi. `disc`, parseHlsSegments'in DISCONTINUITY-SEQUENCE sayacıdır; canlı playlist yenilemesinde (reklam arası dönüşü gibi) araya `#EXT-X-DISCONTINUITY` eklenince **aynı fiziksel parça yeni kimlik alır**.
- **Erişilebilir yol:** "Tüm altyazıyı getir" çalışırken liste yenilenir (auto-retry `resolveBrowserHlsCeaFullPlan` → `mergeCeaCaptureSegments`, veya kullanıcı kısmi sonuçtan devam eder). Tamamlanmış `disc:seq` girdileri yeni listede yoktur → `job.completed` sahipsiz kalır → aynı parçalar yeniden indirilip ikinci kez CEA çözümlenir (sınırlı çift cue) ve eski girdiler hiçbir zaman tamamlanamaz → defter toplamı şişer, "eksik" sayısı yanlış kalır.
- **Kullanıcı etkisi:** büyüyen/liste-değişen yayınlarda tam yakalama kalıcı 'partial' görünebilir veya şişen segment sayısıyla yanıltıcı ilerleme verir; aynı parça gereksiz yeniden indirilir/çözümlenir.
- **Önce kırmızı (deterministik):** node testi "kesinti eklenince defter kararlı kalır" — 10 parçalık liste, seq 5 öncesine DISC ekleme: eski kimlikle `merged=15`, `missing=10` (7 tamamlanmış parça dahil her şey sahipsiz). Düzeltme sonrası `merged=10`, `missing=2` (yalnız 8,9; seq 7 GAP zorunlu iş değil).
- **Düzeltme:** seq-ankerli kimlik — `Number.isFinite(sequence)` ise `seq:${n}` (MEDYA-SEQUENCE tabanı + satır artışı: liste içinde satır başına tekil ve kayan pencerede kararlı); `sequence` yoksa eski `disc:url:<stem>` yedeği korunur. `hlsCeaSegmentFetchKey` (canlı decode eşleştiricisi) ayrı kavram, dokunulmadı.
- **Son kanıt (gerçek Electron):** açık liste (2 parça) → kullanıcı retry → resume + manifest yenileme (kapalı liste 4 parça + DISC seq 1 öncesi + imza yenileme) → `ceaCapture.total=4` (eski kimlikle 5 olurdu), `seg-1.m4s` indirme sayısı sabit kaldı (tamamlanmış parça yeniden inmedi), `complete` durumunda GİRDİ dosyası yazıldı.

### F-99-2 — Renderer `normalizeBrowserCeaCaptureState` `complete` alanını düşürüyor — FAIL→DÜZELTİLDİ

- **Kod yolu:** `src/renderer/renderer.js` `normalizeBrowserCeaCaptureState` — main tarafındaki aynı adlı normalleştirici `complete: payload.complete === true` taşırken renderer kopyası bu alanı atlıyordu; `player.browserCeaCapture.complete` hep `undefined` kalıyordu.
- **Erişilebilir yol:** her `cea-capture-progress` olayı. Bugünkü UI kodu `state==='complete'` okuduğu için kullanıcıya görünür hasar yok — **latent sözleşme sürüklenmesi**: `.complete`'i okuyacak herhangi bir UI/teşhis kodu sessizce yanlış çalışırdı (smoke bu yüzden ilk koşuda `undefined` ile kırmızıya düştü).
- **Düzeltme:** normalleştiriciye `complete: event.complete === true` eklendi.
- **Kanıt:** smoke'ta `openDone.complete===false` / `closed.complete===true` artık doğrulanıyor.

## Eksiksizlik ve dosya↔UI tutarlılığı (nicel kanıt)

| Senaryo | state | missing | planReason | complete | UI mesajı | Dosya |
|---|---|---|---|---|---|---|
| Açık playlist (2/2 parça indi) | partial | 0 | open-playlist | false | "…henüz sonlanmadı; yakalanan 1 satır korundu" | yazılmadı ✓ |
| Liste kapandı + DISC + yeni imza (resume) | complete | 0 | — | true | "2 altyazı satırı eksiksiz yakalandı ve GİRDİ klasörüne kaydedildi" | yazıldı ✓ |
| seq-2 403 (taze iş) | partial | 2 | — | false | "2 segment alınamadı; … korundu" | önceki sağlam dosya korunur |
| 403 düzeldi (resume) | complete | 0 | — | true | eksiksiz mesajı | yazıldı |

- **Dosya↔bellek↔UI eşitliği:** GİRDİ'deki `T2 fixture.*.en.CC1.srt` bağımsız orakla parse edildi → `(start,end,text)` kümesi iç track dosyasıyla (`track.path`) **birebir aynı**; satır sayısı = `ceaCapture.cueCount` = `browserTracks[].cueCount` (2=2=2); cue sırası monoton, negatif süre yok, `(başlangıç,bitiş,metin)` tekrarı yok.
- **Çift-iş kanıtı:** `seg-1.m4s` toplam indirme sayısı DISC eklemeden önce ve sonra sabit (2: sayfa-recovery + iş turu) — seq-ankerli kimlikle tamamlanmış parça yeniden inmiyor.

## Çalıştırılan testler

| Test | Sonuç |
|---|---|
| `node tests/browser-capture-completeness.test.js` (yeni, 5 bölüm) | PASS — F-99-1 red→green (merged 15→10, missing 10→2) |
| `node tests/browser-cea-full-capture.test.js` (kimlik literal'ları `seq:` biçimine güncellendi) | PASS |
| `node tests/browser-subtitle-gauntlet.test.js` | PASS |
| `electron tests/electron-capture-completeness.smoke.js` (yeni) | PASS — yukarıdaki tablo gerçek Electron'da üretildi |
| `npm test` (tam paket) | PASS — 192 node + python suite'leri |
| `npm run test:electron-bridge` | PASS (dbus hataları Linux ortam gürültüsü) |

## Yanlış-pozitif kontrolü

- "complete" yalnız `total>0 && planComplete && missing===0 && cueCount>0` koşulunda — open playlist/GAP-eksik/403/duraklama hepsinde `false` doğrulandı (node + Electron).
- Testler yalnız rapor üretip exit 0 dönmüyor: tüm iddialar `assert` ile kapılı; electron smoke başarısızda `app.exit(1)`.
- Fixture üretim parser/scheduler yollarını kullanıyor (`parseHlsSegments`, `runOrderedCeaCapture`, gerçek `runBrowserHlsCeaFullCapture` hattı) — beklenen çıktı kopyalanmıyor, SRT bağımsız okuyucuyla açılıyor.

## Açık sınırlar (dürüst envanter)

- Resume sınırında **boundary-spanning caption kaybı kanıtlanamadı**: fixture'da tüm parçalar aynı fMP4 içeriği taşıyor (mux.js tek segment sunuyor); farklı içerikli iki fMP4-CEA segmenti olmadan "yarım kalan caption açılışının kapanışsız kalması" senaryosu üretilemiyor. Not: bellek-içi resume decoder durumunu koruduğu için teorik risk checkpoint-restore yolunda zaten tam-replay ile telafi ediliyor.
- Kurtarma turunda `cueCount` 2→1 farkı gözlendi — aynı-içerikli segmentlerin decoder-dedupe davranışı; veri kaybı kanıtı değil (yukarıdaki sınırla aynı kök).
- `EXT-X-BYTERANGE` node katmanında kanıtlı (ayrı kimlik + range iletimi); Electron fixture'ına eklenmedi (mini HTTPS sunucusu Range isteğini 206'ya çevirmiyor — ağ katmanını değil defteri doğruluyoruz).
- UI mesajları bu akışta Türkçe üretiliyor; EN yerelleştirme bu PR'ın kapsamı dışında (mevcut davranış korunuyor).
- Gerçek sağlayıcı/gerçek site koşusu yapılmadı; tüm kanıtlar deterministik fixture + gerçek Electron üzerindedir.

## Yeni bağımlılık

Yok — smoke yalnızca mevcut `ffmpeg`/`openssl` ikililerini ve `mux.js`/`hls.js` node_modules fixture'larını kullanır.
