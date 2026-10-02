# BROWSER BUG REPORT 383 — Yeni-100 batch 10 (son): kapanış süpürmesi 2 + kampanya özeti

Tarih: 2026-10-02 · Dal: devin/1790910305-final-sweep-b10 · Başlangıç: `2d519a9` · Bitiş kod: `3df17fc`

## Özet

Yeni-100 kuyruğunun son batch'i (madde 91–100): tam test paketi + Electron smoke seti + çalışma ağacı/dal/etiket/karar-indeksi hijyeni + tüm kampanyanın kapanış muhasebesi. **2 doğrulanmış kusur onarıldı** (bayat test sözleşmesi + bayat açık-karar satırı); kalan denetimler mevcut hâliyle temiz.

## Düzeltilen kusurlar

### B383-01 — `job-recovery-contracts` bayat kaynak regex'i (test tarafı)

Batch 6'nın (`a17db02`) eklediği `warn` üçüncü argümanı `persistQueueRunning`/`persistQueueTerminal` çağrılarının `(..., options)`/ `(..., exitEvent)` sabit-sonlu regex'lerini düşürüyordu — davranış sözleşmesi değişmedi (çağrı hâlâ `activeQueueItemId` atamasının hemen ardından, `terminalSeen` kapısı korunuyor). İki regex argüman-sonu parantezinden bağımsız biçimde gevşetildi; dosya 8/8 PASS.

### B383-02 — `docs/ACIK-KARARLAR.md` madde 10 bayat satırı

"Blueprint font önerisi timeline'da onay bekliyor" satırı bayattı: repo blueprint'inin `initialize` adımı `fonts-noto-cjk fonts-noto-color-emoji xvfb` paketlerini zaten kuruyor (oturumun snapshot'ında kurulu ve çalışır durumda). Madde doğrulanarak "Kapandı" olarak işaretlendi → açık madde sayısı 10 → 9.

## Doğrulanmış-temiz yüzeyler

- **`npm test` tam paket**: **tüm testler geçti** (501 dosya bölümü, JS + Python) — düzeltme sonrası yeniden koşuldu.
- **Electron smoke seti**: `xvfb-run -a node tests/run-electron-smokes.js --all` → **61/61 smoke geçti** (dbus/xvfb gürültüsü hariç sıfır hata).
- **Çalışma ağacı**: `git status` temiz; `docs/`, `tests/`, `src/`, `backend/`, `tools/` altında untracked dosya yok.
- **Uzak dal hijyeni**: origin'de merge edilmiş yalnız 3 dal (2 `codex/*` + 1 `devin/subtitle-reliability-gauntlet`); merge edilmemiş ~10 `codex/*` dalı kullanıcıya ait — dokunulmadı.
- **Etiket durumu**: `v0.9.0-beta.1` master soyunda; son 479 commit etiketsiz — sürüm etiketleme kullanıcı kararı (kaydedildi).
- **Açık kararlar**: 9 madde kullanıcı kararı bekliyor (kayıtlı, erişilebilir).

## Yeni-100 kampanyası — kapanış muhasebesi

10 batch × 10 madde tamamlandı (raporlar 374–383, PR #412–#421 arası):

| Batch | Kapsam | Doğrulanmış kusur |
|---|---|---|
| 1 (374) | E2E kullanıcı yolculukları | 3 yeni smoke; 7 madde kanıtla temiz |
| 2 (375) | Windows derinleştirme | 4 (UNC host, `?` kodlama, ENAMETOOLONG, windowsHide) |
| 3 (376) | Backend gerçek-model | 3 (halüsinasyon kalıp boşlukları ×2 dil + son-cue kelepçe) |
| 4 (377) | Browser yaşam döngüsü | 3 (çökmüş wc kapıları, crash-kind ezilmesi) + lifecycle smoke |
| 5 (378) | Çeviri kalite | 4 (anlam kapısı dil kapsamı, SDH yerelleşme, SDH-ad, Latin-dışı) |
| 6 (379) | Kuyruk/kurtarma | 3 (saveSync şekil kapısı, items invariant, persist yazma uyarısı) |
| 7 (380) | Performans/bellek | 2 (posterCache FIFO, favicon tek-bounded-yol) + ~17 tavan kanıtı |
| 8 (381) | Güvenlik/mahremiyet | 2 (günlük endpoint redaksiyonu, userinfo soyma) + 8 temiz yüzey |
| 9 (382) | Doküman/araç/infra | 2 indeks kayması + docs-index-integrity ratchet'i + 8 temiz yüzey |
| 10 (383) | Kapanış süpürmesi | 2 (bayat test regex'i, bayat açık-karar satırı) + tam paket kanıtı |

**Toplam: ~25 doğrulanmış kusur onarıldı, ~70 yüzey/madde kanıtla temiz kapatıldı.**

## Test kanıtı

- `npm test` — **tüm testler geçti** (düzeltme sonrası)
- `node tests/run-electron-smokes.js --all` — **61/61**
- `node tests/job-recovery-contracts.test.js` — 8/8 PASS
- `node tests/docs-index-integrity.test.js` — 574 not + 342 satır

## Windows etkisi

Test/doküman değişikliği; ürün kodu değişmedi. Electron smokes Linux xvfb'de koşuldu — Windows CI devre dışı olduğundan Windows-koşu kanıtı bu turda alınamadı (açıkça kaydedildi).
