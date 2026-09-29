# BROWSER_BUG_REPORT_237 — R288: #229 Devin Review toplu triage

**Dal:** `fix/r288-fsync-depth` · **Tür:** review bulgusu düzeltmeleri + test genişletmesi

## Kapsam

PR #229 (fsync dayanıklılık turu) üstüne Devin Review 3 bug + 5 flag buldu.
Bug'ların tümü doğrulanıp düzeltildi; flag'lerin dördü kodla, biri devir
notu netleştirmesiyle kapandı.

## Bug — düzeltildi

1. **Dizin fsync hatası başarılı kaydı gizliyordu** (`src/fsync-utils.js`)
   `fsyncDirectory` açma ve fsync hatasını tek catch'te yutuyordu. Artık
   `openSync` başarısızlığı (Windows'ta dizin açma desteklenmez) ve
   ENOTSUP/EINVAL/EPERM/EACCES/EROFS/ENOSYS/EISDIR fsync hataları tolere
   edilir; açılabilmiş dizinde EIO gibi gerçek G/Ç hatası fırlatılır —
   `atomicWriteFileSync` artık sahte "başarılı" dönmez.
2. **Yeni oluşturulan klasör zinciri senkronlanmıyordu.** `atomicWriteFileSync`
   `mkdirSync(recursive)` sonrası yalnız hedef dizini fsync'liyordu; yeni
   oluşan ara düzeylerin dizin kayıtları üst önbelleklerde bekliyordu.
   Artık mkdir öncesi eksik zincir toplanır ve zincirin her düzeyi (en üst
   yeni klasörün kaydını barındıran kök dahil) rename sonrası senkronlanır.
3. **Ayna yedek fsync'i en-iyi-çaba'ydı** (`src/browser-session-store.js`)
   `mirrorBackup` yolunda `.bak` fsync'i `fsyncFileBestEffort` ile yutuluyordu;
   belgelenen "yedek yazılamazsa ana dosya değişmez" sözleşmesi kırılıyordu.
   Artık sıkı `fsyncFile` — başarısızlık commit'i geri alır.

## Flag — düzeltildi

- Dayanıklılık matrisi **SRT yan dosyasını** da kilitler (`putTrack` ve
  `getTrack` yeniden-kurulum yolları `assertCommitOrder` altında).
- `.bak` fsync **sırası** kilitlendi: yedek fsync, yedek yazımı ile ana
  rename arasında olmalı (önceki fsync yanlış sırayı gizleyemez).
- `media-catalog-store` `read()` artık enjekte `io`'yu kullanır (yazım ve
  okuma aynı fs yüzeyinde).
- Matris geçici kökünü koşu sonunda temizler (kalıntı birikimi yok).

## Flag — devir notunda netleştirildi

- "Tam test paketi katkı kontrolünden çıkarılmış": AGENTS.md'nin
  "her görevde gereksiz yere tam test paketini koşma" kuralıyla kasıtlı
  scoped-test politikası; #229 devir notunda açıkça anıldı.

## Testler

`tests/store-durability-matrix.test.js` → 32 kontrol PASS (sıra kilidi +
SRT + rebuild + temizlik dahil). İlgili depo suitleri yeşil:
browser-foundation 24, media-catalog-store/service, watch-library-migration
161/161, queue-persistence 14.

## Windows

- `fsyncDirectory`'nin tolere ettiği hata kümesi Windows davranışını
  (dizin açma reddi) değiştirmeden korur; yalnız gerçek G/Ç hatası artık
  görünür olur. CI Windows koşusu bekleniyor.
