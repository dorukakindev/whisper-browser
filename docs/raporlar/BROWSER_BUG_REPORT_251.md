# BROWSER_BUG_REPORT_251 — R302: subs:shift ±ms doğruluk ratchet'i

**Tarih:** 2026-09-30 · **Dal:** `devin/1790740818-subs-shift-accuracy` · **Başlangıç:** `781416f`
**Tür:** doğruluk ratchet'i (bug yok — davranış belgelendi) (20'lik kuyruk madde 6)

## Özet

`subs:shift` IPC'sinin çekirdeği `shiftTimecodes` (main.js ~18593) vm
çıkarımıyla oracle'a karşı doğrulandı: **12 senaryo, hepsi PASS**. 1ms
hassasiyeti, roundtrip, cue çıkarma, şekil yükseltmesi, VTT ayar korunumu,
CRLF/BOM davranışı ve 1000-tohumlu fuzz doğrulandı. Ürün kodu değişmedi.

## Doğrulanan sözleşmeler

| Alan | Davranış |
|---|---|
| ms hassasiyeti | 1ms/999ms kaydırma byte-exact; `Math.round(sec*1000)` merkezi |
| Roundtrip | `+x` sonra `−x` orta aralıkta orijinali döndürür |
| Negatif clamp | `start<0`→`0`; `end≤0`→cue bloğu (numara+gövde) silinir |
| Şekil | `MM:SS.mmm` kayınca `HH:` eklenir; saatli giriş `00:` korur |
| Ayırıcı | Virgül giriş virgül, nokta giriş nokta çıkış (SRT/VTT) |
| VTT | `align:center line:90%` gibi cue ayarları korunur |
| Satır sonu | CRLF dosya CRLF çıkar; BOM yalnız yazıcı tarafında eklenir |
| Tolerans | `xx --> yy`, metin-içi `-->`, bozuk satırlar atlanır |
| IPC sınırı | `±86400`s desteklenir; tüm cue'lar çıkarsa boş içerik (hata yok) |

## Bilinçli sınırlar

- Silinen cue'ların numaraları yeniden sıralanmaz (1,3,4 kalır) — SRT
  toleransı, oynatıcılar için zararsız.
- Kaydırmayla komşu cue'lar çakışabilir — sıralama yapılmaz (bilinçli).
- `writeSubtitleAtomic` SRT/ASS/SSA için BOM ekler; VTT/JSON BOM'suz —
  `subs:shift` `.srt`/`.vtt` kısıtlı.

## Regresyon kilidi

`tests/subs-shift-accuracy.test.js` — 12 kontrol (hepsi PASS), 1000 tohumlu
mulberry32 fuzz ile zaman-aritmetik eşitliği.

## Windows etkisi
Yalnız test — ürün kodu değişmedi. `authorizeSubtitleFile` + `backupOnce`
yolu (main.js ~18650) doğrudan test edilmedi (IPC katmanı); saf zaman
mantığı kilitlendi.
