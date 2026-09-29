# BROWSER_BUG_REPORT_231 — Depo yazım dayanıklılığı (fsync) + review triage turu

R281 · Tarih: 2026-09-30 · Dal: `fix/r281-store-resilience` · Temel: `21f36ef`

## Düzeltilen bulgular

### BUG-231-1 — Beş deponun commit yolunda fsync yoktu (durability gap)

`watch-library-store` tam tören kullanıyordu (temp → `fsyncFile` → rename →
`fsyncDirectory`), fakat aynı kritiklikteki beş yazım yolu yalnız
temp+rename yapıyordu:

- `browser-session-store.writeBrowserSessionAtomic`
- `browser-note-store.flush` (ayrıca ölü `flush: true` seçeneği — `writeFileSync`
  için geçersiz, `WriteStream` seçeneği; yok sayılıyordu, kaldırıldı)
- `browser-asset-store.putTrack` + `getTrack` SRT yeniden-kurma yolu
- `media-catalog-store.commit`
- `media-catalog-service` afiş PNG yazımı (temp+rename bile yoktu — düz
  `writeFileSync`)

**Kök neden:** temp+rename yarım temp'in görünmesini engeller ama sayfa
önbelleğindeki veriyi diske ulaştırmaz. "Başarılı" dönen bir yazım güç
kesintisinde sıfır-bayt birincil dosya (veya hiç dosya) üretebilir; `.bak`
da fsync'siz kaldığında yedek de kaybolabilir.

**Düzeltme:** `src/fsync-utils.js` — `fsyncFile`, `fsyncFileBestEffort`
(yedekler için hata-yutmalı), `fsyncDirectory`, `atomicWriteFileSync`.
`watch-library-store`'daki yerel kopya paylaşılan modüle taşındı; beş store
aynı törene bağlandı (temp fsync → bak fsync → rename → dizin fsync).

## Test kanıtı

`tests/store-durability-matrix.test.js` — 23 kontrol, 6 depo. Kayıtlı fs
sarmalayıcısı `openSync` fd→yol eşlemesiyle `fsyncSync` çağrılarını dosya
bazında izler ve sıra kuralını kilitler: temp fsync rename'den önce, dizin
fsync rename'den sonra, `.bak` yazımları fsync'li.

## Devin Review toplu triage (bu PR'da)

- **#223** `ipc-payload-fuzz`: `registerFails` artık assert (taranmayan kanal
  sessizce atlanamaz); fuzz edilmeyen parametre konumlarına ad-bazlı makul
  değerler (truthy kapılarını geçmek için); payload prototip probu.
  `win-traversal` payload'ı Linux'ta separator değildir — Windows geçerliği
  CI'a dayanır (needs_human).
- **#224**: `test_ass_override_roundtrip` +1 senaryo — `merge_continuation` /
  `dedupe_cues` indeks kaymasında biçim sıfırlanması artık test kilitli;
  rapor 226 iddiası düzeltildi; `_roundtrip` kapsam notu; CHANGELOG'a
  eksik R276 girdisi.
- **#226**: `playback-timing-fuzz` — `randCueList` cue'larına `text` eklendi
  (yoksa `normalizeCueList` hepsini eliyor, politika matrisi 4000 boş-deneme
  yapıyordu); sınır karşılaştırması `BOUNDARY_EPS` toleransından kesin
  eşitliğe çevrildi (±1e-12 problarının çözünürlüğü için).
- **#222**: `DEVIR-NOTU.md` indeks sırası kronolojik düzeltildi (29-2304
  girişi 30-0123 sonrasına taşındı).
- **#225**: devir 0400 kod kimliği düzeltmesi yeni tarihli notta (politika).

## Kalan sınırlar

- Fsync maliyeti yazım başına +2 çağrı; kuyruk yazımları debounce'lu olduğu
  için kullanıcı-görünür etki beklenmez (ölçülmedi).
- `browser-asset-store` json+srt çift yazımı iki ayrı rename'dir — dosya çifti
  arası atomiklik yoktur (mevcut sözleşme; reader taraflı telafi zaten var).
- Dizin fsync Windows'ta no-op olabilir (best-effort) — platform sınırı.
